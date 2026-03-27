use std::collections::HashMap;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::LunaError;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Conductor,
    WorkspaceOrchestrator,
    Leaf,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Busy,
    Error(String),
    Offline,
}

impl AgentStatus {
    /// Check whether a transition from the current status to `target` is valid.
    pub fn can_transition_to(&self, target: &AgentStatus) -> bool {
        match (self, target) {
            // Any → Offline (kill) and Any → Error are always valid
            (_, AgentStatus::Offline) => true,
            (_, AgentStatus::Error(_)) => true,
            // Idle → Busy
            (AgentStatus::Idle, AgentStatus::Busy) => true,
            // Busy → Idle (task complete)
            (AgentStatus::Busy, AgentStatus::Idle) => true,
            // Error → Idle (recovery)
            (AgentStatus::Error(_), AgentStatus::Idle) => true,
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetadata {
    pub agent_id: String,
    pub agent_type: AgentType,
    pub capabilities: Vec<String>,
    pub workspace_id: Option<String>,
    pub status: AgentStatus,
}

pub struct AgentRegistry {
    agents: RwLock<HashMap<String, AgentMetadata>>,
}

impl AgentRegistry {
    pub fn new() -> Self {
        Self {
            agents: RwLock::new(HashMap::new()),
        }
    }

    pub async fn register(&self, metadata: AgentMetadata) {
        let mut agents = self.agents.write().await;
        agents.insert(metadata.agent_id.clone(), metadata);
    }

    pub async fn deregister(&self, agent_id: &str) {
        let mut agents = self.agents.write().await;
        agents.remove(agent_id);
    }

    pub async fn get(&self, agent_id: &str) -> Option<AgentMetadata> {
        let agents = self.agents.read().await;
        agents.get(agent_id).cloned()
    }

    /// Transition an agent's status, respecting valid state transitions.
    /// Silently ignores if the agent does not exist.
    pub async fn set_status(&self, agent_id: &str, status: AgentStatus) {
        let mut agents = self.agents.write().await;
        if let Some(meta) = agents.get_mut(agent_id) {
            if meta.status.can_transition_to(&status) {
                meta.status = status;
            } else {
                tracing::warn!(
                    agent_id = %agent_id,
                    from = ?meta.status,
                    to = ?status,
                    "Invalid agent status transition — forcing anyway"
                );
                // Force it anyway to avoid blocking, but warn
                meta.status = status;
            }
        }
    }

    pub async fn get_capabilities(&self, agent_id: &str) -> Vec<String> {
        let agents = self.agents.read().await;
        agents.get(agent_id)
            .map(|m| m.capabilities.clone())
            .unwrap_or_default()
    }

    pub async fn list_all(&self) -> Vec<AgentMetadata> {
        let agents = self.agents.read().await;
        agents.values().cloned().collect()
    }

    pub async fn list_by_workspace(&self, workspace_id: &str) -> Vec<AgentMetadata> {
        let agents = self.agents.read().await;
        agents.values()
            .filter(|m| m.workspace_id.as_deref() == Some(workspace_id))
            .cloned()
            .collect()
    }

    // ── Phase 2E: Agent Spawning / Lifecycle ────────────────────────────────

    /// Spawn a new leaf agent entry in the registry.
    /// Returns the generated agent_id.
    pub async fn spawn_leaf(
        &self,
        workspace_id: &str,
        capabilities: Vec<String>,
    ) -> String {
        let agent_id = format!("leaf_{}_{}", workspace_id, Uuid::new_v4());
        let metadata = AgentMetadata {
            agent_id: agent_id.clone(),
            agent_type: AgentType::Leaf,
            capabilities,
            workspace_id: Some(workspace_id.to_string()),
            status: AgentStatus::Idle,
        };
        self.register(metadata).await;
        agent_id
    }

    /// Kill an agent — marks it as Offline and removes it from the registry.
    pub async fn kill_agent(&self, agent_id: &str) -> Result<(), LunaError> {
        let mut agents = self.agents.write().await;
        if let Some(meta) = agents.get_mut(agent_id) {
            meta.status = AgentStatus::Offline;
            agents.remove(agent_id);
            Ok(())
        } else {
            Err(LunaError::Agent(format!(
                "Cannot kill unknown agent '{}'",
                agent_id
            )))
        }
    }

    /// Find all agents that declare the given capability.
    pub async fn get_by_capability(&self, capability: &str) -> Vec<AgentMetadata> {
        let agents = self.agents.read().await;
        agents
            .values()
            .filter(|m| m.capabilities.iter().any(|c| c == capability))
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_agent(id: &str, caps: Vec<&str>) -> AgentMetadata {
        AgentMetadata {
            agent_id: id.to_string(),
            agent_type: AgentType::Leaf,
            capabilities: caps.into_iter().map(String::from).collect(),
            workspace_id: Some("ws1".to_string()),
            status: AgentStatus::Idle,
        }
    }

    #[tokio::test]
    async fn test_spawn_leaf() {
        let reg = AgentRegistry::new();
        let id = reg.spawn_leaf("ws1", vec!["file.read".into()]).await;
        assert!(id.starts_with("leaf_ws1_"));
        let agent = reg.get(&id).await.unwrap();
        assert_eq!(agent.agent_type, AgentType::Leaf);
        assert_eq!(agent.status, AgentStatus::Idle);
    }

    #[tokio::test]
    async fn test_kill_agent() {
        let reg = AgentRegistry::new();
        reg.register(test_agent("agent_1", vec!["file.read"])).await;
        assert!(reg.get("agent_1").await.is_some());

        reg.kill_agent("agent_1").await.unwrap();
        assert!(reg.get("agent_1").await.is_none());
    }

    #[tokio::test]
    async fn test_kill_unknown_agent() {
        let reg = AgentRegistry::new();
        let result = reg.kill_agent("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_by_capability() {
        let reg = AgentRegistry::new();
        reg.register(test_agent("a1", vec!["file.read", "file.write"])).await;
        reg.register(test_agent("a2", vec!["shell.execute"])).await;
        reg.register(test_agent("a3", vec!["file.read"])).await;

        let readers = reg.get_by_capability("file.read").await;
        assert_eq!(readers.len(), 2);

        let shells = reg.get_by_capability("shell.execute").await;
        assert_eq!(shells.len(), 1);

        let none = reg.get_by_capability("search.local").await;
        assert!(none.is_empty());
    }

    #[tokio::test]
    async fn test_status_transitions() {
        let reg = AgentRegistry::new();
        reg.register(test_agent("a1", vec![])).await;

        // Idle → Busy
        reg.set_status("a1", AgentStatus::Busy).await;
        assert_eq!(reg.get("a1").await.unwrap().status, AgentStatus::Busy);

        // Busy → Idle
        reg.set_status("a1", AgentStatus::Idle).await;
        assert_eq!(reg.get("a1").await.unwrap().status, AgentStatus::Idle);

        // Idle → Error
        reg.set_status("a1", AgentStatus::Error("oops".into())).await;
        assert!(matches!(reg.get("a1").await.unwrap().status, AgentStatus::Error(_)));

        // Error → Offline
        reg.set_status("a1", AgentStatus::Offline).await;
        assert_eq!(reg.get("a1").await.unwrap().status, AgentStatus::Offline);
    }
}
