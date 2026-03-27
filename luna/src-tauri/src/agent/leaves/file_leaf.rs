use async_trait::async_trait;
use std::path::PathBuf;
use tracing::info;

use super::LeafAgent;
use crate::agent::messaging::{AgentMessage, TaskId, TaskStatus};
use crate::error::LunaError;

/// Leaf agent for file system operations: read, write, and list.
/// All paths are validated to stay within a configurable workspace root.
pub struct FileLeafAgent {
    id: String,
    workspace_root: PathBuf,
}

impl FileLeafAgent {
    pub fn new(id: &str, workspace_root: PathBuf) -> Self {
        Self {
            id: id.to_string(),
            workspace_root,
        }
    }

    /// Validate that the resolved path stays within the workspace root.
    /// Prevents path traversal attacks (e.g. "../../etc/passwd").
    fn validate_path(&self, raw: &str) -> Result<PathBuf, LunaError> {
        let candidate = self.workspace_root.join(raw);
        // Canonicalize what we can — for new files the parent must exist
        let resolved = if candidate.exists() {
            candidate.canonicalize().map_err(|e| {
                LunaError::Agent(format!("Cannot resolve path '{}': {}", raw, e))
            })?
        } else {
            // For write: parent must exist and be inside root
            let parent = candidate.parent().ok_or_else(|| {
                LunaError::Agent(format!("Invalid path: '{}'", raw))
            })?;
            if !parent.exists() {
                return Err(LunaError::Agent(format!(
                    "Parent directory does not exist: '{}'",
                    parent.display()
                )));
            }
            let resolved_parent = parent.canonicalize().map_err(|e| {
                LunaError::Agent(format!("Cannot resolve parent of '{}': {}", raw, e))
            })?;
            resolved_parent.join(
                candidate
                    .file_name()
                    .ok_or_else(|| LunaError::Agent("No file name".into()))?,
            )
        };

        let root_canonical = self.workspace_root.canonicalize().map_err(|e| {
            LunaError::Agent(format!(
                "Cannot resolve workspace root '{}': {}",
                self.workspace_root.display(),
                e
            ))
        })?;

        if !resolved.starts_with(&root_canonical) {
            return Err(LunaError::Agent(format!(
                "Path '{}' escapes workspace root '{}'",
                raw,
                root_canonical.display()
            )));
        }

        Ok(resolved)
    }

    async fn file_read(&self, payload: &serde_json::Value) -> Result<serde_json::Value, LunaError> {
        let raw_path = payload
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| LunaError::Agent("file.read requires 'path'".into()))?;

        let path = self.validate_path(raw_path)?;
        let content = tokio::fs::read_to_string(&path).await.map_err(|e| {
            LunaError::Agent(format!("Failed to read '{}': {}", path.display(), e))
        })?;

        Ok(serde_json::json!({
            "path": path.display().to_string(),
            "content": content
        }))
    }

    async fn file_write(&self, payload: &serde_json::Value) -> Result<serde_json::Value, LunaError> {
        let raw_path = payload
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| LunaError::Agent("file.write requires 'path'".into()))?;
        let content = payload
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| LunaError::Agent("file.write requires 'content'".into()))?;

        let path = self.validate_path(raw_path)?;
        tokio::fs::write(&path, content).await.map_err(|e| {
            LunaError::Agent(format!("Failed to write '{}': {}", path.display(), e))
        })?;

        Ok(serde_json::json!({
            "path": path.display().to_string(),
            "bytes_written": content.len()
        }))
    }

    async fn file_list(&self, payload: &serde_json::Value) -> Result<serde_json::Value, LunaError> {
        let raw_path = payload
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");

        let path = self.validate_path(raw_path)?;
        let mut entries = Vec::new();

        let mut dir = tokio::fs::read_dir(&path).await.map_err(|e| {
            LunaError::Agent(format!("Failed to list '{}': {}", path.display(), e))
        })?;

        while let Some(entry) = dir.next_entry().await.map_err(|e| {
            LunaError::Agent(format!("Failed reading directory entry: {}", e))
        })? {
            let meta = entry.metadata().await.ok();
            entries.push(serde_json::json!({
                "name": entry.file_name().to_string_lossy(),
                "is_dir": meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                "size": meta.as_ref().map(|m| m.len()).unwrap_or(0),
            }));
        }

        Ok(serde_json::json!({
            "path": path.display().to_string(),
            "entries": entries
        }))
    }
}

