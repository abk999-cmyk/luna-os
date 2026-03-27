use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, Mutex};

use super::{Workspace, WorkspaceLayout, SnapZone};
use crate::error::LunaError;
use crate::persistence::db::Database;

pub struct WorkspaceManager {
    workspaces: RwLock<HashMap<String, Workspace>>,
    layouts: RwLock<HashMap<String, WorkspaceLayout>>,
    active_workspace_id: RwLock<Option<String>>,
    db: Arc<Mutex<Database>>,
}

impl WorkspaceManager {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self {
            workspaces: RwLock::new(HashMap::new()),
            layouts: RwLock::new(HashMap::new()),
            active_workspace_id: RwLock::new(None),
            db,
        }
    }

    /// Create a new workspace.
    pub async fn create_workspace(
        &self,
        name: &str,
        goal: Option<String>,
        isolation_level: &str,
    ) -> Result<Workspace, LunaError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let workspace = Workspace {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            goal,
            isolation_level: isolation_level.to_string(),
            orchestrator_id: None,
            window_ids: Vec::new(),
            created_at: now,
            updated_at: now,
            active: true,
        };

        self.persist(&workspace).await?;

        let mut workspaces = self.workspaces.write().await;
        workspaces.insert(workspace.id.clone(), workspace.clone());

        Ok(workspace)
    }

    /// Get workspace by ID.
    pub async fn get_workspace(&self, id: &str) -> Option<Workspace> {
        let workspaces = self.workspaces.read().await;
        workspaces.get(id).cloned()
    }

    /// List all workspaces.
    pub async fn list_workspaces(&self) -> Vec<Workspace> {
        let workspaces = self.workspaces.read().await;
        workspaces.values().cloned().collect()
    }

    /// Set a workspace as the active workspace.
    pub async fn switch_workspace(&self, workspace_id: &str) -> Result<(), LunaError> {
        let workspaces = self.workspaces.read().await;
        if !workspaces.contains_key(workspace_id) {
            return Err(LunaError::Database(format!(
                "Workspace '{}' not found",
                workspace_id
            )));
        }
        drop(workspaces);

        let mut active = self.active_workspace_id.write().await;
        *active = Some(workspace_id.to_string());
        Ok(())
    }

    /// Get the currently active workspace ID.
    pub async fn active_workspace(&self) -> Option<String> {
        let active = self.active_workspace_id.read().await;
        active.clone()
    }

    /// Update workspace properties.
    pub async fn update_workspace(
        &self,
        id: &str,
        name: Option<String>,
        goal: Option<String>,
    ) -> Result<(), LunaError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut workspaces = self.workspaces.write().await;
        let workspace = workspaces.get_mut(id).ok_or_else(|| {
            LunaError::Database(format!("Workspace '{}' not found", id))
        })?;

        if let Some(n) = name.clone() {
            workspace.name = n;
        }
        if goal.is_some() {
            workspace.goal = goal.clone();
        }
        workspace.updated_at = now;

        let ws = workspace.clone();
        drop(workspaces);

        // Persist to DB
        let db = self.db.lock().await;
        db.workspace_update(id, name.as_deref(), goal.as_deref(), now)?;

        drop(db);
        let _ = ws; // suppress unused
        Ok(())
    }

    /// Add a window to a workspace.
    pub async fn add_window(&self, workspace_id: &str, window_id: &str) -> Result<(), LunaError> {
        let mut workspaces = self.workspaces.write().await;
        let workspace = workspaces.get_mut(workspace_id).ok_or_else(|| {
            LunaError::Database(format!("Workspace '{}' not found", workspace_id))
        })?;

        if !workspace.window_ids.contains(&window_id.to_string()) {
            workspace.window_ids.push(window_id.to_string());
        }
        workspace.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let ws = workspace.clone();
        drop(workspaces);
        self.persist(&ws).await?;
        Ok(())
    }

    /// Remove a window from a workspace.
    pub async fn remove_window(&self, workspace_id: &str, window_id: &str) -> Result<(), LunaError> {
        let mut workspaces = self.workspaces.write().await;
        let workspace = workspaces.get_mut(workspace_id).ok_or_else(|| {
            LunaError::Database(format!("Workspace '{}' not found", workspace_id))
        })?;

        workspace.window_ids.retain(|id| id != window_id);
        workspace.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let ws = workspace.clone();
        drop(workspaces);
        self.persist(&ws).await?;
        Ok(())
    }

    /// Get all window IDs for a workspace.
    pub async fn get_windows(&self, workspace_id: &str) -> Vec<String> {
        let workspaces = self.workspaces.read().await;
        workspaces
            .get(workspace_id)
            .map(|w| w.window_ids.clone())
            .unwrap_or_default()
    }

    /// Set the layout for a workspace.
    pub async fn set_layout(&self, layout: WorkspaceLayout) -> Result<(), LunaError> {
        // Verify workspace exists
        let workspaces = self.workspaces.read().await;
        if !workspaces.contains_key(&layout.workspace_id) {
            return Err(LunaError::Database(format!(
                "Workspace '{}' not found",
                layout.workspace_id
            )));
        }
        drop(workspaces);

        let mut layouts = self.layouts.write().await;
        layouts.insert(layout.workspace_id.clone(), layout);
        Ok(())
    }

    /// Get the layout for a workspace.
    pub async fn get_layout(&self, workspace_id: &str) -> Option<WorkspaceLayout> {
        let layouts = self.layouts.read().await;
        layouts.get(workspace_id).cloned()
    }

    /// Assign a window to a snap zone.
    pub async fn snap_window(
        &self,
        workspace_id: &str,
        window_id: &str,
        zone: SnapZone,
    ) -> Result<(), LunaError> {
        // Verify workspace exists
        let workspaces = self.workspaces.read().await;
        if !workspaces.contains_key(workspace_id) {
            return Err(LunaError::Database(format!(
                "Workspace '{}' not found",
                workspace_id
            )));
        }
        drop(workspaces);

        let zone_name = match zone {
            SnapZone::Left => "Left",
            SnapZone::Center => "Center",
            SnapZone::Right => "Right",
            SnapZone::Bottom => "Bottom",
        };

        let mut layouts = self.layouts.write().await;
        let layout = layouts
            .entry(workspace_id.to_string())
            .or_insert_with(|| WorkspaceLayout {
                workspace_id: workspace_id.to_string(),
                zones: HashMap::new(),
            });

        // Remove window from any existing zone
        for zone_windows in layout.zones.values_mut() {
            zone_windows.retain(|id| id != window_id);
        }

        // Add to new zone
        layout
            .zones
            .entry(zone_name.to_string())
            .or_default()
            .push(window_id.to_string());

        Ok(())
    }

    /// Get the snap zone bounds for a given zone.
    /// Returns (x, y, width, height) as fractions of the screen.
    pub fn zone_bounds(zone: SnapZone) -> (f64, f64, f64, f64) {
        match zone {
            SnapZone::Left => (0.0, 0.0, 0.25, 0.75),
            SnapZone::Center => (0.25, 0.0, 0.50, 0.75),
            SnapZone::Right => (0.75, 0.0, 0.25, 0.75),
            SnapZone::Bottom => (0.0, 0.75, 1.0, 0.25),
        }
    }

    /// Set the orchestrator agent ID for a workspace.
    pub async fn set_orchestrator(
        &self,
        workspace_id: &str,
        orchestrator_id: &str,
    ) -> Result<(), LunaError> {
        let mut workspaces = self.workspaces.write().await;
        let workspace = workspaces.get_mut(workspace_id).ok_or_else(|| {
            LunaError::Database(format!("Workspace '{}' not found", workspace_id))
        })?;

        workspace.orchestrator_id = Some(orchestrator_id.to_string());
        workspace.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let ws = workspace.clone();
        drop(workspaces);
        self.persist(&ws).await?;
        Ok(())
    }

    /// Delete a workspace (marks inactive, does not delete windows).
    pub async fn delete_workspace(&self, workspace_id: &str) -> Result<(), LunaError> {
        let mut workspaces = self.workspaces.write().await;
        let workspace = workspaces.get_mut(workspace_id).ok_or_else(|| {
            LunaError::Database(format!("Workspace '{}' not found", workspace_id))
        })?;

        workspace.active = false;
        workspace.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let ws = workspace.clone();
        drop(workspaces);

        // Persist deletion to DB
        let db = self.db.lock().await;
        db.workspace_delete(workspace_id)?;

        // Also clear from active if needed
        let mut active = self.active_workspace_id.write().await;
        if active.as_deref() == Some(workspace_id) {
            *active = None;
        }

        drop(db);
        let _ = ws;
        Ok(())
    }

    /// Load workspaces from DB on startup.
    pub async fn load_from_db(&self) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        let rows = db.workspace_list_active()?;
        drop(db);

        let mut workspaces = self.workspaces.write().await;
        for row in rows {
            let id = row["id"].as_str().unwrap_or_default().to_string();
            let name = row["name"].as_str().unwrap_or_default().to_string();
            let goal = row["goal"].as_str().map(|s| s.to_string());
            let isolation_level = row["isolation_level"]
                .as_str()
                .unwrap_or("standard")
                .to_string();
            let orchestrator_id = row["orchestrator_id"].as_str().map(|s| s.to_string());
            let window_ids_str = row["window_ids"].as_str().unwrap_or("[]");
            let window_ids: Vec<String> =
                serde_json::from_str(window_ids_str).unwrap_or_default();
            let created_at = row["created_at"].as_i64().unwrap_or(0);
            let updated_at = row["updated_at"].as_i64().unwrap_or(0);

            let workspace = Workspace {
                id: id.clone(),
                name,
                goal,
                isolation_level,
                orchestrator_id,
                window_ids,
                created_at,
                updated_at,
                active: true,
            };
            workspaces.insert(id, workspace);
        }
        Ok(())
    }

    /// Persist a workspace to DB.
    async fn persist(&self, workspace: &Workspace) -> Result<(), LunaError> {
        let window_ids_json = serde_json::to_string(&workspace.window_ids)
            .map_err(|e| LunaError::Serialization(e.to_string()))?;

        let db = self.db.lock().await;
        db.workspace_save(
            &workspace.id,
            &workspace.name,
            workspace.goal.as_deref(),
            &workspace.isolation_level,
            workspace.orchestrator_id.as_deref(),
            &window_ids_json,
            workspace.created_at,
            workspace.updated_at,
            workspace.active,
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn make_manager() -> WorkspaceManager {
        let db = Database::new(":memory:").expect("in-memory DB");
        let db = Arc::new(Mutex::new(db));
        WorkspaceManager::new(db)
    }

    #[tokio::test]
    async fn test_create_workspace_returns_valid() {
        let mgr = make_manager().await;
        let ws = mgr
            .create_workspace("Test WS", Some("Build something".into()), "standard")
            .await
            .unwrap();

        assert!(!ws.id.is_empty());
        assert_eq!(ws.name, "Test WS");
        assert_eq!(ws.goal.as_deref(), Some("Build something"));
        assert_eq!(ws.isolation_level, "standard");
        assert!(ws.active);
        assert!(ws.window_ids.is_empty());
    }

    #[tokio::test]
    async fn test_get_workspace_by_id() {
        let mgr = make_manager().await;
        let ws = mgr
            .create_workspace("WS1", None, "strict")
            .await
            .unwrap();

        let fetched = mgr.get_workspace(&ws.id).await;
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "WS1");

        let missing = mgr.get_workspace("nonexistent").await;
        assert!(missing.is_none());
    }

    #[tokio::test]
    async fn test_list_workspaces_returns_all() {
        let mgr = make_manager().await;
        mgr.create_workspace("A", None, "standard").await.unwrap();
        mgr.create_workspace("B", None, "open").await.unwrap();
        mgr.create_workspace("C", None, "strict").await.unwrap();

        let list = mgr.list_workspaces().await;
        assert_eq!(list.len(), 3);
    }

    #[tokio::test]
    async fn test_switch_workspace_updates_active() {
        let mgr = make_manager().await;
        let ws = mgr.create_workspace("Active", None, "standard").await.unwrap();

        assert!(mgr.active_workspace().await.is_none());

        mgr.switch_workspace(&ws.id).await.unwrap();
        assert_eq!(mgr.active_workspace().await.unwrap(), ws.id);

        // Switching to nonexistent should fail
        let result = mgr.switch_workspace("bogus").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_add_remove_window() {
        let mgr = make_manager().await;
        let ws = mgr.create_workspace("WinTest", None, "standard").await.unwrap();

        mgr.add_window(&ws.id, "win-1").await.unwrap();
        mgr.add_window(&ws.id, "win-2").await.unwrap();
        // Adding duplicate should not create duplicate
        mgr.add_window(&ws.id, "win-1").await.unwrap();

        let windows = mgr.get_windows(&ws.id).await;
        assert_eq!(windows.len(), 2);
        assert!(windows.contains(&"win-1".to_string()));
        assert!(windows.contains(&"win-2".to_string()));

        mgr.remove_window(&ws.id, "win-1").await.unwrap();
        let windows = mgr.get_windows(&ws.id).await;
        assert_eq!(windows.len(), 1);
        assert!(!windows.contains(&"win-1".to_string()));
    }

    #[tokio::test]
    async fn test_snap_window_assigns_zone() {
        let mgr = make_manager().await;
        let ws = mgr.create_workspace("SnapTest", None, "standard").await.unwrap();

        mgr.snap_window(&ws.id, "win-a", SnapZone::Left).await.unwrap();
        mgr.snap_window(&ws.id, "win-b", SnapZone::Center).await.unwrap();

        let layout = mgr.get_layout(&ws.id).await.unwrap();
        assert!(layout.zones["Left"].contains(&"win-a".to_string()));
        assert!(layout.zones["Center"].contains(&"win-b".to_string()));

        // Re-snap win-a to Right — should remove from Left
        mgr.snap_window(&ws.id, "win-a", SnapZone::Right).await.unwrap();
        let layout = mgr.get_layout(&ws.id).await.unwrap();
        assert!(!layout.zones.get("Left").map_or(false, |v| v.contains(&"win-a".to_string())));
        assert!(layout.zones["Right"].contains(&"win-a".to_string()));
    }

    #[tokio::test]
    async fn test_zone_bounds_correct() {
        assert_eq!(WorkspaceManager::zone_bounds(SnapZone::Left), (0.0, 0.0, 0.25, 0.75));
        assert_eq!(WorkspaceManager::zone_bounds(SnapZone::Center), (0.25, 0.0, 0.50, 0.75));
        assert_eq!(WorkspaceManager::zone_bounds(SnapZone::Right), (0.75, 0.0, 0.25, 0.75));
        assert_eq!(WorkspaceManager::zone_bounds(SnapZone::Bottom), (0.0, 0.75, 1.0, 0.25));
    }

    #[tokio::test]
    async fn test_delete_workspace_marks_inactive() {
        let mgr = make_manager().await;
        let ws = mgr.create_workspace("ToDelete", None, "standard").await.unwrap();
        mgr.switch_workspace(&ws.id).await.unwrap();

        mgr.delete_workspace(&ws.id).await.unwrap();

        // Should still be in memory but marked inactive
        let fetched = mgr.get_workspace(&ws.id).await.unwrap();
        assert!(!fetched.active);

        // Active workspace should be cleared
        assert!(mgr.active_workspace().await.is_none());
    }
}
