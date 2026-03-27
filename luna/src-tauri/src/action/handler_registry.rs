use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, RwLock};

use tracing::{trace, warn};

use super::types::Action;
use crate::error::LunaError;
use crate::state::AppState;

/// A boxed async handler function for processing actions.
pub type ActionHandlerFn = Arc<
    dyn Fn(Action, tauri::AppHandle, Arc<AppState>)
        -> Pin<Box<dyn Future<Output = Result<(), LunaError>> + Send>>
        + Send
        + Sync,
>;

/// Pluggable registry mapping action_type strings to async handler functions.
/// Replaces the hardcoded match block in lib.rs, enabling dynamic apps to
/// register their own handlers at runtime.
pub struct ActionHandlerRegistry {
    handlers: RwLock<HashMap<String, ActionHandlerFn>>,
    /// Tracks which handlers belong to which app (for cleanup on app destroy).
    app_handlers: RwLock<HashMap<String, Vec<String>>>,
}

impl ActionHandlerRegistry {
    pub fn new() -> Self {
        Self {
            handlers: RwLock::new(HashMap::new()),
            app_handlers: RwLock::new(HashMap::new()),
        }
    }

    /// Register a handler for a given action type.
    pub fn register(&self, action_type: &str, handler: ActionHandlerFn) {
        let mut handlers = self.handlers.write().unwrap_or_else(|e| e.into_inner());
        handlers.insert(action_type.to_string(), handler);
    }

    /// Register a handler associated with a dynamic app (for cleanup).
    pub fn register_app_handler(
        &self,
        app_id: &str,
        action_type: &str,
        handler: ActionHandlerFn,
    ) {
        self.register(action_type, handler);
        let mut app_handlers = self.app_handlers.write().unwrap_or_else(|e| e.into_inner());
        app_handlers
            .entry(app_id.to_string())
            .or_default()
            .push(action_type.to_string());
    }

    /// Remove all handlers registered by a specific app.
    pub fn deregister_app_handlers(&self, app_id: &str) {
        let mut app_handlers = self.app_handlers.write().unwrap_or_else(|e| e.into_inner());
        if let Some(types) = app_handlers.remove(app_id) {
            let mut handlers = self.handlers.write().unwrap_or_else(|e| e.into_inner());
            for action_type in types {
                handlers.remove(&action_type);
            }
        }
    }

    /// Dispatch an action to its registered handler.
    /// Returns Ok(true) if a handler was found and executed, Ok(false) if no handler exists.
    pub async fn dispatch(
        &self,
        action: &Action,
        app_handle: &tauri::AppHandle,
        app_state: &Arc<AppState>,
    ) -> Result<bool, LunaError> {
        let handler = {
            let handlers = self.handlers.read().unwrap_or_else(|e| e.into_inner());
            handlers.get(&action.action_type).cloned()
        };

        match handler {
            Some(handler) => {
                handler(action.clone(), app_handle.clone(), app_state.clone()).await?;
                Ok(true)
            }
            None => {
                trace!(
                    action_type = %action.action_type,
                    "No handler registered for action type"
                );
                Ok(false)
            }
        }
    }

    /// Check if a handler is registered for the given action type.
    pub fn has_handler(&self, action_type: &str) -> bool {
        let handlers = self.handlers.read().unwrap_or_else(|e| e.into_inner());
        handlers.contains_key(action_type)
    }
}

