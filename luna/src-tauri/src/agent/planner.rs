use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::agent::llm_client::LlmClient;
use crate::error::LunaError;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    Draft,
    Active,
    InProgress,
    Completed,
    Blocked,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanRevision {
    pub version: u32,
    pub change_summary: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanTask {
    pub id: String,
    pub description: String,
    pub status: PlanStatus,
    pub agent_id: Option<String>,
    pub dependencies: Vec<String>,
    pub effort_estimate: Option<String>,
    pub risks: Vec<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanPhase {
    pub id: String,
    pub name: String,
    pub tasks: Vec<PlanTask>,
    pub status: PlanStatus,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub title: String,
    pub goal: String,
    pub phases: Vec<PlanPhase>,
    pub status: PlanStatus,
    pub version: u32,
    pub history: Vec<PlanRevision>,
    pub created_at: i64,
    pub updated_at: i64,
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

pub struct Planner {
    llm_client: Option<LlmClient>,
    plans: tokio::sync::RwLock<HashMap<String, Plan>>,
}

impl Planner {
    /// Create a new Planner, optionally backed by an LLM client.
    pub fn new(llm_client: Option<LlmClient>) -> Self {
        Self {
            llm_client,
            plans: tokio::sync::RwLock::new(HashMap::new()),
        }
    }

    // -- helpers ------------------------------------------------------------

    fn now() -> i64 {
        chrono::Utc::now().timestamp()
    }

    /// Try to parse an LLM response into a `Plan`. Falls back to `None` on
    /// any parse error so callers can use the heuristic path instead.
    fn parse_llm_plan(raw: &str, goal: &str) -> Option<Plan> {
        // The LLM may wrap its JSON in a markdown code fence – strip it.
        let trimmed = raw.trim();
        let json_str = if trimmed.starts_with("```") {
            let without_prefix = trimmed
                .trim_start_matches("```json")
                .trim_start_matches("```");
            without_prefix.trim_end_matches("```").trim()
        } else {
            trimmed
        };

        #[derive(Deserialize)]
        struct RawPlan {
            title: Option<String>,
            phases: Option<Vec<RawPhase>>,
        }

        #[derive(Deserialize)]
        struct RawPhase {
            name: Option<String>,
            tasks: Option<Vec<RawTask>>,
        }

        #[derive(Deserialize)]
        struct RawTask {
            description: Option<String>,
            effort_estimate: Option<String>,
            risks: Option<Vec<String>>,
            notes: Option<String>,
        }

        let raw_plan: RawPlan = serde_json::from_str(json_str).ok()?;
        let now = Self::now();
        let plan_id = Uuid::new_v4().to_string();

        let phases: Vec<PlanPhase> = raw_plan
            .phases
            .unwrap_or_default()
            .into_iter()
            .enumerate()
            .map(|(i, rp)| {
                let tasks: Vec<PlanTask> = rp
                    .tasks
                    .unwrap_or_default()
                    .into_iter()
                    .map(|rt| PlanTask {
                        id: Uuid::new_v4().to_string(),
                        description: rt.description.unwrap_or_default(),
                        status: PlanStatus::Draft,
                        agent_id: None,
                        dependencies: Vec::new(),
                        effort_estimate: rt.effort_estimate,
                        risks: rt.risks.unwrap_or_default(),
                        notes: rt.notes.unwrap_or_default(),
                    })
                    .collect();

                PlanPhase {
                    id: Uuid::new_v4().to_string(),
                    name: rp.name.unwrap_or_else(|| format!("Phase {}", i + 1)),
                    tasks,
                    status: PlanStatus::Draft,
                    order: i as u32,
                }
            })
            .collect();

        Some(Plan {
            id: plan_id,
            title: raw_plan
                .title
                .unwrap_or_else(|| format!("Plan for: {}", goal)),
            goal: goal.to_string(),
            phases,
            status: PlanStatus::Draft,
            version: 1,
            history: vec![PlanRevision {
                version: 1,
                change_summary: "Initial plan generated by LLM".to_string(),
                timestamp: now,
            }],
            created_at: now,
            updated_at: now,
        })
    }

    /// Build a simple single-phase plan when no LLM is available.
    fn heuristic_plan(goal: &str) -> Plan {
        let now = Self::now();
        let plan_id = Uuid::new_v4().to_string();

        let task = PlanTask {
            id: Uuid::new_v4().to_string(),
            description: goal.to_string(),
            status: PlanStatus::Draft,
            agent_id: None,
            dependencies: Vec::new(),
            effort_estimate: Some("medium".to_string()),
            risks: Vec::new(),
            notes: String::new(),
        };

        let phase = PlanPhase {
            id: Uuid::new_v4().to_string(),
            name: "Phase 1".to_string(),
            tasks: vec![task],
            status: PlanStatus::Draft,
            order: 0,
        };

        Plan {
            id: plan_id,
            title: format!("Plan for: {}", goal),
            goal: goal.to_string(),
            phases: vec![phase],
            status: PlanStatus::Draft,
            version: 1,
            history: vec![PlanRevision {
                version: 1,
                change_summary: "Initial plan created via heuristic fallback".to_string(),
                timestamp: now,
            }],
            created_at: now,
            updated_at: now,
        }
    }

    /// System prompt used when asking the LLM to generate a plan.
    fn plan_system_prompt() -> String {
        r#"You are a planning assistant for Luna OS. Given a user goal, produce a structured plan as JSON.

The JSON must have this shape:
{
  "title": "short title",
  "phases": [
    {
      "name": "Phase name",
      "tasks": [
        {
          "description": "What to do",
          "effort_estimate": "small" | "medium" | "large",
          "risks": ["risk description"],
          "notes": ""
        }
      ]
    }
  ]
}

Output ONLY valid JSON, no commentary."#
            .to_string()
    }

    // -- public API ---------------------------------------------------------

    /// Generate a plan from a user goal. Uses the LLM when available,
    /// otherwise falls back to a simple heuristic plan.
    pub async fn generate_plan(&self, goal: &str) -> Result<Plan, LunaError> {
        let plan = if let Some(ref client) = self.llm_client {
            use crate::agent::llm_client::LlmMessage;

            let messages = vec![LlmMessage {
                role: "user".to_string(),
                content: format!("Create a plan for the following goal:\n{}", goal),
            }];

            let llm_response = client
                .send(&Self::plan_system_prompt(), &messages, 4096)
                .await?;
            Self::parse_llm_plan(&llm_response.content, goal)
                .unwrap_or_else(|| Self::heuristic_plan(goal))
        } else {
            Self::heuristic_plan(goal)
        };

        let mut plans = self.plans.write().await;
        plans.insert(plan.id.clone(), plan.clone());
        Ok(plan)
    }

    /// Retrieve a plan by ID.
    pub async fn get_plan(&self, plan_id: &str) -> Option<Plan> {
        let plans = self.plans.read().await;
        plans.get(plan_id).cloned()
    }

    /// List all plans.
    pub async fn list_plans(&self) -> Vec<Plan> {
        let plans = self.plans.read().await;
        plans.values().cloned().collect()
    }

    /// Update the status of a specific task inside a plan.
    /// Automatically recomputes the parent phase status based on its tasks.
    pub async fn update_task_status(
        &self,
        plan_id: &str,
        task_id: &str,
        status: PlanStatus,
    ) -> Result<(), LunaError> {
        let mut plans = self.plans.write().await;
        let plan = plans
            .get_mut(plan_id)
            .ok_or_else(|| LunaError::Agent(format!("Plan not found: {}", plan_id)))?;

        let mut found = false;
        for phase in &mut plan.phases {
            for task in &mut phase.tasks {
                if task.id == task_id {
                    task.status = status.clone();
                    found = true;
                    break;
                }
            }
            if found {
                // Recompute phase status from its tasks.
                let all_completed = phase
                    .tasks
                    .iter()
                    .all(|t| t.status == PlanStatus::Completed);
                let any_in_progress = phase
                    .tasks
                    .iter()
                    .any(|t| t.status == PlanStatus::InProgress || t.status == PlanStatus::Active);
                let any_blocked = phase.tasks.iter().any(|t| t.status == PlanStatus::Blocked);

                if all_completed {
                    phase.status = PlanStatus::Completed;
                } else if any_blocked {
                    phase.status = PlanStatus::Blocked;
                } else if any_in_progress {
                    phase.status = PlanStatus::InProgress;
                }
                break;
            }
        }

        if !found {
            return Err(LunaError::Agent(format!("Task not found: {}", task_id)));
        }

        plan.updated_at = Self::now();
        Ok(())
    }

    /// Revise an existing plan. Uses the LLM to produce a revised version
    /// when available; otherwise simply appends a note to the history.
    pub async fn revise_plan(
        &self,
        plan_id: &str,
        reason: &str,
    ) -> Result<Plan, LunaError> {
        let mut plans = self.plans.write().await;
        let plan = plans
            .get_mut(plan_id)
            .ok_or_else(|| LunaError::Agent(format!("Plan not found: {}", plan_id)))?;

        if let Some(ref client) = self.llm_client {
            use crate::agent::llm_client::LlmMessage;

            let current_json = serde_json::to_string_pretty(&*plan)
                .map_err(|e| LunaError::Serialization(e.to_string()))?;

            let messages = vec![LlmMessage {
                role: "user".to_string(),
                content: format!(
                    "Here is the current plan:\n{}\n\nRevise the plan because: {}",
                    current_json, reason
                ),
            }];

            let llm_response = client
                .send(&Self::plan_system_prompt(), &messages, 4096)
                .await?;
            if let Some(revised) = Self::parse_llm_plan(&llm_response.content, &plan.goal) {
                // Carry over identity, increment version.
                plan.title = revised.title;
                plan.phases = revised.phases;
            }
        }

        // Always bump version and record revision.
        plan.version += 1;
        plan.history.push(PlanRevision {
            version: plan.version,
            change_summary: reason.to_string(),
            timestamp: Self::now(),
        });
        plan.updated_at = Self::now();

        Ok(plan.clone())
    }

    /// Check if any triggers fire for a plan:
    /// - All tasks in a phase completed → "Phase '<name>' completed"
    /// - Any task blocked → "Task '<desc>' is blocked"
    pub async fn check_triggers(&self, plan_id: &str) -> Vec<String> {
        let plans = self.plans.read().await;
        let plan = match plans.get(plan_id) {
            Some(p) => p,
            None => return Vec::new(),
        };

        let mut triggers = Vec::new();

        for phase in &plan.phases {
            let all_completed = phase
                .tasks
                .iter()
                .all(|t| t.status == PlanStatus::Completed);
            if all_completed && !phase.tasks.is_empty() {
                triggers.push(format!("Phase '{}' completed", phase.name));
            }

            for task in &phase.tasks {
                if task.status == PlanStatus::Blocked {
                    triggers.push(format!("Task '{}' is blocked", task.description));
                }
            }
        }

        triggers
    }

    /// Delete a plan by ID.
    pub async fn delete_plan(&self, plan_id: &str) -> Result<(), LunaError> {
        let mut plans = self.plans.write().await;
        plans
            .remove(plan_id)
            .ok_or_else(|| LunaError::Agent(format!("Plan not found: {}", plan_id)))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_planner() -> Planner {
        Planner::new(None)
    }

    #[tokio::test]
    async fn test_generate_plan_heuristic_fallback() {
        let planner = make_planner();
        let plan = planner
            .generate_plan("Build a website")
            .await
            .expect("should generate plan");

        assert_eq!(plan.goal, "Build a website");
        assert_eq!(plan.version, 1);
        assert_eq!(plan.status, PlanStatus::Draft);
        assert_eq!(plan.phases.len(), 1);
        assert_eq!(plan.phases[0].tasks.len(), 1);
        assert_eq!(plan.phases[0].tasks[0].description, "Build a website");
    }

    #[tokio::test]
    async fn test_get_and_list_plans() {
        let planner = make_planner();
        let plan = planner
            .generate_plan("Plan A")
            .await
            .expect("should generate");

        // get_plan should return it
        let fetched = planner.get_plan(&plan.id).await;
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().goal, "Plan A");

        // list_plans should include it
        let _ = planner.generate_plan("Plan B").await.unwrap();
        let all = planner.list_plans().await;
        assert_eq!(all.len(), 2);

        // non-existent ID
        assert!(planner.get_plan("nope").await.is_none());
    }

    #[tokio::test]
    async fn test_update_task_status_auto_updates_phase() {
        let planner = make_planner();
        let plan = planner
            .generate_plan("Automate tests")
            .await
            .expect("should generate");

        let task_id = plan.phases[0].tasks[0].id.clone();
        let plan_id = plan.id.clone();

        planner
            .update_task_status(&plan_id, &task_id, PlanStatus::Completed)
            .await
            .expect("should update");

        let updated = planner.get_plan(&plan_id).await.unwrap();
        assert_eq!(updated.phases[0].tasks[0].status, PlanStatus::Completed);
        // Single task completed → phase should be Completed
        assert_eq!(updated.phases[0].status, PlanStatus::Completed);
    }

    #[tokio::test]
    async fn test_check_triggers_on_phase_completion() {
        let planner = make_planner();
        let plan = planner
            .generate_plan("Deploy app")
            .await
            .expect("should generate");

        let task_id = plan.phases[0].tasks[0].id.clone();
        let plan_id = plan.id.clone();

        // Before completing, no triggers
        let triggers = planner.check_triggers(&plan_id).await;
        assert!(triggers.is_empty());

        // Complete the only task
        planner
            .update_task_status(&plan_id, &task_id, PlanStatus::Completed)
            .await
            .unwrap();

        let triggers = planner.check_triggers(&plan_id).await;
        assert_eq!(triggers.len(), 1);
        assert!(triggers[0].contains("completed"));
    }

    #[tokio::test]
    async fn test_revise_plan_increments_version() {
        let planner = make_planner();
        let plan = planner
            .generate_plan("Original goal")
            .await
            .expect("should generate");

        let revised = planner
            .revise_plan(&plan.id, "requirements changed")
            .await
            .expect("should revise");

        assert_eq!(revised.version, 2);
        assert_eq!(revised.history.len(), 2);
        assert_eq!(revised.history[1].change_summary, "requirements changed");
    }

    #[tokio::test]
    async fn test_delete_plan() {
        let planner = make_planner();
        let plan = planner
            .generate_plan("Throwaway")
            .await
            .expect("should generate");

        let plan_id = plan.id.clone();

        planner.delete_plan(&plan_id).await.expect("should delete");
        assert!(planner.get_plan(&plan_id).await.is_none());

        // Deleting again should error
        let err = planner.delete_plan(&plan_id).await;
        assert!(err.is_err());
    }
}
