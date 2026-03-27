use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use tracing::debug;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TaskPriority {
    Critical,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TaskType {
    UserRequest,
    AgentPlanning,
    SystemMaintenance,
    Debugging,
    CodeEditing,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum LoadingStrategy {
    LazyLoadOnDemand,
    EagerLoad,
    PredictiveLoad,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum EvictionPolicy {
    Fifo,
    Lru,
    PriorityBased,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// A section of context loaded into working memory for a task.
#[derive(Debug, Clone)]
pub struct ContextSection {
    pub name: String,
    pub content: String,
    pub token_estimate: usize,
    pub priority: u8, // 0 = lowest, 255 = highest
    pub last_accessed: Instant,
}

/// Allocation result telling how many tokens each section gets.
#[derive(Debug, Clone)]
pub struct BudgetAllocation {
    pub task_description: usize,
    pub workspace_state: usize,
    pub capability_manifest: usize,
    pub user_model: usize,
    pub semantic_context: usize,
    pub procedural_context: usize,
    pub scratchpad: usize,
}

/// Per-task working memory context with budget tracking.
#[derive(Debug)]
pub struct WorkingMemoryContext {
    pub task_id: String,
    pub task_type: TaskType,
    pub task_priority: TaskPriority,
    pub budget_tokens: usize,
    pub budget_used: usize,
    pub sections: Vec<ContextSection>,
    pub scratchpad: String,
    pub decision_points: Vec<DecisionPoint>,
    pub loading_strategy: LoadingStrategy,
    pub eviction_policy: EvictionPolicy,
    pub created_at: Instant,
    pub expires_at: Instant,
    pub access_log: Vec<AccessLogEntry>,
}

#[derive(Debug, Clone)]
pub struct DecisionPoint {
    pub decision: String,
    pub alternatives: Vec<String>,
    pub timestamp: Instant,
}

#[derive(Debug, Clone)]
pub struct AccessLogEntry {
    pub section_name: String,
    pub tokens: usize,
    pub timestamp: Instant,
}

/// Cloneable snapshot returned from `get_context` so callers never hold the lock.
#[derive(Debug, Clone)]
pub struct WorkingMemoryContextSnapshot {
    pub task_id: String,
    pub task_type: TaskType,
    pub task_priority: TaskPriority,
    pub budget_tokens: usize,
    pub budget_used: usize,
    pub section_count: usize,
    pub scratchpad: String,
    pub remaining: usize,
    pub created_at_elapsed_secs: u64,
}

// ---------------------------------------------------------------------------
// ContextBudgetManager
// ---------------------------------------------------------------------------

pub struct ContextBudgetManager {
    contexts: RwLock<HashMap<String, WorkingMemoryContext>>,
    default_ttl: Duration,
    default_budget: usize,
}

impl ContextBudgetManager {
    pub fn new() -> Self {
        Self {
            contexts: RwLock::new(HashMap::new()),
            default_ttl: Duration::from_secs(30 * 60), // 30 minutes
            default_budget: 100_000,                    // tokens
        }
    }

    /// Create a new working memory context for a task.  Returns the task_id.
    pub async fn create_context(
        &self,
        task_id: &str,
        task_type: TaskType,
        priority: TaskPriority,
        budget_override: Option<usize>,
    ) -> String {
        let budget = budget_override.unwrap_or(self.default_budget);
        let now = Instant::now();
        let ctx = WorkingMemoryContext {
            task_id: task_id.to_string(),
            task_type,
            task_priority: priority,
            budget_tokens: budget,
            budget_used: 0,
            sections: Vec::new(),
            scratchpad: String::new(),
            decision_points: Vec::new(),
            loading_strategy: LoadingStrategy::LazyLoadOnDemand,
            eviction_policy: EvictionPolicy::PriorityBased,
            created_at: now,
            expires_at: now + self.default_ttl,
            access_log: Vec::new(),
        };
        let id = ctx.task_id.clone();
        self.contexts.write().await.insert(id.clone(), ctx);
        debug!(task_id = %id, budget, "Created context budget");
        id
    }

    /// Get a snapshot of a context by task_id.
    pub async fn get_context(&self, task_id: &str) -> Option<WorkingMemoryContextSnapshot> {
        let contexts = self.contexts.read().await;
        contexts.get(task_id).map(|ctx| WorkingMemoryContextSnapshot {
            task_id: ctx.task_id.clone(),
            task_type: ctx.task_type,
            task_priority: ctx.task_priority,
            budget_tokens: ctx.budget_tokens,
            budget_used: ctx.budget_used,
            section_count: ctx.sections.len(),
            scratchpad: ctx.scratchpad.clone(),
            remaining: ctx.budget_tokens.saturating_sub(ctx.budget_used),
            created_at_elapsed_secs: ctx.created_at.elapsed().as_secs(),
        })
    }

    /// Calculate budget allocation based on task type and priority.
    pub fn calculate_allocation(
        &self,
        total_budget: usize,
        task_type: TaskType,
        priority: TaskPriority,
    ) -> BudgetAllocation {
        let available = match priority {
            TaskPriority::Critical => total_budget * 90 / 100,
            TaskPriority::High => total_budget * 70 / 100,
            TaskPriority::Medium => total_budget * 50 / 100,
            TaskPriority::Low => total_budget * 30 / 100,
        };

        match task_type {
            TaskType::CodeEditing => BudgetAllocation {
                task_description: available * 8 / 100,
                workspace_state: available * 25 / 100,
                capability_manifest: available * 7 / 100,
                user_model: available * 10 / 100,
                semantic_context: available * 30 / 100,
                procedural_context: available * 5 / 100,
                scratchpad: available * 15 / 100,
            },
            TaskType::AgentPlanning => BudgetAllocation {
                task_description: available * 8 / 100,
                workspace_state: available * 10 / 100,
                capability_manifest: available * 7 / 100,
                user_model: available * 15 / 100,
                semantic_context: available * 25 / 100,
                procedural_context: available * 20 / 100,
                scratchpad: available * 15 / 100,
            },
            TaskType::Debugging => BudgetAllocation {
                task_description: available * 8 / 100,
                workspace_state: available * 30 / 100,
                capability_manifest: available * 7 / 100,
                user_model: available * 5 / 100,
                semantic_context: available * 20 / 100,
                procedural_context: available * 5 / 100,
                scratchpad: available * 25 / 100,
            },
            TaskType::UserRequest | TaskType::SystemMaintenance => BudgetAllocation {
                task_description: available * 10 / 100,
                workspace_state: available * 20 / 100,
                capability_manifest: available * 7 / 100,
                user_model: available * 13 / 100,
                semantic_context: available * 25 / 100,
                procedural_context: available * 10 / 100,
                scratchpad: available * 15 / 100,
            },
        }
    }

    /// Add a context section, respecting budget limits.
    ///
    /// Returns `Ok(true)` if added directly, `Ok(false)` if eviction was needed
    /// and performed first. Returns `Err` if budget is exhausted even after
    /// eviction.
    pub async fn add_section(
        &self,
        task_id: &str,
        section: ContextSection,
    ) -> Result<bool, String> {
        let mut contexts = self.contexts.write().await;
        let ctx = contexts
            .get_mut(task_id)
            .ok_or_else(|| format!("Context not found: {}", task_id))?;

        let tokens = section.token_estimate;
        let remaining = ctx.budget_tokens.saturating_sub(ctx.budget_used);

        if tokens <= remaining {
            // Fits within budget — add directly.
            ctx.budget_used += tokens;
            ctx.access_log.push(AccessLogEntry {
                section_name: section.name.clone(),
                tokens,
                timestamp: Instant::now(),
            });
            ctx.sections.push(section);
            return Ok(true);
        }

        // Need to evict.
        let deficit = tokens - remaining;
        let freed = Self::evict_inner(ctx, deficit);

        if freed + remaining >= tokens {
            ctx.budget_used += tokens;
            ctx.access_log.push(AccessLogEntry {
                section_name: section.name.clone(),
                tokens,
                timestamp: Instant::now(),
            });
            ctx.sections.push(section);
            Ok(false)
        } else {
            Err(format!(
                "Budget exhausted for task {}: need {} tokens, only {} available after eviction",
                task_id,
                tokens,
                freed + remaining
            ))
        }
    }

    /// Update scratchpad content.
    pub async fn update_scratchpad(&self, task_id: &str, content: &str) -> Result<(), String> {
        let mut contexts = self.contexts.write().await;
        let ctx = contexts
            .get_mut(task_id)
            .ok_or_else(|| format!("Context not found: {}", task_id))?;

        // Adjust budget: remove old scratchpad tokens, add new.
        let old_tokens = Self::estimate_tokens(&ctx.scratchpad);
        let new_tokens = Self::estimate_tokens(content);
        ctx.budget_used = ctx.budget_used.saturating_sub(old_tokens) + new_tokens;
        ctx.scratchpad = content.to_string();
        Ok(())
    }

    /// Record a decision point.
    pub async fn record_decision(
        &self,
        task_id: &str,
        decision: &str,
        alternatives: Vec<String>,
    ) -> Result<(), String> {
        let mut contexts = self.contexts.write().await;
        let ctx = contexts
            .get_mut(task_id)
            .ok_or_else(|| format!("Context not found: {}", task_id))?;

        ctx.decision_points.push(DecisionPoint {
            decision: decision.to_string(),
            alternatives,
            timestamp: Instant::now(),
        });
        Ok(())
    }

    /// Get remaining budget for a task.
    pub async fn remaining_budget(&self, task_id: &str) -> Option<usize> {
        let contexts = self.contexts.read().await;
        contexts
            .get(task_id)
            .map(|ctx| ctx.budget_tokens.saturating_sub(ctx.budget_used))
    }

    /// Evict lowest-priority sections to free up tokens.  Returns number of
    /// tokens freed.
    pub async fn evict(&self, task_id: &str, tokens_needed: usize) -> Result<usize, String> {
        let mut contexts = self.contexts.write().await;
        let ctx = contexts
            .get_mut(task_id)
            .ok_or_else(|| format!("Context not found: {}", task_id))?;
        Ok(Self::evict_inner(ctx, tokens_needed))
    }

    /// Inner eviction logic (caller must hold write lock).
    fn evict_inner(ctx: &mut WorkingMemoryContext, tokens_needed: usize) -> usize {
        // Sort indices by priority ASC, then last_accessed ASC (oldest first).
        let mut indices: Vec<usize> = (0..ctx.sections.len())
            .filter(|i| ctx.sections[*i].priority < 200)
            .collect();
        indices.sort_by(|&a, &b| {
            ctx.sections[a]
                .priority
                .cmp(&ctx.sections[b].priority)
                .then_with(|| ctx.sections[a].last_accessed.cmp(&ctx.sections[b].last_accessed))
        });

        let mut freed: usize = 0;
        let mut to_remove: Vec<usize> = Vec::new();

        for &idx in &indices {
            if freed >= tokens_needed {
                break;
            }
            freed += ctx.sections[idx].token_estimate;
            to_remove.push(idx);
        }

        // Remove in reverse index order so earlier indices stay valid.
        to_remove.sort_unstable_by(|a, b| b.cmp(a));
        for idx in to_remove {
            let removed = ctx.sections.remove(idx);
            ctx.budget_used = ctx.budget_used.saturating_sub(removed.token_estimate);
            debug!(section = %removed.name, tokens = removed.token_estimate, "Evicted context section");
        }

        freed
    }

    /// Archive/remove a completed task context.
    pub async fn archive_context(&self, task_id: &str) -> Result<(), String> {
        let mut contexts = self.contexts.write().await;
        contexts
            .remove(task_id)
            .map(|_| ())
            .ok_or_else(|| format!("Context not found: {}", task_id))
    }

    /// Expire all stale contexts (past their TTL).  Returns count expired.
    pub async fn expire_stale(&self) -> usize {
        let mut contexts = self.contexts.write().await;
        let before = contexts.len();
        let now = Instant::now();
        contexts.retain(|_, ctx| ctx.expires_at > now);
        let expired = before - contexts.len();
        if expired > 0 {
            debug!(expired, "Expired stale context budgets");
        }
        expired
    }

    /// Assemble the full context string for an LLM call.
    /// Concatenates all sections ordered by priority (highest first).
    pub async fn assemble_context(&self, task_id: &str) -> Option<String> {
        let mut contexts = self.contexts.write().await;
        let ctx = contexts.get_mut(task_id)?;

        // Update last_accessed for all sections.
        let now = Instant::now();
        for section in &mut ctx.sections {
            section.last_accessed = now;
        }

        // Sort by priority descending.
        let mut sorted: Vec<&ContextSection> = ctx.sections.iter().collect();
        sorted.sort_by(|a, b| b.priority.cmp(&a.priority));

        let mut parts: Vec<String> = Vec::with_capacity(sorted.len() + 1);
        for section in sorted {
            parts.push(format!("## {}\n{}", section.name, section.content));
        }

        if !ctx.scratchpad.is_empty() {
            parts.push(format!("## Scratchpad\n{}", ctx.scratchpad));
        }

        Some(parts.join("\n\n"))
    }

    /// Estimate token count for a string (rough: chars / 4).
    pub fn estimate_tokens(text: &str) -> usize {
        text.len() / 4
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_section(name: &str, tokens: usize, priority: u8) -> ContextSection {
        ContextSection {
            name: name.to_string(),
            content: "x".repeat(tokens * 4), // so estimate_tokens rounds back
            token_estimate: tokens,
            priority,
            last_accessed: Instant::now(),
        }
    }

    #[tokio::test]
    async fn test_create_context_returns_valid_task_id() {
        let mgr = ContextBudgetManager::new();
        let id = mgr
            .create_context("task-1", TaskType::UserRequest, TaskPriority::High, None)
            .await;
        assert_eq!(id, "task-1");

        let snap = mgr.get_context("task-1").await;
        assert!(snap.is_some());
        let snap = snap.unwrap();
        assert_eq!(snap.budget_tokens, 100_000);
        assert_eq!(snap.budget_used, 0);
    }

    #[tokio::test]
    async fn test_allocation_code_editing_workspace_gt_procedural() {
        let mgr = ContextBudgetManager::new();
        let alloc = mgr.calculate_allocation(100_000, TaskType::CodeEditing, TaskPriority::High);
        assert!(
            alloc.workspace_state > alloc.procedural_context,
            "workspace_state ({}) should be > procedural_context ({})",
            alloc.workspace_state,
            alloc.procedural_context
        );
    }

    #[tokio::test]
    async fn test_allocation_agent_planning_procedural_gt_workspace() {
        let mgr = ContextBudgetManager::new();
        let alloc =
            mgr.calculate_allocation(100_000, TaskType::AgentPlanning, TaskPriority::High);
        assert!(
            alloc.procedural_context > alloc.workspace_state,
            "procedural_context ({}) should be > workspace_state ({})",
            alloc.procedural_context,
            alloc.workspace_state
        );
    }

    #[tokio::test]
    async fn test_add_section_within_budget_succeeds() {
        let mgr = ContextBudgetManager::new();
        mgr.create_context("task-2", TaskType::UserRequest, TaskPriority::Medium, Some(10_000))
            .await;

        let section = make_section("intro", 500, 100);
        let result = mgr.add_section("task-2", section).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true);

        let remaining = mgr.remaining_budget("task-2").await.unwrap();
        assert_eq!(remaining, 9_500);
    }

    #[tokio::test]
    async fn test_add_section_exceeding_budget_triggers_eviction() {
        let mgr = ContextBudgetManager::new();
        mgr.create_context("task-3", TaskType::UserRequest, TaskPriority::Medium, Some(1_000))
            .await;

        // Fill with a low-priority section.
        let filler = make_section("filler", 800, 10);
        mgr.add_section("task-3", filler).await.unwrap();

        // Now add a section that exceeds remaining budget (200 left, need 500).
        let important = make_section("important", 500, 150);
        let result = mgr.add_section("task-3", important).await;
        assert!(result.is_ok());
        // Should have evicted, so returns false.
        assert_eq!(result.unwrap(), false);
    }

    #[tokio::test]
    async fn test_eviction_removes_lowest_priority_first() {
        let mgr = ContextBudgetManager::new();
        mgr.create_context("task-4", TaskType::Debugging, TaskPriority::High, Some(2_000))
            .await;

        mgr.add_section("task-4", make_section("low", 400, 5))
            .await
            .unwrap();
        mgr.add_section("task-4", make_section("med", 400, 50))
            .await
            .unwrap();
        mgr.add_section("task-4", make_section("high", 400, 150))
            .await
            .unwrap();

        // Evict 500 tokens — should remove "low" first (400), then "med" (400).
        let freed = mgr.evict("task-4", 500).await.unwrap();
        assert!(freed >= 500);

        // "high" should survive.
        let snap = mgr.get_context("task-4").await.unwrap();
        assert_eq!(snap.section_count, 1);

        let assembled = mgr.assemble_context("task-4").await.unwrap();
        assert!(assembled.contains("high"));
        assert!(!assembled.contains("low"));
    }

    #[tokio::test]
    async fn test_expire_stale_removes_old_contexts() {
        let mgr = ContextBudgetManager {
            contexts: RwLock::new(HashMap::new()),
            default_ttl: Duration::from_millis(1), // expire almost immediately
            default_budget: 1_000,
        };

        mgr.create_context("stale-1", TaskType::UserRequest, TaskPriority::Low, None)
            .await;

        // Wait just enough for the TTL to pass.
        tokio::time::sleep(Duration::from_millis(5)).await;

        let expired = mgr.expire_stale().await;
        assert_eq!(expired, 1);

        assert!(mgr.get_context("stale-1").await.is_none());
    }

    #[tokio::test]
    async fn test_assemble_context_orders_by_priority() {
        let mgr = ContextBudgetManager::new();
        mgr.create_context("task-5", TaskType::CodeEditing, TaskPriority::High, Some(50_000))
            .await;

        mgr.add_section("task-5", make_section("low-pri", 100, 10))
            .await
            .unwrap();
        mgr.add_section("task-5", make_section("high-pri", 100, 200))
            .await
            .unwrap();
        mgr.add_section("task-5", make_section("mid-pri", 100, 100))
            .await
            .unwrap();

        let assembled = mgr.assemble_context("task-5").await.unwrap();
        let high_pos = assembled.find("high-pri").unwrap();
        let mid_pos = assembled.find("mid-pri").unwrap();
        let low_pos = assembled.find("low-pri").unwrap();
        assert!(
            high_pos < mid_pos && mid_pos < low_pos,
            "Expected high ({}) < mid ({}) < low ({})",
            high_pos,
            mid_pos,
            low_pos
        );
    }

    #[tokio::test]
    async fn test_record_decision_and_scratchpad() {
        let mgr = ContextBudgetManager::new();
        mgr.create_context("task-6", TaskType::AgentPlanning, TaskPriority::Medium, None)
            .await;

        mgr.update_scratchpad("task-6", "thinking about approach")
            .await
            .unwrap();
        mgr.record_decision("task-6", "use recursive approach", vec!["iterative".into()])
            .await
            .unwrap();

        let snap = mgr.get_context("task-6").await.unwrap();
        assert_eq!(snap.scratchpad, "thinking about approach");

        let assembled = mgr.assemble_context("task-6").await.unwrap();
        assert!(assembled.contains("thinking about approach"));
    }

    #[tokio::test]
    async fn test_archive_context_removes_it() {
        let mgr = ContextBudgetManager::new();
        mgr.create_context("task-7", TaskType::SystemMaintenance, TaskPriority::Low, None)
            .await;

        assert!(mgr.get_context("task-7").await.is_some());
        mgr.archive_context("task-7").await.unwrap();
        assert!(mgr.get_context("task-7").await.is_none());
    }

    #[tokio::test]
    async fn test_estimate_tokens() {
        assert_eq!(ContextBudgetManager::estimate_tokens(""), 0);
        assert_eq!(ContextBudgetManager::estimate_tokens("abcd"), 1);
        assert_eq!(ContextBudgetManager::estimate_tokens("abcdefgh"), 2);
    }

    #[tokio::test]
    async fn test_eviction_never_removes_high_priority_sections() {
        let mgr = ContextBudgetManager::new();
        mgr.create_context("task-8", TaskType::Debugging, TaskPriority::High, Some(1_000))
            .await;

        // Add a section with priority >= 200 (protected).
        mgr.add_section("task-8", make_section("protected", 800, 220))
            .await
            .unwrap();

        // Try to evict — should free 0 because the only section is protected.
        let freed = mgr.evict("task-8", 500).await.unwrap();
        assert_eq!(freed, 0);

        let snap = mgr.get_context("task-8").await.unwrap();
        assert_eq!(snap.section_count, 1);
    }
}
