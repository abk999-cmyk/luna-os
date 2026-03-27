use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

use crate::error::LunaError;
use crate::persistence::db::Database;
use super::pattern_detector::PatternDetector;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Observation {
    pub id: String,
    pub action_sequence: Vec<String>,
    pub context_tags: Vec<String>,
    pub timestamp: i64,
    pub outcome: ObservationOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ObservationOutcome {
    Success,
    Failure,
    Corrected,
    Abandoned,
}

impl std::fmt::Display for ObservationOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Success => write!(f, "success"),
            Self::Failure => write!(f, "failure"),
            Self::Corrected => write!(f, "corrected"),
            Self::Abandoned => write!(f, "abandoned"),
        }
    }
}

impl ObservationOutcome {
    pub fn from_str(s: &str) -> Self {
        match s {
            "success" => Self::Success,
            "failure" => Self::Failure,
            "corrected" => Self::Corrected,
            "abandoned" => Self::Abandoned,
            _ => Self::Success,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedPattern {
    pub sequence: Vec<String>,
    pub frequency: u32,
    pub confidence: f64,
    pub context_tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationProposal {
    pub id: String,
    pub proposal_type: ProposalType,
    pub description: String,
    pub trigger_description: String,
    pub action_sequence: Vec<String>,
    pub confidence: f64,
    pub status: ProposalStatus,
    pub created_at: i64,
    pub dismissed_at: Option<i64>,
    /// Legacy fields kept for compatibility
    pub pattern: DetectedPattern,
    pub proposed_action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProposalType {
    ObservedPattern,
    ContextMatchedDecision,
    EfficiencyOpportunity,
    ContradictionFlag,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProposalStatus {
    Pending,
    Accepted,
    Rejected,
    Expired,
}

// ---------------------------------------------------------------------------
// Learning engine
// ---------------------------------------------------------------------------

pub struct LearningEngine {
    db: Arc<Mutex<Database>>,
    observations: RwLock<Vec<Observation>>,
}

impl LearningEngine {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self {
            db,
            observations: RwLock::new(Vec::new()),
        }
    }

    /// Record an observation, persist to DB, and return its ID.
    pub async fn record_observation(
        &self,
        actions: Vec<String>,
        tags: Vec<String>,
        outcome: ObservationOutcome,
    ) -> Result<String, LunaError> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        let obs = Observation {
            id: id.clone(),
            action_sequence: actions,
            context_tags: tags,
            timestamp: now,
            outcome,
        };

        // Persist
        let actions_json = serde_json::to_string(&obs.action_sequence)?;
        let tags_json = serde_json::to_string(&obs.context_tags)?;
        {
            let db = self.db.lock().await;
            db.conn().execute(
                "INSERT INTO learning_observations (id, actions_json, tags_json, outcome, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![obs.id, actions_json, tags_json, obs.outcome.to_string(), obs.timestamp],
            )?;
        }

        // Keep in memory
        {
            let mut mem = self.observations.write().await;
            mem.push(obs);
            // Cap in-memory buffer at 500
            if mem.len() > 500 {
                let excess = mem.len() - 500;
                mem.drain(..excess);
            }
        }

        Ok(id)
    }

    /// Return recent observations from the in-memory buffer.
    pub async fn get_recent_observations(&self, limit: usize) -> Vec<Observation> {
        let mem = self.observations.read().await;
        let start = if mem.len() > limit { mem.len() - limit } else { 0 };
        mem[start..].to_vec()
    }

    /// Scan recent observations for repeated action sequences.
    pub async fn check_for_patterns(&self) -> Vec<DetectedPattern> {
        let mem = self.observations.read().await;
        let action_seqs: Vec<Vec<String>> =
            mem.iter().map(|o| o.action_sequence.clone()).collect();

        if action_seqs.is_empty() {
            return Vec::new();
        }

        PatternDetector::find_repeated_sequences(&action_seqs, 2, 2)
    }

    /// Create a proposal from a detected pattern.
    pub fn generate_proposal(&self, pattern: &DetectedPattern) -> AutomationProposal {
        let description = format!(
            "Automate the sequence [{}] (seen {} times, confidence {:.0}%)",
            pattern.sequence.join(" -> "),
            pattern.frequency,
            pattern.confidence * 100.0,
        );
        let proposed_action = format!("auto:{}", pattern.sequence.join("_"));
        let trigger_description = format!(
            "When you perform '{}', auto-complete the remaining steps",
            pattern.sequence.first().map(|s| s.as_str()).unwrap_or("?")
        );

        AutomationProposal {
            id: Uuid::new_v4().to_string(),
            proposal_type: ProposalType::ObservedPattern,
            description,
            trigger_description,
            action_sequence: pattern.sequence.clone(),
            confidence: pattern.confidence,
            status: ProposalStatus::Pending,
            created_at: chrono::Utc::now().timestamp(),
            dismissed_at: None,
            pattern: pattern.clone(),
            proposed_action,
        }
    }

    /// Generate proposals from high-confidence patterns.
    ///
    /// Scans recent observations for repeated patterns and decision patterns,
    /// then returns up to `max_count` proposals sorted by confidence.
    pub async fn generate_proposals(&self, max_count: usize) -> Vec<AutomationProposal> {
        use super::pattern_detector::PatternDetector;

        let mem = self.observations.read().await;
        if mem.is_empty() {
            return Vec::new();
        }

        let mut proposals: Vec<AutomationProposal> = Vec::new();

        // 1. Sequence-based proposals (ObservedPattern)
        let action_seqs: Vec<Vec<String>> =
            mem.iter().map(|o| o.action_sequence.clone()).collect();
        let patterns = PatternDetector::find_repeated_sequences(&action_seqs, 2, 2);
        for pattern in &patterns {
            if pattern.confidence >= 0.3 {
                proposals.push(self.generate_proposal(pattern));
            }
        }

        // 2. Decision-based proposals (ContextMatchedDecision)
        let decision_patterns = PatternDetector::detect_decision_patterns(&mem);
        for dp in &decision_patterns {
            if dp.confidence >= 0.3 {
                let description = format!(
                    "When context is [{}], you consistently choose '{}' ({} times, {:.0}% confidence)",
                    dp.context_tags.join(", "),
                    dp.chosen_option,
                    dp.frequency,
                    dp.confidence * 100.0,
                );
                let trigger_description = format!(
                    "Auto-select '{}' when context matches [{}]",
                    dp.chosen_option,
                    dp.context_tags.join(", "),
                );
                let pattern = DetectedPattern {
                    sequence: vec![dp.chosen_option.clone()],
                    frequency: dp.frequency,
                    confidence: dp.confidence,
                    context_tags: dp.context_tags.clone(),
                };
                proposals.push(AutomationProposal {
                    id: Uuid::new_v4().to_string(),
                    proposal_type: ProposalType::ContextMatchedDecision,
                    description,
                    trigger_description,
                    action_sequence: vec![dp.chosen_option.clone()],
                    confidence: dp.confidence,
                    status: ProposalStatus::Pending,
                    created_at: chrono::Utc::now().timestamp(),
                    dismissed_at: None,
                    pattern,
                    proposed_action: format!("auto_decision:{}", dp.chosen_option),
                });
            }
        }

        // 3. Efficiency opportunity: detect corrected observations that could be avoided
        let corrected_count = mem.iter().filter(|o| o.outcome == ObservationOutcome::Corrected).count();
        if corrected_count >= 3 {
            // Find the most common corrected sequence
            let corrected_seqs: Vec<Vec<String>> = mem
                .iter()
                .filter(|o| o.outcome == ObservationOutcome::Corrected)
                .map(|o| o.action_sequence.clone())
                .collect();
            let corrected_patterns = PatternDetector::find_repeated_sequences(&corrected_seqs, 2, 2);
            for cp in &corrected_patterns {
                let pattern = cp.clone();
                proposals.push(AutomationProposal {
                    id: Uuid::new_v4().to_string(),
                    proposal_type: ProposalType::EfficiencyOpportunity,
                    description: format!(
                        "You frequently correct the sequence [{}] — consider an alternative workflow",
                        cp.sequence.join(" -> "),
                    ),
                    trigger_description: format!(
                        "Suggest alternative when you start with '{}'",
                        cp.sequence.first().map(|s| s.as_str()).unwrap_or("?"),
                    ),
                    action_sequence: cp.sequence.clone(),
                    confidence: cp.confidence,
                    status: ProposalStatus::Pending,
                    created_at: chrono::Utc::now().timestamp(),
                    dismissed_at: None,
                    pattern,
                    proposed_action: format!("efficiency:{}", cp.sequence.join("_")),
                });
            }
        }

        // Sort by confidence descending, take top max_count
        proposals.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
        proposals.truncate(max_count);
        proposals
    }

    /// Track how often a user approves actions of a given type.
    /// Returns a ratio in [0.0, 1.0].
    pub async fn get_approval_rate(&self, action_type: &str) -> f64 {
        let db = self.db.lock().await;
        let result: Option<(i64, i64)> = db
            .conn()
            .query_row(
                "SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as approved
                 FROM learning_observations
                 WHERE actions_json LIKE ?1",
                rusqlite::params![format!("%\"{action_type}\"%")],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();

        match result {
            Some((total, approved)) if total > 0 => approved as f64 / total as f64,
            _ => 0.5, // neutral default
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_engine() -> LearningEngine {
        let db = Arc::new(Mutex::new(
            Database::new(":memory:").expect("in-memory DB"),
        ));
        LearningEngine::new(db)
    }

    #[tokio::test]
    async fn test_record_and_retrieve_observation() {
        let engine = make_engine();
        let id = engine
            .record_observation(
                vec!["open".into(), "edit".into()],
                vec!["coding".into()],
                ObservationOutcome::Success,
            )
            .await
            .expect("record");

        assert!(!id.is_empty());
        let recent = engine.get_recent_observations(10).await;
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].action_sequence, vec!["open", "edit"]);
    }

    #[tokio::test]
    async fn test_check_for_patterns_detects_repeats() {
        let engine = make_engine();

        // Record the same sequence 3 times
        for _ in 0..3 {
            engine
                .record_observation(
                    vec!["open".into(), "edit".into(), "save".into()],
                    vec!["coding".into()],
                    ObservationOutcome::Success,
                )
                .await
                .expect("record");
        }

        let patterns = engine.check_for_patterns().await;
        assert!(!patterns.is_empty(), "should detect repeated sequences");
        let has_open_edit = patterns
            .iter()
            .any(|p| p.sequence.contains(&"open".to_string()));
        assert!(has_open_edit);
    }

    #[tokio::test]
    async fn test_generate_proposal_from_pattern() {
        let engine = make_engine();
        let pattern = DetectedPattern {
            sequence: vec!["open".into(), "edit".into()],
            frequency: 5,
            confidence: 0.8,
            context_tags: vec![],
        };
        let proposal = engine.generate_proposal(&pattern);
        assert_eq!(proposal.status, ProposalStatus::Pending);
        assert_eq!(proposal.proposal_type, ProposalType::ObservedPattern);
        assert!(proposal.description.contains("open -> edit"));
        assert!(proposal.proposed_action.starts_with("auto:"));
        assert_eq!(proposal.action_sequence, vec!["open", "edit"]);
        assert!((proposal.confidence - 0.8).abs() < f64::EPSILON);
        assert!(proposal.dismissed_at.is_none());
    }

    #[tokio::test]
    async fn test_get_recent_observations_limit() {
        let engine = make_engine();
        for i in 0..10 {
            engine
                .record_observation(
                    vec![format!("action-{i}")],
                    vec![],
                    ObservationOutcome::Success,
                )
                .await
                .expect("record");
        }

        let recent = engine.get_recent_observations(3).await;
        assert_eq!(recent.len(), 3);
        // Should be the last 3
        assert_eq!(recent[0].action_sequence[0], "action-7");
        assert_eq!(recent[2].action_sequence[0], "action-9");
    }

    #[tokio::test]
    async fn test_get_approval_rate_default() {
        let engine = make_engine();
        let rate = engine.get_approval_rate("nonexistent").await;
        assert!((rate - 0.5).abs() < f64::EPSILON, "default should be 0.5");
    }
}
