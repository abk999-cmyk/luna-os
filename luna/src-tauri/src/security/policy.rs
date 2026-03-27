use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use crate::error::LunaError;
use crate::persistence::db::Database;

// ── Permission Modes ────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    /// All actions require explicit user approval
    Supervised,
    /// Pre-approved actions execute freely; others still prompt
    Autonomous,
    /// Custom per-action policy rules
    Custom,
}

impl Default for PermissionMode {
    fn default() -> Self {
        Self::Supervised
    }
}

// ── Policy Decision ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PolicyDecision {
    Allow,
    Deny,
    Prompt,
    AllowWithAudit,
}

// ── Policy Conditions ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConditions {
    /// Only apply during these hours (24h format, e.g., (9, 17) = 9am-5pm)
    pub time_window: Option<(u8, u8)>,
    /// Max executions per hour before escalating to Prompt
    pub rate_limit: Option<u32>,
    /// Only for these workspace IDs
    pub workspace_ids: Option<Vec<String>>,
}

// ── Policy Rule ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    /// Glob pattern like "leaf_*" or "*"
    pub agent_pattern: String,
    /// Glob pattern like "file.*" or "shell.execute"
    pub action_pattern: String,
    /// What to do when this rule matches
    pub decision: PolicyDecision,
    /// Optional conditions that refine matching
    pub conditions: Option<PolicyConditions>,
}

// ── Pre-approved actions for Autonomous mode ────────────────────────────────

const AUTONOMOUS_PRE_APPROVED: &[&str] = &[
    "window.*",
    "memory.*",
    "agent.response",
    "agent.think",
    "system.notify",
];

// ── SecurityPolicy ──────────────────────────────────────────────────────────

pub struct SecurityPolicy {
    mode: tokio::sync::RwLock<PermissionMode>,
    rules: tokio::sync::RwLock<Vec<PolicyRule>>,
    rate_counters: tokio::sync::RwLock<HashMap<String, Vec<i64>>>,
    db: Arc<tokio::sync::Mutex<Database>>,
}

impl SecurityPolicy {
    /// Create a new SecurityPolicy in Supervised mode with no custom rules.
    pub fn new(db: Arc<tokio::sync::Mutex<Database>>) -> Self {
        Self {
            mode: tokio::sync::RwLock::new(PermissionMode::Supervised),
            rules: tokio::sync::RwLock::new(Vec::new()),
            rate_counters: tokio::sync::RwLock::new(HashMap::new()),
            db,
        }
    }

    /// Get the current permission mode.
    pub async fn get_mode(&self) -> PermissionMode {
        self.mode.read().await.clone()
    }

    /// Set the permission mode and persist to the database.
    pub async fn set_mode(&self, mode: PermissionMode) -> Result<(), LunaError> {
        let serialized = serde_json::to_string(&mode)?;
        {
            let db = self.db.lock().await;
            db.policy_set("permission_mode", &serialized)?;
        }
        *self.mode.write().await = mode.clone();
        info!(mode = ?mode, "Permission mode updated");
        Ok(())
    }

    /// Load saved mode and custom rules from the database.
    pub async fn load_from_db(&self) -> Result<(), LunaError> {
        let (mode_str, rules_str) = {
            let db = self.db.lock().await;
            (
                db.policy_get("permission_mode")?,
                db.policy_get("custom_rules")?,
            )
        };

        if let Some(mode_json) = mode_str {
            match serde_json::from_str::<PermissionMode>(&mode_json) {
                Ok(mode) => {
                    *self.mode.write().await = mode;
                }
                Err(e) => {
                    warn!(error = %e, "Failed to parse saved permission mode, keeping default");
                }
            }
        }

        if let Some(rules_json) = rules_str {
            match serde_json::from_str::<Vec<PolicyRule>>(&rules_json) {
                Ok(rules) => {
                    *self.rules.write().await = rules;
                }
                Err(e) => {
                    warn!(error = %e, "Failed to parse saved policy rules, keeping empty");
                }
            }
        }

        debug!(mode = ?*self.mode.read().await, "Security policy loaded from DB");
        Ok(())
    }

