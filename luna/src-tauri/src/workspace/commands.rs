use tauri::State;
use tracing::info;

use crate::error::LunaError;
use crate::state::AppState;
use super::{Workspace, WorkspaceLayout, SnapZone};

/// Create a new workspace.
#[tauri::command]
pub async fn create_workspace(
    state: State<'_, AppState>,
    name: String,
    goal: Option<String>,
    isolation_level: Option<String>,
) -> Result<Workspace, LunaError> {
    let level = isolation_level.as_deref().unwrap_or("standard");
    let workspace = state
        .workspace_manager
        .create_workspace(&name, goal, level)
        .await?;
    info!(workspace_id = %workspace.id, name = %workspace.name, "Workspace created");
    Ok(workspace)
}

/// List all active workspaces.
#[tauri::command]
pub async fn list_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<Workspace>, LunaError> {
    Ok(state.workspace_manager.list_workspaces().await)
}

/// Switch to a different workspace.
#[tauri::command]
pub async fn switch_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), LunaError> {
    state.workspace_manager.switch_workspace(&workspace_id).await?;
    info!(workspace_id = %workspace_id, "Switched workspace");
    Ok(())
}

/// Get the currently active workspace ID.
#[tauri::command]
pub async fn get_active_workspace(
    state: State<'_, AppState>,
) -> Result<Option<String>, LunaError> {
    Ok(state.workspace_manager.active_workspace().await)
}

/// Delete (deactivate) a workspace.
#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), LunaError> {
    state.workspace_manager.delete_workspace(&workspace_id).await?;
    info!(workspace_id = %workspace_id, "Workspace deleted");
    Ok(())
}

/// Snap a window to a zone within a workspace.
#[tauri::command]
pub async fn snap_window(
    state: State<'_, AppState>,
    workspace_id: String,
    window_id: String,
    zone: String,
) -> Result<(), LunaError> {
    let snap_zone = match zone.to_lowercase().as_str() {
        "left" => SnapZone::Left,
        "center" => SnapZone::Center,
        "right" => SnapZone::Right,
        "bottom" => SnapZone::Bottom,
        _ => return Err(LunaError::Dispatch(format!("Unknown snap zone: {}", zone))),
    };

    state
        .workspace_manager
        .snap_window(&workspace_id, &window_id, snap_zone)
        .await?;

    info!(
        workspace_id = %workspace_id,
        window_id = %window_id,
        zone = %zone,
        "Window snapped to zone"
    );
    Ok(())
}

/// Get the layout for a workspace.
#[tauri::command]
pub async fn get_layout(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<WorkspaceLayout>, LunaError> {
    Ok(state.workspace_manager.get_layout(&workspace_id).await)
}

/// Update workspace properties.
#[tauri::command]
pub async fn update_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    name: Option<String>,
    goal: Option<String>,
) -> Result<serde_json::Value, LunaError> {
    state.workspace_manager.update_workspace(&workspace_id, name, goal).await?;
    let ws = state.workspace_manager.get_workspace(&workspace_id).await;
    Ok(serde_json::to_value(ws).unwrap_or_default())
}

/// Add a window to a workspace.
#[tauri::command]
pub async fn add_window_to_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    window_id: String,
) -> Result<(), LunaError> {
    state.workspace_manager.add_window(&workspace_id, &window_id).await
}

/// Remove a window from a workspace.
#[tauri::command]
pub async fn remove_window_from_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
    window_id: String,
) -> Result<(), LunaError> {
    state.workspace_manager.remove_window(&workspace_id, &window_id).await
}
