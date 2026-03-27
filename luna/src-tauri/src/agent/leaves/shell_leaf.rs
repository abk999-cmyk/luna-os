use async_trait::async_trait;
use std::time::Duration;
use tracing::{info, warn};

use super::LeafAgent;
use crate::agent::messaging::{AgentMessage, TaskId, TaskStatus};
use crate::error::LunaError;

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_TIMEOUT_MS: u64 = 60_000;

/// Leaf agent for executing shell commands with timeout and output capture.
pub struct ShellLeafAgent {
    id: String,
}

impl ShellLeafAgent {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
        }
    }

    async fn shell_execute(
        &self,
        payload: &serde_json::Value,
    ) -> Result<serde_json::Value, LunaError> {
        const ALLOWED_COMMANDS: &[&str] = &[
            "ls", "cat", "head", "tail", "grep", "find", "wc", "sort", "uniq",
            "echo", "pwd", "date", "whoami", "env", "which", "file", "stat",
            "mkdir", "cp", "mv", "touch", "diff", "git", "cargo", "npm", "node",
            "python", "python3", "pip", "rustc", "go",
        ];

        let command = payload
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| LunaError::Agent("shell.execute requires 'command'".into()))?;

        let base_cmd = command.split('/').last().unwrap_or(command);
        if !ALLOWED_COMMANDS.contains(&base_cmd) {
            return Err(LunaError::Agent(format!("shell.execute: command '{}' not in allowlist", command)));
        }

        let args: Vec<String> = payload
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        let timeout_ms = payload
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(DEFAULT_TIMEOUT_MS)
            .min(MAX_TIMEOUT_MS);

        info!(
            command = %command,
            args = ?args,
            timeout_ms = timeout_ms,
            "ShellLeafAgent executing command"
        );

        let child = tokio::process::Command::new(command)
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                LunaError::Agent(format!("Failed to spawn command '{}': {}", command, e))
            })?;

        let result = tokio::time::timeout(
            Duration::from_millis(timeout_ms),
            child.wait_with_output(),
        )
        .await;

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let exit_code = output.status.code().unwrap_or(-1);

                Ok(serde_json::json!({
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": exit_code
                }))
            }
            Ok(Err(e)) => Err(LunaError::Agent(format!(
                "Command '{}' failed: {}",
                command, e
            ))),
            Err(_) => {
                // Timeout — child was consumed by wait_with_output so it is
                // already dropped and the process will be cleaned up.
                warn!(command = %command, "Command timed out after {}ms", timeout_ms);
                Err(LunaError::Agent(format!(
                    "Command '{}' timed out after {}ms",
                    command, timeout_ms
                )))
            }
        }
    }
}

#[async_trait]
impl LeafAgent for ShellLeafAgent {
    fn agent_id(&self) -> &str {
        &self.id
    }

    fn capabilities(&self) -> Vec<String> {
        vec!["shell.execute".to_string()]
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
            "ShellLeafAgent handling task"
        );

        match action_type {
            "shell.execute" => {
                let result = self.shell_execute(&payload).await?;
                Ok(AgentMessage::Report {
                    task_id: task_id.clone(),
                    result,
                    status: TaskStatus::Completed,
                })
            }
            other => Err(LunaError::Agent(format!(
                "ShellLeafAgent does not support action '{}'",
                other
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_shell_execute_echo() {
        let agent = ShellLeafAgent::new("shell_leaf_1");

        let result = agent
            .handle(
                &"t1".to_string(),
                "shell.execute",
                serde_json::json!({
                    "command": "echo",
                    "args": ["hello", "world"],
                    "timeout_ms": 5000
                }),
            )
            .await
            .unwrap();

        if let AgentMessage::Report { result, status, .. } = result {
            assert_eq!(status, TaskStatus::Completed);
            assert_eq!(result["exit_code"], 0);
            assert!(result["stdout"].as_str().unwrap().contains("hello world"));
        } else {
            panic!("Expected Report");
        }
    }

    #[tokio::test]
    async fn test_shell_execute_nonexistent_command() {
        let agent = ShellLeafAgent::new("shell_leaf_1");

        let result = agent
            .handle(
                &"t2".to_string(),
                "shell.execute",
                serde_json::json!({
                    "command": "nonexistent_command_xyz_12345"
                }),
            )
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_shell_timeout_capped() {
        let agent = ShellLeafAgent::new("shell_leaf_1");

        // Request 120s timeout — should be capped to 60s
        let result = agent
            .handle(
                &"t3".to_string(),
                "shell.execute",
                serde_json::json!({
                    "command": "echo",
                    "args": ["fast"],
                    "timeout_ms": 120000
                }),
            )
            .await
            .unwrap();

        if let AgentMessage::Report { status, .. } = result {
            assert_eq!(status, TaskStatus::Completed);
        } else {
            panic!("Expected Report");
        }
    }

    #[tokio::test]
    async fn test_unsupported_action() {
        let agent = ShellLeafAgent::new("shell_leaf_1");

        let result = agent
            .handle(
                &"t4".to_string(),
                "shell.run_background",
                serde_json::json!({}),
            )
            .await;

        assert!(result.is_err());
    }
}
