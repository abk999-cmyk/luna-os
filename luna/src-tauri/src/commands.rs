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

    // Get current open windows for context
    let open_windows: Vec<String> = {
        let wm = state.window_manager.read().await;
        wm.get_all_windows_owned()
            .iter()
            .map(|w| format!("{} ({})", w.title, w.id))
            .collect()
    };

    let session_id = state.get_session_id().await;

    // Generate action space string from registry (released before conductor lock)
    let action_space = {
        let reg = state.dispatcher.get_registry().await;
        reg.generate_action_space_prompt()
    };

    // Send to conductor if available
    let mut conductor_guard = state.conductor.write().await;
    if let Some(ref mut conductor) = *conductor_guard {
        let result = conductor.handle_user_input(
            text.clone(),
            Some(action_space),
            Some(&state.memory),
            open_windows,
            &session_id,
        ).await;

        match result {
            Ok(actions) => {
                // Update conductor working memory
                state.memory.working.push_observation(
                    "conductor",
                    format!("Handled user input: {} actions produced", actions.len()),
                ).await;

                for action in actions {
                    // Dispatch through the action system — queue processor handles events
                    if let Err(e) = state.dispatcher.dispatch(action).await {
                        warn!(error = %e, "Failed to dispatch agent action");
                    }
                }
            }
            Err(e) => {
                warn!(error = %e, "Conductor error");
                let error_payload = serde_json::json!({ "text": format!("Error: {}", e) });
                let _ = app.emit("agent-response", &error_payload);

                // Dispatch error action
                let error_action = Action::new(
                    "agent.error".to_string(),
                    serde_json::json!({ "text": format!("{}", e) }),
                    ActionSource::Agent("conductor".to_string()),
                );
                state.dispatcher.dispatch(error_action).await.ok();
            }
        }
    } else {
        let no_agent_payload = serde_json::json!({
            "text": "No AI agent configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY and restart Luna."
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
    let agents = state.agent_registry.list_all().await;
    Ok(serde_json::json!({
        "has_conductor": conductor.is_some(),
        "conductor_id": conductor.as_ref().map(|c| c.id.clone()),
        "agents": agents,
    }))
}

/// Grant permission for an agent to perform an action.
#[tauri::command]
pub async fn grant_permission(
    state: State<'_, AppState>,
    agent_id: String,
    action_type: String,
    permanent: bool,
) -> Result<(), LunaError> {
    {
        let mut perms = state.permissions.write().await;
        perms.grant(&agent_id, &action_type, permanent)?;
    }

    state.audit.log(&agent_id, &action_type, "granted").ok();

    if permanent {
        // Persist to agent_state so it survives restart
        let mut agent_state = state.memory.agent_state.load(&agent_id)?;
        let perms = state.permissions.read().await;
        let grants = perms.serialize_grants(&agent_id);
        if let Some(obj) = agent_state.as_object_mut() {
            obj.insert("granted_permissions".to_string(), serde_json::json!(grants));
        }
        state.memory.agent_state.save(&agent_id, &agent_state)?;
    }

    info!(agent_id = %agent_id, action_type = %action_type, permanent, "Permission granted");
    Ok(())
}

/// Deny permission for an agent to perform an action.
#[tauri::command]
pub async fn deny_permission(
    state: State<'_, AppState>,
    agent_id: String,
    action_type: String,
) -> Result<(), LunaError> {
    {
        let mut perms = state.permissions.write().await;
        perms.deny(&agent_id, &action_type)?;
    }
    state.audit.log(&agent_id, &action_type, "denied").ok();
    info!(agent_id = %agent_id, action_type = %action_type, "Permission denied");
    Ok(())
}

/// Get the current scratchpad for a workspace.
#[tauri::command]
pub async fn get_scratchpad(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<crate::agent::scratchpad::ScratchpadEntry>, LunaError> {
    Ok(state.scratchpad.read(&workspace_id).await)
}

/// Query the permission audit log.
#[tauri::command]
pub async fn query_permission_log(
    state: State<'_, AppState>,
    agent_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<serde_json::Value>, LunaError> {
    state.audit.query(agent_id.as_deref(), limit.unwrap_or(50))
}
