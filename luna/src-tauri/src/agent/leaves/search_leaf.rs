use async_trait::async_trait;
use std::path::PathBuf;
use tracing::info;

use super::LeafAgent;
use crate::agent::messaging::{AgentMessage, TaskId, TaskStatus};
use crate::error::LunaError;

const MAX_RESULTS: usize = 500;

/// Leaf agent for searching files by name pattern within a directory tree.
pub struct SearchLeafAgent {
    id: String,
    default_root: PathBuf,
}

impl SearchLeafAgent {
    pub fn new(id: &str, default_root: PathBuf) -> Self {
        Self {
            id: id.to_string(),
            default_root,
        }
    }

    /// Simple glob-like matching: supports `*` as wildcard.
    /// Falls back to substring matching if no `*` is present.
    fn matches_pattern(filename: &str, pattern: &str) -> bool {
        if pattern.contains('*') {
            // Split on * and check that all parts appear in order
            let parts: Vec<&str> = pattern.split('*').collect();
            let mut pos = 0;
            for (i, part) in parts.iter().enumerate() {
                if part.is_empty() {
                    continue;
                }
                if i == 0 {
                    // First part must be a prefix
                    if !filename.starts_with(part) {
                        return false;
                    }
                    pos = part.len();
                } else if i == parts.len() - 1 && !part.is_empty() {
                    // Last part must be a suffix
                    if !filename[pos..].ends_with(part) {
                        return false;
                    }
                } else {
                    // Middle parts must appear in order
                    match filename[pos..].find(part) {
                        Some(idx) => pos += idx + part.len(),
                        None => return false,
                    }
                }
            }
            true
        } else {
            // Substring match (case-insensitive)
            filename.to_lowercase().contains(&pattern.to_lowercase())
        }
    }

    async fn search_local(
        &self,
        payload: &serde_json::Value,
    ) -> Result<serde_json::Value, LunaError> {
        let pattern = payload
            .get("pattern")
            .and_then(|v| v.as_str())
            .ok_or_else(|| LunaError::Agent("search.local requires 'pattern'".into()))?;

        let root_str = payload.get("root").and_then(|v| v.as_str());

        let root = if let Some(r) = root_str {
            let candidate = PathBuf::from(r);
            if candidate.is_absolute() {
                if candidate.starts_with(&self.default_root) {
                    candidate
                } else {
                    return Err(LunaError::Agent(format!("search.local: path '{}' is outside workspace", r)));
                }
            } else {
                self.default_root.join(r)
            }
        } else {
            self.default_root.clone()
        };

        if !root.exists() {
            return Err(LunaError::Agent(format!(
                "Search root does not exist: '{}'",
                root.display()
            )));
        }

        let mut matches = Vec::new();
        let mut stack = vec![root.clone()];

        while let Some(dir) = stack.pop() {
            let mut entries = match tokio::fs::read_dir(&dir).await {
                Ok(e) => e,
                Err(_) => continue, // skip unreadable dirs
            };

            while let Ok(Some(entry)) = entries.next_entry().await {
                let file_name = entry.file_name().to_string_lossy().to_string();
                let path = entry.path();

                if let Ok(meta) = entry.metadata().await {
                    if meta.is_dir() {
                        stack.push(path.clone());
                    }
                }

                if Self::matches_pattern(&file_name, pattern) {
                    matches.push(path.display().to_string());
                    if matches.len() >= MAX_RESULTS {
                        break;
                    }
                }
            }

            if matches.len() >= MAX_RESULTS {
                break;
            }
        }

        Ok(serde_json::json!({
            "pattern": pattern,
            "root": root.display().to_string(),
            "matches": matches,
            "truncated": matches.len() >= MAX_RESULTS
        }))
    }
}

#[async_trait]
impl LeafAgent for SearchLeafAgent {
    fn agent_id(&self) -> &str {
        &self.id
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["search.local".to_string()]
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
            "SearchLeafAgent handling task"
        );

        match action_type {
            "search.local" => {
                let result = self.search_local(&payload).await?;
                Ok(AgentMessage::Report {
                    task_id: task_id.clone(),
                    result,
                    status: TaskStatus::Completed,
                })
            }
            other => Err(LunaError::Agent(format!(
                "SearchLeafAgent does not support action '{}'",
                other
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_workspace() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("main.rs"), "fn main() {}").unwrap();
        fs::write(dir.path().join("lib.rs"), "pub mod foo;").unwrap();
        fs::write(dir.path().join("readme.md"), "# Hello").unwrap();
        fs::create_dir(dir.path().join("src")).unwrap();
        fs::write(dir.path().join("src/foo.rs"), "pub fn foo() {}").unwrap();
        fs::write(dir.path().join("src/bar.rs"), "pub fn bar() {}").unwrap();
        dir
    }

    #[test]
    fn test_glob_matching() {
        assert!(SearchLeafAgent::matches_pattern("main.rs", "*.rs"));
        assert!(SearchLeafAgent::matches_pattern("lib.rs", "*.rs"));
        assert!(!SearchLeafAgent::matches_pattern("readme.md", "*.rs"));
        assert!(SearchLeafAgent::matches_pattern("readme.md", "*.md"));
        assert!(SearchLeafAgent::matches_pattern("foo_bar.rs", "foo*"));
        assert!(SearchLeafAgent::matches_pattern("test_main_spec.rs", "test*spec*"));
    }

    #[test]
    fn test_substring_matching() {
        assert!(SearchLeafAgent::matches_pattern("main.rs", "main"));
        assert!(SearchLeafAgent::matches_pattern("README.md", "readme")); // case-insensitive
        assert!(!SearchLeafAgent::matches_pattern("main.rs", "foo"));
    }

    #[tokio::test]
    async fn test_search_local_glob() {
        let ws = setup_workspace();
        let agent = SearchLeafAgent::new("search_1", ws.path().to_path_buf());

        let result = agent
            .handle(
                &"t1".to_string(),
                "search.local",
                serde_json::json!({ "pattern": "*.rs" }),
            )
            .await
            .unwrap();

        if let AgentMessage::Report { result, status, .. } = result {
            assert_eq!(status, TaskStatus::Completed);
            let matches = result["matches"].as_array().unwrap();
            // main.rs, lib.rs, src/foo.rs, src/bar.rs
            assert_eq!(matches.len(), 4);
        } else {
            panic!("Expected Report");
        }
    }

    #[tokio::test]
    async fn test_search_local_substring() {
        let ws = setup_workspace();
        let agent = SearchLeafAgent::new("search_1", ws.path().to_path_buf());

        let result = agent
            .handle(
                &"t2".to_string(),
                "search.local",
                serde_json::json!({ "pattern": "foo" }),
            )
            .await
            .unwrap();

        if let AgentMessage::Report { result, status, .. } = result {
            assert_eq!(status, TaskStatus::Completed);
            let matches = result["matches"].as_array().unwrap();
            assert_eq!(matches.len(), 1);
            assert!(matches[0].as_str().unwrap().contains("foo.rs"));
        } else {
            panic!("Expected Report");
        }
    }

    #[tokio::test]
    async fn test_search_nonexistent_root() {
        let agent = SearchLeafAgent::new("search_1", PathBuf::from("/nonexistent_path_xyz"));

        let result = agent
            .handle(
                &"t3".to_string(),
                "search.local",
                serde_json::json!({ "pattern": "*.rs" }),
            )
            .await;

        assert!(result.is_err());
    }
}
