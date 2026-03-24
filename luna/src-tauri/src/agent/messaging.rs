use std::collections::HashMap;
use tokio::sync::{mpsc, RwLock};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::LunaError;

pub type TaskId = String;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed(String),
}

/// Messages passed between agents via the MessageBus.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentMessage {
    /// Conductor → Orchestrator: delegate a task
    Delegate {
        task_id: TaskId,
        task: String,
        context: serde_json::Value,
    },
    /// Orchestrator → Leaf: assign a specific action
    Assign {
        task_id: TaskId,
        action_type: String,
        payload: serde_json::Value,
        timeout_ms: u64,
    },
    /// Leaf → Orchestrator: report result
    Report {
        task_id: TaskId,
        result: serde_json::Value,
        status: TaskStatus,
    },
    /// Orchestrator → Conductor: task is done
    Complete {
        task_id: TaskId,
        result: serde_json::Value,
    },
    /// Any → Conductor: something went wrong, need help
    Escalate {
        task_id: TaskId,
        from_agent: String,
        reason: String,
    },
    /// Frontend → Agent: a UI event from a dynamic app component
    Event {
        app_id: String,
        payload: serde_json::Value,
    },
}

impl AgentMessage {
    pub fn new_delegate(task: &str, context: serde_json::Value) -> (TaskId, Self) {
        let task_id = Uuid::new_v4().to_string();
        let msg = AgentMessage::Delegate {
            task_id: task_id.clone(),
            task: task.to_string(),
            context,
        };
        (task_id, msg)
    }

    pub fn new_event(app_id: &str, payload: serde_json::Value) -> Self {
        AgentMessage::Event {
            app_id: app_id.to_string(),
            payload,
        }
    }
}

/// Central message bus for inter-agent communication.
pub struct MessageBus {
    channels: RwLock<HashMap<String, mpsc::UnboundedSender<AgentMessage>>>,
}

impl MessageBus {
    pub fn new() -> Self {
        Self {
            channels: RwLock::new(HashMap::new()),
        }
    }

    /// Register an agent and get its receiver end.
    pub async fn register(&self, agent_id: &str) -> mpsc::UnboundedReceiver<AgentMessage> {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut channels = self.channels.write().await;
        channels.insert(agent_id.to_string(), tx);
        rx
    }

    /// Send a message to a specific agent.
    pub async fn send(&self, to: &str, msg: AgentMessage) -> Result<(), LunaError> {
        let channels = self.channels.read().await;
        if let Some(tx) = channels.get(to) {
            tx.send(msg).map_err(|_| {
                LunaError::Agent(format!("Agent '{}' channel is closed", to))
            })?;
        } else {
            return Err(LunaError::Agent(format!(
                "Agent '{}' is not registered on the message bus", to
            )));
        }
        Ok(())
    }

    pub async fn is_registered(&self, agent_id: &str) -> bool {
        let channels = self.channels.read().await;
        channels.contains_key(agent_id)
    }
}
