use std::collections::HashMap;
use tokio::sync::{mpsc, oneshot, RwLock};
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

// ── Phase 2A: Rich Message Protocol ──────────────────────────────────────────

/// Priority level for messages on the bus.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MessagePriority {
    Low,
    Normal,
    High,
    Critical,
}

/// Rich envelope that wraps an `AgentMessage` with metadata for routing,
/// correlation, TTL, and acknowledgment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageEnvelope {
    pub message_id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub source_agent_id: String,
    pub destination_agent_id: String,
    pub message: AgentMessage,
    pub correlation_id: Option<String>,
    pub priority: MessagePriority,
    pub ttl_ms: Option<u64>,
    pub requires_ack: bool,
}

impl MessageEnvelope {
    /// Create a new envelope with sensible defaults (Normal priority, no TTL, no ack).
    pub fn new(source: &str, destination: &str, message: AgentMessage) -> Self {
        Self {
            message_id: Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now(),
            source_agent_id: source.to_string(),
            destination_agent_id: destination.to_string(),
            message,
            correlation_id: None,
            priority: MessagePriority::Normal,
            ttl_ms: None,
            requires_ack: false,
        }
    }

    /// Builder: set correlation ID for request-response tracking.
    pub fn with_correlation_id(mut self, id: impl Into<String>) -> Self {
        self.correlation_id = Some(id.into());
        self
    }

    /// Builder: set priority.
    pub fn with_priority(mut self, priority: MessagePriority) -> Self {
        self.priority = priority;
        self
    }

    /// Builder: set time-to-live in milliseconds.
    pub fn with_ttl(mut self, ttl_ms: u64) -> Self {
        self.ttl_ms = Some(ttl_ms);
        self
    }

    /// Builder: mark this envelope as requiring acknowledgment.
    pub fn with_ack(mut self) -> Self {
        self.requires_ack = true;
        self
    }

    /// Returns `true` if the envelope has expired based on its TTL.
    pub fn is_expired(&self) -> bool {
        if let Some(ttl) = self.ttl_ms {
            let elapsed = chrono::Utc::now()
                .signed_duration_since(self.timestamp)
                .num_milliseconds();
            elapsed > 0 && (elapsed as u64) > ttl
        } else {
            false
        }
    }
}

/// Central message bus for inter-agent communication.
///
/// Supports both the legacy `send()` API (bare `AgentMessage`) and the new
/// envelope-based `send_envelope()` / `send_with_ack()` API.
pub struct MessageBus {
    channels: RwLock<HashMap<String, mpsc::UnboundedSender<MessageEnvelope>>>,
    ack_senders: RwLock<HashMap<String, oneshot::Sender<MessageEnvelope>>>,
}

impl MessageBus {
    pub fn new() -> Self {
        Self {
            channels: RwLock::new(HashMap::new()),
            ack_senders: RwLock::new(HashMap::new()),
        }
    }

    /// Register an agent and get its receiver end.
    pub async fn register(&self, agent_id: &str) -> mpsc::UnboundedReceiver<MessageEnvelope> {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut channels = self.channels.write().await;
        channels.insert(agent_id.to_string(), tx);
        rx
    }

    /// Legacy send: wraps a bare `AgentMessage` in an envelope and delivers it.
    /// The `to` parameter is used as the destination; source is set to "unknown".
    pub async fn send(&self, to: &str, msg: AgentMessage) -> Result<(), LunaError> {
        let envelope = MessageEnvelope::new("unknown", to, msg);
        self.send_envelope(envelope).await
    }

    /// Send a full `MessageEnvelope`. The destination is taken from the envelope.
    /// Expired messages (TTL exceeded) are silently dropped.
    pub async fn send_envelope(&self, envelope: MessageEnvelope) -> Result<(), LunaError> {
        // TTL check — skip expired messages
        if envelope.is_expired() {
            tracing::warn!(
                message_id = %envelope.message_id,
                destination = %envelope.destination_agent_id,
                "Dropping expired message (TTL exceeded)"
            );
            return Ok(());
        }

        let dest = envelope.destination_agent_id.clone();
        let channels = self.channels.read().await;
        if let Some(tx) = channels.get(&dest) {
            tx.send(envelope).map_err(|_| {
                LunaError::Agent(format!("Agent '{}' channel is closed", dest))
            })?;
        } else {
            return Err(LunaError::Agent(format!(
                "Agent '{}' is not registered on the message bus", dest
            )));
        }
        Ok(())
    }

    /// Send an envelope and get a `oneshot::Receiver` that will resolve when the
    /// recipient sends an acknowledgment envelope with a matching `correlation_id`.
    pub async fn send_with_ack(
        &self,
        mut envelope: MessageEnvelope,
    ) -> Result<oneshot::Receiver<MessageEnvelope>, LunaError> {
        // Ensure a correlation_id exists
        let correlation_id = envelope
            .correlation_id
            .clone()
            .unwrap_or_else(|| envelope.message_id.clone());
        envelope.correlation_id = Some(correlation_id.clone());
        envelope.requires_ack = true;

        let (tx, rx) = oneshot::channel();
        {
            let mut ack_senders = self.ack_senders.write().await;
            ack_senders.insert(correlation_id, tx);
        }

        self.send_envelope(envelope).await?;
        Ok(rx)
    }

