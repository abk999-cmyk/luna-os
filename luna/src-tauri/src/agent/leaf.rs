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

/// A stub leaf agent for Phase 2. Logs the task and returns success.
/// Phase 4 will implement specialized agents (FileLeaf, ShellLeaf, SearchLeaf, etc.)
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

        // Stub: acknowledge and return success with a placeholder result
        Ok(AgentMessage::Report {
            task_id: task_id.clone(),
            result: serde_json::json!({
                "agent": self.id,
                "action_type": action_type,
                "payload": payload,
                "note": "stub leaf agent — Phase 4 will implement real capabilities"
            }),
            status: TaskStatus::Completed,
        })
    }
}
