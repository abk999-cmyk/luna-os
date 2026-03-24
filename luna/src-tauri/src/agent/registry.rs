use std::collections::HashMap;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

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

    pub async fn set_status(&self, agent_id: &str, status: AgentStatus) {
        let mut agents = self.agents.write().await;
        if let Some(meta) = agents.get_mut(agent_id) {
            meta.status = status;
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
}
