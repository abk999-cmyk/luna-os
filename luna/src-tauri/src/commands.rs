use tauri::{AppHandle, Emitter, State};
use tracing::{info, warn};

use crate::action::types::{Action, ActionSource};
use crate::error::LunaError;
use crate::state::AppState;

#[tauri::command]
pub async fn dispatch_action(
    state: State<'_, AppState>,
    action_type: String,
    payload: serde_json::Value,
) -> Result<String, LunaError> {
    let action = Action::new(action_type, payload, ActionSource::User);
    let id = state.dispatcher.dispatch(action).await?;
    Ok(id.to_string())
}

#[tauri::command]
pub async fn query_actions(
    state: State<'_, AppState>,
    action_type: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Action>, LunaError> {
    let limit = limit.unwrap_or(50);
    match action_type {
        Some(at) => Ok(state.dispatcher.query_by_type(&at).await),
        None => Ok(state.dispatcher.query_recent(limit).await),
    }
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
) -> Result<(), LunaError> {
    info!(text = %text, "User message received");

    // Dispatch as user.text_input action
    let input_action = Action::new(
        "user.text_input".to_string(),
        serde_json::json!({ "text": &text }),
        ActionSource::User,
    );
    state.dispatcher.dispatch(input_action).await?;

    // Send to conductor if available
    let mut conductor_guard = state.conductor.write().await;
    if let Some(ref mut conductor) = *conductor_guard {
        match conductor.handle_user_input(text).await {
            Ok(actions) => {
                for action in actions {
                    // Emit agent response to frontend
                    if action.action_type == "agent.response" {
                        let _ = app.emit("agent-response", &action.payload);
                    }
                    if action.action_type == "window.create" {
                        let _ = app.emit("agent-window-create", &action.payload);
                    }

                    // Dispatch through action system
                    if let Err(e) = state.dispatcher.dispatch(action).await {
                        warn!(error = %e, "Failed to dispatch agent action");
                    }
                }
            }
            Err(e) => {
                warn!(error = %e, "Conductor error");
                let error_payload = serde_json::json!({
                    "text": format!("Error: {}", e)
                });
                let _ = app.emit("agent-response", &error_payload);

                // Dispatch error action
                let error_action = Action::new(
                    "agent.error".to_string(),
                    error_payload,
                    ActionSource::Agent("conductor".to_string()),
                );
                state.dispatcher.dispatch(error_action).await.ok();
            }
        }
    } else {
        // No conductor available — tell the user
        let no_agent_payload = serde_json::json!({
            "text": "No AI agent configured. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable and restart Luna."
        });
        let _ = app.emit("agent-response", &no_agent_payload);
    }

    Ok(())
}

#[tauri::command]
pub async fn get_agent_status(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, LunaError> {
    let conductor = state.conductor.read().await;
    Ok(serde_json::json!({
        "has_conductor": conductor.is_some(),
        "conductor_id": conductor.as_ref().map(|c| c.id.clone()),
    }))
}
