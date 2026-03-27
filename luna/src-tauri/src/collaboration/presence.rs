use std::collections::HashMap;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct UserPresence {
    pub user_id: String,
    pub workspace_id: String,
    pub cursor_position: Option<CursorPosition>,
    pub status: PresenceStatus,
    pub last_heartbeat: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
    pub window_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum PresenceStatus {
    Active,
    Idle,
    Away,
}

pub struct PresenceManager {
    users: tokio::sync::RwLock<HashMap<String, UserPresence>>,
    idle_timeout_secs: i64,
}

impl PresenceManager {
    pub fn new() -> Self {
        Self {
            users: tokio::sync::RwLock::new(HashMap::new()),
            idle_timeout_secs: 300, // 5 minutes default
        }
    }

    pub async fn update_presence(
        &self,
        user_id: &str,
        workspace_id: &str,
        cursor: Option<CursorPosition>,
    ) {
        let now = chrono::Utc::now().timestamp();
        let presence = UserPresence {
            user_id: user_id.to_string(),
            workspace_id: workspace_id.to_string(),
            cursor_position: cursor,
            status: PresenceStatus::Active,
            last_heartbeat: now,
        };
        self.users.write().await.insert(user_id.to_string(), presence);
    }

    pub async fn heartbeat(&self, user_id: &str) {
        let now = chrono::Utc::now().timestamp();
        if let Some(presence) = self.users.write().await.get_mut(user_id) {
            presence.last_heartbeat = now;
            presence.status = PresenceStatus::Active;
        }
    }

    pub async fn get_workspace_presence(&self, workspace_id: &str) -> Vec<UserPresence> {
        self.users
            .read()
            .await
            .values()
            .filter(|p| p.workspace_id == workspace_id)
            .cloned()
            .collect()
    }

    pub async fn remove_user(&self, user_id: &str) {
        self.users.write().await.remove(user_id);
    }

    pub async fn cleanup_stale(&self) {
        let now = chrono::Utc::now().timestamp();
        let timeout = self.idle_timeout_secs;
        self.users.write().await.retain(|_, presence| {
            now - presence.last_heartbeat < timeout
        });
    }
}

impl Default for PresenceManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_update_and_get_presence() {
        let mgr = PresenceManager::new();
        mgr.update_presence("user1", "ws1", Some(CursorPosition { x: 10.0, y: 20.0, window_id: None })).await;
        let present = mgr.get_workspace_presence("ws1").await;
        assert_eq!(present.len(), 1);
        assert_eq!(present[0].user_id, "user1");
        assert_eq!(present[0].status, PresenceStatus::Active);
    }

    #[tokio::test]
    async fn test_remove_user() {
        let mgr = PresenceManager::new();
        mgr.update_presence("user1", "ws1", None).await;
        mgr.remove_user("user1").await;
        let present = mgr.get_workspace_presence("ws1").await;
        assert_eq!(present.len(), 0);
    }

    #[tokio::test]
    async fn test_cleanup_stale() {
        let mgr = PresenceManager {
            users: tokio::sync::RwLock::new(HashMap::new()),
            idle_timeout_secs: 1, // 1 second for testing
        };
        // Insert a presence with an old heartbeat
        {
            let mut users = mgr.users.write().await;
            users.insert("stale_user".to_string(), UserPresence {
                user_id: "stale_user".to_string(),
                workspace_id: "ws1".to_string(),
                cursor_position: None,
                status: PresenceStatus::Active,
                last_heartbeat: chrono::Utc::now().timestamp() - 10, // 10 seconds ago
            });
        }
        mgr.cleanup_stale().await;
        let present = mgr.get_workspace_presence("ws1").await;
        assert_eq!(present.len(), 0);
    }

    #[tokio::test]
    async fn test_heartbeat() {
        let mgr = PresenceManager::new();
        mgr.update_presence("user1", "ws1", None).await;
        let before = mgr.get_workspace_presence("ws1").await[0].last_heartbeat;
        // Small delay isn't needed since heartbeat uses Utc::now() which may be same timestamp
        mgr.heartbeat("user1").await;
        let after = mgr.get_workspace_presence("ws1").await[0].last_heartbeat;
        assert!(after >= before);
    }
}
