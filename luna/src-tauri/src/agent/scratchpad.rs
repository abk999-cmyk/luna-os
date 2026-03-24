use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tracing::debug;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScratchpadEntry {
    pub task_id: String,
    pub agent_id: String,
    pub step: u32,
    pub content: String,
    pub timestamp: u64,
}

impl ScratchpadEntry {
    pub fn new(task_id: &str, agent_id: &str, step: u32, content: &str) -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Self {
            task_id: task_id.to_string(),
            agent_id: agent_id.to_string(),
            step,
            content: content.to_string(),
            timestamp,
        }
    }
}

/// Shared blackboard for agents to post intermediate results.
/// Auto-clears entries older than 1 hour.
pub struct Scratchpad {
    /// workspace_id → entries
    entries: RwLock<HashMap<String, Vec<ScratchpadEntry>>>,
}

impl Scratchpad {
    pub fn new() -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
        }
    }

    pub async fn write(
        &self,
        workspace_id: &str,
        task_id: &str,
        agent_id: &str,
        step: u32,
        content: &str,
        app: Option<&AppHandle>,
    ) {
        let entry = ScratchpadEntry::new(task_id, agent_id, step, content);

        {
            let mut map = self.entries.write().await;
            map.entry(workspace_id.to_string())
                .or_insert_with(Vec::new)
                .push(entry.clone());
        }

        debug!(workspace_id, agent_id, step, "Scratchpad entry written");

        // Emit event to frontend
        if let Some(handle) = app {
            let _ = handle.emit("scratchpad-update", serde_json::json!({
                "workspace_id": workspace_id,
                "entry": entry
            }));
        }
    }

    pub async fn read(&self, workspace_id: &str) -> Vec<ScratchpadEntry> {
        let map = self.entries.read().await;
        map.get(workspace_id)
            .cloned()
            .unwrap_or_default()
    }

    pub async fn clear_task(&self, workspace_id: &str, task_id: &str) {
        let mut map = self.entries.write().await;
        if let Some(entries) = map.get_mut(workspace_id) {
            entries.retain(|e| e.task_id != task_id);
        }
    }

    /// Remove entries older than 1 hour.
    pub async fn evict_stale(&self) {
        let cutoff = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| (d.as_millis() as u64).saturating_sub(3_600_000))
            .unwrap_or(0);

        let mut map = self.entries.write().await;
        for entries in map.values_mut() {
            let before = entries.len();
            entries.retain(|e| e.timestamp > cutoff);
            let evicted = before - entries.len();
            if evicted > 0 {
                debug!(evicted, "Evicted stale scratchpad entries");
            }
        }
    }
}
