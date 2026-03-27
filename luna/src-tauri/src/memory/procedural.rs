use std::fmt;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::error::LunaError;
use crate::persistence::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowPattern {
    pub id: String,
    pub name: String,
    pub pattern_type: PatternType,
    pub trigger_keywords: Vec<String>,
    pub trigger_tags: Vec<String>,
    pub steps: Vec<WorkflowStep>,
    pub frequency: u32,
    pub success_rate: f64,
    pub confidence: f64,
    pub last_observed: i64,
    pub user_feedback: UserFeedback,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatternType {
    UserInitiated,
    AgentInitiated,
    CollaborativeLoop,
    TaskDecomposition,
}

impl fmt::Display for PatternType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PatternType::UserInitiated => write!(f, "user_initiated"),
            PatternType::AgentInitiated => write!(f, "agent_initiated"),
            PatternType::CollaborativeLoop => write!(f, "collaborative_loop"),
            PatternType::TaskDecomposition => write!(f, "task_decomposition"),
        }
    }
}

impl PatternType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "agent_initiated" => PatternType::AgentInitiated,
            "collaborative_loop" => PatternType::CollaborativeLoop,
            "task_decomposition" => PatternType::TaskDecomposition,
            _ => PatternType::UserInitiated,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub step_number: u32,
    pub actor: String,
    pub action_template: String,
    pub expected_duration_ms: Option<u64>,
    pub dependencies: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UserFeedback {
    Endorsed,
    Neutral,
    Rejected,
}

impl fmt::Display for UserFeedback {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UserFeedback::Endorsed => write!(f, "endorsed"),
            UserFeedback::Neutral => write!(f, "neutral"),
            UserFeedback::Rejected => write!(f, "rejected"),
        }
    }
}

impl UserFeedback {
    pub fn from_str(s: &str) -> Self {
        match s {
            "endorsed" => UserFeedback::Endorsed,
            "rejected" => UserFeedback::Rejected,
            _ => UserFeedback::Neutral,
        }
    }
}

/// Procedural memory — captures learned workflows as action sequences.
/// Backed by SQLite for durability.
pub struct ProceduralMemory {
    db: Arc<Mutex<Database>>,
}

