use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub async fn get_user_model(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let model = state.user_model.get_or_create("default")
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&model).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_user_expertise(
    state: State<'_, AppState>,
    domain: String,
    delta: f64,
) -> Result<(), String> {
    state.user_model.update_expertise(&domain, delta)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn record_learning_observation(
    state: State<'_, AppState>,
    actions: Vec<String>,
    tags: Vec<String>,
    outcome: String,
) -> Result<String, String> {
    let outcome = match outcome.as_str() {
        "success" => crate::intelligence::learning::ObservationOutcome::Success,
        "failure" => crate::intelligence::learning::ObservationOutcome::Failure,
        "corrected" => crate::intelligence::learning::ObservationOutcome::Corrected,
        _ => crate::intelligence::learning::ObservationOutcome::Abandoned,
    };
    state.learning_engine.record_observation(actions, tags, outcome)
        .map_err(|e| e.to_string())
}

/// Get pending automation proposals generated from detected patterns.
#[tauri::command]
pub async fn get_automation_proposals(
    state: State<'_, AppState>,
    max_count: Option<usize>,
) -> Result<serde_json::Value, String> {
    let proposals = state.learning_engine.generate_proposals(max_count.unwrap_or(10));
    let pending: Vec<_> = proposals
        .into_iter()
        .filter(|p| p.status == crate::intelligence::learning::ProposalStatus::Pending)
        .collect();
    serde_json::to_value(&pending).map_err(|e| e.to_string())
}

/// Accept or reject an automation proposal.
#[tauri::command]
pub async fn respond_to_proposal(
    state: State<'_, AppState>,
    id: String,
    accepted: bool,
) -> Result<(), String> {
    // Record the user's decision as a learning observation so future proposals
    // reflect acceptance patterns.
    let outcome = if accepted {
        crate::intelligence::learning::ObservationOutcome::Success
    } else {
        crate::intelligence::learning::ObservationOutcome::Abandoned
    };
    let action_label = if accepted {
        "proposal.accepted"
    } else {
        "proposal.rejected"
    };
    state
        .learning_engine
        .record_observation(
            vec![action_label.to_string(), id],
            vec!["proposal_response".to_string()],
            outcome,
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the full user model as JSON for inspection.
#[tauri::command]
pub async fn inspect_user_model(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let model = state.user_model.get_or_create("default")
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&model).map_err(|e| e.to_string())
}

/// Resets the user model to defaults (privacy control).
#[tauri::command]
pub async fn delete_user_model(state: State<'_, AppState>) -> Result<(), String> {
    state.user_model.reset_to_defaults("default")
        .map_err(|e| e.to_string())
}

/// Returns recent model update history (privacy audit).
#[tauri::command]
pub async fn get_user_model_audit(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<serde_json::Value, String> {
    let entries = state.user_model.get_audit_log(limit.unwrap_or(50));
    serde_json::to_value(&entries).map_err(|e| e.to_string())
}
