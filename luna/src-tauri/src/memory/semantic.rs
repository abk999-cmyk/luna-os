use std::sync::{Arc, Mutex};

use crate::error::LunaError;
use crate::persistence::db::Database;

/// Semantic memory — a key-value store for facts and knowledge snippets.
/// In Phase 5 this will be upgraded to vector embeddings.
pub struct SemanticMemory {
    db: Arc<Mutex<Option<Database>>>,
}

impl SemanticMemory {
    pub fn new(db: Arc<Mutex<Option<Database>>>) -> Self {
        Self { db }
    }

    pub fn store(&self, key: &str, value: &str, tags: &[String]) -> Result<(), LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            let tags_str = serde_json::to_string(&tags)?;
            db.semantic_store(key, value, &tags_str)?;
        }
        Ok(())
    }

    pub fn get(&self, key: &str) -> Result<Option<String>, LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            return db.semantic_get(key);
        }
        Ok(None)
    }

    pub fn search_by_tag(&self, tag: &str) -> Result<Vec<(String, String)>, LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            return db.semantic_search_by_tag(tag);
        }
        Ok(Vec::new())
    }
}

/// Per-agent persistent state store.
pub struct AgentStateStore {
    db: Arc<Mutex<Option<Database>>>,
}

impl AgentStateStore {
    pub fn new(db: Arc<Mutex<Option<Database>>>) -> Self {
        Self { db }
    }

    pub fn load(&self, agent_id: &str) -> Result<serde_json::Value, LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            if let Some(state) = db.agent_state_load(agent_id)? {
                return Ok(state);
            }
        }
        Ok(serde_json::json!({
            "token_counts": { "input": 0, "output": 0 },
            "preferences": {},
            "capability_registry": []
        }))
    }

    pub fn save(&self, agent_id: &str, state: &serde_json::Value) -> Result<(), LunaError> {
        let db_guard = self.db.lock().unwrap();
        if let Some(ref db) = *db_guard {
            db.agent_state_save(agent_id, state)?;
        }
        Ok(())
    }

    /// Increment token usage counts for an agent.
    pub fn record_tokens(&self, agent_id: &str, input: u32, output: u32) -> Result<(), LunaError> {
        let mut state = self.load(agent_id)?;
        let counts = state.get_mut("token_counts")
            .and_then(|v| v.as_object_mut())
            .cloned()
            .unwrap_or_default();

        let total_input = counts.get("input").and_then(|v| v.as_u64()).unwrap_or(0) + input as u64;
        let total_output = counts.get("output").and_then(|v| v.as_u64()).unwrap_or(0) + output as u64;

        if let Some(obj) = state.as_object_mut() {
            obj.insert("token_counts".to_string(), serde_json::json!({
                "input": total_input,
                "output": total_output
            }));
        }
        self.save(agent_id, &state)
    }
}
