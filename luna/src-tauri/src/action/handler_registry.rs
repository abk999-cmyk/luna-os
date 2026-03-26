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
        let mut handlers = self.handlers.write().unwrap();
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
        let mut app_handlers = self.app_handlers.write().unwrap();
        app_handlers
            .entry(app_id.to_string())
            .or_default()
            .push(action_type.to_string());
    }

    /// Remove all handlers registered by a specific app.
    pub fn deregister_app_handlers(&self, app_id: &str) {
        let mut app_handlers = self.app_handlers.write().unwrap();
        if let Some(types) = app_handlers.remove(app_id) {
            let mut handlers = self.handlers.write().unwrap();
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
            let handlers = self.handlers.read().unwrap();
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
        let handlers = self.handlers.read().unwrap();
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
                if let Err(e) = state.app_manager.create_app(descriptor.clone(), window_id.clone(), agent_id) {
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
                    state.app_manager.update_data(&app_id, data)?;
                }

                // Update components (full spec replacement) if provided
                if let Some(components) = action.payload.get("components") {
                    if let Some(app) = state.app_manager.get_app(&app_id) {
                        let mut new_desc = app.descriptor.clone();
                        if let Ok(comps) = serde_json::from_value(components.clone()) {
                            new_desc.components = comps;
                        }
                        state.app_manager.update_spec(&app_id, new_desc)?;
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

                let app = state.app_manager.destroy_app(&app_id)?;

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
                    let _ = state.memory.semantic.store(key, val, &tags);
                    tracing::debug!(key = %key, "Stored value in semantic memory");
                }
                Ok(())
            })
        }),
    );
}
