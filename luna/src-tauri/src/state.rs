use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

use crate::action::dispatcher::ActionDispatcher;
use crate::action::handler_registry::ActionHandlerRegistry;
use crate::agent::conductor::ConductorAgent;
use crate::agent::messaging::MessageBus;
use crate::agent::registry::AgentRegistry;
use crate::agent::scratchpad::Scratchpad;
use crate::app::lifecycle::AppManager;
use crate::memory::MemorySystem;
use crate::sync::batcher::UpdateBatcher;
use crate::sync::topic::TopicManager;
use crate::persistence::db::Database;
use crate::security::{AuditLog, PermissionMatrix};
use crate::window::manager::WindowManager;

#[derive(Clone)]
pub struct AppState {
    pub dispatcher: Arc<ActionDispatcher>,
    pub handler_registry: Arc<ActionHandlerRegistry>,
    pub window_manager: Arc<RwLock<WindowManager>>,
    pub conductor: Arc<RwLock<Option<ConductorAgent>>>,
    pub db: Arc<Mutex<Option<Database>>>,
    pub session_id: Arc<RwLock<Option<String>>>,
    // Sprint 2: memory, security, agent hierarchy
    pub memory: Arc<MemorySystem>,
    pub permissions: Arc<RwLock<PermissionMatrix>>,
    pub audit: Arc<AuditLog>,
    pub agent_registry: Arc<AgentRegistry>,
    pub message_bus: Arc<MessageBus>,
    pub scratchpad: Arc<Scratchpad>,
    // Sprint 3: dynamic app system
    pub app_manager: Arc<AppManager>,
    // Sprint 3: state sync
    pub topic_manager: Arc<TopicManager>,
    pub update_batcher: Arc<UpdateBatcher>,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        dispatcher: Arc<ActionDispatcher>,
        handler_registry: Arc<ActionHandlerRegistry>,
        window_manager: Arc<RwLock<WindowManager>>,
        conductor: Arc<RwLock<Option<ConductorAgent>>>,
        db: Arc<Mutex<Option<Database>>>,
        session_id: String,
        memory: Arc<MemorySystem>,
        permissions: Arc<RwLock<PermissionMatrix>>,
        audit: Arc<AuditLog>,
        agent_registry: Arc<AgentRegistry>,
        message_bus: Arc<MessageBus>,
        scratchpad: Arc<Scratchpad>,
        app_manager: Arc<AppManager>,
        topic_manager: Arc<TopicManager>,
        update_batcher: Arc<UpdateBatcher>,
    ) -> Self {
        Self {
            dispatcher,
            handler_registry,
            window_manager,
            conductor,
            db,
            session_id: Arc::new(RwLock::new(Some(session_id))),
            memory,
            permissions,
            audit,
            agent_registry,
            message_bus,
            scratchpad,
            app_manager,
            topic_manager,
            update_batcher,
        }
    }

    /// Get the current session ID.
    pub async fn get_session_id(&self) -> String {
        self.session_id.read().await
            .clone()
            .unwrap_or_else(|| "unknown".to_string())
    }
}
