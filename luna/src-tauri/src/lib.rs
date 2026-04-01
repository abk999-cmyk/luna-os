pub mod action;
pub mod agent;
pub mod app;
pub mod collaboration;
pub mod commands;
pub mod config;
pub mod error;
pub mod intelligence;
pub mod logging;
pub mod memory;
pub mod migration;
pub mod persistence;
pub mod security;
pub mod state;
pub mod sync;
pub mod telemetry;
pub mod window;
pub mod workspace;

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;
use action::dispatcher::ActionDispatcher;
use action::handler_registry::ActionHandlerRegistry;
use action::history::ActionHistory;
use action::queue::ActionQueue;
use action::registry::ActionTypeRegistry;
use agent::conductor::ConductorAgent;
use agent::llm_client::LlmClient;
use agent::messaging::MessageBus;
use agent::orchestrator::WorkspaceOrchestrator;
use agent::registry::{AgentMetadata, AgentRegistry, AgentStatus, AgentType};
use agent::scratchpad::Scratchpad;
use config::LunaConfig;
use memory::MemorySystem;
use persistence::db::Database;
use security::{AuditLog, PermissionMatrix, SandboxManager};
use security::policy::SecurityPolicy;
use agent::task_graph::TaskGraph;
use app::lifecycle::AppManager;
use app::template_registry::TemplateRegistry;
use state::AppState;
use workspace::manager::WorkspaceManager;
use sync::batcher::UpdateBatcher;
use telemetry::metrics::MetricsCollector;
use telemetry::latency::LatencyTracker;
use sync::topic::TopicManager;
use window::manager::WindowManager;
use action::undo::UndoManager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file (silently ignore if missing)
    // Try CWD first, then parent directory (src-tauri → luna/)
    if dotenvy::dotenv().is_err() {
        let _ = dotenvy::from_filename("../.env");
    }

    // Load config first (before logging)
    let config = LunaConfig::load().expect("Failed to load configuration");

    // Initialize logging
    let _logging_guard = logging::init_logging(&config.log_dir);

    info!("Luna starting up (Sprint 2)");

    // ── Core action system ────────────────────────────────────────────────────
    let registry = Arc::new(RwLock::new(ActionTypeRegistry::new_with_core_types()));
    let history = Arc::new(RwLock::new(ActionHistory::new(10_000)));
    let (queue, receiver) = ActionQueue::new();

    // ── Database ──────────────────────────────────────────────────────────────
    let db = Database::new(&config.db_path).expect("Failed to initialize database");
    info!("Database initialized at {}", config.db_path);
    let db = Arc::new(tokio::sync::Mutex::new(db));

    // ── Memory system ─────────────────────────────────────────────────────────
    let memory = Arc::new(MemorySystem::new(db.clone()));

    // Purge episodic memory older than 30 days (on startup)
    memory.episodic.purge_old_sync(30).ok();

    // ── Security: permissions + audit ─────────────────────────────────────────
    let permissions = {
        let mut perm_matrix = PermissionMatrix::new_with_defaults(db.clone());
        // M2: Reload persisted permanent grants from all agents in agent_state table
        {
            let database = db.blocking_lock();
            let agent_ids = database.get_all_agent_ids().unwrap_or_default();
            for agent_id in &agent_ids {
                if let Ok(Some(state)) = database.agent_state_load(agent_id) {
                    perm_matrix.load_from_agent_state(agent_id, &state);
                }
            }
        }
        Arc::new(RwLock::new(perm_matrix))
    };
    let audit = Arc::new(AuditLog::new(db.clone()));

    // ── Dispatcher (with permissions) ─────────────────────────────────────────
    let dispatcher = Arc::new(ActionDispatcher::new(
        registry.clone(),
        history.clone(),
        queue,
        db.clone(),
        permissions.clone(),
        audit.clone(),
    ));

    // ── Window manager ────────────────────────────────────────────────────────
    let mut window_manager = WindowManager::new();
    {
        let database = db.blocking_lock();
        if let Ok(Some(latest_session)) = database.get_latest_session_id() {
            match database.load_window_states(&latest_session) {
                Ok(windows) if !windows.is_empty() => {
                    info!(count = windows.len(), "Restoring window states");
                    window_manager.restore_windows(windows);
                }
                _ => {}
            }
        }
    }
    let window_manager = Arc::new(RwLock::new(window_manager));

    // ── Conductor agent ───────────────────────────────────────────────────────
    let conductor = if let Some(ref key) = config.anthropic_api_key {
        info!("Initializing Conductor with Anthropic API");
        Some(ConductorAgent::new(LlmClient::new_anthropic(key.clone())))
    } else if let Some(ref key) = config.openai_api_key {
        info!("Initializing Conductor with OpenAI API");
        Some(ConductorAgent::new(LlmClient::new_openai(key.clone())))
    } else {
        tracing::warn!("No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
        None
    };
    let conductor = Arc::new(conductor);

    // ── Agent hierarchy ───────────────────────────────────────────────────────
    let agent_registry = Arc::new(AgentRegistry::new());
    let message_bus = Arc::new(MessageBus::new());
    let scratchpad = Arc::new(Scratchpad::new());
    let app_manager = Arc::new(AppManager::new(db.clone()));
    app_manager.load_from_db();
    let topic_manager = Arc::new(TopicManager::new());
    let update_batcher = Arc::new(UpdateBatcher::new());
    let task_graph = Arc::new(TaskGraph::new());
    let template_registry = Arc::new(TemplateRegistry::new(db.clone()));
    let workspace_manager = Arc::new(WorkspaceManager::new(db.clone()));

    // ── Telemetry ────────────────────────────────────────────────────────────
    let metrics = Arc::new(MetricsCollector::new());
    let latency = Arc::new(LatencyTracker::new());

    // ── Intelligence & collaboration ─────────────────────────────────────────
    let user_model_store = Arc::new(intelligence::user_model::UserModelStore::new(db.clone()));
    let learning_engine = Arc::new(intelligence::learning::LearningEngine::new(db.clone()));
    let identity_manager = Arc::new(collaboration::identity::IdentityManager::new(db.clone()));
    let rbac_manager = Arc::new(collaboration::rbac::RbacManager::new(db.clone()));
    let presence_manager = Arc::new(collaboration::presence::PresenceManager::new());

    // Load persisted workspaces from DB
    tauri::async_runtime::block_on(async {
        if let Err(e) = workspace_manager.load_from_db().await {
            tracing::warn!(error = %e, "Failed to load workspaces from DB");
        }
    });

    // ── Session ───────────────────────────────────────────────────────────────
    let session_id = Uuid::new_v4().to_string();
    {
        let database = db.blocking_lock();
        let now = chrono::Utc::now().to_rfc3339();
        database.insert_session(&session_id, &now).ok();
    }

    // Set session ID on dispatcher
    {
        let dispatcher_clone = dispatcher.clone();
        let sid = session_id.clone();
        tauri::async_runtime::block_on(async {
            dispatcher_clone.set_session_id(sid).await;
        });
    }

    // ── Register conductor in agent registry ──────────────────────────────────
    {
        let registry_ref = agent_registry.clone();
        tauri::async_runtime::block_on(async {
            registry_ref.register(AgentMetadata {
                agent_id: "conductor".to_string(),
                agent_type: AgentType::Conductor,
                capabilities: vec![
                    "window.create".to_string(), "window.close".to_string(),
                    "agent.response".to_string(), "agent.delegate".to_string(),
                    "memory.store".to_string(),
                ],
                workspace_id: None,
                status: AgentStatus::Idle,
            }).await;
        });
    }

    // ── Register conductor on message bus ──────────────────────────────────
    let conductor_rx = {
        let bus = message_bus.clone();
        tauri::async_runtime::block_on(async {
            bus.register("conductor").await
        })
    };

    // ── Spawn workspace orchestrator ──────────────────────────────────────────
    {
        // Reuse the same LLM client config as the conductor for orchestrator decomposition
        let orchestrator_llm = if let Some(ref key) = config.anthropic_api_key {
            Some(LlmClient::new_anthropic(key.clone()))
        } else if let Some(ref key) = config.openai_api_key {
            Some(LlmClient::new_openai(key.clone()))
        } else {
            None
        };

        let workspace_root = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let orchestrator = Arc::new(WorkspaceOrchestrator::new(
            "workspace_default",
            orchestrator_llm,
            workspace_root,
        ));
        let meta = orchestrator.agent_metadata();

        let reg_ref = agent_registry.clone();
        tauri::async_runtime::block_on(async {
            reg_ref.register(meta).await;
        });

        WorkspaceOrchestrator::spawn(
            orchestrator,
            message_bus.clone(),
            agent_registry.clone(),
            scratchpad.clone(),
            memory.clone(),
            task_graph.clone(),
        );
    }

    // ── Scratchpad eviction (periodic) ────────────────────────────────────────
    {
        let sp = scratchpad.clone();
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(300));
            loop {
                interval.tick().await;
                sp.evict_stale().await;
            }
        });
    }

    // ── Working memory eviction (periodic) ───────────────────────────────────
    {
        let wm = memory.working.clone();
        tauri::async_runtime::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                wm.expire_stale().await;
            }
        });
    }

    // ── Action handler registry ─────────────────────────────────────────────
    let handler_registry = Arc::new(ActionHandlerRegistry::new());
    action::handler_registry::register_core_handlers(&handler_registry);

    // ── Sandbox manager ────────────────────────────────────────────────────────
    let sandbox_manager = Arc::new(SandboxManager::new());

    // Assign sensible tiers to known agents so they don't fall back to Restricted.
    {
        use crate::security::sandbox::SandboxTier;
        let sm = sandbox_manager.clone();
        tauri::async_runtime::block_on(async {
            sm.set_agent_tier("conductor", SandboxTier::Trusted).await;
            sm.set_agent_tier("orchestrator_workspace_default", SandboxTier::Standard).await;
        });
    }

    // ── Undo manager ─────────────────────────────────────────────────────────
    let undo_manager = Arc::new(UndoManager::new(db.clone()));

    // ── Security policy ─────────────────────────────────────────────────────
    let security_policy = Arc::new(SecurityPolicy::new(db.clone()));
    {
        let sp = security_policy.clone();
        tauri::async_runtime::block_on(async move {
            if let Err(e) = sp.load_from_db().await {
                tracing::warn!("Failed to load security policy from DB: {}", e);
            }
        });
    }

    // ── Create app state ──────────────────────────────────────────────────────
    let app_state = AppState::new(
        dispatcher.clone(),
        handler_registry.clone(),
        window_manager.clone(),
        conductor.clone(),
        db.clone(),
        session_id.clone(),
        memory.clone(),
        permissions.clone(),
        audit.clone(),
        agent_registry.clone(),
        message_bus.clone(),
        scratchpad.clone(),
        app_manager.clone(),
        topic_manager.clone(),
        update_batcher.clone(),
        task_graph.clone(),
        template_registry.clone(),
        workspace_manager.clone(),
        metrics.clone(),
        latency.clone(),
        user_model_store.clone(),
        learning_engine.clone(),
        identity_manager.clone(),
        rbac_manager.clone(),
        presence_manager.clone(),
        sandbox_manager.clone(),
        undo_manager.clone(),
        security_policy.clone(),
    );

    info!(session_id = %session_id, "Luna session started");

    let flush_batcher = update_batcher.clone();
    let pending_cleanup_dispatcher = dispatcher.clone();

    // Clone for the queue processor (all fields are Arc so this is cheap).
    let queue_state = Arc::new(app_state.clone());
    let queue_handler_registry = handler_registry.clone();
    let queue_history = history.clone();
    let queue_latency = latency.clone();

    // For conductor bus processing (Phase 2D)
    let conductor_task_graph = task_graph.clone();
    let conductor_dispatcher = dispatcher.clone();

    // ── Build and run Tauri app ───────────────────────────────────────────────
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(move |app| {
            let handle = app.handle().clone();
            let mut recv = receiver;
            let proc_handler_registry = queue_handler_registry;
            let proc_state = queue_state;
            let proc_history = queue_history;

            // ── Action queue processor ────────────────────────────────────────
            // Central event loop: dispatches actions through the handler registry.
            let queue_handle = handle.clone();
            let proc_latency = queue_latency;
            tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                while let Some(action) = recv.recv().await {
                    tracing::trace!(
                        action_type = %action.action_type,
                        action_id = %action.id,
                        "Processing action from queue"
                    );

                    let start = std::time::Instant::now();
                    let result = proc_handler_registry.dispatch(&action, &queue_handle, &proc_state).await;
                    let elapsed = start.elapsed();
                    proc_latency.record(&action.action_type, elapsed);
                    proc_latency.record("action_dispatch", elapsed);
                    let new_status = match &result {
                        Ok(true) => crate::action::types::ActionStatus::Completed,
                        Ok(false) => crate::action::types::ActionStatus::Failed(
                            format!("no handler registered for '{}'", action.action_type)
                        ),
                        Err(e) => crate::action::types::ActionStatus::Failed(e.to_string()),
                    };
                    {
                        let mut history = proc_history.write().await;
                        history.update_status(&action.id, new_status.clone());
                    }

                    // Auto-record undo entry for undoable actions
                    if matches!(new_status, crate::action::types::ActionStatus::Completed) {
                        if action.action_type.starts_with("fs.") || action.action_type.starts_with("window.") || action.action_type == "memory.store" {
                            let agent_id = match &action.source {
                                crate::action::types::ActionSource::Agent(id) => id.clone(),
                                crate::action::types::ActionSource::User => "user".to_string(),
                                crate::action::types::ActionSource::System => "system".to_string(),
                            };
                            if let Err(e) = proc_state.undo_manager.create_entry_from_action(&action, &agent_id).await {
                                tracing::debug!(error = %e, "Could not create undo entry");
                            }
                        }
                    }

                    // Emit agent-action event to frontend for activity tracking
                    {
                        let status_str = match &new_status {
                            crate::action::types::ActionStatus::Completed => "completed",
                            crate::action::types::ActionStatus::Failed(_) => "failed",
                            _ => "pending",
                        };
                        let agent_id = match &action.source {
                            crate::action::types::ActionSource::Agent(id) => id.clone(),
                            crate::action::types::ActionSource::User => "user".to_string(),
                            crate::action::types::ActionSource::System => "system".to_string(),
                        };
                        if let Err(e) = queue_handle.emit(
                            "agent-action",
                            serde_json::json!({
                                "action_type": action.action_type,
                                "payload": action.payload,
                                "agent_id": agent_id,
                                "status": status_str,
                            }),
                        ) {
                            tracing::debug!(error = %e, "Failed to emit agent-action event");
                        }
                    }

                    match &result {
                        Ok(false) => {
                            tracing::warn!(
                                action_type = %action.action_type,
                                "No handler registered for action type"
                            );
                        }
                        Err(e) => {
                            tracing::warn!(
                                action_type = %action.action_type,
                                error = %e,
                                "Handler error processing action"
                            );
                        }
                        _ => {}
                    }
                }
                tracing::warn!("Action queue channel closed — processor stopping");
            });

            // ── Conductor bus processing (Phase 2D) ─────────────────────────────
            {
                use tauri::Emitter;
                let mut conductor_rx = conductor_rx;
                let tg = conductor_task_graph;
                let cond_handle = handle.clone();
                let cond_dispatcher = conductor_dispatcher;
                tauri::async_runtime::spawn(async move {
                    while let Some(envelope) = conductor_rx.recv().await {
                        tracing::info!(
                            message_id = %envelope.message_id,
                            source = %envelope.source_agent_id,
                            priority = ?envelope.priority,
                            "Conductor received message on bus"
                        );

                        match &envelope.message {
                            crate::agent::messaging::AgentMessage::Complete { task_id, result } => {
                                tracing::info!(
                                    task_id = %task_id,
                                    "Task completed — updating task graph"
                                );
                                tg.complete_task(task_id, Some(result.clone()));
                            }

                            crate::agent::messaging::AgentMessage::Escalate { task_id, from_agent, reason } => {
                                tracing::warn!(
                                    task_id = %task_id,
                                    from_agent = %from_agent,
                                    reason = %reason,
                                    "Escalation received at conductor"
                                );
                                tg.fail_task(task_id, reason);

                                // Emit system notification to frontend
                                let _ = cond_handle.emit(
                                    "system-notification",
                                    serde_json::json!({
                                        "level": "warning",
                                        "title": "Task Escalation",
                                        "message": format!(
                                            "Agent '{}' escalated task {}: {}",
                                            from_agent, task_id, reason
                                        ),
                                        "task_id": task_id,
                                        "from_agent": from_agent,
                                    }),
                                );
                            }

                            crate::agent::messaging::AgentMessage::Event { app_id, payload } => {
                                tracing::info!(
                                    app_id = %app_id,
                                    "Event message received at conductor — dispatching as action"
                                );
                                // Build an action from the event payload and dispatch it
                                if let Some(action_type) = payload.get("action_type").and_then(|v| v.as_str()) {
                                    let action_payload = payload.get("payload").cloned().unwrap_or(payload.clone());
                                    let action = crate::action::types::Action::new(
                                        action_type.to_string(),
                                        action_payload,
                                        crate::action::types::ActionSource::Agent("conductor".to_string()),
                                    );
                                    if let Err(e) = cond_dispatcher.dispatch(action).await {
                                        tracing::warn!(error = %e, "Failed to dispatch event as action");
                                    }
                                } else {
                                    tracing::debug!(app_id = %app_id, "Event has no action_type — ignoring");
                                }
                            }

                            other => {
                                tracing::debug!(msg = ?other, "Conductor received unhandled message type");
                            }
                        }
                    }
                    tracing::warn!("Conductor message bus listener ended");
                });
            }

            // ── Pending actions cleanup (every 60s, remove actions older than 5min) ──
            {
                let cleanup_dispatcher = pending_cleanup_dispatcher.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_secs(60));
                    loop {
                        interval.tick().await;
                        cleanup_dispatcher.cleanup_stale_pending(Duration::from_secs(300)).await;
                    }
                });
            }

            // ── State sync batcher flush loop ────────────────────────────────
            {
                use tauri::Emitter;
                let sync_batcher = flush_batcher;
                let sync_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(Duration::from_millis(16));
                    loop {
                        interval.tick().await;
                        if sync_batcher.is_shutdown() {
                            break;
                        }
                        if sync_batcher.should_flush().await {
                            let batch = sync_batcher.flush().await;
                            if !batch.is_empty() {
                                let updates: Vec<serde_json::Value> = batch
                                    .iter()
                                    .map(|u| {
                                        serde_json::json!({
                                            "topic": u.topic,
                                            "payload": u.payload,
                                        })
                                    })
                                    .collect();
                                let _ = sync_handle.emit("luna-sync", &updates);
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::dispatch_action,
            commands::query_actions,
            commands::send_message,
            commands::send_message_streaming,
            commands::get_agent_status,
            commands::grant_permission,
            commands::deny_permission,
            commands::get_scratchpad,
            commands::query_permission_log,
            commands::approve_pending_action,
            commands::deny_pending_action,
            commands::transcribe_audio,
            commands::inject_context,
            commands::get_task_graph,
            commands::query_episodic_by_agent,
            commands::query_episodic_time_range,
            commands::search_semantic_memory,
            commands::delete_semantic_memory,
            commands::create_plan,
            commands::get_plan,
            commands::list_active_plans,
            commands::update_plan,
            window::commands::create_window,
            window::commands::close_window,
            window::commands::resize_window,
            window::commands::move_window,
            window::commands::minimize_window,
            window::commands::restore_window,
            window::commands::focus_window,
            window::commands::get_windows,
            app::commands::dispatch_app_event,
            app::commands::save_as_template,
            app::commands::list_templates,
            app::commands::instantiate_from_template,
            app::commands::delete_template,
            app::commands::validate_manifest,
            workspace::commands::create_workspace,
            workspace::commands::list_workspaces,
            workspace::commands::switch_workspace,
            workspace::commands::get_active_workspace,
            workspace::commands::delete_workspace,
            workspace::commands::snap_window,
            workspace::commands::get_layout,
            workspace::commands::update_workspace,
            workspace::commands::add_window_to_workspace,
            workspace::commands::remove_window_from_workspace,
            telemetry::commands::get_metrics,
            telemetry::commands::get_latency_report,
            migration::commands::import_file,
            migration::commands::detect_project,
            migration::commands::export_workspace_state,
            intelligence::commands::get_user_model,
            intelligence::commands::update_user_expertise,
            intelligence::commands::record_learning_observation,
            intelligence::commands::get_automation_proposals,
            intelligence::commands::respond_to_proposal,
            intelligence::commands::inspect_user_model,
            intelligence::commands::delete_user_model,
            intelligence::commands::get_user_model_audit,
            collaboration::commands::create_user,
            collaboration::commands::get_current_user,
            collaboration::commands::grant_workspace_access,
            collaboration::commands::get_workspace_presence,
            commands::undo_last_action,
            commands::get_undo_history,
            commands::get_permission_mode,
            commands::set_permission_mode,
            commands::save_app_content,
            commands::load_app_content,
            commands::delete_app_content,
            commands::get_system_info,
            commands::list_directory,
            commands::get_home_dir,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                info!("Luna shutting down");

                let wm = window_manager.clone();
                let db_ref = db.clone();
                let sid = session_id.clone();

                tauri::async_runtime::block_on(async {
                    let manager = wm.read().await;
                    let windows = manager.get_all_windows_owned();

                    let database = db_ref.lock().await;
                    database.save_window_states(&sid, &windows).ok();
                    let now = chrono::Utc::now().to_rfc3339();
                    database.close_session(&sid, &now).ok();
                });

                info!("Luna shutdown complete");
            }
        });
}
