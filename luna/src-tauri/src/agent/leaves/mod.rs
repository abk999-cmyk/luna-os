pub mod file_leaf;
pub mod shell_leaf;
pub mod search_leaf;

use async_trait::async_trait;
use tracing::info;

use crate::agent::messaging::{AgentMessage, TaskId, TaskStatus};
use crate::error::LunaError;

/// Trait for all leaf agents. Leaf agents execute discrete, specialized tasks.
#[async_trait]
pub trait LeafAgent: Send + Sync {
    fn agent_id(&self) -> &str;
    fn capabilities(&self) -> Vec<String>;
    async fn handle(
        &self,
        task_id: &TaskId,
        action_type: &str,
        payload: serde_json::Value,
    ) -> Result<AgentMessage, LunaError>;
}

/// A stub leaf agent for testing. Logs the task and returns success.
pub struct StubLeafAgent {
    id: String,
    caps: Vec<String>,
}

impl StubLeafAgent {
    pub fn new(id: &str, capabilities: Vec<&str>) -> Self {
        Self {
            id: id.to_string(),
            caps: capabilities.iter().map(|s| s.to_string()).collect(),
        }
    }
}

#[async_trait]
impl LeafAgent for StubLeafAgent {
    fn agent_id(&self) -> &str {
        &self.id
    }

    fn capabilities(&self) -> Vec<String> {
        self.caps.clone()
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
            "Leaf agent handling task (stub)"
        );

        Ok(AgentMessage::Report {
            task_id: task_id.clone(),
            result: serde_json::json!({
                "agent": self.id,
                "action_type": action_type,
                "payload": payload,
                "note": "stub leaf agent — no real execution"
            }),
            status: TaskStatus::Completed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_stub_leaf_agent() {
        let agent = StubLeafAgent::new("test_stub", vec!["test.action"]);
        assert_eq!(agent.agent_id(), "test_stub");
        assert_eq!(agent.capabilities(), vec!["test.action".to_string()]);

        let result = agent
            .handle(
                &"task_1".to_string(),
                "test.action",
                serde_json::json!({}),
            )
            .await
            .unwrap();

        match result {
            AgentMessage::Report { status, .. } => {
                assert_eq!(status, TaskStatus::Completed);
            }
            _ => panic!("Expected Report message"),
        }
    }
}
