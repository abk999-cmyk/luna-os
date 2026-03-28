use tauri::State;
use crate::state::AppState;

#[tauri::command]
pub async fn create_user(state: State<'_, AppState>, name: String) -> Result<serde_json::Value, String> {
    let user = state.identity_manager.create_local_user(&name).await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(&user).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_current_user(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let user = state.identity_manager.get_current_user().await;
    serde_json::to_value(&user).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn grant_workspace_access(
    state: State<'_, AppState>,
    workspace_id: String,
    user_id: String,
    role: String,
    #[allow(unused_variables)] granted_by: String,
) -> Result<(), String> {
    // Ignore caller-supplied granted_by; derive identity from the authenticated session.
    let current_user = state.identity_manager.get_current_user().await
        .ok_or_else(|| "No authenticated user session. Please log in first.".to_string())?;
    let authenticated_id = current_user.user_id;

    let role = match role.as_str() {
        "owner" => crate::collaboration::rbac::Role::Owner,
        "editor" => crate::collaboration::rbac::Role::Editor,
        _ => crate::collaboration::rbac::Role::Viewer,
    };
    state.rbac_manager.grant_access(&workspace_id, &user_id, role, &authenticated_id).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_workspace_presence(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<serde_json::Value, String> {
    let presence = state.presence_manager.get_workspace_presence(&workspace_id).await;
    serde_json::to_value(&presence).map_err(|e| e.to_string())
}
