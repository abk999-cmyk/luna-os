use tauri::State;
use tracing::info;

use crate::app::manifest::{AppManifest, ManifestValidator};
use crate::app::template_registry::AppTemplate;
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
    // Validate that the app exists before dispatching
    if !state.app_manager.app_exists(&app_id) {
        return Err(LunaError::Dispatch(format!("App not found: {}", app_id)));
    }

    info!(
        app_id = %app_id,
        handler = %handler_name,
        component = %component_id,
        "App event dispatched"
    );

    // Handle __data_sync events: update the app's data context and persist
    if handler_name == "__data_sync" {
        let data: serde_json::Value = serde_json::from_str(&event_data)
            .map_err(|e| LunaError::Dispatch(format!("Invalid event_data JSON: {}", e)))?;
        state.app_manager.update_data(&app_id, data).await?;
        info!(app_id = %app_id, "Data sync persisted");
        return Ok(());
    }

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
        crate::action::types::ActionSource::User,
    );

    state.dispatcher.dispatch(action).await?;

    Ok(())
}

// ── Phase 5: Template commands ──────────────────────────────────────────────

/// Save a running app as a reusable template.
#[tauri::command]
pub async fn save_as_template(
    state: State<'_, AppState>,
    app_id: String,
    template_name: String,
    description: String,
    category: String,
    tags: Vec<String>,
) -> Result<AppTemplate, LunaError> {
    let descriptor = state
        .app_manager
        .get_descriptor(&app_id)
        .ok_or_else(|| LunaError::Dispatch(format!("App not found: {}", app_id)))?;

    let template = state.template_registry.save_as_template(
        &template_name,
        &description,
        &category,
        tags,
        &descriptor,
    ).await?;

    info!(template_id = %template.id, name = %template.name, "Template saved");
    Ok(template)
}

/// List all available templates.
#[tauri::command]
pub async fn list_templates(
    state: State<'_, AppState>,
) -> Result<Vec<AppTemplate>, LunaError> {
    state.template_registry.list_templates().await
}

/// Instantiate a new app from a template.
#[tauri::command]
pub async fn instantiate_from_template(
    state: State<'_, AppState>,
    template_id: String,
    new_title: Option<String>,
) -> Result<crate::app::descriptor::AppDescriptor, LunaError> {
    let new_app_id = uuid::Uuid::new_v4().to_string();
    let descriptor = state.template_registry.instantiate(
        &template_id,
        &new_app_id,
        new_title.as_deref(),
    ).await?;

    info!(
        template_id = %template_id,
        new_app_id = %new_app_id,
        "App instantiated from template"
    );
    Ok(descriptor)
}

/// Delete a template.
#[tauri::command]
pub async fn delete_template(
    state: State<'_, AppState>,
    template_id: String,
) -> Result<(), LunaError> {
    state.template_registry.delete_template(&template_id).await?;
    info!(template_id = %template_id, "Template deleted");
    Ok(())
}

/// Validate an app manifest.
#[tauri::command]
pub async fn validate_manifest(
    manifest_json: String,
) -> Result<Vec<String>, LunaError> {
    let manifest: AppManifest = serde_json::from_str(&manifest_json)
        .map_err(|e| LunaError::Dispatch(format!("Invalid manifest JSON: {}", e)))?;
    Ok(ManifestValidator::validate(&manifest))
}