    /// Deliver an acknowledgment. If a `send_with_ack` call is waiting on the
    /// envelope's `correlation_id`, the waiting receiver is resolved.
    pub async fn deliver_ack(&self, envelope: &MessageEnvelope) {
        if let Some(ref cid) = envelope.correlation_id {
            let mut ack_senders = self.ack_senders.write().await;
            if let Some(tx) = ack_senders.remove(cid) {
                let _ = tx.send(envelope.clone());
            }
        }
    }

    pub async fn is_registered(&self, agent_id: &str) -> bool {
        let channels = self.channels.read().await;
        channels.contains_key(agent_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_register_creates_channel() {
        let bus = MessageBus::new();
        let _rx = bus.register("agent_a").await;
        assert!(bus.is_registered("agent_a").await);
    }

    #[tokio::test]
    async fn test_send_delivers_to_registered_agent() {
        let bus = MessageBus::new();
        let mut rx = bus.register("agent_b").await;
        let msg = AgentMessage::new_event("app_1", serde_json::json!({}));
        bus.send("agent_b", msg).await.unwrap();
        let received = rx.recv().await;
        assert!(received.is_some());
        // Verify it is wrapped in an envelope
        let env = received.unwrap();
        assert_eq!(env.destination_agent_id, "agent_b");
        if let AgentMessage::Event { app_id, .. } = &env.message {
            assert_eq!(app_id, "app_1");
        } else {
            panic!("Expected Event message");
        }
    }

    #[tokio::test]
    async fn test_send_fails_for_unregistered_agent() {
        let bus = MessageBus::new();
        let msg = AgentMessage::new_event("app_1", serde_json::json!({}));
        let result = bus.send("nobody", msg).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_is_registered_returns_correct_value() {
        let bus = MessageBus::new();
        assert!(!bus.is_registered("agent_x").await);
        let _rx = bus.register("agent_x").await;
        assert!(bus.is_registered("agent_x").await);
    }

    #[tokio::test]
    async fn test_envelope_defaults() {
        let env = MessageEnvelope::new(
            "src",
            "dst",
            AgentMessage::new_event("a", serde_json::json!({})),
        );
        assert_eq!(env.source_agent_id, "src");
        assert_eq!(env.destination_agent_id, "dst");
        assert_eq!(env.priority, MessagePriority::Normal);
        assert!(env.ttl_ms.is_none());
        assert!(!env.requires_ack);
        assert!(env.correlation_id.is_none());
        assert!(!env.is_expired());
    }

    #[tokio::test]
    async fn test_envelope_builders() {
        let env = MessageEnvelope::new(
            "src",
            "dst",
            AgentMessage::new_event("a", serde_json::json!({})),
        )
        .with_priority(MessagePriority::Critical)
        .with_ttl(5000)
        .with_correlation_id("corr-123")
        .with_ack();

        assert_eq!(env.priority, MessagePriority::Critical);
        assert_eq!(env.ttl_ms, Some(5000));
        assert_eq!(env.correlation_id.as_deref(), Some("corr-123"));
        assert!(env.requires_ack);
    }

    #[tokio::test]
    async fn test_expired_message_is_dropped() {
        let bus = MessageBus::new();
        let _rx = bus.register("agent_c").await;

        // Create an envelope with TTL=0 (expired immediately)
        let mut env = MessageEnvelope::new(
            "src",
            "agent_c",
            AgentMessage::new_event("a", serde_json::json!({})),
        );
        // Set timestamp in the past so it's expired
        env.timestamp = chrono::Utc::now() - chrono::Duration::seconds(10);
        env.ttl_ms = Some(1); // 1ms TTL, 10s ago — definitely expired

        // Should succeed (silently dropped)
        let result = bus.send_envelope(env).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_send_envelope_delivers() {
        let bus = MessageBus::new();
        let mut rx = bus.register("agent_d").await;

        let env = MessageEnvelope::new(
            "orchestrator_1",
            "agent_d",
            AgentMessage::new_event("app_2", serde_json::json!({"key": "val"})),
        )
        .with_priority(MessagePriority::High);

        bus.send_envelope(env).await.unwrap();

        let received = rx.recv().await.unwrap();
        assert_eq!(received.source_agent_id, "orchestrator_1");
        assert_eq!(received.priority, MessagePriority::High);
    }

    #[tokio::test]
    async fn test_send_with_ack() {
        let bus = MessageBus::new();
        let mut rx = bus.register("agent_e").await;

        let env = MessageEnvelope::new(
            "sender",
            "agent_e",
            AgentMessage::new_event("a", serde_json::json!({})),
        );

        let ack_rx = bus.send_with_ack(env).await.unwrap();

        // Recipient receives the envelope
        let received = rx.recv().await.unwrap();
        assert!(received.requires_ack);
        assert!(received.correlation_id.is_some());

        // Recipient sends ack back
        let ack_env = MessageEnvelope::new(
            "agent_e",
            "sender",
            AgentMessage::new_event("a", serde_json::json!({"ack": true})),
        )
        .with_correlation_id(received.correlation_id.unwrap());

        bus.deliver_ack(&ack_env).await;

        // Original sender receives the ack
        let ack = ack_rx.await.unwrap();
        assert_eq!(ack.source_agent_id, "agent_e");
    }
}
