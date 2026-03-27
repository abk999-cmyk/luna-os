use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

use crate::error::LunaError;
use crate::persistence::db::Database;

/// Seconds in 24 hours.
const UNDO_TTL_SECS: i64 = 86_400;

// ── Data types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoEntry {
    pub id: String,
    pub action_id: String,
    pub action_type: String,
    pub agent_id: String,
    pub inverse_operation: InverseOperation,
    pub description: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub executed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InverseOperation {
    /// Delete a file that was created
    DeleteFile { path: String },
    /// Restore file content that was overwritten
    RestoreFile {
        path: String,
        original_content: String,
    },
    /// Remove a window that was created
    RemoveWindow { window_id: String },
    /// Restore a window that was closed
    RestoreWindow { window_state_json: String },
    /// Reverse a semantic memory change
    RestoreSemanticEntry {
        key: String,
        original_value: Option<String>,
    },
    /// Generic: store the inverse as a JSON action to re-dispatch
    ReplayAction {
        action_type: String,
        payload: serde_json::Value,
    },
    /// No inverse possible
    NonReversible { reason: String },
}

// ── UndoManager ─────────────────────────────────────────────────────────────

pub struct UndoManager {
    db: Arc<Mutex<Database>>,
}

impl UndoManager {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self { db }
    }

    /// Record an undo entry for a completed action.
    pub fn record(&self, entry: &UndoEntry) -> Result<(), LunaError> {
        let inverse_json = serde_json::to_string(&entry.inverse_operation)?;
        let db = self.db.blocking_lock();
        db.undo_insert(
            &entry.id,
            &entry.action_id,
            &entry.action_type,
            &entry.agent_id,
            &inverse_json,
            &entry.description,
            entry.created_at,
            entry.expires_at,
        )
    }

    /// Get the most recent N undo entries (not yet executed, not expired).
    pub fn get_recent(&self, limit: usize) -> Result<Vec<UndoEntry>, LunaError> {
        let db = self.db.blocking_lock();
        let rows = db.undo_get_recent(limit)?;
        Self::rows_to_entries(rows)
    }

    /// Get undo entry by action_id.
    pub fn get_by_action(&self, action_id: &str) -> Result<Option<UndoEntry>, LunaError> {
        let db = self.db.blocking_lock();
        match db.undo_get_by_action(action_id)? {
            Some(row) => Ok(Some(Self::row_to_entry(row)?)),
            None => Ok(None),
        }
    }

    /// Mark an undo entry as executed.
    pub fn mark_executed(&self, id: &str) -> Result<(), LunaError> {
        let db = self.db.blocking_lock();
        db.undo_mark_executed(id)
    }

    /// Purge expired entries (older than 24 hours).
    pub fn purge_expired(&self) -> Result<usize, LunaError> {
        let db = self.db.blocking_lock();
        db.undo_purge_expired()
    }

    /// Get the inverse operation for the last N actions (most-recent-first).
    pub fn get_undo_stack(&self, limit: usize) -> Result<Vec<UndoEntry>, LunaError> {
        // Same as get_recent — the DB query already orders most-recent-first.
        self.get_recent(limit)
    }

    /// Check if an action type is reversible.
    pub fn is_reversible(action_type: &str) -> bool {
        matches!(
            action_type,
            "file.write"
                | "file.create"
                | "file.delete"
                | "window.create"
                | "window.close"
                | "memory.store"
                | "app.create"
                | "app.destroy"
        )
    }

    /// Create an undo entry from an action and its result.
    pub fn create_entry(
        action_id: &str,
        action_type: &str,
        agent_id: &str,
        payload: &serde_json::Value,
        result: &serde_json::Value,
    ) -> UndoEntry {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let inverse_operation = match action_type {
            "file.write" => {
                let path = payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let original_content = result
                    .get("original_content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                InverseOperation::RestoreFile {
                    path,
                    original_content,
                }
            }
            "file.create" => {
                let path = payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                InverseOperation::DeleteFile { path }
            }
            "file.delete" => {
                let path = payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let original_content = result
                    .get("original_content")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                InverseOperation::RestoreFile {
                    path,
                    original_content,
                }
            }
            "window.create" => {
                let window_id = result
                    .get("window_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                InverseOperation::RemoveWindow { window_id }
            }
            "window.close" => {
                let window_state_json = serde_json::to_string(payload).unwrap_or_default();
                InverseOperation::RestoreWindow { window_state_json }
            }
            "memory.store" => {
                let key = payload
                    .get("key")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let original_value = result
                    .get("original_value")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                InverseOperation::RestoreSemanticEntry {
                    key,
                    original_value,
                }
            }
            "app.create" | "app.destroy" => InverseOperation::ReplayAction {
                action_type: action_type.to_string(),
                payload: payload.clone(),
            },
            _ => InverseOperation::NonReversible {
                reason: format!("No inverse defined for action type '{}'", action_type),
            },
        };

        let description = format!("Undo {} by agent {}", action_type, agent_id);

        UndoEntry {
            id: uuid::Uuid::new_v4().to_string(),
            action_id: action_id.to_string(),
            action_type: action_type.to_string(),
            agent_id: agent_id.to_string(),
            inverse_operation,
            description,
            created_at: now,
            expires_at: now + UNDO_TTL_SECS,
            executed: false,
        }
    }

    /// Create and record an undo entry directly from a dispatched Action.
    ///
    /// Inspects the action type and builds the inverse operation.  Returns an
    /// error only when persistence fails; non-reversible actions are silently
    /// recorded with `InverseOperation::NonReversible`.
    pub fn create_entry_from_action(
        &self,
        action: &crate::action::types::Action,
        agent_id: &str,
    ) -> Result<(), LunaError> {
        if !Self::is_reversible(&action.action_type) {
            return Ok(()); // skip non-reversible actions silently
        }
        let entry = Self::create_entry(
            &action.id.to_string(),
            &action.action_type,
            agent_id,
            &action.payload,
            &serde_json::json!({}), // result context not available at dispatch site
        );
        self.record(&entry)
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    fn rows_to_entries(rows: Vec<UndoRow>) -> Result<Vec<UndoEntry>, LunaError> {
        rows.into_iter().map(Self::row_to_entry).collect()
    }

    fn row_to_entry(row: UndoRow) -> Result<UndoEntry, LunaError> {
        let inverse_operation: InverseOperation = serde_json::from_str(&row.inverse_json)?;
        Ok(UndoEntry {
            id: row.id,
            action_id: row.action_id,
            action_type: row.action_type,
            agent_id: row.agent_id,
            inverse_operation,
            description: row.description,
            created_at: row.created_at,
            expires_at: row.expires_at,
            executed: row.executed,
        })
    }
}

/// Internal row representation returned from DB helpers.
pub struct UndoRow {
    pub id: String,
    pub action_id: String,
    pub action_type: String,
    pub agent_id: String,
    pub inverse_json: String,
    pub description: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub executed: bool,
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_db() -> Arc<Mutex<Database>> {
        Arc::new(Mutex::new(Database::new(":memory:").unwrap()))
    }

    fn make_entry(action_id: &str, action_type: &str) -> UndoEntry {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        UndoEntry {
            id: uuid::Uuid::new_v4().to_string(),
            action_id: action_id.to_string(),
            action_type: action_type.to_string(),
            agent_id: "agent-1".to_string(),
            inverse_operation: InverseOperation::DeleteFile {
                path: "/tmp/test.txt".to_string(),
            },
            description: "test undo".to_string(),
            created_at: now,
            expires_at: now + UNDO_TTL_SECS,
            executed: false,
        }
    }

    #[test]
    fn test_record_and_retrieve() {
        let db = make_db();
        let mgr = UndoManager::new(db);
        let entry = make_entry("act-1", "file.create");

        mgr.record(&entry).unwrap();
        let recent = mgr.get_recent(10).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].action_id, "act-1");
    }

    #[test]
    fn test_mark_executed_filters_from_recent() {
        let db = make_db();
        let mgr = UndoManager::new(db);

        let e1 = make_entry("act-1", "file.create");
        let e2 = make_entry("act-2", "file.write");
        let id1 = e1.id.clone();
        mgr.record(&e1).unwrap();
        mgr.record(&e2).unwrap();

        mgr.mark_executed(&id1).unwrap();
        let recent = mgr.get_recent(10).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].action_id, "act-2");
    }

    #[test]
    fn test_is_reversible_known_types() {
        assert!(UndoManager::is_reversible("file.write"));
        assert!(UndoManager::is_reversible("file.create"));
        assert!(UndoManager::is_reversible("file.delete"));
        assert!(UndoManager::is_reversible("window.create"));
        assert!(UndoManager::is_reversible("window.close"));
        assert!(UndoManager::is_reversible("memory.store"));
        assert!(UndoManager::is_reversible("app.create"));
        assert!(UndoManager::is_reversible("app.destroy"));
        assert!(!UndoManager::is_reversible("system.shutdown"));
        assert!(!UndoManager::is_reversible("unknown.action"));
    }

    #[test]
    fn test_create_entry_file_write_maps_to_restore_file() {
        let payload = serde_json::json!({"path": "/tmp/hello.txt"});
        let result = serde_json::json!({"original_content": "old content"});
        let entry = UndoManager::create_entry("act-fw", "file.write", "agent-1", &payload, &result);

        match &entry.inverse_operation {
            InverseOperation::RestoreFile {
                path,
                original_content,
            } => {
                assert_eq!(path, "/tmp/hello.txt");
                assert_eq!(original_content, "old content");
            }
            other => panic!("Expected RestoreFile, got {:?}", other),
        }
    }

    #[test]
    fn test_create_entry_unknown_maps_to_non_reversible() {
        let payload = serde_json::json!({});
        let result = serde_json::json!({});
        let entry =
            UndoManager::create_entry("act-unk", "system.reboot", "agent-1", &payload, &result);

        match &entry.inverse_operation {
            InverseOperation::NonReversible { reason } => {
                assert!(reason.contains("system.reboot"));
            }
            other => panic!("Expected NonReversible, got {:?}", other),
        }
    }

    #[test]
    fn test_get_by_action() {
        let db = make_db();
        let mgr = UndoManager::new(db);
        let entry = make_entry("act-lookup", "file.create");
        mgr.record(&entry).unwrap();

        let found = mgr.get_by_action("act-lookup").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().action_id, "act-lookup");

        let not_found = mgr.get_by_action("nonexistent").unwrap();
        assert!(not_found.is_none());
    }
}
