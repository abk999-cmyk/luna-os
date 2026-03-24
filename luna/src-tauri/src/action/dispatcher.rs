use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;
use tracing::{info, warn};

use super::history::ActionHistory;
use super::queue::ActionQueue;
use super::registry::ActionTypeRegistry;
use super::types::{Action, ActionId, ActionStatus};
use crate::error::LunaError;
use crate::persistence::db::Database;

pub struct ActionDispatcher {
    registry: Arc<RwLock<ActionTypeRegistry>>,
    history: Arc<RwLock<ActionHistory>>,
    queue: ActionQueue,
    db: Arc<Mutex<Option<Database>>>,
    session_id: RwLock<Option<String>>,
}

impl ActionDispatcher {
    pub fn new(
        registry: Arc<RwLock<ActionTypeRegistry>>,
        history: Arc<RwLock<ActionHistory>>,
        queue: ActionQueue,
        db: Arc<Mutex<Option<Database>>>,
    ) -> Self {
        Self {
            registry,
            history,
            queue,
            db,
            session_id: RwLock::new(None),
        }
    }

    pub async fn set_session_id(&self, session_id: String) {
        let mut sid = self.session_id.write().await;
        *sid = Some(session_id);
    }

    pub async fn dispatch(&self, mut action: Action) -> Result<ActionId, LunaError> {
        // 1. Validate action type exists in registry
        let registry = self.registry.read().await;
        if !registry.validate(&action.action_type) {
            warn!(action_type = %action.action_type, "Unknown action type rejected");
            return Err(LunaError::Dispatch(format!(
                "Unknown action type: {}",
                action.action_type
            )));
        }
        drop(registry);

        // 2. Update status
        action.status = ActionStatus::Dispatched;
        let action_id = action.id;

        // 3. Push to history
        {
            let mut history = self.history.write().await;
            history.push(action.clone());
        }

        // 4. Persist to DB if available
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
            "Action dispatched"
        );

        // 5. Enqueue for processing
        self.queue.enqueue(action)?;

        Ok(action_id)
    }

    pub async fn query_recent(&self, limit: usize) -> Vec<Action> {
        let history = self.history.read().await;
        history.recent(limit).into_iter().cloned().collect()
    }

    pub async fn query_by_type(&self, action_type: &str) -> Vec<Action> {
        let history = self.history.read().await;
        history.query_by_type(action_type).into_iter().cloned().collect()
    }
}
