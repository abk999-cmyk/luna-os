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
        Some(at) => {
            let mut results = state.dispatcher.query_by_type(&at).await;
            results.truncate(limit);
            Ok(results)
        }
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

    if let Some(ref conductor) = *state.conductor {
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
    let agents = state.agent_registry.list_all().await;
    Ok(serde_json::json!({
        "has_conductor": state.conductor.is_some(),
        "conductor_id": (*state.conductor).as_ref().map(|c| c.id.clone()),
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

    if let Some(ref conductor) = *state.conductor {
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

    let api_key = config.openai_api_key
        .ok_or_else(|| LunaError::Config("Whisper transcription requires OPENAI_API_KEY".into()))?;

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
        "action",
        None,
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
        let truncated: String = content.chars().take(500).collect();
        format!("{}...", truncated)
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

// ── Episodic memory queries ─────────────────────────────────────────────────

/// Query episodic memory by agent ID.
#[tauri::command]
pub async fn query_episodic_by_agent(
    state: State<'_, AppState>,
    agent_id: String,
    limit: Option<usize>,
) -> Result<Vec<serde_json::Value>, LunaError> {
    state.memory.episodic.query_by_agent(&agent_id, limit.unwrap_or(50))
}

/// Query episodic memory by time range.
#[tauri::command]
pub async fn query_episodic_time_range(
    state: State<'_, AppState>,
    start_ms: i64,
    end_ms: i64,
    limit: Option<usize>,
) -> Result<Vec<serde_json::Value>, LunaError> {
    state.memory.episodic.query_time_range(start_ms, end_ms, limit.unwrap_or(100))
}

/// Search semantic memory by tag.
#[tauri::command]
pub async fn search_semantic_memory(
    state: State<'_, AppState>,
    tag: String,
) -> Result<Vec<(String, String)>, LunaError> {
    state.memory.semantic.search_by_tag(&tag)
}

/// Delete a key from the legacy semantic KV store.
#[tauri::command]
pub async fn delete_semantic_memory(
    state: State<'_, AppState>,
    key: String,
) -> Result<(), LunaError> {
    let db = state.db.lock().await;
    db.conn().execute("DELETE FROM semantic_memory WHERE key = ?1", rusqlite::params![key])?;
    Ok(())
}

// ── Undo commands ───────────────────────────────────────────────────────────

/// Undo the most recent undoable action.
#[tauri::command]
pub async fn undo_last_action(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, LunaError> {
    let entries = state.undo_manager.get_recent(1)?;
    match entries.into_iter().next() {
        Some(entry) => {
            let entry_json = serde_json::to_value(&entry)?;
            state.undo_manager.mark_executed(&entry.id)?;
            Ok(serde_json::json!({
                "undone": true,
                "entry": entry_json,
            }))
        }
        None => Ok(serde_json::json!({
            "undone": false,
            "reason": "No undoable actions in history",
        })),
    }
}

/// Get the undo history (most recent first).
#[tauri::command]
pub async fn get_undo_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<serde_json::Value>, LunaError> {
    let entries = state.undo_manager.get_undo_stack(limit.unwrap_or(20))?;
    entries
        .into_iter()
        .map(|e| serde_json::to_value(&e).map_err(LunaError::from))
        .collect()
}

// ── Plan commands ───────────────────────────────────────────────────────────

/// Create a new plan.
#[tauri::command]
pub async fn create_plan(
    state: State<'_, AppState>,
    name: String,
    goal: String,
    steps: Vec<serde_json::Value>,
    created_by: Option<String>,
) -> Result<serde_json::Value, LunaError> {
    let id = uuid::Uuid::new_v4().to_string();
    let steps_json = serde_json::to_string(&steps)?;
    let db = state.db.lock().await;
    db.plan_create(&id, &name, &goal, &steps_json, &created_by.unwrap_or_else(|| "conductor".into()))?;
    Ok(serde_json::json!({ "plan_id": id, "name": name, "goal": goal, "steps": steps }))
}

/// Get a plan by ID.
#[tauri::command]
pub async fn get_plan(
    state: State<'_, AppState>,
    plan_id: String,
) -> Result<serde_json::Value, LunaError> {
    let db = state.db.lock().await;
    match db.plan_get(&plan_id)? {
        Some(plan) => Ok(plan),
        None => Err(LunaError::Database(format!("Plan not found: {}", plan_id))),
    }
}

/// List all active plans.
#[tauri::command]
pub async fn list_active_plans(
    state: State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, LunaError> {
    let db = state.db.lock().await;
    db.plan_list_active()
}

/// Update a plan's steps and/or status.
#[tauri::command]
pub async fn update_plan(
    state: State<'_, AppState>,
    plan_id: String,
    steps: Option<Vec<serde_json::Value>>,
    status: Option<String>,
) -> Result<(), LunaError> {
    let db = state.db.lock().await;
    if let Some(s) = steps {
        let json = serde_json::to_string(&s)?;
        db.plan_update_steps(&plan_id, &json)?;
    }
    if let Some(st) = status {
        db.plan_update_status(&plan_id, &st)?;
    }
    Ok(())
}
