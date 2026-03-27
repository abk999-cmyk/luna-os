use std::sync::Arc;
use rusqlite::params;
use serde::Serialize;
use uuid::Uuid;

use crate::error::LunaError;
use crate::persistence::db::Database;

#[derive(Debug, Clone, Serialize)]
pub struct UserIdentity {
    pub user_id: String,
    pub display_name: String,
    pub avatar_color: String,
    pub auth_method: AuthMethod,
    pub created_at: i64,
    pub last_seen: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum AuthMethod {
    Local,
    Passkey,
    Password,
}

impl AuthMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMethod::Local => "local",
            AuthMethod::Passkey => "passkey",
            AuthMethod::Password => "password",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "passkey" => AuthMethod::Passkey,
            "password" => AuthMethod::Password,
            _ => AuthMethod::Local,
        }
    }
}

pub struct IdentityManager {
    db: Arc<tokio::sync::Mutex<Database>>,
    current_user: tokio::sync::RwLock<Option<UserIdentity>>,
}

impl IdentityManager {
    pub fn new(db: Arc<tokio::sync::Mutex<Database>>) -> Self {
        Self {
            db,
            current_user: tokio::sync::RwLock::new(None),
        }
    }

    pub async fn create_local_user(&self, name: &str) -> Result<UserIdentity, LunaError> {
        let user_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let avatar_color = format!("#{:06x}", rand_color());

        let user = UserIdentity {
            user_id: user_id.clone(),
            display_name: name.to_string(),
            avatar_color: avatar_color.clone(),
            auth_method: AuthMethod::Local,
            created_at: now,
            last_seen: now,
        };

        let db = self.db.lock().await;
        db.conn().execute(
            "INSERT INTO users (id, display_name, avatar_color, auth_method, created_at, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![user_id, name, avatar_color, "local", now, now],
        )?;

        Ok(user)
    }

    pub async fn get_current_user(&self) -> Option<UserIdentity> {
        self.current_user.read().await.clone()
    }

    pub async fn set_current_user(&self, user_id: &str) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        let mut stmt = db.conn().prepare(
            "SELECT id, display_name, avatar_color, auth_method, created_at, last_seen FROM users WHERE id = ?1"
        )?;

        let user = stmt.query_row(params![user_id], |row| {
            Ok(UserIdentity {
                user_id: row.get(0)?,
                display_name: row.get(1)?,
                avatar_color: row.get(2)?,
                auth_method: AuthMethod::from_str(&row.get::<_, String>(3)?),
                created_at: row.get(4)?,
                last_seen: row.get(5)?,
            })
        }).map_err(|e| LunaError::Database(format!("User not found: {}", e)))?;

        // Must drop stmt before using db.conn() again
        drop(stmt);

        // Update last_seen
        db.conn().execute(
            "UPDATE users SET last_seen = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp(), user_id],
        )?;

        drop(db);
        *self.current_user.write().await = Some(user);
        Ok(())
    }

    pub async fn list_users(&self) -> Result<Vec<UserIdentity>, LunaError> {
        let db = self.db.lock().await;
        let mut stmt = db.conn().prepare(
            "SELECT id, display_name, avatar_color, auth_method, created_at, last_seen FROM users ORDER BY created_at"
        )?;

        let users = stmt.query_map([], |row| {
            Ok(UserIdentity {
                user_id: row.get(0)?,
                display_name: row.get(1)?,
                avatar_color: row.get(2)?,
                auth_method: AuthMethod::from_str(&row.get::<_, String>(3)?),
                created_at: row.get(4)?,
                last_seen: row.get(5)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(users)
    }
}

/// Generate a pseudo-random color from timestamp bits.
fn rand_color() -> u32 {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    nanos & 0xFFFFFF
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
    async fn test_create_local_user() {
        let db = test_db().await;
        let mgr = IdentityManager::new(db);
        let user = mgr.create_local_user("Alice").await.unwrap();
        assert_eq!(user.display_name, "Alice");
        assert_eq!(user.auth_method, AuthMethod::Local);
        assert!(user.avatar_color.starts_with('#'));
    }

    #[tokio::test]
    async fn test_list_users() {
        let db = test_db().await;
        let mgr = IdentityManager::new(db);
        mgr.create_local_user("Alice").await.unwrap();
        mgr.create_local_user("Bob").await.unwrap();
        let users = mgr.list_users().await.unwrap();
        assert_eq!(users.len(), 2);
    }

    #[tokio::test]
    async fn test_set_current_user() {
        let db = test_db().await;
        let mgr = IdentityManager::new(db);
        let user = mgr.create_local_user("Alice").await.unwrap();
        mgr.set_current_user(&user.user_id).await.unwrap();
        let current = mgr.get_current_user().await.unwrap();
        assert_eq!(current.display_name, "Alice");
    }

    #[tokio::test]
    async fn test_set_current_user_not_found() {
        let db = test_db().await;
        let mgr = IdentityManager::new(db);
        let result = mgr.set_current_user("nonexistent").await;
        assert!(result.is_err());
    }
}