    /// Add a custom policy rule and persist all rules to the database.
    pub async fn add_rule(&self, rule: PolicyRule) -> Result<(), LunaError> {
        let mut rules = self.rules.write().await;
        rules.push(rule);
        let serialized = serde_json::to_string(&*rules)?;
        let db = self.db.lock().await;
        db.policy_set("custom_rules", &serialized)?;
        Ok(())
    }

    /// Remove a custom policy rule by index and persist.
    pub async fn remove_rule(&self, index: usize) -> Result<(), LunaError> {
        let mut rules = self.rules.write().await;
        if index >= rules.len() {
            return Err(LunaError::Config(format!(
                "Rule index {} out of range (have {} rules)",
                index,
                rules.len()
            )));
        }
        rules.remove(index);
        let serialized = serde_json::to_string(&*rules)?;
        let db = self.db.lock().await;
        db.policy_set("custom_rules", &serialized)?;
        Ok(())
    }

    /// Get all custom policy rules.
    pub async fn get_rules(&self) -> Vec<PolicyRule> {
        self.rules.read().await.clone()
    }

    /// Evaluate whether an agent may perform an action under the current mode.
    ///
    /// This is meant to be called *before* `PermissionMatrix::check()` — it adds
    /// the mode layer on top of the per-entry matrix.
    pub async fn evaluate(&self, agent_id: &str, action_type: &str) -> PolicyDecision {
        let mode = self.mode.read().await.clone();

        match mode {
            PermissionMode::Supervised => {
                // System agent performing system.* actions is always allowed
                if agent_id == "system" && action_type.starts_with("system.") {
                    return PolicyDecision::Allow;
                }
                PolicyDecision::Prompt
            }
            PermissionMode::Autonomous => {
                // Check if action matches any pre-approved pattern
                for pattern in AUTONOMOUS_PRE_APPROVED {
                    if glob_matches(pattern, action_type) {
                        return PolicyDecision::Allow;
                    }
                }
                PolicyDecision::Prompt
            }
            PermissionMode::Custom => {
                let rules = self.rules.read().await;
                for rule in rules.iter() {
                    if glob_matches(&rule.agent_pattern, agent_id)
                        && glob_matches(&rule.action_pattern, action_type)
                    {
                        // Check conditions if present
                        if let Some(ref conditions) = rule.conditions {
                            if !self.check_conditions(conditions, agent_id, action_type).await {
                                continue;
                            }

                            // Check rate limit: if exceeded, escalate to Prompt
                            if let Some(limit) = conditions.rate_limit {
                                let key = format!("{}:{}", agent_id, action_type);
                                if !self.check_rate_limit(&key, limit).await {
                                    debug!(
                                        agent_id,
                                        action_type,
                                        limit,
                                        "Rate limit exceeded, escalating to Prompt"
                                    );
                                    return PolicyDecision::Prompt;
                                }
                            }
                        }
                        return rule.decision.clone();
                    }
                }
                // No matching rule — default to Prompt
                PolicyDecision::Prompt
            }
        }
    }

    /// Check non-rate-limit conditions (time window, workspace).
    async fn check_conditions(
        &self,
        conditions: &PolicyConditions,
        _agent_id: &str,
        _action_type: &str,
    ) -> bool {
        // Time window check
        if let Some((start, end)) = conditions.time_window {
            let current_hour = chrono::Local::now().hour() as u8;
            if start <= end {
                // Normal range, e.g. 9-17
                if current_hour < start || current_hour >= end {
                    return false;
                }
            } else {
                // Overnight range, e.g. 22-6
                if current_hour < start && current_hour >= end {
                    return false;
                }
            }
        }

        true
    }

    /// Returns true if the action is under the rate limit (i.e. allowed).
    pub async fn check_rate_limit(&self, key: &str, limit: u32) -> bool {
        let counters = self.rate_counters.read().await;
        if let Some(timestamps) = counters.get(key) {
            let one_hour_ago = chrono::Utc::now().timestamp_millis() - 3_600_000;
            let recent_count = timestamps.iter().filter(|&&ts| ts > one_hour_ago).count();
            (recent_count as u32) < limit
        } else {
            true
        }
    }

    /// Record an execution timestamp for rate limiting.
    pub async fn record_execution(&self, agent_id: &str, action_type: &str) {
        let key = format!("{}:{}", agent_id, action_type);
        let ts = chrono::Utc::now().timestamp_millis();
        let mut counters = self.rate_counters.write().await;
        counters.entry(key).or_insert_with(Vec::new).push(ts);
    }

