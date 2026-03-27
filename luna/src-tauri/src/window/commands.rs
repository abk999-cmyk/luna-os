use tauri::State;
use crate::error::LunaError;
use crate::state::AppState;
use super::types::{Bounds, WindowState};

#[tauri::command]
pub async fn create_window(
    state: State<'_, AppState>,
    title: String,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    content_type: Option<String>,
) -> Result<WindowState, LunaError> {
    let bounds = Some(Bounds {
        x: x.unwrap_or(100.0),
        y: y.unwrap_or(100.0),
        width: width.unwrap_or(600.0),
        height: height.unwrap_or(400.0),
    });

    let mut manager = state.window_manager.write().await;
    let mut window = manager.create_window(title, bounds);

    if let Some(ct) = content_type {
        window.content_type = match ct.as_str() {
            "response" => super::types::WindowContentType::Response,
            "editor" => super::types::WindowContentType::Editor,
            "panel" => super::types::WindowContentType::Panel,
            "canvas" => super::types::WindowContentType::Canvas,
            "dynamic_app" => super::types::WindowContentType::DynamicApp,
            "terminal" => super::types::WindowContentType::Terminal,
            "scratchpad" => super::types::WindowContentType::Scratchpad,
            _ => super::types::WindowContentType::Empty,
        };
        // Update in manager too
        if let Some(w) = manager.windows_mut().get_mut(&window.id) {
            w.content_type = window.content_type.clone();
        }
    }

    Ok(window)
}

#[tauri::command]
pub async fn close_window(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), LunaError> {
    let mut manager = state.window_manager.write().await;
    manager.close_window(&id)?;
    Ok(())
}

#[tauri::command]
pub async fn resize_window(
    state: State<'_, AppState>,
    id: String,
    width: f64,
    height: f64,
) -> Result<WindowState, LunaError> {
    let mut manager = state.window_manager.write().await;
    let window = manager.resize_window(&id, width, height)?;
    Ok(window.clone())
}

#[tauri::command]
pub async fn move_window(
    state: State<'_, AppState>,
    id: String,
    x: f64,
    y: f64,
) -> Result<WindowState, LunaError> {
    let mut manager = state.window_manager.write().await;
    let window = manager.move_window(&id, x, y)?;
    Ok(window.clone())
}

#[tauri::command]
pub async fn minimize_window(
    state: State<'_, AppState>,
    id: String,
) -> Result<WindowState, LunaError> {
    let mut manager = state.window_manager.write().await;
    let window = manager.minimize_window(&id)?;
    Ok(window.clone())
}

#[tauri::command]
pub async fn restore_window(
    state: State<'_, AppState>,
    id: String,
) -> Result<WindowState, LunaError> {
    let mut manager = state.window_manager.write().await;
    let window = manager.restore_window(&id)?;
    Ok(window.clone())
}

#[tauri::command]
pub async fn focus_window(
    state: State<'_, AppState>,
    id: String,
) -> Result<WindowState, LunaError> {
    let mut manager = state.window_manager.write().await;
    let window = manager.focus_window(&id)?;
    Ok(window.clone())
}

#[tauri::command]
pub async fn get_windows(
    state: State<'_, AppState>,
) -> Result<Vec<WindowState>, LunaError> {
    let manager = state.window_manager.read().await;
    Ok(manager.get_all_windows_owned())
}
