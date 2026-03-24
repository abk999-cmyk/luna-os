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

            -- Sprint 2: Episodic memory
            CREATE TABLE IF NOT EXISTS episodic_memory (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                result TEXT NOT NULL DEFAULT '{}',
                context_tags TEXT NOT NULL DEFAULT '[]'
            );
            CREATE INDEX IF NOT EXISTS idx_episodic_agent_time ON episodic_memory(agent_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_episodic_session ON episodic_memory(session_id, timestamp);

            -- Sprint 2: Semantic key-value memory store
            CREATE TABLE IF NOT EXISTS semantic_memory (
                id TEXT PRIMARY KEY,
                key TEXT NOT NULL UNIQUE,
                value TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL
            );

            -- Sprint 2: Per-agent persistent state (beliefs, preferences, token counts)
            CREATE TABLE IF NOT EXISTS agent_state (
                agent_id TEXT PRIMARY KEY,
                state_json TEXT NOT NULL DEFAULT '{}',
                updated_at INTEGER NOT NULL
            );

            -- Sprint 2: Permission audit log
            CREATE TABLE IF NOT EXISTS permission_log (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                decision TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );

            -- Sprint 3: Dynamic apps
            CREATE TABLE IF NOT EXISTS dynamic_apps (
                app_id TEXT PRIMARY KEY,
                window_id TEXT NOT NULL,
                controlling_agent_id TEXT NOT NULL,
                descriptor_json TEXT NOT NULL,
                data_context_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                destroyed_at INTEGER
            );

            -- Sprint 3: Ephemeral actions (registered by dynamic apps)
            CREATE TABLE IF NOT EXISTS ephemeral_actions (
                action_type TEXT PRIMARY KEY,
                app_id TEXT NOT NULL,
                definition_json TEXT NOT NULL,
                usage_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );

            -- Sprint 3: Window groups (magnetic layout)
            CREATE TABLE IF NOT EXISTS window_groups (
                group_id TEXT PRIMARY KEY,
                window_ids TEXT NOT NULL,
                created_at INTEGER NOT NULL
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

    // ── Episodic memory ─────────────────────────────────────────────────────

    pub fn episodic_record(
        &self,
        id: &str,
        session_id: &str,
        agent_id: &str,
        action_type: &str,
        payload: &str,
        result: &str,
        tags: &str,
    ) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT OR REPLACE INTO episodic_memory (id, session_id, agent_id, timestamp, action_type, payload, result, context_tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, session_id, agent_id, ts, action_type, payload, result, tags],
        )?;
        Ok(())
    }

    pub fn episodic_query_session(&self, session_id: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, agent_id, timestamp, action_type, payload, result, context_tags
             FROM episodic_memory WHERE session_id = ?1
             ORDER BY timestamp ASC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![session_id, limit], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "agent_id": row.get::<_, String>(1)?,
                "timestamp": row.get::<_, i64>(2)?,
                "action_type": row.get::<_, String>(3)?,
                "payload": row.get::<_, String>(4)?,
                "result": row.get::<_, String>(5)?,
                "tags": row.get::<_, String>(6)?,
            }))
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn episodic_purge_old(&self, days: i64) -> Result<usize, LunaError> {
        let cutoff = chrono::Utc::now().timestamp_millis() - (days * 86_400_000);
        let count = self.conn.execute(
            "DELETE FROM episodic_memory WHERE timestamp < ?1",
            params![cutoff],
        )?;
        Ok(count)
    }

    // ── Semantic memory ──────────────────────────────────────────────────────

    pub fn semantic_store(&self, key: &str, value: &str, tags: &str) -> Result<(), LunaError> {
        let id = uuid::Uuid::new_v4().to_string();
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT OR REPLACE INTO semantic_memory (id, key, value, tags, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, key, value, tags, ts],
        )?;
        Ok(())
    }

    pub fn semantic_get(&self, key: &str) -> Result<Option<String>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT value FROM semantic_memory WHERE key = ?1 LIMIT 1"
        )?;
        let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
        Ok(rows.next().transpose()?)
    }

    pub fn semantic_search_by_tag(&self, tag: &str) -> Result<Vec<(String, String)>, LunaError> {
        let like_pattern = format!("%{}%", tag);
        let mut stmt = self.conn.prepare(
            "SELECT key, value FROM semantic_memory WHERE tags LIKE ?1 LIMIT 50"
        )?;
        let rows = stmt.query_map(params![like_pattern], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    // ── Agent state ──────────────────────────────────────────────────────────

    pub fn agent_state_load(&self, agent_id: &str) -> Result<Option<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT state_json FROM agent_state WHERE agent_id = ?1"
        )?;
        let mut rows = stmt.query_map(params![agent_id], |row| row.get::<_, String>(0))?;
        if let Some(json_str) = rows.next().transpose()? {
            Ok(Some(serde_json::from_str(&json_str)?))
        } else {
            Ok(None)
        }
    }

    pub fn agent_state_save(&self, agent_id: &str, state: &serde_json::Value) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        let json_str = serde_json::to_string(state)?;
        self.conn.execute(
            "INSERT OR REPLACE INTO agent_state (agent_id, state_json, updated_at) VALUES (?1, ?2, ?3)",
            params![agent_id, json_str, ts],
        )?;
        Ok(())
    }

    // ── Permission log ───────────────────────────────────────────────────────

    pub fn permission_log_insert(
        &self,
        agent_id: &str,
        action_type: &str,
        decision: &str,
    ) -> Result<(), LunaError> {
        let id = uuid::Uuid::new_v4().to_string();
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT INTO permission_log (id, agent_id, action_type, decision, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, agent_id, action_type, decision, ts],
        )?;
        Ok(())
    }

    pub fn permission_log_query(&self, agent_id: Option<&str>, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let (sql, param_val) = if let Some(aid) = agent_id {
            (
                "SELECT agent_id, action_type, decision, timestamp FROM permission_log WHERE agent_id = ?1 ORDER BY timestamp DESC LIMIT ?2".to_string(),
                serde_json::json!([aid, limit as i64]),
            )
        } else {
            (
                "SELECT agent_id, action_type, decision, timestamp FROM permission_log ORDER BY timestamp DESC LIMIT ?1".to_string(),
                serde_json::json!([limit as i64]),
            )
        };

        // Use simpler approach to avoid param binding complexity
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = if agent_id.is_some() {
            let aid = agent_id.unwrap();
            let r = stmt.query_map(params![aid, limit], |row| {
                Ok(serde_json::json!({
                    "agent_id": row.get::<_, String>(0)?,
                    "action_type": row.get::<_, String>(1)?,
                    "decision": row.get::<_, String>(2)?,
                    "timestamp": row.get::<_, i64>(3)?,
                }))
            })?;
            let mut v = Vec::new();
            for row in r { v.push(row?); }
            v
        } else {
            let r = stmt.query_map(params![limit], |row| {
                Ok(serde_json::json!({
                    "agent_id": row.get::<_, String>(0)?,
                    "action_type": row.get::<_, String>(1)?,
                    "decision": row.get::<_, String>(2)?,
                    "timestamp": row.get::<_, i64>(3)?,
                }))
            })?;
            let mut v = Vec::new();
            for row in r { v.push(row?); }
            v
        };
        let _ = param_val; // suppress unused warning
        Ok(rows)
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