    /// Remove rate counter entries older than 1 hour.
    pub async fn clear_old_rate_entries(&self) {
        let one_hour_ago = chrono::Utc::now().timestamp_millis() - 3_600_000;
        let mut counters = self.rate_counters.write().await;
        for timestamps in counters.values_mut() {
            timestamps.retain(|&ts| ts > one_hour_ago);
        }
        counters.retain(|_, v| !v.is_empty());
    }

}

// ── Glob pattern matching ───────────────────────────────────────────────────

/// Simple glob matcher:
/// - `*` matches anything
/// - `prefix_*` matches anything starting with `prefix_`
/// - `prefix.*` matches anything starting with `prefix.`
/// - Exact match otherwise
fn glob_matches(pattern: &str, value: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if let Some(prefix) = pattern.strip_suffix('*') {
        return value.starts_with(prefix);
    }
    pattern == value
}

// Need chrono::Timelike for .hour()
use chrono::Timelike;

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistence::db::Database;

    fn make_db() -> Arc<tokio::sync::Mutex<Database>> {
        let db = Database::new(":memory:").unwrap();
        Arc::new(tokio::sync::Mutex::new(db))
    }

    #[tokio::test]
    async fn test_supervised_mode_always_returns_prompt() {
        let policy = SecurityPolicy::new(make_db());
        // Default mode is Supervised
        assert_eq!(policy.get_mode().await, PermissionMode::Supervised);

        // Any regular agent+action should return Prompt
        assert_eq!(
            policy.evaluate("leaf_1", "file.read").await,
            PolicyDecision::Prompt
        );
        assert_eq!(
            policy.evaluate("conductor", "window.create").await,
            PolicyDecision::Prompt
        );
        assert_eq!(
            policy.evaluate("some_agent", "memory.store").await,
            PolicyDecision::Prompt
        );
    }

    #[tokio::test]
    async fn test_supervised_mode_allows_system_agent_system_actions() {
        let policy = SecurityPolicy::new(make_db());
        assert_eq!(
            policy.evaluate("system", "system.startup").await,
            PolicyDecision::Allow
        );
        assert_eq!(
            policy.evaluate("system", "system.notify").await,
            PolicyDecision::Allow
        );
        // But non-system agents still get Prompt for system.* actions
        assert_eq!(
            policy.evaluate("leaf_1", "system.startup").await,
            PolicyDecision::Prompt
        );
    }

    #[tokio::test]
    async fn test_autonomous_mode_allows_pre_approved_actions() {
        let db = make_db();
        let policy = SecurityPolicy::new(db);
        policy.set_mode(PermissionMode::Autonomous).await.unwrap();

        // Pre-approved patterns: window.*, memory.*, agent.response, agent.think, system.notify
        assert_eq!(
            policy.evaluate("any_agent", "window.create").await,
            PolicyDecision::Allow
        );
        assert_eq!(
            policy.evaluate("any_agent", "window.close").await,
            PolicyDecision::Allow
        );
        assert_eq!(
            policy.evaluate("any_agent", "memory.store").await,
            PolicyDecision::Allow
        );
        assert_eq!(
            policy.evaluate("any_agent", "agent.response").await,
            PolicyDecision::Allow
        );
        assert_eq!(
            policy.evaluate("any_agent", "agent.think").await,
            PolicyDecision::Allow
        );
        assert_eq!(
            policy.evaluate("any_agent", "system.notify").await,
            PolicyDecision::Allow
        );
        // Non-pre-approved actions still prompt
        assert_eq!(
            policy.evaluate("any_agent", "shell.execute").await,
            PolicyDecision::Prompt
        );
        assert_eq!(
            policy.evaluate("any_agent", "file.delete").await,
            PolicyDecision::Prompt
        );
    }

    #[tokio::test]
    async fn test_custom_mode_matches_glob_patterns() {
        let db = make_db();
        let policy = SecurityPolicy::new(db);
        policy.set_mode(PermissionMode::Custom).await.unwrap();

        // Add rule: leaf_* agents can do file.* actions
        policy
            .add_rule(PolicyRule {
                agent_pattern: "leaf_*".to_string(),
                action_pattern: "file.*".to_string(),
                decision: PolicyDecision::Allow,
                conditions: None,
            })
            .await
            .unwrap();

        // Add rule: deny shell.execute for everyone
        policy
            .add_rule(PolicyRule {
                agent_pattern: "*".to_string(),
                action_pattern: "shell.execute".to_string(),
                decision: PolicyDecision::Deny,
                conditions: None,
            })
            .await
            .unwrap();

        // leaf_1 can do file.read (matches leaf_* and file.*)
        assert_eq!(
            policy.evaluate("leaf_1", "file.read").await,
            PolicyDecision::Allow
        );
        assert_eq!(
            policy.evaluate("leaf_2", "file.write").await,
            PolicyDecision::Allow
        );

        // conductor can't do file.read (doesn't match leaf_*)
        // Falls through to default Prompt
        assert_eq!(
            policy.evaluate("conductor", "file.read").await,
            PolicyDecision::Prompt
        );

        // shell.execute is denied for everyone
        assert_eq!(
            policy.evaluate("leaf_1", "shell.execute").await,
            // leaf_1 matches the first rule's agent_pattern but not action_pattern,
            // so it falls through to the second rule which matches both
            PolicyDecision::Deny
        );
    }

    #[tokio::test]
    async fn test_rate_limiting_triggers_prompt_after_exceeding_limit() {
        let db = make_db();
        let policy = SecurityPolicy::new(db);
        policy.set_mode(PermissionMode::Custom).await.unwrap();

        // Add rule: allow file.read for anyone, but rate limited to 3/hour
        policy
            .add_rule(PolicyRule {
                agent_pattern: "*".to_string(),
                action_pattern: "file.read".to_string(),
                decision: PolicyDecision::Allow,
                conditions: Some(PolicyConditions {
                    time_window: None,
                    rate_limit: Some(3),
                    workspace_ids: None,
                }),
            })
            .await
            .unwrap();

        // First 3 executions should be allowed
        for _ in 0..3 {
            assert_eq!(
                policy.evaluate("agent_a", "file.read").await,
                PolicyDecision::Allow
            );
            policy.record_execution("agent_a", "file.read").await;
        }

        // 4th should be escalated to Prompt (rate limit exceeded)
        assert_eq!(
            policy.evaluate("agent_a", "file.read").await,
            PolicyDecision::Prompt
        );
    }

    #[tokio::test]
    async fn test_mode_persistence_round_trip() {
        let db = make_db();

        // Set mode in one policy instance
        {
            let policy = SecurityPolicy::new(Arc::clone(&db));
            policy.set_mode(PermissionMode::Autonomous).await.unwrap();

            // Also add a rule
            policy
                .add_rule(PolicyRule {
                    agent_pattern: "leaf_*".to_string(),
                    action_pattern: "file.*".to_string(),
                    decision: PolicyDecision::AllowWithAudit,
                    conditions: None,
                })
                .await
                .unwrap();
        }

        // Load in a fresh policy instance
        {
            let policy = SecurityPolicy::new(Arc::clone(&db));
            assert_eq!(policy.get_mode().await, PermissionMode::Supervised); // default before load
            policy.load_from_db().await.unwrap();
            assert_eq!(policy.get_mode().await, PermissionMode::Autonomous);

            let rules = policy.get_rules().await;
            assert_eq!(rules.len(), 1);
            assert_eq!(rules[0].agent_pattern, "leaf_*");
            assert_eq!(rules[0].action_pattern, "file.*");
            assert_eq!(rules[0].decision, PolicyDecision::AllowWithAudit);
        }
    }

    #[test]
    fn test_glob_matches_patterns() {
        // Wildcard matches everything
        assert!(glob_matches("*", "anything"));
        assert!(glob_matches("*", ""));

        // Prefix glob
        assert!(glob_matches("leaf_*", "leaf_1"));
        assert!(glob_matches("leaf_*", "leaf_agent"));
        assert!(!glob_matches("leaf_*", "conductor"));

        // Dot prefix glob
        assert!(glob_matches("file.*", "file.read"));
        assert!(glob_matches("file.*", "file.write"));
        assert!(!glob_matches("file.*", "shell.execute"));

        // Exact match
        assert!(glob_matches("agent.response", "agent.response"));
        assert!(!glob_matches("agent.response", "agent.think"));
    }
}
