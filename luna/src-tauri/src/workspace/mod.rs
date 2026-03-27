pub mod manager;
pub mod commands;

use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub goal: Option<String>,
    pub isolation_level: String, // "strict", "standard", "open"
    pub orchestrator_id: Option<String>,
    pub window_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceLayout {
    pub workspace_id: String,
    /// Snap zones: maps zone name to list of window IDs
    pub zones: std::collections::HashMap<String, Vec<String>>,
}

/// Snap zones for workspace layout
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SnapZone {
    Left,     // references, documentation
    Center,   // primary work area
    Right,    // agents, controls
    Bottom,   // terminal, output
}
