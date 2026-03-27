use std::sync::Arc;
use rusqlite::params;

use crate::error::LunaError;
use crate::persistence::db::Database;

#[derive(Debug, Clone, PartialEq)]
pub enum Role {
    Owner,
    Editor,
    Viewer,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Owner => "owner",
            Role::Editor => "editor",
            Role::Viewer => "viewer",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "owner" => Some(Role::Owner),
            "editor" => Some(Role::Editor),
            "viewer" => Some(Role::Viewer),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct WorkspaceAccess {
    pub workspace_id: String,
    pub user_id: String,
    pub role: Role,
    pub granted_at: i64,
    pub granted_by: String,
}

pub struct RbacManager {
    db: Arc<tokio::sync::Mutex<Database>>,
}

impl RbacManager {
    pub fn new(db: Arc<tokio::sync::Mutex<Database>>) -> Self {
        Self { db }
    }

    pub async fn grant_access(
        &self,
        workspace_id: &str,
        user_id: &str,
        role: Role,
        granted_by: &str,
    ) -> Result<(), LunaError> {
        let now = chrono::Utc::now().timestamp();
        let db = self.db.lock().await;
        db.conn().execute(
            "INSERT OR REPLACE INTO workspace_access (workspace_id, user_id, role, granted_at, granted_by) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![workspace_id, user_id, role.as_str(), now, granted_by],
        )?;
        Ok(())
    }

    pub async fn revoke_access(
        &self,
        workspace_id: &str,
        user_id: &str,
    ) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.conn().execute(
            "DELETE FROM workspace_access WHERE workspace_id = ?1 AND user_id = ?2",
            params![workspace_id, user_id],
        )?;
        Ok(())
    }

    pub async fn get_access(
        &self,
        workspace_id: &str,
        user_id: &str,
    ) -> Result<Option<Role>, LunaError> {
        let db = self.db.lock().await;
        let mut stmt = db.conn().prepare(
            "SELECT role FROM workspace_access WHERE workspace_id = ?1 AND user_id = ?2"
        )?;

        let result = stmt.query_row(params![workspace_id, user_id], |row| {
            row.get::<_, String>(0)
        });

        match result {
            Ok(role_str) => Ok(Role::from_str(&role_str)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(LunaError::Database(e.to_string())),
        }
    }

    pub async fn list_workspace_members(
        &self,
        workspace_id: &str,
    ) -> Result<Vec<WorkspaceAccess>, LunaError> {
        let db = self.db.lock().await;
        let mut stmt = db.conn().prepare(
            "SELECT workspace_id, user_id, role, granted_at, granted_by FROM workspace_access WHERE workspace_id = ?1 ORDER BY granted_at"
        )?;

        let members = stmt.query_map(params![workspace_id], |row| {
            Ok(WorkspaceAccess {
                workspace_id: row.get(0)?,
                user_id: row.get(1)?,
                role: Role::from_str(&row.get::<_, String>(2)?).unwrap_or(Role::Viewer),
                granted_at: row.get(3)?,
                granted_by: row.get(4)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(members)
    }

    pub async fn can_edit(&self, workspace_id: &str, user_id: &str) -> Result<bool, LunaError> {
        match self.get_access(workspace_id, user_id).await? {
            Some(Role::Owner) | Some(Role::Editor) => Ok(true),
            _ => Ok(false),
        }
    }

    pub async fn can_view(&self, workspace_id: &str, user_id: &str) -> Result<bool, LunaError> {
        match self.get_access(workspace_id, user_id).await? {
            Some(_) => Ok(true),
            None => Ok(false),
        }
    }

    pub async fn is_owner(&self, workspace_id: &str, user_id: &str) -> Result<bool, LunaError> {
        match self.get_access(workspace_id, user_id).await? {
            Some(Role::Owner) => Ok(true),
            _ => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    async fn test_db() -> Arc<tokio::sync::Mutex<Database>> {
        let tmp = NamedTempFile::new().unwrap();
        let db = Database::new(tmp.path().to_str().unwrap()).unwrap();
        Arc::new(tokio::sync::Mutex::new(db))
    }

    #[tokio::test]
    async fn test_grant_and_get_access() {
        let db = test_db().await;
        let mgr = RbacManager::new(db);
        mgr.grant_access("ws1", "user1", Role::Editor, "admin").await.unwrap();
        let role = mgr.get_access("ws1", "user1").await.unwrap();
        assert_eq!(role, Some(Role::Editor));
    }

    #[tokio::test]
    async fn test_revoke_access() {
        let db = test_db().await;
        let mgr = RbacManager::new(db);
        mgr.grant_access("ws1", "user1", Role::Editor, "admin").await.unwrap();
        mgr.revoke_access("ws1", "user1").await.unwrap();
        let role = mgr.get_access("ws1", "user1").await.unwrap();
        assert_eq!(role, None);
    }

    #[tokio::test]
    async fn test_can_edit_and_view() {
        let db = test_db().await;
        let mgr = RbacManager::new(db);
        mgr.grant_access("ws1", "user1", Role::Viewer, "admin").await.unwrap();
        assert!(!mgr.can_edit("ws1", "user1").await.unwrap());
        assert!(mgr.can_view("ws1", "user1").await.unwrap());

        mgr.grant_access("ws1", "user2", Role::Editor, "admin").await.unwrap();
        assert!(mgr.can_edit("ws1", "user2").await.unwrap());
        assert!(mgr.can_view("ws1", "user2").await.unwrap());
    }

    #[tokio::test]
    async fn test_is_owner() {
        let db = test_db().await;
        let mgr = RbacManager::new(db);
        mgr.grant_access("ws1", "user1", Role::Owner, "system").await.unwrap();
        mgr.grant_access("ws1", "user2", Role::Editor, "user1").await.unwrap();
        assert!(mgr.is_owner("ws1", "user1").await.unwrap());
        assert!(!mgr.is_owner("ws1", "user2").await.unwrap());
    }

    #[tokio::test]
    async fn test_list_workspace_members() {
        let db = test_db().await;
        let mgr = RbacManager::new(db);
        mgr.grant_access("ws1", "user1", Role::Owner, "system").await.unwrap();
        mgr.grant_access("ws1", "user2", Role::Editor, "user1").await.unwrap();
        mgr.grant_access("ws1", "user3", Role::Viewer, "user1").await.unwrap();
        let members = mgr.list_workspace_members("ws1").await.unwrap();
        assert_eq!(members.len(), 3);
    }
}
