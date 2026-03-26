pub mod action;
pub mod agent;
pub mod app;
pub mod commands;
pub mod config;
pub mod error;
pub mod logging;
pub mod memory;
pub mod persistence;
pub mod security;
pub mod state;
pub mod sync;
pub mod window;

use std::sync::{Arc, Mutex};
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
use security::{AuditLog, PermissionMatrix};
use agent::task_graph::TaskGraph;
use app::lifecycle::AppManager;
use state::AppState;
use sync::batcher::UpdateBatcher;
use sync::topic::TopicManager;
use window::manager::WindowManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
    let db = match Database::new(&config.db_path) {
        Ok(db) => {
            info!("Database initialized at {}", config.db_path);
            Some(db)
        }
        Err(e) => {
            tracing::error!("Failed to initialize database: {}", e);
            None
        }
    };
    let db = Arc::new(Mutex::new(db));

    // ── Memory system ─────────────────────────────────────────────────────────
    let memory = Arc::new(MemorySystem::new(db.clone()));

    // Purge episodic memory older than 30 days (on startup)
    memory.episodic.purge_old(30).ok();

    // ── Security: permissions + audit ─────────────────────────────────────────
    let permissions = {
        let mut perm_matrix = PermissionMatrix::new_with_defaults(db.clone());
        // M2: Reload persisted permanent grants from agent_state
        {
            let db_guard = db.lock().unwrap();
            if let Some(ref database) = *db_guard {
                for agent_id in &["conductor", "orchestrator_default"] {
                    if let Ok(Some(state)) = database.agent_state_load(agent_id) {
                        perm_matrix.load_from_agent_state(agent_id, &state);
                    }
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
        let db_guard = db.lock().unwrap();
        if let Some(ref database) = *db_guard {
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
    let conductor = Arc::new(RwLock::new(conductor));

    // ── Agent hierarchy ───────────────────────────────────────────────────────
    let agent_registry = Arc::new(AgentRegistry::new());
    let message_bus = Arc::new(MessageBus::new());
    let scratchpad = Arc::new(Scratchpad::new());
    let app_manager = Arc::new(AppManager::new());
    let topic_manager = Arc::new(TopicManager::new());
    let update_batcher = Arc::new(UpdateBatcher::new());
    let task_graph = Arc::new(TaskGraph::new());

    // ── Session ───────────────────────────────────────────────────────────────
    let session_id = Uuid::new_v4().to_string();
    {
        let db_guard = db.lock().unwrap();
        if let Some(ref database) = *db_guard {
            let now = chrono::Utc::now().to_rfc3339();
            database.insert_session(&session_id, &now).ok();
        }
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
    {
        let bus = message_bus.clone();
        tauri::async_runtime::block_on(async {
            let mut rx = bus.register("conductor").await;
            tauri::async_runtime::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    tracing::info!(msg = ?msg, "Conductor received message on bus");
                }
                tracing::warn!("Conductor message bus listener ended");
            });
        });
    }

    // ── Spawn workspace orchestrator ──────────────────────────────────────────
    {
        let orchestrator = Arc::new(WorkspaceOrchestrator::new("workspace_default"));
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
    );

    info!(session_id = %session_id, "Luna session started");

    let flush_batcher = update_batcher.clone();
    let pending_cleanup_dispatcher = dispatcher.clone();

    // Clone for the queue processor (all fields are Arc so this is cheap).
    let queue_state = Arc::new(app_state.clone());
    let queue_handler_registry = handler_registry.clone();
    let queue_history = history.clone();

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
            tauri::async_runtime::spawn(async move {
                while let Some(action) = recv.recv().await {
                    tracing::trace!(
                        action_type = %action.action_type,
                        action_id = %action.id,
                        "Processing action from queue"
                    );

                    let result = proc_handler_registry.dispatch(&action, &queue_handle, &proc_state).await;
                    let new_status = if result.is_ok() {
                        crate::action::types::ActionStatus::Completed
                    } else {
                        crate::action::types::ActionStatus::Failed(
                            result.as_ref().err().map(|e| e.to_string()).unwrap_or_default()
                        )
                    };
                    {
                        let mut history = proc_history.write().await;
                        history.update_status(&action.id, new_status);
                    }
                    if let Err(e) = result {
                        tracing::warn!(
                            action_type = %action.action_type,
                            error = %e,
                            "Handler error processing action"
                        );
                    }
                }
                tracing::warn!("Action queue channel closed — processor stopping");
            });

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
            window::commands::create_window,
            window::commands::close_window,
            window::commands::resize_window,
            window::commands::move_window,
            window::commands::minimize_window,
            window::commands::restore_window,
            window::commands::focus_window,
            window::commands::get_windows,
            app::commands::dispatch_app_event,
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

                    let db_guard = db_ref.lock().unwrap();
                    if let Some(ref database) = *db_guard {
                        database.save_window_states(&sid, &windows).ok();
                        let now = chrono::Utc::now().to_rfc3339();
                        database.close_session(&sid, &now).ok();
                    }
                });

                info!("Luna shutdown complete");
            }
        });
}
