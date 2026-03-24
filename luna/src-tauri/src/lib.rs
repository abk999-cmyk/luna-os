pub mod action;
pub mod agent;
pub mod commands;
pub mod config;
pub mod error;
pub mod logging;
pub mod persistence;
pub mod state;
pub mod window;

use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;
use tracing::info;
use uuid::Uuid;

use action::dispatcher::ActionDispatcher;
use action::history::ActionHistory;
use action::queue::ActionQueue;
use action::registry::ActionTypeRegistry;
use agent::conductor::ConductorAgent;
use agent::llm_client::LlmClient;
use config::LunaConfig;
use persistence::db::Database;
use state::AppState;
use window::manager::WindowManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load config first (before logging, since logging needs log_dir)
    let config = LunaConfig::load().expect("Failed to load configuration");

    // Initialize logging
    logging::init_logging(&config.log_dir);

    info!("Luna starting up");

    // Initialize components
    let registry = Arc::new(RwLock::new(ActionTypeRegistry::new_with_core_types()));
    let history = Arc::new(RwLock::new(ActionHistory::new(10_000)));
    let (queue, mut receiver) = ActionQueue::new();

    // Initialize database
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

    // Create dispatcher
    let dispatcher = Arc::new(ActionDispatcher::new(
        registry.clone(),
        history.clone(),
        queue,
        db.clone(),
    ));

    // Initialize window manager and restore previous windows
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

    // Initialize conductor agent (if API key available)
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

    // Create session
    let session_id = Uuid::new_v4().to_string();
    let session_id_clone = session_id.clone();
    {
        let db_guard = db.lock().unwrap();
        if let Some(ref database) = *db_guard {
            let now = chrono::Utc::now().to_rfc3339();
            database.insert_session(&session_id, &now).ok();
        }
    }

    // Create app state
    let app_state = AppState::new(
        dispatcher.clone(),
        window_manager.clone(),
        conductor.clone(),
        db.clone(),
    );

    // Set session ID on dispatcher
    let dispatcher_clone = dispatcher.clone();
    let sid = session_id.clone();
    tauri::async_runtime::block_on(async {
        dispatcher_clone.set_session_id(sid).await;
    });

    // Spawn action queue processor
    tauri::async_runtime::spawn(async move {
        while let Some(action) = receiver.recv().await {
            tracing::trace!(
                action_type = %action.action_type,
                action_id = %action.id,
                "Action processed from queue"
            );
        }
    });

    info!(session_id = %session_id, "Luna session started");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::dispatch_action,
            commands::query_actions,
            commands::send_message,
            commands::get_agent_status,
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
                let sid = session_id_clone.clone();

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