impl ProceduralMemory {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self { db }
    }

    /// Store (insert or replace) a workflow pattern.
    pub async fn store_workflow(&self, workflow: &WorkflowPattern) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        let trigger_keywords = serde_json::to_string(&workflow.trigger_keywords)?;
        let trigger_tags = serde_json::to_string(&workflow.trigger_tags)?;
        let steps_json = serde_json::to_string(&workflow.steps)?;
        db.procedural_store(
            &workflow.id,
            &workflow.name,
            &workflow.pattern_type.to_string(),
            &trigger_keywords,
            &trigger_tags,
            &steps_json,
            workflow.frequency,
            workflow.success_rate,
            workflow.confidence,
            workflow.last_observed,
            &workflow.user_feedback.to_string(),
            workflow.created_at,
            workflow.updated_at,
        )
    }

    /// Retrieve a workflow by ID.
    pub async fn get_workflow(&self, id: &str) -> Result<Option<WorkflowPattern>, LunaError> {
        let db = self.db.lock().await;
        db.procedural_get(id)
    }

    /// Find workflows whose trigger_tags overlap with the given tags.
    pub async fn get_by_trigger_tags(&self, tags: &[String]) -> Result<Vec<WorkflowPattern>, LunaError> {
        let db = self.db.lock().await;
        let patterns: Vec<String> = tags.iter().map(|t| {
            let escaped = t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
            format!("%\"{}\"%" , escaped)
        }).collect();
        db.procedural_search_by_tags(&patterns)
    }

    /// Find workflows whose trigger_keywords match any of the given keywords.
    pub async fn get_by_keywords(&self, keywords: &[String]) -> Result<Vec<WorkflowPattern>, LunaError> {
        let db = self.db.lock().await;
        let patterns: Vec<String> = keywords.iter().map(|k| {
            let escaped = k.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
            format!("%\"{}\"%" , escaped)
        }).collect();
        db.procedural_search_by_keywords(&patterns)
    }

    /// Get high-value workflows by minimum frequency and success rate.
    pub async fn get_high_value(&self, min_frequency: u32, min_success_rate: f64) -> Result<Vec<WorkflowPattern>, LunaError> {
        let db = self.db.lock().await;
        db.procedural_get_high_value(min_frequency, min_success_rate)
    }

    /// Combined tag + keyword search, ordered by frequency * success_rate DESC.
    pub async fn get_applicable(&self, tags: &[String], keywords: &[String], limit: usize) -> Result<Vec<WorkflowPattern>, LunaError> {
        let db = self.db.lock().await;
        let tag_patterns: Vec<String> = tags.iter().map(|t| {
            let escaped = t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
            format!("%\"{}\"%" , escaped)
        }).collect();
        let keyword_patterns: Vec<String> = keywords.iter().map(|k| {
            let escaped = k.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
            format!("%\"{}\"%" , escaped)
        }).collect();

        // Fetch from both sources and merge
        let by_tags = if tag_patterns.is_empty() {
            Vec::new()
        } else {
            db.procedural_search_by_tags(&tag_patterns)?
        };
        let by_keywords = if keyword_patterns.is_empty() {
            Vec::new()
        } else {
            db.procedural_search_by_keywords(&keyword_patterns)?
        };

        // Deduplicate by id, keeping the first occurrence
        let mut seen = std::collections::HashSet::new();
        let mut combined: Vec<WorkflowPattern> = Vec::new();
        for wf in by_tags.into_iter().chain(by_keywords.into_iter()) {
            if seen.insert(wf.id.clone()) {
                combined.push(wf);
            }
        }

        // Sort by frequency * success_rate descending
        combined.sort_by(|a, b| {
            let score_a = a.frequency as f64 * a.success_rate;
            let score_b = b.frequency as f64 * b.success_rate;
            score_b.partial_cmp(&score_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        combined.truncate(limit);
        Ok(combined)
    }

    /// Increment frequency, update last_observed and updated_at.
    pub async fn record_observation(&self, id: &str) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.procedural_update_observation(id)
    }

    /// Set user feedback for a workflow.
    pub async fn set_feedback(&self, id: &str, feedback: UserFeedback) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.procedural_set_feedback(id, &feedback.to_string())
    }

    /// Halve success_rate for workflows not observed in threshold days.
    pub async fn decay_stale(&self, days_threshold: i64) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        let threshold_ts = chrono::Utc::now().timestamp() - (days_threshold * 86_400);
        db.procedural_decay(threshold_ts)
    }

    /// Delete rejected workflows older than days_old days.
    pub async fn purge_rejected(&self, days_old: i64) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        let threshold_ts = chrono::Utc::now().timestamp() - (days_old * 86_400);
        db.procedural_purge_rejected(threshold_ts)
    }

    /// Delete a workflow by id.
    pub async fn delete_workflow(&self, id: &str) -> Result<(), LunaError> {
        let db = self.db.lock().await;
        db.procedural_delete(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_db() -> Arc<Mutex<Database>> {
        Arc::new(Mutex::new(Database::new(":memory:").expect("in-memory DB")))
    }

    fn make_workflow(id: &str, name: &str) -> WorkflowPattern {
        let now = chrono::Utc::now().timestamp();
        WorkflowPattern {
            id: id.to_string(),
            name: name.to_string(),
            pattern_type: PatternType::UserInitiated,
            trigger_keywords: vec!["deploy".to_string(), "release".to_string()],
            trigger_tags: vec!["ci".to_string(), "devops".to_string()],
            steps: vec![
                WorkflowStep {
                    step_number: 1,
                    actor: "user".to_string(),
                    action_template: "initiate deploy".to_string(),
                    expected_duration_ms: Some(500),
                    dependencies: vec![],
                },
                WorkflowStep {
                    step_number: 2,
                    actor: "agent".to_string(),
                    action_template: "run pipeline".to_string(),
                    expected_duration_ms: Some(30000),
                    dependencies: vec![1],
                },
            ],
            frequency: 5,
            success_rate: 0.9,
            confidence: 0.7,
            last_observed: now,
            user_feedback: UserFeedback::Neutral,
            created_at: now,
            updated_at: now,
        }
    }

    #[tokio::test]
    async fn test_store_and_retrieve_workflow() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);
        let wf = make_workflow("wf-1", "Deploy Pipeline");

        mem.store_workflow(&wf).await.expect("store");
        let retrieved = mem.get_workflow("wf-1").await.expect("get").expect("should exist");

        assert_eq!(retrieved.id, "wf-1");
        assert_eq!(retrieved.name, "Deploy Pipeline");
        assert_eq!(retrieved.frequency, 5);
        assert_eq!(retrieved.steps.len(), 2);
        assert_eq!(retrieved.steps[0].actor, "user");
    }

    #[tokio::test]
    async fn test_search_by_trigger_tags() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);

        let wf1 = make_workflow("wf-1", "Deploy");
        let mut wf2 = make_workflow("wf-2", "Build");
        wf2.trigger_tags = vec!["build".to_string(), "compile".to_string()];

        mem.store_workflow(&wf1).await.expect("store wf1");
        mem.store_workflow(&wf2).await.expect("store wf2");

        let results = mem.get_by_trigger_tags(&["ci".to_string()]).await.expect("search");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "wf-1");

        let results = mem.get_by_trigger_tags(&["build".to_string()]).await.expect("search");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "wf-2");
    }

    #[tokio::test]
    async fn test_search_by_keywords() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);

        let wf1 = make_workflow("wf-1", "Deploy");
        let mut wf2 = make_workflow("wf-2", "Test");
        wf2.trigger_keywords = vec!["test".to_string(), "validate".to_string()];

        mem.store_workflow(&wf1).await.expect("store wf1");
        mem.store_workflow(&wf2).await.expect("store wf2");

        let results = mem.get_by_keywords(&["deploy".to_string()]).await.expect("search");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "wf-1");

        let results = mem.get_by_keywords(&["test".to_string()]).await.expect("search");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "wf-2");
    }

    #[tokio::test]
    async fn test_record_observation_increments_frequency() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);

        let wf = make_workflow("wf-1", "Deploy");
        mem.store_workflow(&wf).await.expect("store");

        mem.record_observation("wf-1").await.expect("observe");
        let updated = mem.get_workflow("wf-1").await.expect("get").expect("exists");
        assert_eq!(updated.frequency, 6);

        mem.record_observation("wf-1").await.expect("observe again");
        let updated = mem.get_workflow("wf-1").await.expect("get").expect("exists");
        assert_eq!(updated.frequency, 7);
    }

    #[tokio::test]
    async fn test_set_feedback_updates_correctly() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);

        let wf = make_workflow("wf-1", "Deploy");
        mem.store_workflow(&wf).await.expect("store");

        mem.set_feedback("wf-1", UserFeedback::Endorsed).await.expect("feedback");
        let updated = mem.get_workflow("wf-1").await.expect("get").expect("exists");
        assert_eq!(updated.user_feedback, UserFeedback::Endorsed);

        mem.set_feedback("wf-1", UserFeedback::Rejected).await.expect("feedback");
        let updated = mem.get_workflow("wf-1").await.expect("get").expect("exists");
        assert_eq!(updated.user_feedback, UserFeedback::Rejected);
    }

    #[tokio::test]
    async fn test_decay_stale_reduces_success_rate() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);

        let mut wf = make_workflow("wf-1", "Deploy");
        // Set last_observed to 100 days ago
        wf.last_observed = chrono::Utc::now().timestamp() - (100 * 86_400);
        wf.success_rate = 0.8;
        mem.store_workflow(&wf).await.expect("store");

        // Decay workflows not observed in 30 days
        mem.decay_stale(30).await.expect("decay");

        let updated = mem.get_workflow("wf-1").await.expect("get").expect("exists");
        assert!((updated.success_rate - 0.4).abs() < 0.001, "success_rate should be halved from 0.8 to 0.4, got {}", updated.success_rate);
    }

    #[tokio::test]
    async fn test_delete_workflow() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);

        let wf = make_workflow("wf-1", "Deploy");
        mem.store_workflow(&wf).await.expect("store");
        assert!(mem.get_workflow("wf-1").await.expect("get").is_some());

        mem.delete_workflow("wf-1").await.expect("delete");
        assert!(mem.get_workflow("wf-1").await.expect("get").is_none());
    }

    #[tokio::test]
    async fn test_get_high_value() {
        let db = make_test_db();
        let mem = ProceduralMemory::new(db);

        let mut wf1 = make_workflow("wf-1", "High Value");
        wf1.frequency = 10;
        wf1.success_rate = 0.95;

        let mut wf2 = make_workflow("wf-2", "Low Value");
        wf2.frequency = 1;
        wf2.success_rate = 0.3;

        mem.store_workflow(&wf1).await.expect("store");
        mem.store_workflow(&wf2).await.expect("store");

        let results = mem.get_high_value(5, 0.8).await.expect("high value");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "wf-1");
    }
}
