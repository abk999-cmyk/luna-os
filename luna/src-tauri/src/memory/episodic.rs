use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::LunaError;
use crate::persistence::db::Database;

/// Episodic memory — a timeline of events per agent/session.
/// Backed by SQLite for durability.
pub struct EpisodicMemory {
    db: Arc<Mutex<Database>>,
}

impl EpisodicMemory {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self { db }
    }

    /// Record an event in episodic memory.
    pub async fn record(
        &self,
        session_id: &str,
        agent_id: &str,
        action_type: &str,
        payload: &serde_json::Value,
        result: &serde_json::Value,
        tags: &[String],
        category: &str,
        duration_ms: Option<i64>,
    ) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        let id = Uuid::new_v4().to_string();
        let payload_str = serde_json::to_string(payload)?;
        let result_str = serde_json::to_string(result)?;
        let tags_str = serde_json::to_string(&tags)?;
        db.episodic_record(&id, session_id, agent_id, action_type, &payload_str, &result_str, &tags_str, category, duration_ms)?;
        Ok(())
    }

    /// Query the full timeline for a session.
    pub async fn query_session(&self, session_id: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let db = self.db.lock().await;
        db.episodic_query_session(session_id, limit)
    }

    pub async fn query_by_agent(&self, agent_id: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let db = self.db.lock().await;
        db.episodic_query_by_agent(agent_id, limit)
    }

    pub async fn query_time_range(&self, start_ms: i64, end_ms: i64, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let db = self.db.lock().await;
        db.episodic_query_time_range(start_ms, end_ms, limit)
    }

    pub async fn query_by_category(&self, category: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let db = self.db.lock().await;
        db.episodic_query_by_category(category, limit)
    }

    /// Purge events older than `days` days. Called once per session start.
    pub async fn purge_old(&self, days: i64) -> Result<usize, LunaError> {
        let db = self.db.lock().await;
        db.episodic_purge_old(days)
    }

    /// Synchronous purge for use at startup (before tokio runtime is fully running).
    pub fn purge_old_sync(&self, days: i64) -> Result<usize, LunaError> {
        let db = self.db.blocking_lock();
        db.episodic_purge_old(days)
    }

    /// Get a summary of recent episodic events for prompt injection.
    pub async fn recent_summary(&self, session_id: &str, limit: usize) -> String {
        match self.query_session(session_id, limit).await {
            Ok(events) if !events.is_empty() => {
                let lines: Vec<String> = events.iter().take(5).map(|e| {
                    format!("[{}] {}",
                        e.get("agent_id").and_then(|v| v.as_str()).unwrap_or("?"),
                        e.get("action_type").and_then(|v| v.as_str()).unwrap_or("?")
                    )
                }).collect();
                lines.join("\n")
            }
            _ => "No episodic events yet.".to_string(),
        }
    }
}
