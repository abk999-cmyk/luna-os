use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use crate::error::LunaError;

// ---------------------------------------------------------------------------
// ModelConfig & ModelHierarchy
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub provider: String,
    pub model_id: String,
    pub max_tokens: u32,
    pub temperature: f64,
    pub requests_per_minute: u32,
    pub tokens_per_minute: u32,
    pub cost_per_1k_input: f64,
    pub cost_per_1k_output: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelHierarchy {
    pub conductor: ModelConfig,
    pub orchestrator: ModelConfig,
    pub leaf: ModelConfig,
    pub fallback: ModelConfig,
}

impl ModelHierarchy {
    pub fn default_hierarchy() -> Self {
        Self {
            conductor: ModelConfig {
                provider: "anthropic".into(),
                model_id: "claude-sonnet-4-20250514".into(),
                max_tokens: 4096,
                temperature: 0.7,
                requests_per_minute: 50,
                tokens_per_minute: 100_000,
                cost_per_1k_input: 0.003,
                cost_per_1k_output: 0.015,
            },
            orchestrator: ModelConfig {
                provider: "anthropic".into(),
                model_id: "claude-sonnet-4-20250514".into(),
                max_tokens: 4096,
                temperature: 0.5,
                requests_per_minute: 50,
                tokens_per_minute: 100_000,
                cost_per_1k_input: 0.003,
                cost_per_1k_output: 0.015,
            },
            leaf: ModelConfig {
                provider: "anthropic".into(),
                model_id: "claude-haiku-4-5-20251001".into(),
                max_tokens: 2048,
                temperature: 0.3,
                requests_per_minute: 100,
                tokens_per_minute: 200_000,
                cost_per_1k_input: 0.001,
                cost_per_1k_output: 0.005,
            },
            fallback: ModelConfig {
                provider: "anthropic".into(),
                model_id: "claude-haiku-4-5-20251001".into(),
                max_tokens: 2048,
                temperature: 0.3,
                requests_per_minute: 100,
                tokens_per_minute: 200_000,
                cost_per_1k_input: 0.001,
                cost_per_1k_output: 0.005,
            },
        }
    }
}

// ---------------------------------------------------------------------------
// AgentLevel
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgentLevel {
    Conductor,
    Orchestrator,
    Leaf,
}

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

pub struct ModelRouter {
    hierarchy: ModelHierarchy,
}

impl ModelRouter {
    pub fn new(hierarchy: ModelHierarchy) -> Self {
        Self { hierarchy }
    }

    pub fn select_model(&self, agent_level: &AgentLevel) -> &ModelConfig {
        match agent_level {
            AgentLevel::Conductor => &self.hierarchy.conductor,
            AgentLevel::Orchestrator => &self.hierarchy.orchestrator,
            AgentLevel::Leaf => &self.hierarchy.leaf,
        }
    }

    pub fn get_fallback(&self) -> &ModelConfig {
        &self.hierarchy.fallback
    }

    pub fn update_hierarchy(&mut self, hierarchy: ModelHierarchy) {
        self.hierarchy = hierarchy;
    }
}

// ---------------------------------------------------------------------------
// UsageTracker — tracks token usage and cost per agent level
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LevelUsage {
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_requests: u64,
    pub total_cost: f64,
}

pub struct UsageTracker {
    usage: Mutex<HashMap<AgentLevel, LevelUsage>>,
}

impl UsageTracker {
    pub fn new() -> Self {
        Self {
            usage: Mutex::new(HashMap::new()),
        }
    }

    /// Record token usage for a given agent level, computing cost from the model config.
    pub fn record(
        &self,
        level: &AgentLevel,
        input_tokens: u32,
        output_tokens: u32,
        config: &ModelConfig,
    ) {
        let input_cost = (input_tokens as f64 / 1000.0) * config.cost_per_1k_input;
        let output_cost = (output_tokens as f64 / 1000.0) * config.cost_per_1k_output;

        let mut map = self.usage.lock().unwrap();
        let entry = map.entry(level.clone()).or_default();
        entry.total_input_tokens += input_tokens as u64;
        entry.total_output_tokens += output_tokens as u64;
        entry.total_requests += 1;
        entry.total_cost += input_cost + output_cost;
    }

    /// Get usage snapshot for a given agent level.
    pub fn get_usage(&self, level: &AgentLevel) -> LevelUsage {
        let map = self.usage.lock().unwrap();
        map.get(level).cloned().unwrap_or_default()
    }

