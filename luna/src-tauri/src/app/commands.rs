use tauri::State;
use tracing::info;

use crate::error::LunaError;
use crate::state::AppState;

/// Dispatch a component event from the frontend to the controlling agent.
#[tauri::command]
pub async fn dispatch_app_event(
    state: State<'_, AppState>,
    app_id: String,
    handler_name: String,
    component_id: String,
    event_data: String,
) -> Result<(), LunaError> {
    info!(
        app_id = %app_id,
        handler = %handler_name,
        component = %component_id,
        "App event dispatched"
    );

    // Route the event back through the action system
    let event_payload = serde_json::json!({
        "app_id": app_id,
        "handler_name": handler_name,
        "component_id": component_id,
        "event_data": serde_json::from_str::<serde_json::Value>(&event_data)
            .map_err(|e| LunaError::Dispatch(format!("Invalid event_data JSON: {}", e)))?,
    });

    let action = crate::action::types::Action::new(
        "app.event".to_string(),
        event_payload,
        crate::action::types::ActionSource::System,
    );

    state.dispatcher.dispatch(action).await?;

    Ok(())
}
