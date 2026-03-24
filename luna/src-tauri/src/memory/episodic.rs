use std::sync::{Arc, Mutex};
use uuid::Uuid;

use crate::error::LunaError;
use crate::persistence::db::Database;

/// Episodic memory — a timeline of events per agent/session.
/// Backed by SQLite for durability.
pub struct EpisodicMemory {
    db: Arc<Mutex<Option<Database>>>,
}

impl EpisodicMemory {
    pub fn new(db: Arc<Mutex<Option<Database>>>) -> Self {
        Self { db }
    }

    /// Record an event in episodic memory.
    pub fn record(
        &self,
        session_id: &str,
        agent_id: &str,
        action_type: &str,
        payload: &serde_json::Value,
        result: &serde_json::Value,
        tags: &[String],
    ) -> Result<(), LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            let id = Uuid::new_v4().to_string();
            let payload_str = serde_json::to_string(payload)?;
            let result_str = serde_json::to_string(result)?;
            let tags_str = serde_json::to_string(&tags)?;
            db.episodic_record(&id, session_id, agent_id, action_type, &payload_str, &result_str, &tags_str)?;
        }
        Ok(())
    }

    /// Query the full timeline for a session.
    pub fn query_session(&self, session_id: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            return db.episodic_query_session(session_id, limit);
        }
        Ok(Vec::new())
    }

    /// Purge events older than `days` days. Called once per session start.
    pub fn purge_old(&self, days: i64) -> Result<usize, LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            return db.episodic_purge_old(days);
        }
        Ok(0)
    }

    /// Get a summary of recent episodic events for prompt injection.
    pub fn recent_summary(&self, session_id: &str, limit: usize) -> String {
        match self.query_session(session_id, limit) {
            Ok(events) if !events.is_empty() => {
                let lines: Vec<String> = events.iter().rev().take(5).map(|e| {
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
