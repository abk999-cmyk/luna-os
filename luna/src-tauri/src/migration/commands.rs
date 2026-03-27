use std::path::Path;

use super::file_import::{FileImporter, ImportResult};
use super::project_detector::{DetectedProject, ProjectDetector};

/// Import a file and return its parsed content.
#[tauri::command]
pub fn import_file(path: String) -> Result<ImportResult, String> {
    FileImporter::import_file(Path::new(&path)).map_err(|e| e.to_string())
}

/// Detect the project type at the given directory path.
#[tauri::command]
pub fn detect_project(path: String) -> Result<DetectedProject, String> {
    ProjectDetector::detect(Path::new(&path)).map_err(|e| e.to_string())
}

/// Export the current workspace state as a JSON string.
///
/// In a full implementation this would look up the workspace by ID
/// from AppState.  For now we accept the workspace_id and return an
/// empty-shell export so the command is wired and callable.
#[tauri::command]
pub fn export_workspace_state(workspace_id: String) -> Result<String, String> {
    use crate::migration::export::{ExportedWorkspace, WorkspaceExporter};

    // Placeholder: return a minimal export for the given workspace ID.
    let exported = ExportedWorkspace {
        name: workspace_id,
        goal: String::new(),
        windows: vec![],
        apps: vec![],
        exported_at: chrono::Utc::now().timestamp(),
        version: "1.0.0".to_string(),
    };

    WorkspaceExporter::to_json(&exported).map_err(|e| e.to_string())
}
