use std::collections::HashMap;
use std::time::Instant;
use tokio::sync::RwLock;
use tracing::debug;

use crate::action::types::Action;

/// A slot in working memory for a single agent.
#[derive(Debug)]
pub struct WorkingMemorySlot {
    pub agent_id: String,
    pub recent_actions: Vec<Action>,
    pub observations: Vec<String>,
    pub last_updated: Instant,
}

impl WorkingMemorySlot {
    pub fn new(agent_id: &str) -> Self {
        Self {
            agent_id: agent_id.to_string(),
            recent_actions: Vec::new(),
            observations: Vec::new(),
            last_updated: Instant::now(),
        }
    }

    /// Returns a summary for injection into LLM prompts.
    pub fn summary(&self) -> String {
        let action_summary: Vec<String> = self.recent_actions.iter()
            .rev()
            .take(5)
            .map(|a| format!("{}: {}", a.action_type, a.payload.to_string().chars().take(80).collect::<String>()))
            .collect();

        let obs_summary: Vec<String> = self.observations.iter()
            .rev()
            .take(3)
            .cloned()
            .collect();

        format!(
            "Recent actions: {}\nObservations: {}",
            if action_summary.is_empty() { "none".to_string() } else { action_summary.join("; ") },
            if obs_summary.is_empty() { "none".to_string() } else { obs_summary.join("; ") }
        )
    }
}

/// In-memory working memory — fast, auto-evicting.
/// Max 256 agent slots; expires after 5 minutes of inactivity.
pub struct WorkingMemory {
    slots: RwLock<HashMap<String, WorkingMemorySlot>>,
    max_slots: usize,
    ttl_secs: u64,
}

impl WorkingMemory {
    pub fn new() -> Self {
        Self {
            slots: RwLock::new(HashMap::new()),
            max_slots: 256,
            ttl_secs: 300, // 5 minutes
        }
    }

    pub async fn push_action(&self, agent_id: &str, action: Action) {
        let mut slots = self.slots.write().await;
        let slot = slots.entry(agent_id.to_string()).or_insert_with(|| WorkingMemorySlot::new(agent_id));
        slot.recent_actions.push(action);
        // Keep only last 20 actions per agent
        if slot.recent_actions.len() > 20 {
            let drain = slot.recent_actions.len() - 20;
            slot.recent_actions.drain(..drain);
        }
        slot.last_updated = Instant::now();
    }

    pub async fn push_observation(&self, agent_id: &str, observation: String) {
        let mut slots = self.slots.write().await;
        let slot = slots.entry(agent_id.to_string()).or_insert_with(|| WorkingMemorySlot::new(agent_id));
        slot.observations.push(observation);
        if slot.observations.len() > 20 {
            let drain = slot.observations.len() - 20;
            slot.observations.drain(..drain);
        }
        slot.last_updated = Instant::now();
    }

    pub async fn get_summary(&self, agent_id: &str) -> Option<String> {
        let slots = self.slots.read().await;
        slots.get(agent_id).map(|s| s.summary())
    }

    pub async fn expire_stale(&self) {
        let mut slots = self.slots.write().await;
        let before = slots.len();
        slots.retain(|_, slot| {
            slot.last_updated.elapsed().as_secs() < self.ttl_secs
        });
        let evicted = before - slots.len();
        if evicted > 0 {
            debug!(evicted, "Evicted stale working memory slots");
        }

        // If over max_slots, evict oldest
        if slots.len() > self.max_slots {
            let mut by_age: Vec<String> = slots.iter()
                .map(|(k, v)| (k.clone(), v.last_updated))
                .collect::<Vec<_>>()
                .iter()
                .map(|(k, _)| k.clone())
                .collect();
            by_age.sort_by(|a, b| {
                slots[a].last_updated.cmp(&slots[b].last_updated)
            });
            let to_remove = slots.len() - self.max_slots;
            for key in by_age.iter().take(to_remove) {
                slots.remove(key);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::types::{Action, ActionSource};

    fn make_action(action_type: &str) -> Action {
        Action::new(action_type.to_string(), serde_json::Value::Null, ActionSource::System)
    }

    #[tokio::test]
    async fn test_push_action_adds_to_slot() {
        let wm = WorkingMemory::new();
        wm.push_action("agent_a", make_action("test.action")).await;
        let summary = wm.get_summary("agent_a").await;
        assert!(summary.is_some());
        assert!(summary.unwrap().contains("test.action"));
    }

    #[tokio::test]
    async fn test_push_observation_adds_to_slot() {
        let wm = WorkingMemory::new();
        wm.push_observation("agent_b", "User is happy".to_string()).await;
        let summary = wm.get_summary("agent_b").await;
        assert!(summary.is_some());
        assert!(summary.unwrap().contains("User is happy"));
    }

    #[tokio::test]
    async fn test_get_summary_returns_formatted_text() {
        let wm = WorkingMemory::new();
        wm.push_action("agent_c", make_action("window.create")).await;
        wm.push_observation("agent_c", "Window opened".to_string()).await;
        let summary = wm.get_summary("agent_c").await.unwrap();
        assert!(summary.contains("Recent actions:"));
        assert!(summary.contains("Observations:"));
    }

    #[tokio::test]
    async fn test_max_actions_per_slot_is_20() {
        let wm = WorkingMemory::new();
        for i in 0..25 {
            wm.push_action("agent_d", make_action(&format!("action.{}", i))).await;
        }
        // Check that the slot has at most 20 actions
        let slots = wm.slots.read().await;
        let slot = slots.get("agent_d").unwrap();
        assert_eq!(slot.recent_actions.len(), 20);
    }

    #[tokio::test]
    async fn test_get_summary_returns_none_for_unknown_agent() {
        let wm = WorkingMemory::new();
        assert!(wm.get_summary("nonexistent").await.is_none());
    }
}
