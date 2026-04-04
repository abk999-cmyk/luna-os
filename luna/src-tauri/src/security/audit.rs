use std::sync::Arc;
use tokio::sync::Mutex;

use crate::error::LunaError;
use crate::persistence::db::Database;

/// Audit log for all permission decisions.
pub struct AuditLog {
    db: Arc<Mutex<Database>>,
}

impl AuditLog {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self { db }
    }

    pub async fn log(&self, agent_id: &str, action_type: &str, decision: &str) {
        let db = self.db.lock().await;
        if let Err(e) = db.permission_log_insert(agent_id, action_type, decision) {
            tracing::warn!(error = %e, "Failed to write audit log entry");
        }
    }

    pub async fn query(&self, agent_id: Option<&str>, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let db = self.db.lock().await;
        db.permission_log_query(agent_id, limit)
    }
}