    /// Get total cost across all levels.
    pub fn total_cost(&self) -> f64 {
        let map = self.usage.lock().unwrap();
        map.values().map(|u| u.total_cost).sum()
    }

    /// Reset all tracked usage.
    pub fn reset(&self) {
        let mut map = self.usage.lock().unwrap();
        map.clear();
    }
}

impl Default for UsageTracker {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// RateLimiter — per-agent-level request rate limiting
// ---------------------------------------------------------------------------

struct RateBucket {
    timestamps: Vec<Instant>,
    limit: u32,
}

impl RateBucket {
    fn new(limit: u32) -> Self {
        Self {
            timestamps: Vec::new(),
            limit,
        }
    }

    /// Returns `true` if a request is allowed (under the per-minute limit).
    fn check_and_record(&mut self) -> bool {
        let now = Instant::now();
        let one_minute_ago = now - std::time::Duration::from_secs(60);
        self.timestamps.retain(|t| *t >= one_minute_ago);

        if (self.timestamps.len() as u32) < self.limit {
            self.timestamps.push(now);
            true
        } else {
            false
        }
    }
}

pub struct RateLimiter {
    buckets: Mutex<HashMap<AgentLevel, RateBucket>>,
}

impl RateLimiter {
    pub fn from_hierarchy(hierarchy: &ModelHierarchy) -> Self {
        let mut buckets = HashMap::new();
        buckets.insert(
            AgentLevel::Conductor,
            RateBucket::new(hierarchy.conductor.requests_per_minute),
        );
        buckets.insert(
            AgentLevel::Orchestrator,
            RateBucket::new(hierarchy.orchestrator.requests_per_minute),
        );
        buckets.insert(
            AgentLevel::Leaf,
            RateBucket::new(hierarchy.leaf.requests_per_minute),
        );
        Self {
            buckets: Mutex::new(buckets),
        }
    }

    /// Check whether a request at the given agent level is within the rate limit.
    /// If allowed, records the request and returns `Ok(())`.
    /// If the limit is exceeded, returns an error.
    pub fn check(&self, level: &AgentLevel) -> Result<(), LunaError> {
        let mut buckets = self.buckets.lock().unwrap();
        if let Some(bucket) = buckets.get_mut(level) {
            if bucket.check_and_record() {
                Ok(())
            } else {
                Err(LunaError::Api(format!(
                    "Rate limit exceeded for {:?} agent level ({} req/min)",
                    level, bucket.limit
                )))
            }
        } else {
            // No bucket configured — allow by default.
            Ok(())
        }
    }

    /// Update limits from a new hierarchy configuration.
    pub fn update_limits(&self, hierarchy: &ModelHierarchy) {
        let mut buckets = self.buckets.lock().unwrap();
        if let Some(b) = buckets.get_mut(&AgentLevel::Conductor) {
            b.limit = hierarchy.conductor.requests_per_minute;
        }
        if let Some(b) = buckets.get_mut(&AgentLevel::Orchestrator) {
            b.limit = hierarchy.orchestrator.requests_per_minute;
        }
        if let Some(b) = buckets.get_mut(&AgentLevel::Leaf) {
            b.limit = hierarchy.leaf.requests_per_minute;
        }
    }
}

// ---------------------------------------------------------------------------
// ContextWindowBudget
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextWindowBudget {
    pub total_tokens: u32,
    pub system_prompt_tokens: u32,
    pub conversation_history_tokens: u32,
    pub tool_context_tokens: u32,
    pub working_memory_tokens: u32,
    pub response_reserve_tokens: u32,
}

impl ContextWindowBudget {
    /// Allocate a context window budget given total token capacity and the
    /// measured length of the system prompt (in tokens).
    pub fn allocate(total: u32, system_prompt_len: u32) -> Self {
        let response_reserve = total / 4; // 25% for response
        let remaining = total.saturating_sub(system_prompt_len).saturating_sub(response_reserve);
        let conversation = remaining * 50 / 100; // 50% of remaining
        let tool_context = remaining * 30 / 100; // 30% of remaining
        let working_memory = remaining * 20 / 100; // 20% of remaining

        Self {
            total_tokens: total,
            system_prompt_tokens: system_prompt_len,
            conversation_history_tokens: conversation,
            tool_context_tokens: tool_context,
            working_memory_tokens: working_memory,
            response_reserve_tokens: response_reserve,
        }
    }

