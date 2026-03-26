use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;
use tracing::{info, warn};

use super::history::ActionHistory;
use super::queue::ActionQueue;
use super::registry::ActionTypeRegistry;
use super::types::{Action, ActionId, ActionStatus};
use crate::error::LunaError;
use crate::persistence::db::Database;
use crate::security::{AuditLog, PermissionMatrix, PermissionState};

pub struct ActionDispatcher {
    registry: Arc<RwLock<ActionTypeRegistry>>,
    history: Arc<RwLock<ActionHistory>>,
    queue: ActionQueue,
    db: Arc<Mutex<Option<Database>>>,
    session_id: RwLock<Option<String>>,
    permissions: Arc<RwLock<PermissionMatrix>>,
    audit: Arc<AuditLog>,
    pending_actions: RwLock<HashMap<String, Action>>,
}

impl ActionDispatcher {
    pub fn new(
        registry: Arc<RwLock<ActionTypeRegistry>>,
        history: Arc<RwLock<ActionHistory>>,
        queue: ActionQueue,
        db: Arc<Mutex<Option<Database>>>,
        permissions: Arc<RwLock<PermissionMatrix>>,
        audit: Arc<AuditLog>,
    ) -> Self {
        Self {
            registry,
            history,
            queue,
            db,
            session_id: RwLock::new(None),
            permissions,
            audit,
            pending_actions: RwLock::new(HashMap::new()),
        }
    }

    pub async fn set_session_id(&self, session_id: String) {
        let mut sid = self.session_id.write().await;
        *sid = Some(session_id);
    }

    pub async fn dispatch(&self, mut action: Action) -> Result<ActionId, LunaError> {
        let agent_id = match &action.source {
            crate::action::types::ActionSource::Agent(id) => id.clone(),
            crate::action::types::ActionSource::User => "user".to_string(),
            crate::action::types::ActionSource::System => "system".to_string(),
        };

        // ── 1. Permission check ──────────────────────────────────────────────
        {
            let perms = self.permissions.read().await;
            match perms.check(&agent_id, &action.action_type) {
                PermissionState::Denied => {
                    warn!(
                        agent_id = %agent_id,
                        action_type = %action.action_type,
                        "Action denied by permission matrix"
                    );
                    self.audit.log(&agent_id, &action.action_type, "denied").ok();
                    return Err(LunaError::Dispatch(format!(
                        "Permission denied: agent '{}' cannot perform '{}'",
                        agent_id, action.action_type
                    )));
                }
                PermissionState::PendingApproval => {
                    // User and system actions pass through; agent actions need approval.
                    match &action.source {
                        crate::action::types::ActionSource::User
                        | crate::action::types::ActionSource::System => {
                            // Allow user/system actions through
                        }
                        crate::action::types::ActionSource::Agent(_) => {
                            warn!(
                                agent_id = %agent_id,
                                action_type = %action.action_type,
                                "Action requires user approval — parking"
                            );
                            self.audit.log(&agent_id, &action.action_type, "pending_approval").ok();
                            let action_id = action.id.to_string();
                            {
                                let mut pending = self.pending_actions.write().await;
                                pending.insert(action_id.clone(), action);
                            }
                            return Err(LunaError::PendingApproval(action_id));
                        }
                    }
                }
                PermissionState::Allowed => {}
            }
        }

        // ── 2. Validate action type exists in registry ───────────────────────
        let registry = self.registry.read().await;
        if !registry.validate(&action.action_type) {
            warn!(action_type = %action.action_type, "Unknown action type rejected");
            return Err(LunaError::Dispatch(format!(
                "Unknown action type: {}",
                action.action_type
            )));
        }

        // ── 3. Validate payload schema ───────────────────────────────────────
        if let Err(e) = registry.validate_payload(&action.action_type, &action.payload) {
            warn!(
                action_type = %action.action_type,
                error = %e,
                "Action payload schema validation failed"
            );
            return Err(LunaError::Dispatch(format!(
                "Schema validation failed for '{}': {}",
                action.action_type, e
            )));
        }
        drop(registry);

        // ── 4. Update status ─────────────────────────────────────────────────
        action.status = ActionStatus::Dispatched;
        let action_id = action.id;

        // ── 5. Push to history ───────────────────────────────────────────────
        {
            let mut history = self.history.write().await;
            history.push(action.clone());
        }

        // ── 6. Persist to DB ─────────────────────────────────────────────────
        {
            let db_guard = self.db.lock().unwrap();
            if let Some(ref db) = *db_guard {
                let session_id = self.session_id.try_read().ok().and_then(|s| s.clone());
                if let Err(e) = db.insert_action(&action, session_id.as_deref()) {
                    warn!(error = %e, "Failed to persist action to DB");
                }
            }
        }

        info!(
            action_id = %action_id,
            action_type = %action.action_type,
            agent_id = %agent_id,
            "Action dispatched"
        );

        // ── 7. Enqueue for processing ─────────────────────────────────────────
        let action_type = action.action_type.clone();
        self.queue.enqueue(action)?;

        // ── 8. Increment usage counter ───────────────────────────────────────
        {
            let mut registry = self.registry.write().await;
            registry.increment_usage(&action_type);
        }

        Ok(action_id)
    }

    /// Get a read guard on the action registry (for system prompt generation).
    pub async fn get_registry(&self) -> tokio::sync::RwLockReadGuard<'_, ActionTypeRegistry> {
        self.registry.read().await
    }

    pub async fn query_recent(&self, limit: usize) -> Vec<Action> {
        let history = self.history.read().await;
        history.recent(limit).into_iter().cloned().collect()
    }

    pub async fn query_by_type(&self, action_type: &str) -> Vec<Action> {
        let history = self.history.read().await;
        history.query_by_type(action_type).into_iter().cloned().collect()
    }

    /// Approve a pending action and re-dispatch it (bypasses permission check).
    pub async fn approve_pending(&self, action_id: &str) -> Result<ActionId, LunaError> {
        let action = {
            let mut pending = self.pending_actions.write().await;
            pending.remove(action_id).ok_or_else(|| {
                LunaError::Dispatch(format!("No pending action with id: {}", action_id))
            })?
        };
        info!(action_id = %action_id, action_type = %action.action_type, "Pending action approved");
        // Re-dispatch — grant temporary permission so it passes this time
        {
            let mut perms = self.permissions.write().await;
            let agent_id = match &action.source {
                crate::action::types::ActionSource::Agent(id) => id.clone(),
                _ => "system".to_string(),
            };
            perms.grant(&agent_id, &action.action_type, false).ok();
        }
        self.dispatch(action).await
    }

    /// Deny and discard a pending action.
    pub async fn deny_pending(&self, action_id: &str) -> Result<(), LunaError> {
        let mut pending = self.pending_actions.write().await;
        let action = pending.remove(action_id).ok_or_else(|| {
            LunaError::Dispatch(format!("No pending action with id: {}", action_id))
        })?;
        warn!(action_id = %action_id, action_type = %action.action_type, "Pending action denied");
        self.audit.log("user", &action.action_type, "denied_by_user").ok();
        Ok(())
    }

    /// Get details of a pending action (for the permission dialog).
    pub async fn get_pending_action(&self, action_id: &str) -> Option<Action> {
        let pending = self.pending_actions.read().await;
        pending.get(action_id).cloned()
    }
}
