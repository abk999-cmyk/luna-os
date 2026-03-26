use std::collections::HashMap;
use std::sync::RwLock;

use super::descriptor::AppDescriptor;
use crate::error::LunaError;

/// A running dynamic app instance.
#[derive(Debug, Clone)]
pub struct RunningApp {
    pub descriptor: AppDescriptor,
    pub controlling_agent_id: String,
    pub window_id: String,
    pub data_context: serde_json::Value,
    pub created_at: u64,
}

/// Manages the lifecycle of dynamic apps.
pub struct AppManager {
    apps: RwLock<HashMap<String, RunningApp>>,
}

impl AppManager {
    pub fn new() -> Self {
        Self {
            apps: RwLock::new(HashMap::new()),
        }
    }

    /// Create and register a new dynamic app.
    pub fn create_app(
        &self,
        descriptor: AppDescriptor,
        window_id: String,
        agent_id: String,
    ) -> Result<RunningApp, LunaError> {
        // Validate
        let errors = descriptor.validate();
        if !errors.is_empty() {
            return Err(LunaError::Dispatch(format!(
                "Invalid app descriptor: {}",
                errors.join("; ")
            )));
        }

        let app = RunningApp {
            data_context: descriptor.data.clone(),
            controlling_agent_id: agent_id,
            window_id,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
            descriptor,
        };

        let app_id = app.descriptor.id.clone();
        let mut apps = self.apps.write().unwrap();
        if apps.contains_key(&app_id) {
            return Err(LunaError::Dispatch(format!("App already exists: {}", app_id)));
        }
        apps.insert(app_id, app.clone());

        Ok(app)
    }

    /// Update an app's data context.
    pub fn update_data(&self, app_id: &str, data: serde_json::Value) -> Result<(), LunaError> {
        let mut apps = self.apps.write().unwrap();
        let app = apps.get_mut(app_id).ok_or_else(|| {
            LunaError::Dispatch(format!("App not found: {}", app_id))
        })?;

        // Merge data
        if let (Some(existing), Some(new)) = (app.data_context.as_object_mut(), data.as_object()) {
            for (k, v) in new {
                existing.insert(k.clone(), v.clone());
            }
        } else {
            app.data_context = data;
        }

        Ok(())
    }

    /// Update an app's descriptor (full replacement).
    pub fn update_spec(&self, app_id: &str, descriptor: AppDescriptor) -> Result<(), LunaError> {
        let mut apps = self.apps.write().unwrap();
        let app = apps.get_mut(app_id).ok_or_else(|| {
            LunaError::Dispatch(format!("App not found: {}", app_id))
        })?;
        app.descriptor = descriptor;
        Ok(())
    }

    /// Destroy an app and remove it from the registry.
    pub fn destroy_app(&self, app_id: &str) -> Result<RunningApp, LunaError> {
        let mut apps = self.apps.write().unwrap();
        apps.remove(app_id).ok_or_else(|| {
            LunaError::Dispatch(format!("App not found: {}", app_id))
        })
    }

    /// Get a running app by ID.
    pub fn get_app(&self, app_id: &str) -> Option<RunningApp> {
        let apps = self.apps.read().unwrap();
        apps.get(app_id).cloned()
    }

    /// Get the controlling agent for an app.
    pub fn get_controlling_agent(&self, app_id: &str) -> Option<String> {
        let apps = self.apps.read().unwrap();
        apps.get(app_id).map(|a| a.controlling_agent_id.clone())
    }

    /// List all running apps.
    pub fn list_apps(&self) -> Vec<String> {
        let apps = self.apps.read().unwrap();
        apps.keys().cloned().collect()
    }
}
