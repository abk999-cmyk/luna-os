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
                    match state.dispatcher.dispatch(action).await {
                        Ok(_) => {}
                        Err(LunaError::PendingApproval(action_id)) => {
                            // Emit permission request to frontend
                            if let Some(pending) = state.dispatcher.get_pending_action(&action_id).await {
                                let agent_id = match &pending.source {
                                    ActionSource::Agent(id) => id.clone(),
                                    _ => "unknown".to_string(),
                                };
                                let _ = app.emit("permission-request", serde_json::json!({
                                    "action_id": action_id,
                                    "agent_id": agent_id,
                                    "action_type": pending.action_type,
                                    "payload_preview": serde_json::to_string(&pending.payload).ok(),
                                }));
                            }
                        }
                        Err(e) => {
                            warn!(error = %e, "Failed to dispatch agent action");
                        }
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

/// Send a message with streaming response (token-by-token delivery).
#[tauri::command]
pub async fn send_message_streaming(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
) -> Result<(), LunaError> {
    info!(text = %text, "User message received (streaming)");

    // Dispatch as user.text_input action
    let input_action = Action::new(
        "user.text_input".to_string(),
        serde_json::json!({ "text": &text }),
        ActionSource::User,
    );
    state.dispatcher.dispatch(input_action).await?;

    // Get context
    let open_windows: Vec<String> = {
        let wm = state.window_manager.read().await;
        wm.get_all_windows_owned()
            .iter()
            .map(|w| format!("{} ({})", w.title, w.id))
            .collect()
    };
    let session_id = state.get_session_id().await;
    let action_space = {
        let reg = state.dispatcher.get_registry().await;
        reg.generate_action_space_prompt()
    };

    let mut conductor_guard = state.conductor.write().await;
    if let Some(ref mut conductor) = *conductor_guard {
        let app_handle = app.clone();
        let dispatcher = state.dispatcher.clone();
        let app_handle2 = app.clone();

        let result = conductor.handle_user_input_streaming(
            text.clone(),
            Some(action_space),
            Some(&state.memory),
            open_windows,
            &session_id,
            // on_token: emit to frontend
            move |token| {
                use tauri::Emitter;
                let _ = app_handle.emit("agent-stream-token", serde_json::json!({ "token": token }));
            },
            // on_actions: dispatch through action system
            move |actions| {
                let d = dispatcher.clone();
                let ah = app_handle2.clone();
                tauri::async_runtime::spawn(async move {
                    for action in actions {
                        match d.dispatch(action).await {
                            Ok(_) => {}
                            Err(LunaError::PendingApproval(action_id)) => {
                                if let Some(pending) = d.get_pending_action(&action_id).await {
                                    let agent_id = match &pending.source {
                                        ActionSource::Agent(id) => id.clone(),
                                        _ => "unknown".to_string(),
                                    };
                                    use tauri::Emitter;
                                    let _ = ah.emit("permission-request", serde_json::json!({
                                        "action_id": action_id,
                                        "agent_id": agent_id,
                                        "action_type": pending.action_type,
                                    }));
                                }
                            }
                            Err(e) => {
                                tracing::warn!(error = %e, "Failed to dispatch streaming action");
                            }
                        }
                    }
                });
            },
        ).await;

        // Emit stream-done event
        use tauri::Emitter;
        let _ = app.emit("agent-stream-done", serde_json::json!({}));

        if let Err(e) = result {
            warn!(error = %e, "Conductor streaming error");
            let _ = app.emit("agent-response", serde_json::json!({ "text": format!("Error: {}", e) }));
        }
    } else {
        use tauri::Emitter;
        let _ = app.emit("agent-response", serde_json::json!({
            "text": "No AI agent configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY and restart Luna."
        }));
    }

    Ok(())
}

/// Transcribe audio via Whisper API (for voice input).
#[tauri::command]
pub async fn transcribe_audio(
    _state: State<'_, AppState>,
    audio_base64: String,
    format: String,
) -> Result<String, LunaError> {
    use base64::Engine;
    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(&audio_base64)
        .map_err(|e| LunaError::Dispatch(format!("Invalid base64 audio: {}", e)))?;

    // Use the OpenAI API key (Whisper is OpenAI-only)
    let config = crate::config::LunaConfig::load()
        .map_err(|e| LunaError::Config(format!("{}", e)))?;

    let api_key = config.openai_api_key.or(config.anthropic_api_key)
        .ok_or_else(|| LunaError::Config("No API key configured for transcription".into()))?;

    let client = reqwest::Client::new();
    crate::agent::transcription::transcribe(&client, &api_key, audio_bytes, &format).await
}

/// Inject dropped file context into memory for the conductor.
#[tauri::command]
pub async fn inject_context(
    state: State<'_, AppState>,
    context_type: String,
    summary: String,
    content: String,
    source_filename: String,
) -> Result<(), LunaError> {
    let session_id = state.get_session_id().await;

    // Store in episodic memory
    if let Err(e) = state.memory.episodic.record(
        &session_id,
        "user",
        "context.drop",
        &serde_json::json!({
            "type": context_type,
            "filename": source_filename,
            "summary": summary,
        }),
        &serde_json::json!({}),
        &["context".into(), "drop".into()],
    ) {
        warn!(error = %e, "Failed to record context drop in episodic memory");
    }

    // Store in semantic memory
    let key = format!("context:{}", source_filename);
    let tags: Vec<String> = vec!["context".into(), "drop".into(), context_type.clone()];
    let _ = state.memory.semantic.store(
        &key,
        &format!("{} ({}): {}", source_filename, context_type, summary),
        &tags,
    );

    // Push to working memory so conductor sees it in next prompt
    let preview = if content.len() > 500 {
        format!("{}...", &content[..500])
    } else {
        content
    };
    state.memory.working.push_observation(
        "conductor",
        format!("User dropped file '{}' ({}) — {}. Preview: {}", source_filename, context_type, summary, preview),
    ).await;

    info!(
        filename = %source_filename,
        context_type = %context_type,
        "Context injected from file drop"
    );
    Ok(())
}

/// Get the full task graph.
#[tauri::command]
pub async fn get_task_graph(
    state: State<'_, AppState>,
) -> Result<Vec<crate::agent::task_graph::TaskNode>, LunaError> {
    Ok(state.task_graph.get_tree())
}

/// Approve a pending action (from permission dialog).
#[tauri::command]
pub async fn approve_pending_action(
    state: State<'_, AppState>,
    action_id: String,
) -> Result<(), LunaError> {
    state.dispatcher.approve_pending(&action_id).await?;
    Ok(())
}

/// Deny a pending action (from permission dialog).
#[tauri::command]
pub async fn deny_pending_action(
    state: State<'_, AppState>,
    action_id: String,
) -> Result<(), LunaError> {
    state.dispatcher.deny_pending(&action_id).await
}
