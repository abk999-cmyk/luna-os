use std::collections::HashMap;
use std::sync::RwLock;
use std::sync::Arc;

use super::descriptor::AppDescriptor;
use crate::error::LunaError;
use crate::persistence::db::Database;

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
    db: Arc<tokio::sync::Mutex<Database>>,
}

impl AppManager {
    pub fn new(db: Arc<tokio::sync::Mutex<Database>>) -> Self {
        Self {
            apps: RwLock::new(HashMap::new()),
            db,
        }
    }

    /// Load persisted apps from DB on startup.
    pub fn load_from_db(&self) {
        let database = self.db.blocking_lock();
        if let Ok(rows) = database.load_active_apps() {
            let mut apps = self.apps.write().unwrap();
            for row in rows {
                let app_id = row.get("app_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let window_id = row.get("window_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let agent_id = row.get("controlling_agent_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let descriptor_json = row.get("descriptor_json").and_then(|v| v.as_str()).unwrap_or("{}");
                let data_json = row.get("data_context_json").and_then(|v| v.as_str()).unwrap_or("{}");

                if let Ok(descriptor) = serde_json::from_str::<AppDescriptor>(descriptor_json) {
                    let data_context: serde_json::Value = serde_json::from_str(data_json).unwrap_or(serde_json::json!({}));
                    let app = RunningApp {
                        data_context,
                        controlling_agent_id: agent_id,
                        window_id,
                        created_at: 0,
                        descriptor,
                    };
                    apps.insert(app_id, app);
                }
            }
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

        // Persist to DB
        {
            let database = self.db.blocking_lock();
            let descriptor_json = serde_json::to_string(&app.descriptor).unwrap_or_default();
            let data_json = serde_json::to_string(&app.data_context).unwrap_or_default();
            if let Err(e) = database.save_app(&app_id, &app.window_id, &app.controlling_agent_id, &descriptor_json, &data_json) {
                tracing::warn!(error = %e, "Failed to persist app to DB");
            }
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

        // Persist updated data context
        {
            let database = self.db.blocking_lock();
            let descriptor_json = serde_json::to_string(&app.descriptor).unwrap_or_default();
            let data_json = serde_json::to_string(&app.data_context).unwrap_or_default();
            let _ = database.save_app(app_id, &app.window_id, &app.controlling_agent_id, &descriptor_json, &data_json);
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

        // Persist updated descriptor
        {
            let database = self.db.blocking_lock();
            let descriptor_json = serde_json::to_string(&app.descriptor).unwrap_or_default();
            let data_json = serde_json::to_string(&app.data_context).unwrap_or_default();
            let _ = database.save_app(app_id, &app.window_id, &app.controlling_agent_id, &descriptor_json, &data_json);
        }

        Ok(())
    }

    /// Destroy an app and remove it from the registry.
    pub fn destroy_app(&self, app_id: &str) -> Result<RunningApp, LunaError> {
        let mut apps = self.apps.write().unwrap();
        let app = apps.remove(app_id).ok_or_else(|| {
            LunaError::Dispatch(format!("App not found: {}", app_id))
        })?;

        // Mark as destroyed in DB
        {
            let database = self.db.blocking_lock();
            if let Err(e) = database.destroy_app_record(app_id) {
                tracing::warn!(error = %e, "Failed to mark app as destroyed in DB");
            }
        }

        Ok(app)
    }

    /// Get a running app by ID.
    pub fn get_app(&self, app_id: &str) -> Option<RunningApp> {
        let apps = self.apps.read().unwrap();
        apps.get(app_id).cloned()
    }

    /// Check if an app exists.
    pub fn app_exists(&self, app_id: &str) -> bool {
        let apps = self.apps.read().unwrap();
        apps.contains_key(app_id)
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

    /// Get the descriptor for a running app.
    pub fn get_descriptor(&self, app_id: &str) -> Option<AppDescriptor> {
        let apps = self.apps.read().unwrap();
        apps.get(app_id).map(|a| a.descriptor.clone())
    }
}