#[async_trait]
impl LeafAgent for FileLeafAgent {
    fn agent_id(&self) -> &str {
        &self.id
    }

    fn capabilities(&self) -> Vec<String> {
        vec![
            "file.read".to_string(),
            "file.write".to_string(),
            "file.list".to_string(),
        ]
    }

    async fn handle(
        &self,
        task_id: &TaskId,
        action_type: &str,
        payload: serde_json::Value,
    ) -> Result<AgentMessage, LunaError> {
        info!(
            leaf_agent = %self.id,
            task_id = %task_id,
            action_type = %action_type,
            "FileLeafAgent handling task"
        );

        let result = match action_type {
            "file.read" => self.file_read(&payload).await?,
            "file.write" => self.file_write(&payload).await?,
            "file.list" => self.file_list(&payload).await?,
            other => {
                return Err(LunaError::Agent(format!(
                    "FileLeafAgent does not support action '{}'",
                    other
                )));
            }
        };

        Ok(AgentMessage::Report {
            task_id: task_id.clone(),
            result,
            status: TaskStatus::Completed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_workspace() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("hello.txt"), "Hello, world!").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();
        fs::write(dir.path().join("subdir/nested.txt"), "nested content").unwrap();
        dir
    }

    #[tokio::test]
    async fn test_file_read() {
        let ws = setup_workspace();
        let agent = FileLeafAgent::new("file_leaf_1", ws.path().to_path_buf());

        let result = agent
            .handle(
                &"t1".to_string(),
                "file.read",
                serde_json::json!({ "path": "hello.txt" }),
            )
            .await
            .unwrap();

        if let AgentMessage::Report { result, status, .. } = result {
            assert_eq!(status, TaskStatus::Completed);
            assert_eq!(result["content"], "Hello, world!");
        } else {
            panic!("Expected Report");
        }
    }

    #[tokio::test]
    async fn test_file_write() {
        let ws = setup_workspace();
        let agent = FileLeafAgent::new("file_leaf_1", ws.path().to_path_buf());

        let result = agent
            .handle(
                &"t2".to_string(),
                "file.write",
                serde_json::json!({ "path": "new.txt", "content": "new content" }),
            )
            .await
            .unwrap();

        if let AgentMessage::Report { result, status, .. } = result {
            assert_eq!(status, TaskStatus::Completed);
            assert_eq!(result["bytes_written"], 11);
        } else {
            panic!("Expected Report");
        }

        let content = fs::read_to_string(ws.path().join("new.txt")).unwrap();
        assert_eq!(content, "new content");
    }

    #[tokio::test]
    async fn test_file_list() {
        let ws = setup_workspace();
        let agent = FileLeafAgent::new("file_leaf_1", ws.path().to_path_buf());

        let result = agent
            .handle(
                &"t3".to_string(),
                "file.list",
                serde_json::json!({ "path": "." }),
            )
            .await
            .unwrap();

        if let AgentMessage::Report { result, status, .. } = result {
            assert_eq!(status, TaskStatus::Completed);
            let entries = result["entries"].as_array().unwrap();
            assert!(entries.len() >= 2); // hello.txt + subdir
        } else {
            panic!("Expected Report");
        }
    }

    #[tokio::test]
    async fn test_path_traversal_blocked() {
        let ws = setup_workspace();
        let agent = FileLeafAgent::new("file_leaf_1", ws.path().to_path_buf());

        let result = agent
            .handle(
                &"t4".to_string(),
                "file.read",
                serde_json::json!({ "path": "../../../etc/passwd" }),
            )
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("escapes workspace root") || err.contains("does not exist"));
    }

    #[tokio::test]
    async fn test_unsupported_action() {
        let ws = setup_workspace();
        let agent = FileLeafAgent::new("file_leaf_1", ws.path().to_path_buf());

        let result = agent
            .handle(
                &"t5".to_string(),
                "file.delete",
                serde_json::json!({}),
            )
            .await;

        assert!(result.is_err());
    }
}
