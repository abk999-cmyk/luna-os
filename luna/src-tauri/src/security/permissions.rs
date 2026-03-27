use std::collections::HashMap;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tracing::{info, debug};

use crate::error::LunaError;
use crate::persistence::db::Database;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Allowed,
    Denied,
    PendingApproval,
}

/// The permission matrix: (agent_id, action_type) → PermissionState
pub struct PermissionMatrix {
    /// In-memory permission cache
    entries: HashMap<(String, String), PermissionState>,
    db: Arc<tokio::sync::Mutex<Database>>,
}

impl PermissionMatrix {
    pub fn new_with_defaults(db: Arc<tokio::sync::Mutex<Database>>) -> Self {
        let mut matrix = Self {
            entries: HashMap::new(),
            db,
        };
        matrix.apply_default_policy();
        matrix
    }

    fn apply_default_policy(&mut self) {
        // Conductor gets broad permissions for core actions
        let conductor_allowed = [
            "window.create", "window.close", "window.focus", "window.update_content",
            "window.minimize", "window.restore", "window.resize", "window.move",
            "agent.response", "agent.think", "agent.delegate", "agent.task.create",
            "agent.error", "system.notify", "memory.store", "memory.retrieve",
        ];
        for action in &conductor_allowed {
            self.entries.insert(
                ("conductor".to_string(), action.to_string()),
                PermissionState::Allowed,
            );
        }

        // Orchestrator gets task management actions
        let orchestrator_allowed = [
            "agent.response", "system.notify", "memory.store", "memory.retrieve",
            "agent.task.create",
        ];
        for action in &orchestrator_allowed {
            self.entries.insert(
                ("orchestrator_default".to_string(), action.to_string()),
                PermissionState::Allowed,
            );
        }
    }

    /// Check permission for an agent to perform an action.
    pub fn check(&self, agent_id: &str, action_type: &str) -> PermissionState {
        // System-level actions only auto-allowed for system/user sources, not agents
        if (action_type.starts_with("system.") || action_type.starts_with("user."))
            && (agent_id == "system" || agent_id == "user")
        {
            return PermissionState::Allowed;
        }

        // Check specific entry
        if let Some(state) = self.entries.get(&(agent_id.to_string(), action_type.to_string())) {
            return state.clone();
        }

        // Default: conductor is broadly permitted, others need approval
        if agent_id == "conductor" {
            PermissionState::Allowed
        } else {
            PermissionState::PendingApproval
        }
    }

    /// Grant permanent permission.
    pub fn grant(&mut self, agent_id: &str, action_type: &str, permanent: bool) -> Result<(), LunaError> {
        debug!(agent_id, action_type, permanent, "Granting permission");
        self.entries.insert(
            (agent_id.to_string(), action_type.to_string()),
            PermissionState::Allowed,
        );

        if permanent {
            // Persist to agent_state so it survives restart
            // (actual persistence handled at higher level via commands.rs)
            info!(agent_id, action_type, "Permission permanently granted");
        }

        Ok(())
    }

    /// Deny permission.
    pub fn deny(&mut self, agent_id: &str, action_type: &str) -> Result<(), LunaError> {
        debug!(agent_id, action_type, "Denying permission");
        self.entries.insert(
            (agent_id.to_string(), action_type.to_string()),
            PermissionState::Denied,
        );
        Ok(())
    }

    /// Load persisted granted permissions from agent state JSON.
    pub fn load_from_agent_state(&mut self, agent_id: &str, state: &serde_json::Value) {
        if let Some(perms) = state.get("granted_permissions").and_then(|v| v.as_array()) {
            for perm in perms {
                if let Some(action_type) = perm.as_str() {
                    self.entries.insert(
                        (agent_id.to_string(), action_type.to_string()),
                        PermissionState::Allowed,
                    );
                }
            }
        }
    }

    /// Serialize granted permissions for an agent into the state JSON.
    pub fn serialize_grants(&self, agent_id: &str) -> Vec<String> {
        self.entries.iter()
            .filter(|((aid, _), state)| aid == agent_id && **state == PermissionState::Allowed)
            .map(|((_, action), _)| action.clone())
            .collect()
    }

    pub fn log_decision(&self, agent_id: &str, action_type: &str, decision: &str) {
        let db = self.db.blocking_lock();
        let _ = db.permission_log_insert(agent_id, action_type, decision);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::db::Database;

    fn make_matrix() -> PermissionMatrix {
        let db = Database::new(":memory:").unwrap();
        let db = Arc::new(tokio::sync::Mutex::new(db));
        PermissionMatrix::new_with_defaults(db)
    }

    #[test]
    fn test_check_allowed_for_conductor_window_actions() {
        let matrix = make_matrix();
        assert_eq!(matrix.check("conductor", "window.create"), PermissionState::Allowed);
        assert_eq!(matrix.check("conductor", "window.close"), PermissionState::Allowed);
    }

    #[test]
    fn test_check_pending_for_unknown_agent() {
        let matrix = make_matrix();
        assert_eq!(matrix.check("rogue_agent", "window.create"), PermissionState::PendingApproval);
    }

    #[test]
    fn test_grant_changes_state_to_allowed() {
        let mut matrix = make_matrix();
        assert_eq!(matrix.check("leaf_1", "memory.store"), PermissionState::PendingApproval);
        matrix.grant("leaf_1", "memory.store", false).unwrap();
        assert_eq!(matrix.check("leaf_1", "memory.store"), PermissionState::Allowed);
    }

    #[test]
    fn test_deny_changes_state_to_denied() {
        let mut matrix = make_matrix();
        matrix.deny("leaf_1", "window.create").unwrap();
        assert_eq!(matrix.check("leaf_1", "window.create"), PermissionState::Denied);
    }

    #[test]
    fn test_system_actions_auto_allowed_for_system_agent() {
        let matrix = make_matrix();
        assert_eq!(matrix.check("system", "system.startup"), PermissionState::Allowed);
        assert_eq!(matrix.check("system", "system.notify"), PermissionState::Allowed);
    }

    #[test]
    fn test_system_actions_not_auto_allowed_for_regular_agent() {
        let matrix = make_matrix();
        // A non-system, non-conductor agent asking for system.* gets PendingApproval
        assert_eq!(matrix.check("leaf_agent", "system.startup"), PermissionState::PendingApproval);
    }

    #[test]
    fn test_serialize_grants_returns_correct_list() {
        let mut matrix = make_matrix();
        matrix.grant("test_agent", "window.create", false).unwrap();
        matrix.grant("test_agent", "memory.store", false).unwrap();
        matrix.deny("test_agent", "window.close").unwrap();
        let grants = matrix.serialize_grants("test_agent");
        assert!(grants.contains(&"window.create".to_string()));
        assert!(grants.contains(&"memory.store".to_string()));
        assert!(!grants.contains(&"window.close".to_string()));
    }
}
