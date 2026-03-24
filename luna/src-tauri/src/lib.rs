pub mod action;
pub mod agent;
pub mod commands;
pub mod config;
pub mod error;
pub mod logging;
pub mod memory;
pub mod persistence;
pub mod security;
pub mod state;
pub mod window;

use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;
use tauri::Emitter;

use action::dispatcher::ActionDispatcher;
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
use state::AppState;
use window::manager::WindowManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load config first (before logging)
    let config = LunaConfig::load().expect("Failed to load configuration");

    // Initialize logging
    logging::init_logging(&config.log_dir);

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
    let permissions = Arc::new(RwLock::new(PermissionMatrix::new_with_defaults(db.clone())));
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
            match database.load_window_states() {
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
    let conductor = Arc::new(RwLock::new(conductor));

    // ── Agent hierarchy ───────────────────────────────────────────────────────
    let agent_registry = Arc::new(AgentRegistry::new());
    let message_bus = Arc::new(MessageBus::new());
    let scratchpad = Arc::new(Scratchpad::new());

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

    // ── Create app state ──────────────────────────────────────────────────────
    let app_state = AppState::new(
        dispatcher.clone(),
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
    );

    info!(session_id = %session_id, "Luna session started");

    // Capture components needed by the queue processor
    let queue_message_bus = message_bus.clone();
    let queue_memory = memory.clone();

    // ── Build and run Tauri app ───────────────────────────────────────────────
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(move |app| {
            let handle = app.handle().clone();
            let mut recv = receiver;
            let proc_message_bus = queue_message_bus.clone();
            let proc_memory = queue_memory.clone();

            // ── Action queue processor ────────────────────────────────────────
            // Central event loop: routes dispatched actions to handlers/events.
            tauri::async_runtime::spawn(async move {
                while let Some(action) = recv.recv().await {
                    tracing::trace!(
                        action_type = %action.action_type,
                        action_id = %action.id,
                        "Processing action from queue"
                    );

                    match action.action_type.as_str() {
                        "agent.response" => {
                            let _ = handle.emit("agent-response", &action.payload);
                        }
                        "window.create" => {
                            let _ = handle.emit("agent-window-create", &action.payload);
                        }
                        "window.update_content" => {
                            let _ = handle.emit("window-content-update", &action.payload);
                        }
                        "window.close" => {
                            let _ = handle.emit("agent-window-close", &action.payload);
                        }
                        "window.focus" => {
                            let _ = handle.emit("agent-window-focus", &action.payload);
                        }
                        "system.notify" => {
                            let _ = handle.emit("system-notification", &action.payload);
                        }
                        "agent.think" => {
                            if let Some(thought) = action.payload.get("thought").and_then(|v| v.as_str()) {
                                tracing::debug!(thought = %thought, "Conductor thinking");
                            }
                        }
                        "agent.delegate" => {
                            let task = action.payload.get("task")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown task")
                                .to_string();
                            let workspace_id = action.payload.get("workspace_id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("workspace_default")
                                .to_string();
                            let orchestrator_id = format!("orchestrator_{}", workspace_id);
                            let context = action.payload.get("context")
                                .cloned()
                                .unwrap_or(serde_json::json!({}));

                            let (task_id, msg) = agent::messaging::AgentMessage::new_delegate(&task, context);
                            info!(task_id = %task_id, task = %task, "Delegating to orchestrator");

                            if let Err(e) = proc_message_bus.send(&orchestrator_id, msg).await {
                                tracing::warn!(error = %e, "Failed to delegate to orchestrator");
                            }
                        }
                        "memory.store" => {
                            if let (Some(key), Some(val)) = (
                                action.payload.get("key").and_then(|v| v.as_str()),
                                action.payload.get("value").and_then(|v| v.as_str()),
                            ) {
                                let tags: Vec<String> = action.payload.get("tags")
                                    .and_then(|v| v.as_array())
                                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                                    .unwrap_or_default();
                                let _ = proc_memory.semantic.store(key, val, &tags);
                                tracing::debug!(key = %key, "Stored value in semantic memory");
                            }
                        }
                        _ => {
                            tracing::trace!(
                                action_type = %action.action_type,
                                "Action type has no registered handler (no-op)"
                            );
                        }
                    }
                }
                tracing::warn!("Action queue channel closed — processor stopping");
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::dispatch_action,
            commands::query_actions,
            commands::send_message,
            commands::get_agent_status,
            commands::grant_permission,
            commands::deny_permission,
            commands::get_scratchpad,
            commands::query_permission_log,
            window::commands::create_window,
            window::commands::close_window,
            window::commands::resize_window,
            window::commands::move_window,
            window::commands::minimize_window,
            window::commands::restore_window,
            window::commands::focus_window,
            window::commands::get_windows,
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
