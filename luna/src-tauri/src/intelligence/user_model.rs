use std::collections::HashMap;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};

use crate::error::LunaError;
use crate::persistence::db::Database;

// ---------------------------------------------------------------------------
// Decay constants (halflives in days)
// ---------------------------------------------------------------------------

/// Cognitive style: 60-day halflife
pub const DECAY_HALFLIFE_COGNITIVE_DAYS: f64 = 60.0;
/// Work patterns: 14-day halflife
pub const DECAY_HALFLIFE_WORK_PATTERNS_DAYS: f64 = 14.0;
/// Interaction style: 30-day halflife
pub const DECAY_HALFLIFE_INTERACTION_DAYS: f64 = 30.0;
/// Expertise: 90-day halflife
pub const DECAY_HALFLIFE_EXPERTISE_DAYS: f64 = 90.0;
/// Contextual: 1-day halflife (effectively real-time)
pub const DECAY_HALFLIFE_CONTEXTUAL_DAYS: f64 = 1.0;

// ---------------------------------------------------------------------------
// Signal types for the signal collector
// ---------------------------------------------------------------------------

/// Represents a single user interaction signal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSignal {
    pub timestamp: i64,
    pub source: String,
    pub signal_type: SignalType,
    pub value: f64,
    pub context: SignalContext,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SignalType {
    KeyboardShortcutUsed,
    CorrectionGiven,
    FeedbackReceived,
    ActionTaken,
    OverrideMade,
    SessionStart,
    SessionEnd,
    BreakDetected,
    TaskSwitch,
    ExplicitPreference,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalContext {
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub task_in_progress: Option<String>,
    #[serde(default)]
    pub device: Option<String>,
}

impl Default for SignalContext {
    fn default() -> Self {
        Self {
            session_id: None,
            task_in_progress: None,
            device: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Model audit entry
// ---------------------------------------------------------------------------

/// Records a single update to the user model (for privacy audit trail).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelAuditEntry {
    pub timestamp: i64,
    pub dimension: String,
    pub field: String,
    pub old_value: f64,
    pub new_value: f64,
    pub source: String,
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserModel {
    pub user_id: String,
    pub cognitive_style: CognitiveStyle,
    pub work_patterns: WorkPatterns,
    pub interaction_style: InteractionStyle,
    pub expertise: ExpertiseProfile,
    pub contextual_state: ContextualState,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveStyle {
    pub verbosity_preference: f64,
    pub detail_orientation: f64,
    pub learning_style: String,
    pub decision_speed: f64,
    /// Tolerates / likes complex systems (0.0-1.0)
    #[serde(default = "default_half")]
    pub comfort_with_complexity: f64,
    /// Learns from examples vs. abstract theory (0.0-1.0)
    #[serde(default = "default_half")]
    pub preference_for_examples: f64,
    /// Comfort with uncertainty (0.0-1.0)
    #[serde(default = "default_half")]
    pub risk_tolerance: f64,
    /// 0.0 = brief, 1.0 = exhaustive
    #[serde(default = "default_half")]
    pub explanation_depth_wanted: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkPatterns {
    pub peak_hours: Vec<u8>,
    pub avg_session_duration_mins: f64,
    pub multitasking_tendency: f64,
    pub break_frequency_mins: f64,
    /// Average length of a work session in minutes
    #[serde(default = "default_session_minutes")]
    pub average_session_minutes: f64,
    /// How regular break-taking is (0.0-1.0)
    #[serde(default = "default_half")]
    pub break_regularity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractionStyle {
    pub preferred_input: String,
    pub shortcut_usage: f64,
    pub correction_frequency: f64,
    pub feedback_tendency: f64,
    /// How often the user overrides agent suggestions (0.0-1.0)
    #[serde(default = "default_low")]
    pub override_frequency: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpertiseProfile {
    pub domains: HashMap<String, f64>,
    pub overall_technical_level: f64,
    /// Learning trajectory: -1.0 = declining, 0.0 = stable, 1.0 = improving
    #[serde(default)]
    pub learning_trajectory: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextualState {
    pub current_focus: Option<String>,
    pub energy_level: f64,
    pub urgency: f64,
}

// ---------------------------------------------------------------------------
// Serde default helpers
// ---------------------------------------------------------------------------

fn default_half() -> f64 {
    0.5
}
fn default_session_minutes() -> f64 {
    60.0
}
fn default_low() -> f64 {
    0.2
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

impl UserModel {
    pub fn default_for(user_id: &str) -> Self {
        Self {
            user_id: user_id.to_string(),
            cognitive_style: CognitiveStyle {
                verbosity_preference: 0.5,
                detail_orientation: 0.5,
                learning_style: "textual".to_string(),
                decision_speed: 0.5,
                comfort_with_complexity: 0.5,
                preference_for_examples: 0.5,
                risk_tolerance: 0.5,
                explanation_depth_wanted: 0.5,
            },
            work_patterns: WorkPatterns {
                peak_hours: vec![9, 10, 11, 14, 15, 16],
                avg_session_duration_mins: 60.0,
                multitasking_tendency: 0.5,
                break_frequency_mins: 90.0,
                average_session_minutes: 60.0,
                break_regularity: 0.5,
            },
            interaction_style: InteractionStyle {
                preferred_input: "keyboard".to_string(),
                shortcut_usage: 0.3,
                correction_frequency: 0.2,
                feedback_tendency: 0.3,
                override_frequency: 0.2,
            },
            expertise: ExpertiseProfile {
                domains: HashMap::new(),
                overall_technical_level: 0.5,
                learning_trajectory: 0.0,
            },
            contextual_state: ContextualState {
                current_focus: None,
                energy_level: 0.7,
                urgency: 0.3,
            },
            updated_at: chrono::Utc::now().timestamp(),
        }
    }
}

// ---------------------------------------------------------------------------
// Decay model
// ---------------------------------------------------------------------------

/// Compute the exponential decay factor for a given elapsed time.
/// Returns a weight in [0.0, 1.0] — 1.0 means no decay, 0.0 means fully decayed.
pub fn decay_factor(elapsed_days: f64, halflife_days: f64) -> f64 {
    if halflife_days <= 0.0 {
        return 0.0;
    }
    (-(elapsed_days.ln() * std::f64::consts::LN_2 / halflife_days).exp())
        .max(0.0)
        .min(1.0)
}

/// Compute exponential decay: weight = 0.5^(elapsed / halflife).
pub fn decay_weight(elapsed_days: f64, halflife_days: f64) -> f64 {
    if halflife_days <= 0.0 {
        return 0.0;
    }
    (0.5_f64).powf(elapsed_days / halflife_days)
}

/// Enum for user model dimensions with their halflives.
#[derive(Debug, Clone, Copy)]
pub enum ModelDimension {
    CognitiveStyle,
    WorkPatterns,
    InteractionStyle,
    Expertise,
    Contextual,
}

impl ModelDimension {
    /// Get the decay halflife in days for this dimension.
    pub fn halflife_days(&self) -> f64 {
        match self {
            ModelDimension::CognitiveStyle => DECAY_HALFLIFE_COGNITIVE_DAYS,
            ModelDimension::WorkPatterns => DECAY_HALFLIFE_WORK_PATTERNS_DAYS,
            ModelDimension::InteractionStyle => DECAY_HALFLIFE_INTERACTION_DAYS,
            ModelDimension::Expertise => DECAY_HALFLIFE_EXPERTISE_DAYS,
            ModelDimension::Contextual => DECAY_HALFLIFE_CONTEXTUAL_DAYS,
        }
    }
}

// ---------------------------------------------------------------------------
// Signal Collector
// ---------------------------------------------------------------------------

/// Buffers user signals and processes them on a 5-minute interval.
/// Signals are any user interaction: keyboard shortcut used, correction given,
/// feedback received, action taken, etc.
pub struct SignalCollector {
    buffer: RwLock<Vec<UserSignal>>,
    store: Arc<UserModelStore>,
}

impl SignalCollector {
    pub fn new(store: Arc<UserModelStore>) -> Self {
        Self {
            buffer: RwLock::new(Vec::new()),
            store,
        }
    }

    /// Add a signal to the buffer.
    pub async fn collect(&self, signal: UserSignal) {
        let mut buf = self.buffer.write().await;
        buf.push(signal);
    }

    /// Process all buffered signals and update the user model.
    /// Called every 5 minutes or on explicit flush.
    pub async fn flush(&self) -> Result<(), LunaError> {
        let signals = {
            let mut buf = self.buffer.write().await;
            std::mem::take(&mut *buf)
        };

        if signals.is_empty() {
            return Ok(());
        }

        // Filter low-confidence signals
        let signals: Vec<_> = signals.into_iter().filter(|s| s.confidence >= 0.5).collect();
        if signals.is_empty() {
            return Ok(());
        }

        // Group by signal type and aggregate
        let mut correction_count = 0usize;
        let mut override_count = 0usize;
        let mut shortcut_count = 0usize;
        let mut feedback_count = 0usize;
        let mut _action_count = 0usize;
        let mut _task_switch_count = 0usize;

        for signal in &signals {
            match signal.signal_type {
                SignalType::CorrectionGiven => correction_count += 1,
                SignalType::OverrideMade => override_count += 1,
                SignalType::KeyboardShortcutUsed => shortcut_count += 1,
                SignalType::FeedbackReceived => feedback_count += 1,
                SignalType::ActionTaken => _action_count += 1,
                SignalType::TaskSwitch => _task_switch_count += 1,
                _ => {}
            }
        }

        let total = signals.len().max(1) as f64;

        // Update interaction style based on signal ratios
        if correction_count > 0 {
            let ratio = (correction_count as f64 / total).clamp(0.0, 1.0);
            self.store.update_interaction_field("correction_frequency", ratio).await?;
        }
        if override_count > 0 {
            let ratio = (override_count as f64 / total).clamp(0.0, 1.0);
            self.store.update_interaction_field("override_frequency", ratio).await?;
        }
        if shortcut_count > 0 {
            self.store.record_interaction("shortcut").await?;
        }
        if feedback_count > 0 {
            self.store.record_interaction("feedback").await?;
        }

        Ok(())
    }

    /// Get the current number of buffered signals.
    pub async fn pending_count(&self) -> usize {
        self.buffer.read().await.len()
    }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

pub struct UserModelStore {
    db: Arc<Mutex<Database>>,
    cache: RwLock<Option<UserModel>>,
    audit_log: RwLock<Vec<ModelAuditEntry>>,
}

impl UserModelStore {
    pub fn new(db: Arc<Mutex<Database>>) -> Self {
        Self {
            db,
            cache: RwLock::new(None),
            audit_log: RwLock::new(Vec::new()),
        }
    }

    /// Load from DB or create a default model.
    pub async fn get_or_create(&self, user_id: &str) -> Result<UserModel, LunaError> {
        // Check cache first
        {
            let cached = self.cache.read().await;
            if let Some(ref m) = *cached {
                if m.user_id == user_id {
                    return Ok(m.clone());
                }
            }
        }

        let model = {
            let db = self.db.lock().await;
            let result: Option<String> = db
                .conn()
                .query_row(
                    "SELECT model_json FROM user_model WHERE user_id = ?1",
                    rusqlite::params![user_id],
                    |row| row.get(0),
                )
                .ok();

            match result {
                Some(json) => serde_json::from_str::<UserModel>(&json)?,
                None => {
                    let m = UserModel::default_for(user_id);
                    let json = serde_json::to_string(&m)?;
                    db.conn().execute(
                        "INSERT INTO user_model (user_id, model_json, updated_at) VALUES (?1, ?2, ?3)",
                        rusqlite::params![user_id, json, m.updated_at],
                    )?;
                    m
                }
            }
        };
        {
            let mut cached = self.cache.write().await;
            *cached = Some(model.clone());
        }
        Ok(model)
    }

    /// Persist the model to DB.
    pub async fn save(&self, model: &UserModel) -> Result<(), LunaError> {
        let json = serde_json::to_string(model)?;
        let db = self.db.lock().await;
        db.conn().execute(
            "INSERT OR REPLACE INTO user_model (user_id, model_json, updated_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![model.user_id, json, model.updated_at],
        )?;
        drop(db);

        let mut cached = self.cache.write().await;
        *cached = Some(model.clone());
        Ok(())
    }

    /// Record an audit entry for a model update.
    async fn record_audit(&self, dimension: &str, field: &str, old_value: f64, new_value: f64, source: &str) {
        let entry = ModelAuditEntry {
            timestamp: chrono::Utc::now().timestamp(),
            dimension: dimension.to_string(),
            field: field.to_string(),
            old_value,
            new_value,
            source: source.to_string(),
        };
        let mut log = self.audit_log.write().await;
        log.push(entry);
        // Keep last 500 entries
        if log.len() > 500 {
            let drain_count = log.len() - 500;
            log.drain(..drain_count);
        }
    }

    /// Get recent audit entries.
    pub async fn get_audit_log(&self, limit: usize) -> Vec<ModelAuditEntry> {
        let log = self.audit_log.read().await;
        let start = if log.len() > limit { log.len() - limit } else { 0 };
        log[start..].to_vec()
    }

    /// Reset the user model to defaults (privacy: delete model).
    pub async fn reset_to_defaults(&self, user_id: &str) -> Result<(), LunaError> {
        let model = UserModel::default_for(user_id);
        self.save(&model).await?;
        self.record_audit("all", "reset", 0.0, 0.0, "user_request").await;
        // Clear audit log on full reset
        let mut log = self.audit_log.write().await;
        log.clear();
        Ok(())
    }

    /// Bayesian-style update: blend prior expertise with new observation.
    pub async fn update_expertise(&self, domain: &str, delta: f64) -> Result<(), LunaError> {
        let mut model = {
            let cached = self.cache.read().await;
            cached.clone().ok_or_else(|| LunaError::Database("No model loaded".to_string()))?
        };

        let current = model.expertise.domains.get(domain).copied().unwrap_or(0.5);
        // Bayesian-ish: weighted blend (prior 0.7, observation 0.3)
        let new_observation = (current + delta).clamp(0.0, 1.0);
        let updated = (current * 0.7 + new_observation * 0.3).clamp(0.0, 1.0);
        model.expertise.domains.insert(domain.to_string(), updated);

        // Update learning trajectory: positive delta = improving, negative = declining
        let trajectory_alpha = 0.2;
        let direction = if delta > 0.0 { 1.0 } else if delta < 0.0 { -1.0 } else { 0.0 };
        let old_trajectory = model.expertise.learning_trajectory;
        model.expertise.learning_trajectory =
            (old_trajectory * (1.0 - trajectory_alpha) + direction * trajectory_alpha).clamp(-1.0, 1.0);

        model.updated_at = chrono::Utc::now().timestamp();

        self.record_audit("expertise", domain, current, updated, "bayesian_update").await;
        self.save(&model).await
    }

    /// Rolling average update for a cognitive style field.
    pub async fn update_cognitive_style(&self, field: &str, observed_value: f64) -> Result<(), LunaError> {
        let mut model = {
            let cached = self.cache.read().await;
            cached.clone().ok_or_else(|| LunaError::Database("No model loaded".to_string()))?
        };

        let alpha = 0.2; // rolling-average weight for new observation
        match field {
            "verbosity_preference" => {
                let v = &mut model.cognitive_style.verbosity_preference;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("cognitive_style", field, old, *v, "rolling_average").await;
            }
            "detail_orientation" => {
                let v = &mut model.cognitive_style.detail_orientation;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("cognitive_style", field, old, *v, "rolling_average").await;
            }
            "decision_speed" => {
                let v = &mut model.cognitive_style.decision_speed;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("cognitive_style", field, old, *v, "rolling_average").await;
            }
            "comfort_with_complexity" => {
                let v = &mut model.cognitive_style.comfort_with_complexity;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("cognitive_style", field, old, *v, "rolling_average").await;
            }
            "preference_for_examples" => {
                let v = &mut model.cognitive_style.preference_for_examples;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("cognitive_style", field, old, *v, "rolling_average").await;
            }
            "risk_tolerance" => {
                let v = &mut model.cognitive_style.risk_tolerance;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("cognitive_style", field, old, *v, "rolling_average").await;
            }
            "explanation_depth_wanted" => {
                let v = &mut model.cognitive_style.explanation_depth_wanted;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("cognitive_style", field, old, *v, "rolling_average").await;
            }
            _ => {
                return Err(LunaError::Database(format!(
                    "Unknown cognitive style field: {field}"
                )));
            }
        }

        model.updated_at = chrono::Utc::now().timestamp();
        self.save(&model).await
    }

    /// Track an interaction event (updates interaction style counters).
    pub async fn record_interaction(&self, interaction_type: &str) -> Result<(), LunaError> {
        let mut model = {
            let cached = self.cache.read().await;
            cached.clone().ok_or_else(|| LunaError::Database("No model loaded".to_string()))?
        };

        let alpha = 0.1;
        match interaction_type {
            "shortcut" => {
                let v = &mut model.interaction_style.shortcut_usage;
                let old = *v;
                *v = (*v * (1.0 - alpha) + 1.0 * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", "shortcut_usage", old, *v, "interaction").await;
            }
            "correction" => {
                let v = &mut model.interaction_style.correction_frequency;
                let old = *v;
                *v = (*v * (1.0 - alpha) + 1.0 * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", "correction_frequency", old, *v, "interaction").await;
            }
            "feedback" => {
                let v = &mut model.interaction_style.feedback_tendency;
                let old = *v;
                *v = (*v * (1.0 - alpha) + 1.0 * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", "feedback_tendency", old, *v, "interaction").await;
            }
            "override" => {
                let v = &mut model.interaction_style.override_frequency;
                let old = *v;
                *v = (*v * (1.0 - alpha) + 1.0 * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", "override_frequency", old, *v, "interaction").await;
            }
            _ => {} // ignore unknown types
        }

        model.updated_at = chrono::Utc::now().timestamp();
        self.save(&model).await
    }

    /// Update an interaction style field directly with a rolling average.
    pub async fn update_interaction_field(&self, field: &str, observed_value: f64) -> Result<(), LunaError> {
        let mut model = {
            let cached = self.cache.read().await;
            cached.clone().ok_or_else(|| LunaError::Database("No model loaded".to_string()))?
        };

        let alpha = 0.15;
        match field {
            "correction_frequency" => {
                let v = &mut model.interaction_style.correction_frequency;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", field, old, *v, "signal_collector").await;
            }
            "override_frequency" => {
                let v = &mut model.interaction_style.override_frequency;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", field, old, *v, "signal_collector").await;
            }
            "shortcut_usage" => {
                let v = &mut model.interaction_style.shortcut_usage;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", field, old, *v, "signal_collector").await;
            }
            "feedback_tendency" => {
                let v = &mut model.interaction_style.feedback_tendency;
                let old = *v;
                *v = (*v * (1.0 - alpha) + observed_value * alpha).clamp(0.0, 1.0);
                self.record_audit("interaction_style", field, old, *v, "signal_collector").await;
            }
            _ => {
                return Err(LunaError::Database(format!(
                    "Unknown interaction style field: {field}"
                )));
            }
        }

        model.updated_at = chrono::Utc::now().timestamp();
        self.save(&model).await
    }

    /// Convenience: get verbosity level from cache.
    pub async fn get_verbosity_level(&self) -> f64 {
        let cached = self.cache.read().await;
        cached
            .as_ref()
            .map(|m| m.cognitive_style.verbosity_preference)
            .unwrap_or(0.5)
    }

    /// Convenience: get expertise for a domain from cache.
    pub async fn get_expertise_for(&self, domain: &str) -> f64 {
        let cached = self.cache.read().await;
        cached
            .as_ref()
            .and_then(|m| m.expertise.domains.get(domain).copied())
            .unwrap_or(0.0)
    }

    /// Apply decay to the user model based on elapsed time since last update.
    /// Call this periodically (e.g., on session start) to let old signals fade.
    pub async fn decay_model(&self) -> Result<(), LunaError> {
        let mut model = {
            let cached = self.cache.read().await;
            cached.clone().ok_or_else(|| LunaError::Database("No model loaded".to_string()))?
        };

        let now = chrono::Utc::now().timestamp();
        let elapsed_secs = (now - model.updated_at).max(0) as f64;
        let elapsed_days = elapsed_secs / 86400.0;

        if elapsed_days < 0.01 {
            // Less than ~15 minutes, skip decay
            return Ok(());
        }

        // Decay each dimension toward its default (0.5) with dimension-specific halflives
        let decay_toward_default = |value: f64, halflife: f64| -> f64 {
            let w = decay_weight(elapsed_days, halflife);
            // Blend current value toward 0.5 (default/neutral)
            0.5 + (value - 0.5) * w
        };

        // Cognitive style (60-day halflife)
        let hl = ModelDimension::CognitiveStyle.halflife_days();
        model.cognitive_style.verbosity_preference =
            decay_toward_default(model.cognitive_style.verbosity_preference, hl);
        model.cognitive_style.detail_orientation =
            decay_toward_default(model.cognitive_style.detail_orientation, hl);
        model.cognitive_style.decision_speed =
            decay_toward_default(model.cognitive_style.decision_speed, hl);
        model.cognitive_style.comfort_with_complexity =
            decay_toward_default(model.cognitive_style.comfort_with_complexity, hl);
        model.cognitive_style.preference_for_examples =
            decay_toward_default(model.cognitive_style.preference_for_examples, hl);
        model.cognitive_style.risk_tolerance =
            decay_toward_default(model.cognitive_style.risk_tolerance, hl);
        model.cognitive_style.explanation_depth_wanted =
            decay_toward_default(model.cognitive_style.explanation_depth_wanted, hl);

        // Work patterns (14-day halflife)
        let hl = ModelDimension::WorkPatterns.halflife_days();
        model.work_patterns.multitasking_tendency =
            decay_toward_default(model.work_patterns.multitasking_tendency, hl);
        model.work_patterns.break_regularity =
            decay_toward_default(model.work_patterns.break_regularity, hl);

        // Interaction style (30-day halflife)
        let hl = ModelDimension::InteractionStyle.halflife_days();
        model.interaction_style.shortcut_usage =
            decay_toward_default(model.interaction_style.shortcut_usage, hl);
        model.interaction_style.correction_frequency =
            decay_toward_default(model.interaction_style.correction_frequency, hl);
        model.interaction_style.feedback_tendency =
            decay_toward_default(model.interaction_style.feedback_tendency, hl);
        model.interaction_style.override_frequency =
            decay_toward_default(model.interaction_style.override_frequency, hl);

        // Expertise (90-day halflife)
        let hl = ModelDimension::Expertise.halflife_days();
        let domains: Vec<String> = model.expertise.domains.keys().cloned().collect();
        for domain in domains {
            if let Some(v) = model.expertise.domains.get_mut(&domain) {
                *v = decay_toward_default(*v, hl);
            }
        }
        model.expertise.learning_trajectory =
            model.expertise.learning_trajectory * decay_weight(elapsed_days, hl);

        // Contextual (1-day halflife — nearly reset)
        let hl = ModelDimension::Contextual.halflife_days();
        model.contextual_state.energy_level =
            decay_toward_default(model.contextual_state.energy_level, hl);
        model.contextual_state.urgency =
            decay_toward_default(model.contextual_state.urgency, hl);

        model.updated_at = now;
        self.save(&model).await
    }

    /// Estimate cognitive load from system state.
    ///
    /// Factors:
    /// - `open_window_count`: number of currently open windows
    /// - `session_minutes`: minutes since session started
    /// - `task_switch_count`: number of task switches in this session (from episodic memory)
    ///
    /// Returns a score in [0.0, 1.0].
    pub fn estimate_cognitive_load(
        &self,
        open_window_count: usize,
        session_minutes: f64,
        task_switch_count: usize,
    ) -> f64 {
        // Window factor: 0 windows = 0.0, 10+ windows = 1.0
        let window_factor = (open_window_count as f64 / 10.0).clamp(0.0, 1.0);

        // Session duration factor: longer sessions = higher load
        // 0 min = 0.0, 240+ min (4 hrs) = 1.0
        let session_factor = (session_minutes / 240.0).clamp(0.0, 1.0);

        // Task switching factor: 0 switches = 0.0, 20+ switches = 1.0
        let switch_factor = (task_switch_count as f64 / 20.0).clamp(0.0, 1.0);

        // Weighted combination
        let load = window_factor * 0.3 + session_factor * 0.3 + switch_factor * 0.4;
        load.clamp(0.0, 1.0)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> UserModelStore {
        let db = Arc::new(Mutex::new(
            Database::new(":memory:").expect("in-memory DB"),
        ));
        UserModelStore::new(db)
    }

    #[tokio::test]
    async fn test_get_or_create_returns_default() {
        let store = make_store();
        let model = store.get_or_create("user-1").await.expect("get_or_create");
        assert_eq!(model.user_id, "user-1");
        assert!((model.cognitive_style.verbosity_preference - 0.5).abs() < f64::EPSILON);
        assert!(model.expertise.domains.is_empty());
    }

    #[tokio::test]
    async fn test_save_and_reload() {
        let store = make_store();
        let mut model = store.get_or_create("user-1").await.expect("create");
        model.cognitive_style.verbosity_preference = 0.9;
        store.save(&model).await.expect("save");

        // Clear cache to force DB read
        {
            let mut cached = store.cache.write().await;
            *cached = None;
        }

        let reloaded = store.get_or_create("user-1").await.expect("reload");
        assert!((reloaded.cognitive_style.verbosity_preference - 0.9).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_update_expertise_bayesian() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");

        store.update_expertise("rust", 0.3).await.expect("update");
        let level = store.get_expertise_for("rust").await;
        // Prior was 0.5 (default for new domain), delta 0.3
        // new_observation = clamp(0.5 + 0.3, 0, 1) = 0.8
        // updated = (0.5 * 0.7 + 0.8 * 0.3) = 0.35 + 0.24 = 0.59
        assert!(level > 0.5, "expertise should have increased, got {level}");
        assert!(level < 1.0);
    }

    #[tokio::test]
    async fn test_update_cognitive_style_rolling_average() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");

        // Push verbosity toward 1.0
        store
            .update_cognitive_style("verbosity_preference", 1.0)
            .await
            .expect("update");
        let v = store.get_verbosity_level().await;
        // 0.5 * 0.8 + 1.0 * 0.2 = 0.6
        assert!(
            (v - 0.6).abs() < 0.01,
            "expected ~0.6, got {v}"
        );
    }

    #[tokio::test]
    async fn test_record_interaction_updates_style() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");
        let initial = {
            let c = store.cache.read().await;
            c.as_ref().unwrap().interaction_style.shortcut_usage
        };

        store.record_interaction("shortcut").await.expect("record");
        let after = {
            let c = store.cache.read().await;
            c.as_ref().unwrap().interaction_style.shortcut_usage
        };
        assert!(after > initial, "shortcut_usage should increase");
    }

    #[tokio::test]
    async fn test_unknown_cognitive_field_errors() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");
        let result = store.update_cognitive_style("nonexistent", 0.5).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_new_cognitive_style_fields_default() {
        let store = make_store();
        let model = store.get_or_create("user-1").await.expect("create");
        assert!((model.cognitive_style.comfort_with_complexity - 0.5).abs() < f64::EPSILON);
        assert!((model.cognitive_style.preference_for_examples - 0.5).abs() < f64::EPSILON);
        assert!((model.cognitive_style.risk_tolerance - 0.5).abs() < f64::EPSILON);
        assert!((model.cognitive_style.explanation_depth_wanted - 0.5).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_new_work_pattern_fields_default() {
        let store = make_store();
        let model = store.get_or_create("user-1").await.expect("create");
        assert!((model.work_patterns.average_session_minutes - 60.0).abs() < f64::EPSILON);
        assert!((model.work_patterns.break_regularity - 0.5).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_override_frequency_default() {
        let store = make_store();
        let model = store.get_or_create("user-1").await.expect("create");
        assert!((model.interaction_style.override_frequency - 0.2).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_learning_trajectory_default() {
        let store = make_store();
        let model = store.get_or_create("user-1").await.expect("create");
        assert!((model.expertise.learning_trajectory - 0.0).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_cognitive_load_estimation() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");

        // Low load: few windows, short session, no switches
        let load = store.estimate_cognitive_load(2, 30.0, 1);
        assert!(load < 0.3, "expected low load, got {load}");

        // High load: many windows, long session, many switches
        let load = store.estimate_cognitive_load(12, 300.0, 25);
        assert!(load > 0.8, "expected high load, got {load}");
    }

    #[test]
    fn test_decay_weight_function() {
        // At 0 days elapsed, weight should be 1.0
        let w = decay_weight(0.0, 30.0);
        assert!((w - 1.0).abs() < f64::EPSILON);

        // At exactly one halflife, weight should be 0.5
        let w = decay_weight(30.0, 30.0);
        assert!((w - 0.5).abs() < 0.001);

        // At two halflives, weight should be 0.25
        let w = decay_weight(60.0, 30.0);
        assert!((w - 0.25).abs() < 0.001);
    }

    #[tokio::test]
    async fn test_audit_log() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");
        store.update_cognitive_style("verbosity_preference", 0.9).await.expect("update");
        let log = store.get_audit_log(10).await;
        assert!(!log.is_empty());
        assert_eq!(log[0].dimension, "cognitive_style");
        assert_eq!(log[0].field, "verbosity_preference");
    }

    #[tokio::test]
    async fn test_reset_to_defaults() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");
        store.update_cognitive_style("verbosity_preference", 0.9).await.expect("update");
        store.reset_to_defaults("user-1").await.expect("reset");

        let model = store.get_or_create("user-1").await.expect("reload");
        assert!((model.cognitive_style.verbosity_preference - 0.5).abs() < f64::EPSILON);
    }

    #[tokio::test]
    async fn test_update_new_cognitive_fields() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");

        store.update_cognitive_style("comfort_with_complexity", 0.8).await.expect("update");
        store.update_cognitive_style("risk_tolerance", 0.3).await.expect("update");
        store.update_cognitive_style("preference_for_examples", 0.9).await.expect("update");
        store.update_cognitive_style("explanation_depth_wanted", 0.1).await.expect("update");

        let model = {
            let c = store.cache.read().await;
            c.clone().unwrap()
        };
        // comfort_with_complexity: 0.5 * 0.8 + 0.8 * 0.2 = 0.56
        assert!(model.cognitive_style.comfort_with_complexity > 0.5);
        assert!(model.cognitive_style.risk_tolerance < 0.5);
    }

    #[tokio::test]
    async fn test_record_override_interaction() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");
        let initial = {
            let c = store.cache.read().await;
            c.as_ref().unwrap().interaction_style.override_frequency
        };

        store.record_interaction("override").await.expect("record");
        let after = {
            let c = store.cache.read().await;
            c.as_ref().unwrap().interaction_style.override_frequency
        };
        assert!(after > initial, "override_frequency should increase");
    }

    #[tokio::test]
    async fn test_expertise_learning_trajectory_updates() {
        let store = make_store();
        store.get_or_create("user-1").await.expect("create");

        // Positive delta should push trajectory positive
        store.update_expertise("rust", 0.2).await.expect("update");
        let model = {
            let c = store.cache.read().await;
            c.clone().unwrap()
        };
        assert!(model.expertise.learning_trajectory > 0.0, "trajectory should be positive");

        // Negative delta should pull trajectory down
        store.update_expertise("rust", -0.3).await.expect("update");
        let model = {
            let c = store.cache.read().await;
            c.clone().unwrap()
        };
        // After positive then negative, trajectory is mixed
        // 0.0 * 0.8 + 1.0 * 0.2 = 0.2  (first update)
        // 0.2 * 0.8 + (-1.0) * 0.2 = -0.04  (second update)
        assert!(model.expertise.learning_trajectory < 0.1);
    }

    #[test]
    fn test_backward_compat_deserialization() {
        // Simulate an old model JSON without the new fields
        let old_json = r#"{
            "user_id": "old-user",
            "cognitive_style": {
                "verbosity_preference": 0.7,
                "detail_orientation": 0.6,
                "learning_style": "visual",
                "decision_speed": 0.4
            },
            "work_patterns": {
                "peak_hours": [9, 10, 11],
                "avg_session_duration_mins": 45.0,
                "multitasking_tendency": 0.3,
                "break_frequency_mins": 60.0
            },
            "interaction_style": {
                "preferred_input": "mouse",
                "shortcut_usage": 0.1,
                "correction_frequency": 0.5,
                "feedback_tendency": 0.4
            },
            "expertise": {
                "domains": {},
                "overall_technical_level": 0.8
            },
            "contextual_state": {
                "current_focus": null,
                "energy_level": 0.5,
                "urgency": 0.2
            },
            "updated_at": 1700000000
        }"#;

        let model: UserModel = serde_json::from_str(old_json).expect("should deserialize old format");
        assert_eq!(model.user_id, "old-user");
        // New fields should have their serde defaults
        assert!((model.cognitive_style.comfort_with_complexity - 0.5).abs() < f64::EPSILON);
        assert!((model.cognitive_style.preference_for_examples - 0.5).abs() < f64::EPSILON);
        assert!((model.cognitive_style.risk_tolerance - 0.5).abs() < f64::EPSILON);
        assert!((model.cognitive_style.explanation_depth_wanted - 0.5).abs() < f64::EPSILON);
        assert!((model.work_patterns.average_session_minutes - 60.0).abs() < f64::EPSILON);
        assert!((model.work_patterns.break_regularity - 0.5).abs() < f64::EPSILON);
        assert!((model.interaction_style.override_frequency - 0.2).abs() < f64::EPSILON);
        assert!((model.expertise.learning_trajectory - 0.0).abs() < f64::EPSILON);
    }
}