    pub fn available_for_history(&self) -> u32 {
        self.conversation_history_tokens
    }

    pub fn available_for_tools(&self) -> u32 {
        self.tool_context_tokens
    }

    pub fn available_for_working_memory(&self) -> u32 {
        self.working_memory_tokens
    }

    /// Total tokens currently allocated (should not exceed `total_tokens`).
    pub fn allocated(&self) -> u32 {
        self.system_prompt_tokens
            + self.conversation_history_tokens
            + self.tool_context_tokens
            + self.working_memory_tokens
            + self.response_reserve_tokens
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- ModelRouter tests --------------------------------------------------

    #[test]
    fn test_default_hierarchy_values() {
        let h = ModelHierarchy::default_hierarchy();
        assert_eq!(h.conductor.model_id, "claude-sonnet-4-20250514");
        assert_eq!(h.leaf.model_id, "claude-haiku-4-5-20251001");
        assert_eq!(h.fallback.model_id, "claude-haiku-4-5-20251001");
    }

    #[test]
    fn test_model_router_select() {
        let h = ModelHierarchy::default_hierarchy();
        let router = ModelRouter::new(h);

        let c = router.select_model(&AgentLevel::Conductor);
        assert_eq!(c.model_id, "claude-sonnet-4-20250514");
        assert!((c.temperature - 0.7).abs() < f64::EPSILON);

        let l = router.select_model(&AgentLevel::Leaf);
        assert_eq!(l.model_id, "claude-haiku-4-5-20251001");
        assert!((l.temperature - 0.3).abs() < f64::EPSILON);
    }

    #[test]
    fn test_model_router_fallback() {
        let h = ModelHierarchy::default_hierarchy();
        let router = ModelRouter::new(h);
        let fb = router.get_fallback();
        assert_eq!(fb.model_id, "claude-haiku-4-5-20251001");
    }

    #[test]
    fn test_model_router_update_hierarchy() {
        let h = ModelHierarchy::default_hierarchy();
        let mut router = ModelRouter::new(h);

        let mut new_h = ModelHierarchy::default_hierarchy();
        new_h.conductor.model_id = "claude-opus-4-20250514".into();
        router.update_hierarchy(new_h);

        let c = router.select_model(&AgentLevel::Conductor);
        assert_eq!(c.model_id, "claude-opus-4-20250514");
    }

    // -- UsageTracker tests -------------------------------------------------

    #[test]
    fn test_usage_tracker_record_and_get() {
        let tracker = UsageTracker::new();
        let config = ModelConfig {
            provider: "anthropic".into(),
            model_id: "test".into(),
            max_tokens: 4096,
            temperature: 0.5,
            requests_per_minute: 50,
            tokens_per_minute: 100_000,
            cost_per_1k_input: 0.003,
            cost_per_1k_output: 0.015,
        };

        tracker.record(&AgentLevel::Conductor, 1000, 500, &config);
        tracker.record(&AgentLevel::Conductor, 2000, 1000, &config);

        let usage = tracker.get_usage(&AgentLevel::Conductor);
        assert_eq!(usage.total_input_tokens, 3000);
        assert_eq!(usage.total_output_tokens, 1500);
        assert_eq!(usage.total_requests, 2);

        // cost = (3000/1000)*0.003 + (1500/1000)*0.015 = 0.009 + 0.0225 = 0.0315
        assert!((usage.total_cost - 0.0315).abs() < 1e-9);
    }

    #[test]
    fn test_usage_tracker_total_cost() {
        let tracker = UsageTracker::new();
        let config = ModelConfig {
            provider: "anthropic".into(),
            model_id: "test".into(),
            max_tokens: 4096,
            temperature: 0.5,
            requests_per_minute: 50,
            tokens_per_minute: 100_000,
            cost_per_1k_input: 0.001,
            cost_per_1k_output: 0.005,
        };

        tracker.record(&AgentLevel::Conductor, 1000, 1000, &config);
        tracker.record(&AgentLevel::Leaf, 1000, 1000, &config);

        // Each: (1.0)*0.001 + (1.0)*0.005 = 0.006. Total = 0.012
        assert!((tracker.total_cost() - 0.012).abs() < 1e-9);
    }

    #[test]
    fn test_usage_tracker_reset() {
        let tracker = UsageTracker::new();
        let config = ModelConfig {
            provider: "anthropic".into(),
            model_id: "test".into(),
            max_tokens: 4096,
            temperature: 0.5,
            requests_per_minute: 50,
            tokens_per_minute: 100_000,
            cost_per_1k_input: 0.001,
            cost_per_1k_output: 0.005,
        };

        tracker.record(&AgentLevel::Conductor, 1000, 1000, &config);
        tracker.reset();
        assert!((tracker.total_cost() - 0.0).abs() < 1e-9);
        assert_eq!(tracker.get_usage(&AgentLevel::Conductor).total_requests, 0);
    }

    #[test]
    fn test_usage_tracker_untracked_level() {
        let tracker = UsageTracker::new();
        let usage = tracker.get_usage(&AgentLevel::Orchestrator);
        assert_eq!(usage.total_requests, 0);
        assert_eq!(usage.total_input_tokens, 0);
    }

    // -- RateLimiter tests --------------------------------------------------

    #[test]
    fn test_rate_limiter_allows_within_limit() {
        let h = ModelHierarchy::default_hierarchy();
        let limiter = RateLimiter::from_hierarchy(&h);
        // Conductor limit is 50 rpm — first request should pass.
        assert!(limiter.check(&AgentLevel::Conductor).is_ok());
    }

    #[test]
    fn test_rate_limiter_rejects_over_limit() {
        let mut h = ModelHierarchy::default_hierarchy();
        h.conductor.requests_per_minute = 3; // artificially low
        let limiter = RateLimiter::from_hierarchy(&h);

        assert!(limiter.check(&AgentLevel::Conductor).is_ok());
        assert!(limiter.check(&AgentLevel::Conductor).is_ok());
        assert!(limiter.check(&AgentLevel::Conductor).is_ok());
        // Fourth should fail
        assert!(limiter.check(&AgentLevel::Conductor).is_err());
    }

    #[test]
    fn test_rate_limiter_independent_levels() {
        let mut h = ModelHierarchy::default_hierarchy();
        h.conductor.requests_per_minute = 1;
        h.leaf.requests_per_minute = 100;
        let limiter = RateLimiter::from_hierarchy(&h);

        assert!(limiter.check(&AgentLevel::Conductor).is_ok());
        assert!(limiter.check(&AgentLevel::Conductor).is_err());
        // Leaf should still be fine
        assert!(limiter.check(&AgentLevel::Leaf).is_ok());
    }

    // -- ContextWindowBudget tests ------------------------------------------

    #[test]
    fn test_context_window_budget_allocate() {
        let budget = ContextWindowBudget::allocate(8000, 500);
        assert_eq!(budget.total_tokens, 8000);
        assert_eq!(budget.system_prompt_tokens, 500);
        assert_eq!(budget.response_reserve_tokens, 2000); // 8000/4

        // remaining = 8000 - 500 - 2000 = 5500
        assert_eq!(budget.conversation_history_tokens, 2750); // 50%
        assert_eq!(budget.tool_context_tokens, 1650); // 30%
        assert_eq!(budget.working_memory_tokens, 1100); // 20%
    }

    #[test]
    fn test_context_window_budget_available_methods() {
        let budget = ContextWindowBudget::allocate(8000, 500);
        assert_eq!(budget.available_for_history(), budget.conversation_history_tokens);
        assert_eq!(budget.available_for_tools(), budget.tool_context_tokens);
        assert_eq!(budget.available_for_working_memory(), budget.working_memory_tokens);
    }

    #[test]
    fn test_context_window_budget_allocated_does_not_exceed_total() {
        let budget = ContextWindowBudget::allocate(8000, 500);
        // Due to integer division there may be a small remainder, but it should
        // never exceed total.
        assert!(budget.allocated() <= budget.total_tokens);
    }

    #[test]
    fn test_context_window_budget_large_system_prompt() {
        // When system prompt is very large, remaining should still be non-negative
        // thanks to saturating_sub.
        let budget = ContextWindowBudget::allocate(4000, 3500);
        assert_eq!(budget.response_reserve_tokens, 1000);
        // remaining = 4000 - 3500 - 1000 = 0 (saturating)
        assert_eq!(budget.conversation_history_tokens, 0);
        assert_eq!(budget.tool_context_tokens, 0);
        assert_eq!(budget.working_memory_tokens, 0);
    }
}
