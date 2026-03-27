use serde::{Deserialize, Serialize};

use crate::app::descriptor::AppDescriptor;
use crate::error::LunaError;
use crate::window::types::WindowState;
use crate::workspace::Workspace;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedWorkspace {
    pub name: String,
    pub goal: String,
    pub windows: Vec<serde_json::Value>,
    pub apps: Vec<serde_json::Value>,
    pub exported_at: i64,
    pub version: String,
}

// ── WorkspaceExporter ────────────────────────────────────────────────────────

pub struct WorkspaceExporter;

impl WorkspaceExporter {
    /// Gather workspace state into an exportable struct.
    pub fn export_workspace(
        workspace: &Workspace,
        windows: &[WindowState],
        apps: &[AppDescriptor],
    ) -> ExportedWorkspace {
        let window_values: Vec<serde_json::Value> = windows
            .iter()
            .filter_map(|w| serde_json::to_value(w).ok())
            .collect();

        let app_values: Vec<serde_json::Value> = apps
            .iter()
            .filter_map(|a| serde_json::to_value(a).ok())
            .collect();

        ExportedWorkspace {
            name: workspace.name.clone(),
            goal: workspace.goal.clone().unwrap_or_default(),
            windows: window_values,
            apps: app_values,
            exported_at: chrono::Utc::now().timestamp(),
            version: "1.0.0".to_string(),
        }
    }

    /// Serialize an exported workspace to a JSON string.
    pub fn to_json(exported: &ExportedWorkspace) -> Result<String, LunaError> {
        serde_json::to_string_pretty(exported).map_err(|e| {
            LunaError::Serialization(format!("Failed to serialize workspace export: {}", e))
        })
    }

    /// Deserialize an exported workspace from a JSON string.
    pub fn from_json(json: &str) -> Result<ExportedWorkspace, LunaError> {
        serde_json::from_str(json).map_err(|e| {
            LunaError::Serialization(format!("Failed to deserialize workspace export: {}", e))
        })
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_workspace() -> Workspace {
        Workspace {
            id: "ws-1".to_string(),
            name: "Test Workspace".to_string(),
            goal: Some("Build something great".to_string()),
            isolation_level: "standard".to_string(),
            orchestrator_id: None,
            window_ids: vec![],
            created_at: 0,
            updated_at: 0,
            active: true,
        }
    }

    #[test]
    fn test_export_and_serialize() {
        let ws = sample_workspace();
        let exported = WorkspaceExporter::export_workspace(&ws, &[], &[]);
        assert_eq!(exported.name, "Test Workspace");
        assert_eq!(exported.goal, "Build something great");
        assert_eq!(exported.version, "1.0.0");

        let json = WorkspaceExporter::to_json(&exported).unwrap();
        assert!(json.contains("Test Workspace"));
    }

    #[test]
    fn test_round_trip() {
        let ws = sample_workspace();
        let exported = WorkspaceExporter::export_workspace(&ws, &[], &[]);
        let json = WorkspaceExporter::to_json(&exported).unwrap();
        let restored = WorkspaceExporter::from_json(&json).unwrap();
        assert_eq!(restored.name, exported.name);
        assert_eq!(restored.goal, exported.goal);
        assert_eq!(restored.version, exported.version);
    }

    #[test]
    fn test_from_json_invalid() {
        let result = WorkspaceExporter::from_json("not valid json");
        assert!(result.is_err());
    }
}
