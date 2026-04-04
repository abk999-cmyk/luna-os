use std::collections::HashMap;
use std::sync::Arc;
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
    db: Arc<tokio::sync::Mutex<Database>>,
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
        db: Arc<tokio::sync::Mutex<Database>>,
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
        // Evict stale pending actions (older than 5 min) when map grows large
        {
            let cutoff = chrono::Utc::now() - chrono::Duration::minutes(5);
            let mut pending = self.pending_actions.write().await;
            if pending.len() > 10 {
                pending.retain(|_, a| a.timestamp > cutoff);
            }
        }

        // Check payload size (max 1MB)
        let payload_size = serde_json::to_string(&action.payload).map(|s| s.len()).unwrap_or(0);
        if payload_size > 1_048_576 {
            return Err(LunaError::Dispatch(format!("Action payload too large: {} bytes (max 1MB)", payload_size)));
        }

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
                    self.audit.log(&agent_id, &action.action_type, "denied").await;
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
                            self.audit.log(&agent_id, &action.action_type, "pending_approval").await;
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

        // ── 4. Record action ID before status change ─────────────────────────
        let action_id = action.id;

        // ── 5. Push to history (still Queued at this point) ─────────────────
        {
            let mut history = self.history.write().await;
            history.push(action.clone());
        }

        // ── 6. Persist to DB ─────────────────────────────────────────────────
        {
            let db = self.db.lock().await;
            let session_id = self.session_id.try_read().ok().and_then(|s| s.clone());
            if let Err(e) = db.insert_action(&action, session_id.as_deref()) {
                warn!(error = %e, "Failed to persist action to DB");
            }
        }

        // ── 7. Update status to Dispatched ───────────────────────────────────
        action.status = ActionStatus::Dispatched;

        info!(
            action_id = %action_id,
            action_type = %action.action_type,
            agent_id = %agent_id,
            "Action dispatched"
        );

        // ── 8. Enqueue for processing ─────────────────────────────────────────
        let action_type = action.action_type.clone();
        if let Err(e) = self.queue.enqueue(action) {
            // Enqueue failed — mark as Failed in history
            warn!(error = %e, "Failed to enqueue action");
            let mut history = self.history.write().await;
            history.update_status(&action_id, ActionStatus::Failed(format!("enqueue failed: {}", e)));
            return Err(e);
        }

        // ── 9. Increment usage counter ───────────────────────────────────────
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

    /// Approve a pending action and dispatch it directly, bypassing permission check.
    pub async fn approve_pending(&self, action_id: &str) -> Result<ActionId, LunaError> {
        let mut action = {
            let mut pending = self.pending_actions.write().await;
            pending.remove(action_id).ok_or_else(|| {
                LunaError::Dispatch(format!("No pending action with id: {}", action_id))
            })?
        };

        let agent_id = match &action.source {
            crate::action::types::ActionSource::Agent(id) => id.clone(),
            crate::action::types::ActionSource::User => "user".to_string(),
            crate::action::types::ActionSource::System => "system".to_string(),
        };

        info!(action_id = %action_id, action_type = %action.action_type, agent_id = %agent_id, "Pending action approved — dispatching directly");
        self.audit.log(&agent_id, &action.action_type, "approved_by_user").await;

        // Dispatch directly to queue, bypassing permission check (user already approved)
        let aid = action.id;

        {
            let mut history = self.history.write().await;
            history.push(action.clone());
        }

        {
            let db = self.db.lock().await;
            let session_id = self.session_id.try_read().ok().and_then(|s| s.clone());
            if let Err(e) = db.insert_action(&action, session_id.as_deref()) {
                warn!(error = %e, "Failed to persist approved action to DB");
            }
        }

        action.status = ActionStatus::Dispatched;
        let action_type = action.action_type.clone();
        if let Err(e) = self.queue.enqueue(action) {
            warn!(error = %e, "Failed to enqueue approved action");
            let mut history = self.history.write().await;
            history.update_status(&aid, ActionStatus::Failed(format!("enqueue failed: {}", e)));
            return Err(e);
        }

        {
            let mut registry = self.registry.write().await;
            registry.increment_usage(&action_type);
        }

        Ok(aid)
    }

    /// Deny and discard a pending action.
    pub async fn deny_pending(&self, action_id: &str) -> Result<(), LunaError> {
        let mut pending = self.pending_actions.write().await;
        let action = pending.remove(action_id).ok_or_else(|| {
            LunaError::Dispatch(format!("No pending action with id: {}", action_id))
        })?;
        warn!(action_id = %action_id, action_type = %action.action_type, "Pending action denied");
        self.audit.log("user", &action.action_type, "denied_by_user").await;
        Ok(())
    }

    /// Get details of a pending action (for the permission dialog).
    pub async fn get_pending_action(&self, action_id: &str) -> Option<Action> {
        let pending = self.pending_actions.read().await;
        pending.get(action_id).cloned()
    }

    /// Remove pending actions older than max_age.
    pub async fn cleanup_stale_pending(&self, max_age: std::time::Duration) {
        let now = chrono::Utc::now();
        let mut pending = self.pending_actions.write().await;
        let before = pending.len();
        pending.retain(|_, action| {
            let age = now - action.timestamp;
            age.to_std().map(|d| d < max_age).unwrap_or(true)
        });
        let removed = before - pending.len();
        if removed > 0 {
            info!(removed, "Cleaned up stale pending actions");
        }
    }
}
