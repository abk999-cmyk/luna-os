use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type ActionId = Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub id: ActionId,
    pub action_type: String,
    pub payload: serde_json::Value,
    pub timestamp: DateTime<Utc>,
    pub source: ActionSource,
    pub priority: Priority,
    pub retry_count: u32,
    pub status: ActionStatus,
    /// Optional target agent for inter-agent messaging
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_agent_id: Option<String>,
}

impl Action {
    pub fn new(action_type: String, payload: serde_json::Value, source: ActionSource) -> Self {
        Self {
            id: Uuid::new_v4(),
            action_type,
            payload,
            timestamp: Utc::now(),
            source,
            priority: Priority::Normal,
            retry_count: 0,
            status: ActionStatus::Pending,
            target_agent_id: None,
        }
    }

    pub fn for_agent(mut self, agent_id: &str) -> Self {
        self.target_agent_id = Some(agent_id.to_string());
        self
    }

    pub fn system(action_type: &str) -> Self {
        Self::new(
            action_type.to_string(),
            serde_json::Value::Null,
            ActionSource::System,
        )
    }

    pub fn agent(action_type: &str, payload: serde_json::Value, agent_id: &str) -> Self {
        Self::new(
            action_type.to_string(),
            payload,
            ActionSource::Agent(agent_id.to_string()),
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", content = "id")]
pub enum ActionSource {
    User,
    Agent(String),
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Normal,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ActionStatus {
    Pending,
    Dispatched,
    Completed,
    Failed(String),
}
