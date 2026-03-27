use std::sync::Arc;
use tokio::sync::RwLock;

use crate::action::dispatcher::ActionDispatcher;
use crate::action::handler_registry::ActionHandlerRegistry;
use crate::action::undo::UndoManager;
use crate::agent::conductor::ConductorAgent;
use crate::agent::messaging::MessageBus;
use crate::agent::registry::AgentRegistry;
use crate::agent::scratchpad::Scratchpad;
use crate::agent::task_graph::TaskGraph;
use crate::app::lifecycle::AppManager;
use crate::app::template_registry::TemplateRegistry;
use crate::memory::MemorySystem;
use crate::sync::batcher::UpdateBatcher;
use crate::sync::topic::TopicManager;
use crate::persistence::db::Database;
use crate::security::{AuditLog, PermissionMatrix, SandboxManager};
use crate::window::manager::WindowManager;
use crate::workspace::manager::WorkspaceManager;
use crate::telemetry::metrics::MetricsCollector;
use crate::telemetry::latency::LatencyTracker;
use crate::intelligence::user_model::UserModelStore;
use crate::intelligence::learning::LearningEngine;
use crate::collaboration::identity::IdentityManager;
use crate::collaboration::rbac::RbacManager;
use crate::collaboration::presence::PresenceManager;

#[derive(Clone)]
pub struct AppState {
    pub dispatcher: Arc<ActionDispatcher>,
    pub handler_registry: Arc<ActionHandlerRegistry>,
    pub window_manager: Arc<RwLock<WindowManager>>,
    pub conductor: Arc<Option<ConductorAgent>>,
    pub db: Arc<tokio::sync::Mutex<Database>>,
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
    // Sprint 4: task graph
    pub task_graph: Arc<TaskGraph>,
    // Phase 5: template registry
    pub template_registry: Arc<TemplateRegistry>,
    // Phase 6: workspace manager
    pub workspace_manager: Arc<WorkspaceManager>,
    // Phase 13: telemetry
    pub metrics: Arc<MetricsCollector>,
    pub latency: Arc<LatencyTracker>,
    // Intelligence & collaboration
    pub user_model: Arc<UserModelStore>,
    pub learning_engine: Arc<LearningEngine>,
    pub identity_manager: Arc<IdentityManager>,
    pub rbac_manager: Arc<RbacManager>,
    pub presence_manager: Arc<PresenceManager>,
    pub sandbox_manager: Arc<SandboxManager>,
    pub undo_manager: Arc<UndoManager>,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        dispatcher: Arc<ActionDispatcher>,
        handler_registry: Arc<ActionHandlerRegistry>,
        window_manager: Arc<RwLock<WindowManager>>,
        conductor: Arc<Option<ConductorAgent>>,
        db: Arc<tokio::sync::Mutex<Database>>,
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
        task_graph: Arc<TaskGraph>,
        template_registry: Arc<TemplateRegistry>,
        workspace_manager: Arc<WorkspaceManager>,
        metrics: Arc<MetricsCollector>,
        latency: Arc<LatencyTracker>,
        user_model: Arc<UserModelStore>,
        learning_engine: Arc<LearningEngine>,
        identity_manager: Arc<IdentityManager>,
        rbac_manager: Arc<RbacManager>,
        presence_manager: Arc<PresenceManager>,
        sandbox_manager: Arc<SandboxManager>,
        undo_manager: Arc<UndoManager>,
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
            task_graph,
            template_registry,
            workspace_manager,
            metrics,
            latency,
            user_model,
            learning_engine,
            identity_manager,
            rbac_manager,
            presence_manager,
            sandbox_manager,
            undo_manager,
        }
    }

    /// Get the current session ID.
    pub async fn get_session_id(&self) -> String {
        self.session_id.read().await
            .clone()
            .unwrap_or_else(|| "unknown".to_string())
    }
}
