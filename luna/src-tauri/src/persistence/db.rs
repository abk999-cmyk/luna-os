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
        conn.execute_batch("PRAGMA journal_size_limit=10000000; PRAGMA wal_autocheckpoint=1000; PRAGMA foreign_keys=ON;")?;

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

            -- Phase 3A: Procedural memory (learned workflows)
            CREATE TABLE IF NOT EXISTS procedural_workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                pattern_type TEXT NOT NULL DEFAULT 'user_initiated',
                trigger_keywords TEXT NOT NULL DEFAULT '[]',
                trigger_tags TEXT NOT NULL DEFAULT '[]',
                steps_json TEXT NOT NULL DEFAULT '[]',
                frequency INTEGER NOT NULL DEFAULT 1,
                success_rate REAL NOT NULL DEFAULT 1.0,
                confidence REAL NOT NULL DEFAULT 0.5,
                last_observed INTEGER NOT NULL,
                user_feedback TEXT NOT NULL DEFAULT 'neutral',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_procedural_pattern_type ON procedural_workflows(pattern_type);
            CREATE INDEX IF NOT EXISTS idx_procedural_frequency ON procedural_workflows(frequency, success_rate);
            CREATE INDEX IF NOT EXISTS idx_procedural_last_observed ON procedural_workflows(last_observed);

            -- Phase 3B: Semantic memory property graph
            CREATE TABLE IF NOT EXISTS semantic_nodes (
                id TEXT PRIMARY KEY,
                node_type TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                properties_json TEXT NOT NULL DEFAULT '{}',
                confidence_score REAL NOT NULL DEFAULT 0.5,
                tags TEXT NOT NULL DEFAULT '[]',
                source TEXT NOT NULL DEFAULT 'inferred',
                access_frequency INTEGER NOT NULL DEFAULT 0,
                last_accessed INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_semantic_nodes_type ON semantic_nodes(node_type);
            CREATE INDEX IF NOT EXISTS idx_semantic_nodes_name ON semantic_nodes(name);
            CREATE INDEX IF NOT EXISTS idx_semantic_nodes_type_name ON semantic_nodes(node_type, name);

            CREATE TABLE IF NOT EXISTS semantic_edges (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL REFERENCES semantic_nodes(id),
                target_id TEXT NOT NULL REFERENCES semantic_nodes(id),
                relationship_type TEXT NOT NULL,
                properties_json TEXT NOT NULL DEFAULT '{}',
                weight REAL NOT NULL DEFAULT 0.5,
                episodic_evidence TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_semantic_edges_source ON semantic_edges(source_id);
            CREATE INDEX IF NOT EXISTS idx_semantic_edges_target ON semantic_edges(target_id);
            CREATE INDEX IF NOT EXISTS idx_semantic_edges_rel ON semantic_edges(relationship_type);
            CREATE INDEX IF NOT EXISTS idx_semantic_edges_source_target ON semantic_edges(source_id, target_id);

            -- Phase 4A: Security policy (permission modes + custom rules)
            CREATE TABLE IF NOT EXISTS security_policy (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            -- Phase 5B: App templates
            CREATE TABLE IF NOT EXISTS app_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'general',
                tags TEXT NOT NULL DEFAULT '[]',
                descriptor_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                use_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_templates_category ON app_templates(category);
            CREATE INDEX IF NOT EXISTS idx_templates_name ON app_templates(name);

            -- Phase 4C: Undo log
            CREATE TABLE IF NOT EXISTS undo_log (
                id TEXT PRIMARY KEY,
                action_id TEXT NOT NULL,
                action_type TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                inverse_json TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                executed INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_undo_created ON undo_log(created_at);
            CREATE INDEX IF NOT EXISTS idx_undo_action ON undo_log(action_id);

            -- Phase 6: Workspaces
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                goal TEXT,
                isolation_level TEXT NOT NULL DEFAULT 'standard',
                orchestrator_id TEXT,
                window_ids TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(active);

            -- Phase 2: App content persistence
            CREATE TABLE IF NOT EXISTS app_content_state (
                window_content_type TEXT NOT NULL,
                content_key TEXT NOT NULL,
                content_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (window_content_type, content_key)
            );
            CREATE INDEX IF NOT EXISTS idx_app_content_type ON app_content_state(window_content_type);

            -- Intelligence: User model
            CREATE TABLE IF NOT EXISTS user_model (
                user_id TEXT PRIMARY KEY,
                model_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            -- Intelligence: Learning observations
            CREATE TABLE IF NOT EXISTS learning_observations (
                id TEXT PRIMARY KEY,
                actions_json TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                outcome TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_learning_obs_timestamp ON learning_observations(timestamp);

            -- Phase 11: Collaboration - user identities
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                avatar_color TEXT NOT NULL,
                auth_method TEXT NOT NULL DEFAULT 'local',
                created_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL
            );

            -- Phase 11: Collaboration - workspace access control
            CREATE TABLE IF NOT EXISTS workspace_access (
                workspace_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                granted_at INTEGER NOT NULL,
                granted_by TEXT NOT NULL,
                PRIMARY KEY (workspace_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_workspace_access_workspace ON workspace_access(workspace_id);
            CREATE INDEX IF NOT EXISTS idx_workspace_access_user ON workspace_access(user_id);

            -- Plans table
            CREATE TABLE IF NOT EXISTS plans (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                goal TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                steps_json TEXT NOT NULL DEFAULT '[]',
                created_by TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                completed_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
            "
        )?;

        // Add new columns if they don't exist (safe migration)
        if let Err(e) = self.conn.execute_batch("
            ALTER TABLE episodic_memory ADD COLUMN category TEXT NOT NULL DEFAULT 'action';
            ALTER TABLE episodic_memory ADD COLUMN duration_ms INTEGER;
        ") {
            // Column may already exist, that's fine
            tracing::debug!("Migration note (likely already applied): {}", e);
        }

        if let Err(e) = self.conn.execute_batch("
            ALTER TABLE window_states ADD COLUMN created_at TEXT;
        ") {
            // Column may already exist, that's fine
            tracing::debug!("Migration note (likely already applied): {}", e);
        }

        Ok(())
    }

    /// Expose a reference to the underlying connection for direct queries.
    pub fn conn(&self) -> &Connection {
        &self.conn
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
            let created_at_str = w.created_at.to_rfc3339();
            self.conn.execute(
                "INSERT INTO window_states (id, session_id, title, x, y, width, height, z_order, visibility, content_type, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    w.id, session_id, w.title,
                    w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height,
                    w.z_order, visibility, content_type, created_at_str,
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
        category: &str,
        duration_ms: Option<i64>,
    ) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT OR REPLACE INTO episodic_memory (id, session_id, agent_id, timestamp, action_type, payload, result, context_tags, category, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![id, session_id, agent_id, ts, action_type, payload, result, tags, category, duration_ms],
        )?;
        Ok(())
    }

    pub fn episodic_query_session(&self, session_id: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, agent_id, timestamp, action_type, payload, result, context_tags
             FROM episodic_memory WHERE session_id = ?1
             ORDER BY timestamp DESC LIMIT ?2"
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

    pub fn episodic_query_by_agent(&self, agent_id: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, agent_id, timestamp, action_type, payload, result, context_tags, category, duration_ms
             FROM episodic_memory WHERE agent_id = ?1
             ORDER BY timestamp DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![agent_id, limit], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "session_id": row.get::<_, String>(1)?,
                "agent_id": row.get::<_, String>(2)?,
                "timestamp": row.get::<_, i64>(3)?,
                "action_type": row.get::<_, String>(4)?,
                "payload": row.get::<_, String>(5)?,
                "result": row.get::<_, String>(6)?,
                "tags": row.get::<_, String>(7)?,
                "category": row.get::<_, String>(8).unwrap_or_else(|_| "action".to_string()),
                "duration_ms": row.get::<_, Option<i64>>(9).unwrap_or(None),
            }))
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn episodic_query_time_range(&self, start_ms: i64, end_ms: i64, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, agent_id, timestamp, action_type, payload, result, context_tags, category, duration_ms
             FROM episodic_memory WHERE timestamp >= ?1 AND timestamp <= ?2
             ORDER BY timestamp DESC LIMIT ?3"
        )?;
        let rows = stmt.query_map(params![start_ms, end_ms, limit], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "session_id": row.get::<_, String>(1)?,
                "agent_id": row.get::<_, String>(2)?,
                "timestamp": row.get::<_, i64>(3)?,
                "action_type": row.get::<_, String>(4)?,
                "payload": row.get::<_, String>(5)?,
                "result": row.get::<_, String>(6)?,
                "tags": row.get::<_, String>(7)?,
                "category": row.get::<_, String>(8).unwrap_or_else(|_| "action".to_string()),
                "duration_ms": row.get::<_, Option<i64>>(9).unwrap_or(None),
            }))
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn episodic_query_by_category(&self, category: &str, limit: usize) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, agent_id, timestamp, action_type, payload, result, context_tags, category, duration_ms
             FROM episodic_memory WHERE category = ?1
             ORDER BY timestamp DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![category, limit], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "session_id": row.get::<_, String>(1)?,
                "agent_id": row.get::<_, String>(2)?,
                "timestamp": row.get::<_, i64>(3)?,
                "action_type": row.get::<_, String>(4)?,
                "payload": row.get::<_, String>(5)?,
                "result": row.get::<_, String>(6)?,
                "tags": row.get::<_, String>(7)?,
                "category": row.get::<_, String>(8).unwrap_or_else(|_| "action".to_string()),
                "duration_ms": row.get::<_, Option<i64>>(9).unwrap_or(None),
            }))
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
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

    pub fn semantic_delete(&self, key: &str) -> Result<bool, LunaError> {
        let count = self.conn.execute(
            "DELETE FROM semantic_memory WHERE key = ?1",
            params![key],
        )?;
        Ok(count > 0)
    }

    pub fn semantic_search_by_tag(&self, tag: &str) -> Result<Vec<(String, String)>, LunaError> {
        let escaped = tag.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
        let like_pattern = format!("%\"{}\"%" , escaped);
        let mut stmt = self.conn.prepare(
            "SELECT key, value FROM semantic_memory WHERE tags LIKE ?1 ESCAPE '\\' LIMIT 100"
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

    pub fn get_latest_session_id(&self) -> Result<Option<String>, LunaError> {
        let mut stmt = self.conn.prepare("SELECT id FROM sessions ORDER BY start_time DESC LIMIT 1")?;
        let mut rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        Ok(rows.next().transpose()?)
    }

    /// Get all agent IDs that have persisted state.
    pub fn get_all_agent_ids(&self) -> Result<Vec<String>, LunaError> {
        let mut stmt = self.conn.prepare("SELECT agent_id FROM agent_state")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row?);
        }
        Ok(ids)
    }

    // ── App persistence ──────────────────────────────────────────────────────

    pub fn save_app(
        &self,
        app_id: &str,
        window_id: &str,
        controlling_agent_id: &str,
        descriptor_json: &str,
        data_context_json: &str,
    ) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT OR REPLACE INTO dynamic_apps (app_id, window_id, controlling_agent_id, descriptor_json, data_context_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![app_id, window_id, controlling_agent_id, descriptor_json, data_context_json, ts],
        )?;
        Ok(())
    }

    pub fn destroy_app_record(&self, app_id: &str) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "UPDATE dynamic_apps SET destroyed_at = ?1 WHERE app_id = ?2",
            params![ts, app_id],
        )?;
        Ok(())
    }

    pub fn load_active_apps(&self) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT app_id, window_id, controlling_agent_id, descriptor_json, data_context_json
             FROM dynamic_apps WHERE destroyed_at IS NULL"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "app_id": row.get::<_, String>(0)?,
                "window_id": row.get::<_, String>(1)?,
                "controlling_agent_id": row.get::<_, String>(2)?,
                "descriptor_json": row.get::<_, String>(3)?,
                "data_context_json": row.get::<_, String>(4)?,
            }))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn load_window_states(&self, session_id: &str) -> Result<Vec<WindowState>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, x, y, width, height, z_order, visibility, content_type, created_at
             FROM window_states
             WHERE session_id = ?1
             ORDER BY z_order ASC"
        )?;

        let rows = stmt.query_map(params![session_id], |row| {
            let visibility_str: String = row.get(7)?;
            let content_type_str: String = row.get(8)?;
            let created_at_str: Option<String> = row.get(9)?;
            let created_at = created_at_str
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(chrono::Utc::now);

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
                created_at,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    // ── Procedural memory ───────────────────────────────────────────────────

    pub fn procedural_store(
        &self,
        id: &str,
        name: &str,
        pattern_type: &str,
        trigger_keywords: &str,
        trigger_tags: &str,
        steps_json: &str,
        frequency: u32,
        success_rate: f64,
        confidence: f64,
        last_observed: i64,
        user_feedback: &str,
        created_at: i64,
        updated_at: i64,
    ) -> Result<(), LunaError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO procedural_workflows
             (id, name, pattern_type, trigger_keywords, trigger_tags, steps_json,
              frequency, success_rate, confidence, last_observed, user_feedback,
              created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                id, name, pattern_type, trigger_keywords, trigger_tags, steps_json,
                frequency, success_rate, confidence, last_observed, user_feedback,
                created_at, updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn procedural_get(&self, id: &str) -> Result<Option<crate::memory::procedural::WorkflowPattern>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, pattern_type, trigger_keywords, trigger_tags, steps_json,
                    frequency, success_rate, confidence, last_observed, user_feedback,
                    created_at, updated_at
             FROM procedural_workflows WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Self::workflow_from_row(row)
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r??)),
            None => Ok(None),
        }
    }

    pub fn procedural_search_by_tags(&self, tag_patterns: &[String]) -> Result<Vec<crate::memory::procedural::WorkflowPattern>, LunaError> {
        if tag_patterns.is_empty() {
            return Ok(Vec::new());
        }
        let conditions: Vec<String> = tag_patterns.iter().enumerate()
            .map(|(i, _)| format!("trigger_tags LIKE ?{} ESCAPE '\\'", i + 1))
            .collect();
        let sql = format!(
            "SELECT id, name, pattern_type, trigger_keywords, trigger_tags, steps_json,
                    frequency, success_rate, confidence, last_observed, user_feedback,
                    created_at, updated_at
             FROM procedural_workflows WHERE {} LIMIT 100",
            conditions.join(" OR ")
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = tag_patterns.iter()
            .map(|p| p as &dyn rusqlite::types::ToSql)
            .collect();
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Self::workflow_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row??);
        }
        Ok(results)
    }

    pub fn procedural_search_by_keywords(&self, keyword_patterns: &[String]) -> Result<Vec<crate::memory::procedural::WorkflowPattern>, LunaError> {
        if keyword_patterns.is_empty() {
            return Ok(Vec::new());
        }
        let conditions: Vec<String> = keyword_patterns.iter().enumerate()
            .map(|(i, _)| format!("trigger_keywords LIKE ?{} ESCAPE '\\'", i + 1))
            .collect();
        let sql = format!(
            "SELECT id, name, pattern_type, trigger_keywords, trigger_tags, steps_json,
                    frequency, success_rate, confidence, last_observed, user_feedback,
                    created_at, updated_at
             FROM procedural_workflows WHERE {} LIMIT 100",
            conditions.join(" OR ")
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = keyword_patterns.iter()
            .map(|p| p as &dyn rusqlite::types::ToSql)
            .collect();
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Self::workflow_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row??);
        }
        Ok(results)
    }

    pub fn procedural_get_high_value(&self, min_freq: u32, min_success_rate: f64) -> Result<Vec<crate::memory::procedural::WorkflowPattern>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, pattern_type, trigger_keywords, trigger_tags, steps_json,
                    frequency, success_rate, confidence, last_observed, user_feedback,
                    created_at, updated_at
             FROM procedural_workflows
             WHERE frequency >= ?1 AND success_rate >= ?2
             ORDER BY frequency DESC, success_rate DESC
             LIMIT 100"
        )?;
        let rows = stmt.query_map(params![min_freq, min_success_rate], |row| {
            Self::workflow_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row??);
        }
        Ok(results)
    }

    pub fn procedural_update_observation(&self, id: &str) -> Result<(), LunaError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "UPDATE procedural_workflows
             SET frequency = frequency + 1, last_observed = ?1, updated_at = ?1
             WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn procedural_set_feedback(&self, id: &str, feedback: &str) -> Result<(), LunaError> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "UPDATE procedural_workflows SET user_feedback = ?1, updated_at = ?2 WHERE id = ?3",
            params![feedback, now, id],
        )?;
        Ok(())
    }

    pub fn procedural_decay(&self, threshold_timestamp: i64) -> Result<(), LunaError> {
        self.conn.execute(
            "UPDATE procedural_workflows
             SET success_rate = success_rate * 0.5
             WHERE last_observed < ?1",
            params![threshold_timestamp],
        )?;
        Ok(())
    }

    pub fn procedural_purge_rejected(&self, threshold_timestamp: i64) -> Result<(), LunaError> {
        self.conn.execute(
            "DELETE FROM procedural_workflows
             WHERE user_feedback = 'rejected' AND updated_at < ?1",
            params![threshold_timestamp],
        )?;
        Ok(())
    }

    pub fn procedural_delete(&self, id: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "DELETE FROM procedural_workflows WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    // ── Semantic property graph ────────────────────────────────────────────

    pub fn graph_insert_node(&self, node: &crate::memory::semantic::SemanticNode) -> Result<(), LunaError> {
        let props = serde_json::to_string(&node.properties)?;
        let tags = serde_json::to_string(&node.tags)?;
        self.conn.execute(
            "INSERT OR REPLACE INTO semantic_nodes
             (id, node_type, name, description, properties_json, confidence_score, tags, source,
              access_frequency, last_accessed, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                node.id, node.node_type.to_string(), node.name, node.description,
                props, node.confidence_score, tags, node.source,
                node.access_frequency, node.last_accessed, node.created_at, node.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn graph_get_node(&self, id: &str) -> Result<Option<crate::memory::semantic::SemanticNode>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, node_type, name, description, properties_json, confidence_score,
                    tags, source, access_frequency, last_accessed, created_at, updated_at
             FROM semantic_nodes WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Self::semantic_node_from_row(row)
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r??)),
            None => Ok(None),
        }
    }

    pub fn graph_get_nodes_by_type(&self, type_str: &str) -> Result<Vec<crate::memory::semantic::SemanticNode>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, node_type, name, description, properties_json, confidence_score,
                    tags, source, access_frequency, last_accessed, created_at, updated_at
             FROM semantic_nodes WHERE node_type = ?1"
        )?;
        let rows = stmt.query_map(params![type_str], |row| {
            Self::semantic_node_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row??); }
        Ok(results)
    }

    pub fn graph_search_nodes_by_name(&self, name_like: &str) -> Result<Vec<crate::memory::semantic::SemanticNode>, LunaError> {
        // Escape SQL LIKE wildcards in user input to prevent injection
        let escaped = name_like
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let pattern = format!("%{}%", escaped);
        let mut stmt = self.conn.prepare(
            "SELECT id, node_type, name, description, properties_json, confidence_score,
                    tags, source, access_frequency, last_accessed, created_at, updated_at
             FROM semantic_nodes WHERE name LIKE ?1 ESCAPE '\\' LIMIT 100"
        )?;
        let rows = stmt.query_map(params![pattern], |row| {
            Self::semantic_node_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row??); }
        Ok(results)
    }

    pub fn graph_update_node(&self, node: &crate::memory::semantic::SemanticNode) -> Result<(), LunaError> {
        let props = serde_json::to_string(&node.properties)?;
        let tags = serde_json::to_string(&node.tags)?;
        self.conn.execute(
            "UPDATE semantic_nodes SET
                node_type = ?1, name = ?2, description = ?3, properties_json = ?4,
                confidence_score = ?5, tags = ?6, source = ?7, access_frequency = ?8,
                last_accessed = ?9, updated_at = ?10
             WHERE id = ?11",
            params![
                node.node_type.to_string(), node.name, node.description, props,
                node.confidence_score, tags, node.source, node.access_frequency,
                node.last_accessed, node.updated_at, node.id,
            ],
        )?;
        Ok(())
    }

    pub fn graph_delete_node(&self, id: &str) -> Result<(), LunaError> {
        self.conn.execute("DELETE FROM semantic_nodes WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn graph_touch_node(&self, id: &str) -> Result<(), LunaError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        self.conn.execute(
            "UPDATE semantic_nodes SET access_frequency = access_frequency + 1, last_accessed = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn graph_insert_edge(&self, edge: &crate::memory::semantic::SemanticEdge) -> Result<(), LunaError> {
        let props = serde_json::to_string(&edge.properties)?;
        let evidence = serde_json::to_string(&edge.episodic_evidence)?;
        self.conn.execute(
            "INSERT OR REPLACE INTO semantic_edges
             (id, source_id, target_id, relationship_type, properties_json, weight, episodic_evidence, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                edge.id, edge.source_id, edge.target_id, edge.relationship_type.to_string(),
                props, edge.weight, evidence, edge.created_at, edge.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn graph_get_edge(&self, id: &str) -> Result<Option<crate::memory::semantic::SemanticEdge>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_id, target_id, relationship_type, properties_json, weight, episodic_evidence, created_at, updated_at
             FROM semantic_edges WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Self::semantic_edge_from_row(row)
        })?;
        match rows.next() {
            Some(r) => Ok(Some(r??)),
            None => Ok(None),
        }
    }

    pub fn graph_get_edges_from(&self, source_id: &str) -> Result<Vec<crate::memory::semantic::SemanticEdge>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_id, target_id, relationship_type, properties_json, weight, episodic_evidence, created_at, updated_at
             FROM semantic_edges WHERE source_id = ?1"
        )?;
        let rows = stmt.query_map(params![source_id], |row| {
            Self::semantic_edge_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row??); }
        Ok(results)
    }

    pub fn graph_get_edges_to(&self, target_id: &str) -> Result<Vec<crate::memory::semantic::SemanticEdge>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_id, target_id, relationship_type, properties_json, weight, episodic_evidence, created_at, updated_at
             FROM semantic_edges WHERE target_id = ?1"
        )?;
        let rows = stmt.query_map(params![target_id], |row| {
            Self::semantic_edge_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row??); }
        Ok(results)
    }

    pub fn graph_get_edges_between(&self, source_id: &str, target_id: &str) -> Result<Vec<crate::memory::semantic::SemanticEdge>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_id, target_id, relationship_type, properties_json, weight, episodic_evidence, created_at, updated_at
             FROM semantic_edges WHERE source_id = ?1 AND target_id = ?2"
        )?;
        let rows = stmt.query_map(params![source_id, target_id], |row| {
            Self::semantic_edge_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row??); }
        Ok(results)
    }

    pub fn graph_get_edges_by_type(&self, rel_type: &str) -> Result<Vec<crate::memory::semantic::SemanticEdge>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_id, target_id, relationship_type, properties_json, weight, episodic_evidence, created_at, updated_at
             FROM semantic_edges WHERE relationship_type = ?1"
        )?;
        let rows = stmt.query_map(params![rel_type], |row| {
            Self::semantic_edge_from_row(row)
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row??); }
        Ok(results)
    }

    pub fn graph_update_edge_weight(&self, id: &str, weight: f64) -> Result<(), LunaError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        self.conn.execute(
            "UPDATE semantic_edges SET weight = ?1, updated_at = ?2 WHERE id = ?3",
            params![weight, now, id],
        )?;
        Ok(())
    }

    pub fn graph_delete_edge(&self, id: &str) -> Result<(), LunaError> {
        self.conn.execute("DELETE FROM semantic_edges WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn graph_delete_edges_for_node(&self, node_id: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "DELETE FROM semantic_edges WHERE source_id = ?1 OR target_id = ?1",
            params![node_id],
        )?;
        Ok(())
    }

    fn semantic_node_from_row(row: &rusqlite::Row) -> rusqlite::Result<Result<crate::memory::semantic::SemanticNode, LunaError>> {
        let id: String = row.get(0)?;
        let node_type_str: String = row.get(1)?;
        let name: String = row.get(2)?;
        let description: Option<String> = row.get(3)?;
        let props_str: String = row.get(4)?;
        let confidence_score: f64 = row.get(5)?;
        let tags_str: String = row.get(6)?;
        let source: String = row.get(7)?;
        let access_frequency: u32 = row.get(8)?;
        let last_accessed: i64 = row.get(9)?;
        let created_at: i64 = row.get(10)?;
        let updated_at: i64 = row.get(11)?;

        let node_type = match node_type_str.parse::<crate::memory::semantic::NodeType>() {
            Ok(nt) => nt,
            Err(e) => return Ok(Err(e)),
        };
        let properties: serde_json::Value = match serde_json::from_str(&props_str) {
            Ok(v) => v,
            Err(e) => return Ok(Err(LunaError::from(e))),
        };
        let tags: Vec<String> = match serde_json::from_str(&tags_str) {
            Ok(v) => v,
            Err(e) => return Ok(Err(LunaError::from(e))),
        };

        Ok(Ok(crate::memory::semantic::SemanticNode {
            id, node_type, name, description, properties, confidence_score,
            tags, source, access_frequency, last_accessed, created_at, updated_at,
        }))
    }

    fn semantic_edge_from_row(row: &rusqlite::Row) -> rusqlite::Result<Result<crate::memory::semantic::SemanticEdge, LunaError>> {
        let id: String = row.get(0)?;
        let source_id: String = row.get(1)?;
        let target_id: String = row.get(2)?;
        let rel_type_str: String = row.get(3)?;
        let props_str: String = row.get(4)?;
        let weight: f64 = row.get(5)?;
        let evidence_str: String = row.get(6)?;
        let created_at: i64 = row.get(7)?;
        let updated_at: i64 = row.get(8)?;

        let relationship_type = match rel_type_str.parse::<crate::memory::semantic::RelationshipType>() {
            Ok(rt) => rt,
            Err(e) => return Ok(Err(e)),
        };
        let properties: serde_json::Value = match serde_json::from_str(&props_str) {
            Ok(v) => v,
            Err(e) => return Ok(Err(LunaError::from(e))),
        };
        let episodic_evidence: Vec<String> = match serde_json::from_str(&evidence_str) {
            Ok(v) => v,
            Err(e) => return Ok(Err(LunaError::from(e))),
        };

        Ok(Ok(crate::memory::semantic::SemanticEdge {
            id, source_id, target_id, relationship_type, properties,
            weight, episodic_evidence, created_at, updated_at,
        }))
    }

    /// Helper to deserialize a workflow row. Returns Result nested in rusqlite::Result
    /// because serde_json parsing can fail outside of rusqlite's error domain.
    fn workflow_from_row(row: &rusqlite::Row) -> rusqlite::Result<Result<crate::memory::procedural::WorkflowPattern, LunaError>> {
        let id: String = row.get(0)?;
        let name: String = row.get(1)?;
        let pattern_type_str: String = row.get(2)?;
        let trigger_keywords_str: String = row.get(3)?;
        let trigger_tags_str: String = row.get(4)?;
        let steps_json_str: String = row.get(5)?;
        let frequency: u32 = row.get(6)?;
        let success_rate: f64 = row.get(7)?;
        let confidence: f64 = row.get(8)?;
        let last_observed: i64 = row.get(9)?;
        let user_feedback_str: String = row.get(10)?;
        let created_at: i64 = row.get(11)?;
        let updated_at: i64 = row.get(12)?;

        let trigger_keywords: Result<Vec<String>, _> = serde_json::from_str(&trigger_keywords_str);
        let trigger_tags: Result<Vec<String>, _> = serde_json::from_str(&trigger_tags_str);
        let steps: Result<Vec<crate::memory::procedural::WorkflowStep>, _> = serde_json::from_str(&steps_json_str);

        match (trigger_keywords, trigger_tags, steps) {
            (Ok(kw), Ok(tags), Ok(steps)) => {
                Ok(Ok(crate::memory::procedural::WorkflowPattern {
                    id,
                    name,
                    pattern_type: crate::memory::procedural::PatternType::from_str(&pattern_type_str),
                    trigger_keywords: kw,
                    trigger_tags: tags,
                    steps,
                    frequency,
                    success_rate,
                    confidence,
                    last_observed,
                    user_feedback: crate::memory::procedural::UserFeedback::from_str(&user_feedback_str),
                    created_at,
                    updated_at,
                }))
            }
            (Err(e), _, _) | (_, Err(e), _) | (_, _, Err(e)) => {
                Ok(Err(LunaError::from(e)))
            }
        }
    }

    // ── Security policy persistence ─────────────────────────────────────────

    pub fn policy_set(&self, key: &str, value: &str) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT OR REPLACE INTO security_policy (key, value, updated_at) VALUES (?1, ?2, ?3)",
            params![key, value, ts],
        )?;
        Ok(())
    }

    pub fn policy_get(&self, key: &str) -> Result<Option<String>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT value FROM security_policy WHERE key = ?1"
        )?;
        let result = stmt.query_row(params![key], |row| row.get::<_, String>(0));
        match result {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(LunaError::from(e)),
        }
    }

    // ── Undo log ────────────────────────────────────────────────────────────

    pub fn undo_insert(
        &self,
        id: &str,
        action_id: &str,
        action_type: &str,
        agent_id: &str,
        inverse_json: &str,
        description: &str,
        created_at: i64,
        expires_at: i64,
    ) -> Result<(), LunaError> {
        self.conn.execute(
            "INSERT INTO undo_log (id, action_id, action_type, agent_id, inverse_json, description, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, action_id, action_type, agent_id, inverse_json, description, created_at, expires_at],
        )?;
        Ok(())
    }

    pub fn undo_get_recent(&self, limit: usize) -> Result<Vec<crate::action::undo::UndoRow>, LunaError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let mut stmt = self.conn.prepare(
            "SELECT id, action_id, action_type, agent_id, inverse_json, description, created_at, expires_at, executed
             FROM undo_log
             WHERE executed = 0 AND expires_at > ?1
             ORDER BY created_at DESC
             LIMIT ?2"
        )?;
        let rows = stmt.query_map(params![now, limit], |row| {
            Ok(crate::action::undo::UndoRow {
                id: row.get(0)?,
                action_id: row.get(1)?,
                action_type: row.get(2)?,
                agent_id: row.get(3)?,
                inverse_json: row.get(4)?,
                description: row.get(5)?,
                created_at: row.get(6)?,
                expires_at: row.get(7)?,
                executed: row.get::<_, i32>(8)? != 0,
            })
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    pub fn undo_get_by_action(&self, action_id: &str) -> Result<Option<crate::action::undo::UndoRow>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, action_id, action_type, agent_id, inverse_json, description, created_at, expires_at, executed
             FROM undo_log WHERE action_id = ?1 LIMIT 1"
        )?;
        let result = stmt.query_row(params![action_id], |row| {
            Ok(crate::action::undo::UndoRow {
                id: row.get(0)?,
                action_id: row.get(1)?,
                action_type: row.get(2)?,
                agent_id: row.get(3)?,
                inverse_json: row.get(4)?,
                description: row.get(5)?,
                created_at: row.get(6)?,
                expires_at: row.get(7)?,
                executed: row.get::<_, i32>(8)? != 0,
            })
        });
        match result {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(LunaError::from(e)),
        }
    }

    pub fn undo_mark_executed(&self, id: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "UPDATE undo_log SET executed = 1 WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn undo_purge_expired(&self) -> Result<usize, LunaError> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let count = self.conn.execute(
            "DELETE FROM undo_log WHERE expires_at < ?1",
            params![now],
        )?;
        Ok(count)
    }

    // ── App templates ───────────────────────────────────────────────────────

    pub fn template_save(
        &self,
        id: &str,
        name: &str,
        description: &str,
        category: &str,
        tags_json: &str,
        descriptor_json: &str,
        created_at: i64,
    ) -> Result<(), LunaError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO app_templates (id, name, description, category, tags, descriptor_json, created_at, use_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE((SELECT use_count FROM app_templates WHERE id = ?1), 0))",
            params![id, name, description, category, tags_json, descriptor_json, created_at],
        )?;
        Ok(())
    }

    pub fn template_get(&self, id: &str) -> Result<Option<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, category, tags, descriptor_json, created_at, use_count
             FROM app_templates WHERE id = ?1"
        )?;
        let result = stmt.query_row(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, String>(2)?,
                "category": row.get::<_, String>(3)?,
                "tags": row.get::<_, String>(4)?,
                "descriptor_json": row.get::<_, String>(5)?,
                "created_at": row.get::<_, i64>(6)?,
                "use_count": row.get::<_, u32>(7)?,
            }))
        });
        match result {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(LunaError::from(e)),
        }
    }

    pub fn template_list(&self) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, category, tags, descriptor_json, created_at, use_count
             FROM app_templates ORDER BY name ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, String>(2)?,
                "category": row.get::<_, String>(3)?,
                "tags": row.get::<_, String>(4)?,
                "descriptor_json": row.get::<_, String>(5)?,
                "created_at": row.get::<_, i64>(6)?,
                "use_count": row.get::<_, u32>(7)?,
            }))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn template_search(&self, query: &str) -> Result<Vec<serde_json::Value>, LunaError> {
        let pattern = format!("%{}%", query);
        let mut stmt = self.conn.prepare(
            "SELECT id, name, description, category, tags, descriptor_json, created_at, use_count
             FROM app_templates
             WHERE name LIKE ?1 OR description LIKE ?1 OR tags LIKE ?1
             ORDER BY name ASC"
        )?;
        let rows = stmt.query_map(params![pattern], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, String>(2)?,
                "category": row.get::<_, String>(3)?,
                "tags": row.get::<_, String>(4)?,
                "descriptor_json": row.get::<_, String>(5)?,
                "created_at": row.get::<_, i64>(6)?,
                "use_count": row.get::<_, u32>(7)?,
            }))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn template_delete(&self, id: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "DELETE FROM app_templates WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    pub fn template_increment_use(&self, id: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "UPDATE app_templates SET use_count = use_count + 1 WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    // ── Phase 6: Workspace persistence ──────────────────────────────────────

    pub fn workspace_save(
        &self,
        id: &str,
        name: &str,
        goal: Option<&str>,
        isolation_level: &str,
        orchestrator_id: Option<&str>,
        window_ids: &str,
        created_at: i64,
        updated_at: i64,
        active: bool,
    ) -> Result<(), LunaError> {
        self.conn.execute(
            "INSERT OR REPLACE INTO workspaces (id, name, goal, isolation_level, orchestrator_id, window_ids, created_at, updated_at, active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, name, goal, isolation_level, orchestrator_id, window_ids, created_at, updated_at, active as i32],
        )?;
        Ok(())
    }

    pub fn workspace_list_active(&self) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, goal, isolation_level, orchestrator_id, window_ids, created_at, updated_at
             FROM workspaces WHERE active = 1 ORDER BY updated_at DESC"
        )?;
        let mut results = Vec::new();
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "goal": row.get::<_, Option<String>>(2)?,
                "isolation_level": row.get::<_, String>(3)?,
                "orchestrator_id": row.get::<_, Option<String>>(4)?,
                "window_ids": row.get::<_, String>(5)?,
                "created_at": row.get::<_, i64>(6)?,
                "updated_at": row.get::<_, i64>(7)?,
            }))
        })?;
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn workspace_update(
        &self,
        id: &str,
        name: Option<&str>,
        goal: Option<&str>,
        updated_at: i64,
    ) -> Result<(), LunaError> {
        if let Some(name) = name {
            self.conn.execute(
                "UPDATE workspaces SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, updated_at, id],
            )?;
        }
        if let Some(goal) = goal {
            self.conn.execute(
                "UPDATE workspaces SET goal = ?1, updated_at = ?2 WHERE id = ?3",
                params![goal, updated_at, id],
            )?;
        }
        Ok(())
    }

    pub fn workspace_delete(&self, id: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "UPDATE workspaces SET active = 0 WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    // ── Plan persistence ────────────────────────────────────────────────────

    pub fn plan_create(&self, id: &str, name: &str, goal: &str, steps_json: &str, created_by: &str) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT INTO plans (id, name, goal, status, steps_json, created_by, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'active', ?4, ?5, ?6, ?6)",
            params![id, name, goal, steps_json, created_by, ts],
        )?;
        Ok(())
    }

    pub fn plan_update_steps(&self, id: &str, steps_json: &str) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "UPDATE plans SET steps_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![steps_json, ts, id],
        )?;
        Ok(())
    }

    pub fn plan_update_status(&self, id: &str, status: &str) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        let completed_at = if status == "completed" { Some(ts) } else { None };
        self.conn.execute(
            "UPDATE plans SET status = ?1, updated_at = ?2, completed_at = ?3 WHERE id = ?4",
            params![status, ts, completed_at, id],
        )?;
        Ok(())
    }

    pub fn plan_get(&self, id: &str) -> Result<Option<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, goal, status, steps_json, created_by, created_at, updated_at, completed_at
             FROM plans WHERE id = ?1"
        )?;
        let result = stmt.query_row(params![id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "goal": row.get::<_, String>(2)?,
                "status": row.get::<_, String>(3)?,
                "steps_json": row.get::<_, String>(4)?,
                "created_by": row.get::<_, String>(5)?,
                "created_at": row.get::<_, i64>(6)?,
                "updated_at": row.get::<_, i64>(7)?,
                "completed_at": row.get::<_, Option<i64>>(8)?,
            }))
        });
        match result {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(LunaError::from(e)),
        }
    }

    pub fn plan_list_active(&self) -> Result<Vec<serde_json::Value>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, goal, status, steps_json, created_by, created_at, updated_at, completed_at
             FROM plans WHERE status = 'active' ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "goal": row.get::<_, String>(2)?,
                "status": row.get::<_, String>(3)?,
                "steps_json": row.get::<_, String>(4)?,
                "created_by": row.get::<_, String>(5)?,
                "created_at": row.get::<_, i64>(6)?,
                "updated_at": row.get::<_, i64>(7)?,
                "completed_at": row.get::<_, Option<i64>>(8)?,
            }))
        })?;
        let mut results = Vec::new();
        for row in rows { results.push(row?); }
        Ok(results)
    }

    // ── App content state persistence ──────────────────────────────────────

    pub fn save_app_content(&self, content_type: &str, content_key: &str, content_json: &str) -> Result<(), LunaError> {
        let ts = chrono::Utc::now().timestamp_millis();
        self.conn.execute(
            "INSERT OR REPLACE INTO app_content_state (window_content_type, content_key, content_json, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![content_type, content_key, content_json, ts],
        )?;
        Ok(())
    }

    pub fn load_app_content(&self, content_type: &str) -> Result<Vec<(String, String)>, LunaError> {
        let mut stmt = self.conn.prepare(
            "SELECT content_key, content_json FROM app_content_state WHERE window_content_type = ?1 ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map(params![content_type], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn delete_app_content(&self, content_type: &str, content_key: &str) -> Result<(), LunaError> {
        self.conn.execute(
            "DELETE FROM app_content_state WHERE window_content_type = ?1 AND content_key = ?2",
            params![content_type, content_key],
        )?;
        Ok(())
    }
}
