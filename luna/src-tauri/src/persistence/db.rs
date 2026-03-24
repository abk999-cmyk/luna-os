use rusqlite::{Connection, params};
use std::path::Path;
use std::fs;
use tracing::info;

use crate::action::types::Action;
use crate::error::LunaError;
use crate::window::types::WindowState;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, LunaError> {
        // Ensure parent directory exists
        if let Some(parent) = Path::new(path).parent() {
            fs::create_dir_all(parent).map_err(|e| {
                LunaError::Database(format!("Failed to create DB directory: {}", e))
            })?;
        }

        let conn = Connection::open(path)?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;

        let db = Self { conn };
        db.run_migrations()?;

        info!(path = path, "Database initialized");
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), LunaError> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                start_time TEXT NOT NULL,
                end_time TEXT
            );

            CREATE TABLE IF NOT EXISTS actions (
                id TEXT PRIMARY KEY,
                action_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                source TEXT NOT NULL,
                priority TEXT NOT NULL,
                retry_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                session_id TEXT REFERENCES sessions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(action_type);
            CREATE INDEX IF NOT EXISTS idx_actions_session ON actions(session_id);
            CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON actions(timestamp);

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                agent_type TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS window_states (
                id TEXT PRIMARY KEY,
                session_id TEXT REFERENCES sessions(id),
                title TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                z_order INTEGER NOT NULL,
                visibility TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'empty'
            );
            "
        )?;
        Ok(())
    }

    pub fn insert_session(&self, session_id: &str, start_time: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "INSERT INTO sessions (id, start_time) VALUES (?1, ?2)",
            params![session_id, start_time],
        )?;
        Ok(())
    }

    pub fn close_session(&self, session_id: &str, end_time: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "UPDATE sessions SET end_time = ?1 WHERE id = ?2",
            params![end_time, session_id],
        )?;
        Ok(())
    }

    pub fn insert_action(&self, action: &Action, session_id: Option<&str>) -> Result<(), LunaError> {
        let payload = serde_json::to_string(&action.payload)?;
        let source = serde_json::to_string(&action.source)?;
        let priority = serde_json::to_string(&action.priority)?;
        let status = serde_json::to_string(&action.status)?;

        self.conn.execute(
            "INSERT OR REPLACE INTO actions (id, action_type, payload, timestamp, source, priority, retry_count, status, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                action.id.to_string(),
                action.action_type,
                payload,
                action.timestamp.to_rfc3339(),
                source,
                priority,
                action.retry_count,
                status,
                session_id,
            ],
        )?;
        Ok(())
    }

    pub fn query_actions_by_type(&self, action_type: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, action_type, payload, timestamp, source, priority, status
             FROM actions WHERE action_type = ?1
             ORDER BY timestamp DESC LIMIT ?2"
        )?;

        let rows = stmt.query_map(params![action_type, limit], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "action_type": row.get::<_, String>(1)?,
                "payload": row.get::<_, String>(2)?,
                "timestamp": row.get::<_, String>(3)?,
                "source": row.get::<_, String>(4)?,
                "priority": row.get::<_, String>(5)?,
                "status": row.get::<_, String>(6)?,
            }))
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn save_window_states(&self, session_id: &str, windows: &[WindowState]) -> Result<(), LunaError> {
        // Clear existing for this session
        self.conn.execute(
            "DELETE FROM window_states WHERE session_id = ?1",
            params![session_id],
        )?;

        for w in windows {
            let visibility = serde_json::to_string(&w.visibility)?;
            let content_type = serde_json::to_string(&w.content_type)?;
            self.conn.execute(
                "INSERT INTO window_states (id, session_id, title, x, y, width, height, z_order, visibility, content_type)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    w.id, session_id, w.title,
                    w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height,
                    w.z_order, visibility, content_type,
                ],
            )?;
        }
        Ok(())
    }

    pub fn load_window_states(&self) -> Result<Vec<WindowState>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, x, y, width, height, z_order, visibility, content_type
             FROM window_states
             ORDER BY z_order ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            let visibility_str: String = row.get(7)?;
            let content_type_str: String = row.get(8)?;

            Ok(WindowState {
                id: row.get(0)?,
                title: row.get(1)?,
                bounds: crate::window::types::Bounds {
                    x: row.get(2)?,
                    y: row.get(3)?,
                    width: row.get(4)?,
                    height: row.get(5)?,
                },
                z_order: row.get(6)?,
                visibility: serde_json::from_str(&visibility_str).unwrap_or(crate::window::types::Visibility::Visible),
                focused: false,
                content_type: serde_json::from_str(&content_type_str).unwrap_or(crate::window::types::WindowContentType::Empty),
                created_at: chrono::Utc::now(),
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}