/// Register all core action handlers (the ones that were hardcoded in the lib.rs match block).
pub fn register_core_handlers(registry: &ActionHandlerRegistry) {
    use tauri::Emitter;

    // agent.response → emit to frontend
    registry.register(
        "agent.response",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-response", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-response");
                }
                Ok(())
            })
        }),
    );

    // window.create → emit to frontend
    registry.register(
        "window.create",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-window-create", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-create");
                }
                Ok(())
            })
        }),
    );

    // window.update_content → emit to frontend
    registry.register(
        "window.update_content",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("window-content-update", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit window-content-update");
                }
                Ok(())
            })
        }),
    );

    // window.close → emit to frontend
    registry.register(
        "window.close",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-window-close", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-close");
                }
                Ok(())
            })
        }),
    );

    // window.focus → emit to frontend
    registry.register(
        "window.focus",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-window-focus", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-focus");
                }
                Ok(())
            })
        }),
    );

    // system.notify → emit to frontend
    registry.register(
        "system.notify",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("system-notification", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit system-notification");
                }
                Ok(())
            })
        }),
    );

    // agent.think → log thought (no frontend event)
    registry.register(
        "agent.think",
        Arc::new(|action, _handle, _state| {
            Box::pin(async move {
                if let Some(thought) = action.payload.get("thought").and_then(|v| v.as_str()) {
                    tracing::debug!(thought = %thought, "Conductor thinking");
                }
                Ok(())
            })
        }),
    );

    // user.text_input → no-op (actual handling is in send_message/send_message_streaming)
    registry.register(
        "user.text_input",
        Arc::new(|_action, _handle, _state| {
            Box::pin(async move { Ok(()) })
        }),
    );

    // system.startup/shutdown/session_start/session_end → no-op (lifecycle events)
    for event_type in &["system.startup", "system.shutdown", "system.session_start", "system.session_end"] {
        registry.register(
            event_type,
            Arc::new(|_action, _handle, _state| {
                Box::pin(async move { Ok(()) })
            }),
        );
    }

    // agent.delegate → route to workspace orchestrator
    registry.register(
        "agent.delegate",
        Arc::new(|action, _handle, state| {
            Box::pin(async move {
                let task = action
                    .payload
                    .get("task")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown task")
                    .to_string();
                let workspace_id = action
                    .payload
                    .get("workspace_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("workspace_default")
                    .to_string();
                let orchestrator_id = format!("orchestrator_{}", workspace_id);
                let context = action
                    .payload
                    .get("context")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));

                let (task_id, msg) =
                    crate::agent::messaging::AgentMessage::new_delegate(&task, context);
                tracing::info!(task_id = %task_id, task = %task, "Delegating to orchestrator");

                if let Err(e) = state.message_bus.send(&orchestrator_id, msg).await {
                    warn!(error = %e, "Failed to delegate to orchestrator");
                }
                Ok(())
            })
        }),
    );

    // app.create → create dynamic app, window, emit event
    registry.register(
        "app.create",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let descriptor: crate::app::descriptor::AppDescriptor =
                    serde_json::from_value(action.payload.clone()).map_err(|e| {
                        LunaError::Dispatch(format!("Invalid app descriptor: {}", e))
                    })?;

                // Determine window size
                let width = descriptor.width.unwrap_or(600.0);
                let height = descriptor.height.unwrap_or(400.0);

                // Create window for this app
                let window = {
                    let mut wm = state.window_manager.write().await;
                    wm.create_window(
                        descriptor.title.clone(),
                        Some(crate::window::types::Bounds {
                            x: 100.0,
                            y: 100.0,
                            width,
                            height,
                        }),
                    )
                };

                let window_id = window.id.clone();
                let app_id = descriptor.id.clone();
                let agent_id = match &action.source {
                    crate::action::types::ActionSource::Agent(id) => id.clone(),
                    _ => "conductor".to_string(),
                };

                // Register in AppManager — rollback window on failure (H3)
                if let Err(e) = state.app_manager.create_app(descriptor.clone(), window_id.clone(), agent_id).await {
                    // Rollback: remove the orphaned window
                    let mut wm = state.window_manager.write().await;
                    let _ = wm.close_window(&window_id);
                    return Err(e);
                }

                // Emit to frontend
                if let Err(e) = handle.emit(
                    "app-created",
                    serde_json::json!({
                        "app_id": app_id,
                        "window_id": window_id,
                        "spec": descriptor,
                    }),
                ) {
                    tracing::debug!(error = %e, "Failed to emit app-created");
                }

                tracing::info!(app_id = %app_id, window_id = %window_id, "Dynamic app created");
                Ok(())
            })
        }),
    );

    // app.update → update app data/spec, emit event
    registry.register(
        "app.update",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let app_id = action
                    .payload
                    .get("app_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("app.update requires app_id".into()))?
                    .to_string();

                // Update data context if provided
                if let Some(data) = action.payload.get("data").cloned() {
                    state.app_manager.update_data(&app_id, data).await?;
                }

                // Update components (full spec replacement) if provided
                if let Some(components) = action.payload.get("components") {
                    if let Some(app) = state.app_manager.get_app(&app_id) {
                        let mut new_desc = app.descriptor.clone();
                        if let Ok(comps) = serde_json::from_value(components.clone()) {
                            new_desc.components = comps;
                        }
                        state.app_manager.update_spec(&app_id, new_desc).await?;
                    }
                }

                // Get current app state for the event
                let app = state.app_manager.get_app(&app_id);

                if let Err(e) = handle.emit(
                    "app-updated",
                    serde_json::json!({
                        "app_id": app_id,
                        "data": app.as_ref().map(|a| &a.data_context),
                        "spec": app.as_ref().map(|a| &a.descriptor),
                    }),
                ) {
                    tracing::debug!(error = %e, "Failed to emit app-updated");
                }

                tracing::info!(app_id = %app_id, "Dynamic app updated");
                Ok(())
            })
        }),
    );

    // app.destroy → destroy app, emit event
    registry.register(
        "app.destroy",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let app_id = action
                    .payload
                    .get("app_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("app.destroy requires app_id".into()))?
                    .to_string();

                let app = state.app_manager.destroy_app(&app_id).await?;

                // Deregister any app-specific handlers
                state.handler_registry.deregister_app_handlers(&app_id);

                // M13: Remove window from WindowManager
                {
                    let mut wm = state.window_manager.write().await;
                    let _ = wm.close_window(&app.window_id);
                }

                // Close the window (notify frontend)
                if let Err(e) = handle.emit(
                    "agent-window-close",
                    serde_json::json!({ "window_id": app.window_id }),
                ) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-close for app destroy");
                }

                if let Err(e) = handle.emit(
                    "app-destroyed",
                    serde_json::json!({ "app_id": app_id }),
                ) {
                    tracing::debug!(error = %e, "Failed to emit app-destroyed");
                }

                tracing::info!(app_id = %app_id, "Dynamic app destroyed");
                Ok(())
            })
        }),
    );

    // app.event → route component event back to controlling agent
    registry.register(
        "app.event",
        Arc::new(|action, _handle, state| {
            Box::pin(async move {
                let app_id = action
                    .payload
                    .get("app_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if let Some(agent_id) = state.app_manager.get_controlling_agent(&app_id) {
                    let msg = crate::agent::messaging::AgentMessage::new_event(
                        &app_id,
                        action.payload.clone(),
                    );
                    if let Err(e) = state.message_bus.send(&agent_id, msg).await {
                        warn!(error = %e, agent = %agent_id, "Failed to route app event to agent");
                    }
                } else {
                    warn!(app_id = %app_id, "No controlling agent found for app event — event dropped");
                }
                Ok(())
            })
        }),
    );

    // memory.store → store in semantic memory
    registry.register(
        "memory.store",
        Arc::new(|action, _handle, state| {
            Box::pin(async move {
                if let (Some(key), Some(val)) = (
                    action.payload.get("key").and_then(|v| v.as_str()),
                    action.payload.get("value").and_then(|v| v.as_str()),
                ) {
                    let tags: Vec<String> = action
                        .payload
                        .get("tags")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default();
                    let _ = state.memory.semantic.store(key, val, &tags).await;
                    tracing::debug!(key = %key, "Stored value in semantic memory");
                }
                Ok(())
            })
        }),
    );

    // memory.search → search semantic memory by tag
    registry.register(
        "memory.search",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let tag = action
                    .payload
                    .get("tag")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("memory.search requires 'tag'".into()))?
                    .to_string();
                let results: Vec<(String, String)> = state.memory.semantic.search_by_tag(&tag).await?;
                let results_json: Vec<serde_json::Value> = results
                    .into_iter()
                    .map(|(k, v)| serde_json::json!({"key": k, "value": v}))
                    .collect();
                if let Err(e) = handle.emit(
                    "memory-search-result",
                    serde_json::json!({"tag": tag, "results": results_json}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit memory-search-result");
                }
                Ok(())
            })
        }),
    );

    // memory.delete → delete from semantic memory
    registry.register(
        "memory.delete",
        Arc::new(|action, _handle, state| {
            Box::pin(async move {
                let key = action
                    .payload
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("memory.delete requires 'key'".into()))?
                    .to_string();
                let _: bool = state.memory.semantic.delete(&key).await?;
                tracing::debug!(key = %key, "Deleted value from semantic memory");
                Ok(())
            })
        }),
    );

    // fs.read → read file contents with sandbox validation
    registry.register(
        "fs.read",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let path_str = action
                    .payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.read requires 'path'".into()))?
                    .to_string();
                let path = std::path::Path::new(&path_str);
                let agent_id = match &action.source {
                    crate::action::types::ActionSource::Agent(id) => id.clone(),
                    _ => "system".to_string(),
                };
                state.sandbox_manager.check_read(&agent_id, path).await?;
                let content = tokio::fs::read_to_string(path).await.map_err(|e| {
                    LunaError::Dispatch(format!("Failed to read file '{}': {}", path_str, e))
                })?;
                if let Err(e) = handle.emit(
                    "fs-read-result",
                    serde_json::json!({"path": path_str, "content": content}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit fs-read-result");
                }
                Ok(())
            })
        }),
    );

    // fs.write → write file with sandbox validation
    registry.register(
        "fs.write",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let path_str = action
                    .payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.write requires 'path'".into()))?
                    .to_string();
                let content = action
                    .payload
                    .get("content")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.write requires 'content'".into()))?
                    .to_string();
                let path = std::path::Path::new(&path_str);
                let agent_id = match &action.source {
                    crate::action::types::ActionSource::Agent(id) => id.clone(),
                    _ => "system".to_string(),
                };
                state.sandbox_manager.check_write(&agent_id, path).await?;
                tokio::fs::write(path, &content).await.map_err(|e| {
                    LunaError::Dispatch(format!("Failed to write file '{}': {}", path_str, e))
                })?;
                if let Err(e) = handle.emit(
                    "fs-write-result",
                    serde_json::json!({"path": path_str, "success": true}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit fs-write-result");
                }
                Ok(())
            })
        }),
    );

    // fs.delete → delete file with sandbox validation
    registry.register(
        "fs.delete",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let path_str = action
                    .payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.delete requires 'path'".into()))?
                    .to_string();
                let path = std::path::Path::new(&path_str);
                let agent_id = match &action.source {
                    crate::action::types::ActionSource::Agent(id) => id.clone(),
                    _ => "system".to_string(),
                };
                state.sandbox_manager.check_write(&agent_id, path).await?;
                tokio::fs::remove_file(path).await.map_err(|e| {
                    LunaError::Dispatch(format!("Failed to delete file '{}': {}", path_str, e))
                })?;
                if let Err(e) = handle.emit(
                    "fs-delete-result",
                    serde_json::json!({"path": path_str, "success": true}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit fs-delete-result");
                }
                Ok(())
            })
        }),
    );

    // fs.list → list directory contents with sandbox validation
    registry.register(
        "fs.list",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let path_str = action
                    .payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.list requires 'path'".into()))?
                    .to_string();
                let path = std::path::Path::new(&path_str);
                let agent_id = match &action.source {
                    crate::action::types::ActionSource::Agent(id) => id.clone(),
                    _ => "system".to_string(),
                };
                state.sandbox_manager.check_read(&agent_id, path).await?;
                let mut entries = Vec::new();
                let mut read_dir = tokio::fs::read_dir(path).await.map_err(|e| {
                    LunaError::Dispatch(format!("Failed to list directory '{}': {}", path_str, e))
                })?;
                while let Some(entry) = read_dir.next_entry().await.map_err(|e| {
                    LunaError::Dispatch(format!("Failed to read directory entry: {}", e))
                })? {
                    let file_type = entry.file_type().await.ok();
                    entries.push(serde_json::json!({
                        "name": entry.file_name().to_string_lossy().to_string(),
                        "is_dir": file_type.map(|ft| ft.is_dir()).unwrap_or(false),
                    }));
                }
                if let Err(e) = handle.emit(
                    "fs-list-result",
                    serde_json::json!({"path": path_str, "entries": entries}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit fs-list-result");
                }
                Ok(())
            })
        }),
    );

    // fs.move → move/rename file with sandbox validation
    registry.register(
        "fs.move",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let source_str = action
                    .payload
                    .get("source")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.move requires 'source'".into()))?
                    .to_string();
                let dest_str = action
                    .payload
                    .get("destination")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.move requires 'destination'".into()))?
                    .to_string();
                let agent_id = match &action.source {
                    crate::action::types::ActionSource::Agent(id) => id.clone(),
                    _ => "system".to_string(),
                };
                let source_path = std::path::Path::new(&source_str);
                let dest_path = std::path::Path::new(&dest_str);
                state.sandbox_manager.check_read(&agent_id, source_path).await?;
                state.sandbox_manager.check_write(&agent_id, dest_path).await?;
                tokio::fs::rename(source_path, dest_path).await.map_err(|e| {
                    LunaError::Dispatch(format!(
                        "Failed to move '{}' to '{}': {}", source_str, dest_str, e
                    ))
                })?;
                if let Err(e) = handle.emit(
                    "fs-move-result",
                    serde_json::json!({"source": source_str, "destination": dest_str, "success": true}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit fs-move-result");
                }
                Ok(())
            })
        }),
    );

    // fs.mkdir → create directory with sandbox validation
    registry.register(
        "fs.mkdir",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let path_str = action
                    .payload
                    .get("path")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("fs.mkdir requires 'path'".into()))?
                    .to_string();
                let path = std::path::Path::new(&path_str);
                let agent_id = match &action.source {
                    crate::action::types::ActionSource::Agent(id) => id.clone(),
                    _ => "system".to_string(),
                };
                state.sandbox_manager.check_write(&agent_id, path).await?;
                tokio::fs::create_dir_all(path).await.map_err(|e| {
                    LunaError::Dispatch(format!("Failed to create directory '{}': {}", path_str, e))
                })?;
                if let Err(e) = handle.emit(
                    "fs-mkdir-result",
                    serde_json::json!({"path": path_str, "success": true}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit fs-mkdir-result");
                }
                Ok(())
            })
        }),
    );

    // window.resize → emit to frontend
    registry.register(
        "window.resize",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-window-resize", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-resize");
                }
                Ok(())
            })
        }),
    );

    // window.move → emit to frontend
    registry.register(
        "window.move",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-window-move", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-move");
                }
                Ok(())
            })
        }),
    );

    // window.maximize → emit to frontend
    registry.register(
        "window.maximize",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-window-maximize", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-maximize");
                }
                Ok(())
            })
        }),
    );

    // window.stack → emit to frontend
    registry.register(
        "window.stack",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("agent-window-stack", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit agent-window-stack");
                }
                Ok(())
            })
        }),
    );

    // agent.spawn → spawn a new leaf agent
    registry.register(
        "agent.spawn",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let agent_type = action
                    .payload
                    .get("agent_type")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("agent.spawn requires 'agent_type'".into()))?
                    .to_string();
                let workspace_id = action
                    .payload
                    .get("workspace_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("workspace_default")
                    .to_string();
                let capabilities: Vec<String> = action
                    .payload
                    .get("capabilities")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_else(|| vec![agent_type.clone()]);
                let agent_id = state
                    .agent_registry
                    .spawn_leaf(&workspace_id, capabilities)
                    .await;
                if let Err(e) = handle.emit(
                    "agent-spawned",
                    serde_json::json!({"agent_id": agent_id, "agent_type": agent_type, "workspace_id": workspace_id}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit agent-spawned");
                }
                tracing::info!(agent_id = %agent_id, agent_type = %agent_type, "Spawned new leaf agent");
                Ok(())
            })
        }),
    );

    // agent.kill → kill/deactivate an agent
    registry.register(
        "agent.kill",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let agent_id = action
                    .payload
                    .get("agent_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("agent.kill requires 'agent_id'".into()))?
                    .to_string();
                state.agent_registry.kill_agent(&agent_id).await?;
                if let Err(e) = handle.emit(
                    "agent-killed",
                    serde_json::json!({"agent_id": agent_id}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit agent-killed");
                }
                tracing::info!(agent_id = %agent_id, "Killed agent");
                Ok(())
            })
        }),
    );

    // config.get → read configuration value from semantic memory
    registry.register(
        "config.get",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let key = action
                    .payload
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("config.get requires 'key'".into()))?
                    .to_string();
                let config_key = format!("config:{}", key);
                let value: Option<String> = state.memory.semantic.get(&config_key).await?;
                if let Err(e) = handle.emit(
                    "config-get-result",
                    serde_json::json!({"key": key, "value": value}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit config-get-result");
                }
                Ok(())
            })
        }),
    );

    // config.set → update configuration value in semantic memory
    registry.register(
        "config.set",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let key = action
                    .payload
                    .get("key")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("config.set requires 'key'".into()))?
                    .to_string();
                let value = action
                    .payload
                    .get("value")
                    .cloned()
                    .ok_or_else(|| LunaError::Dispatch("config.set requires 'value'".into()))?;
                let config_key = format!("config:{}", key);
                let value_str = match &value {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                state.memory.semantic.store(&config_key, &value_str, &["config".to_string()]).await?;
                if let Err(e) = handle.emit(
                    "config-set-result",
                    serde_json::json!({"key": key, "value": value, "success": true}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit config-set-result");
                }
                Ok(())
            })
        }),
    );

    // plan.create → emit plan-created event
    registry.register(
        "plan.create",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("plan-created", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit plan-created");
                }
                Ok(())
            })
        }),
    );

    // plan.update → emit plan-updated event
    registry.register(
        "plan.update",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                if let Err(e) = handle.emit("plan-updated", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit plan-updated");
                }
                Ok(())
            })
        }),
    );

    // workspace.create → create workspace via WorkspaceManager
    registry.register(
        "workspace.create",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let name = action
                    .payload
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("workspace.create requires 'name'".into()))?
                    .to_string();
                let goal = action
                    .payload
                    .get("goal")
                    .and_then(|v| v.as_str())
                    .map(String::from);
                let workspace = state
                    .workspace_manager
                    .create_workspace(&name, goal, "standard")
                    .await?;
                if let Err(e) = handle.emit(
                    "workspace-created",
                    serde_json::json!({"workspace_id": workspace.id, "name": workspace.name}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit workspace-created");
                }
                tracing::info!(workspace_id = %workspace.id, name = %name, "Created workspace");
                Ok(())
            })
        }),
    );

    // workspace.switch → switch workspace via WorkspaceManager
    registry.register(
        "workspace.switch",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let workspace_id = action
                    .payload
                    .get("workspace_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("workspace.switch requires 'workspace_id'".into()))?
                    .to_string();
                state.workspace_manager.switch_workspace(&workspace_id).await?;
                if let Err(e) = handle.emit(
                    "workspace-switched",
                    serde_json::json!({"workspace_id": workspace_id}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit workspace-switched");
                }
                tracing::info!(workspace_id = %workspace_id, "Switched workspace");
                Ok(())
            })
        }),
    );

    // workspace.close → close workspace via WorkspaceManager
    registry.register(
        "workspace.close",
        Arc::new(|action, handle, state| {
            Box::pin(async move {
                let workspace_id = action
                    .payload
                    .get("workspace_id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| LunaError::Dispatch("workspace.close requires 'workspace_id'".into()))?
                    .to_string();
                state.workspace_manager.delete_workspace(&workspace_id).await?;
                if let Err(e) = handle.emit(
                    "workspace-closed",
                    serde_json::json!({"workspace_id": workspace_id}),
                ) {
                    tracing::debug!(error = %e, "Failed to emit workspace-closed");
                }
                tracing::info!(workspace_id = %workspace_id, "Closed workspace");
                Ok(())
            })
        }),
    );

    // system.undo → undo the last undoable action
    registry.register(
        "system.undo",
        Arc::new(|action, handle, _state| {
            Box::pin(async move {
                // Emit an undo-requested event; the undo manager logic is handled
                // by the dispatcher/undo subsystem which listens for this event.
                if let Err(e) = handle.emit("system-undo-requested", &action.payload) {
                    tracing::debug!(error = %e, "Failed to emit system-undo-requested");
                }
                Ok(())
            })
        }),
    );
}
