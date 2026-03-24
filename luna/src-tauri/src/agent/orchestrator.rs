use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{info, warn};

use crate::agent::leaf::{LeafAgent, StubLeafAgent};
use crate::agent::messaging::{AgentMessage, MessageBus, TaskId};
use crate::agent::registry::{AgentMetadata, AgentRegistry, AgentStatus, AgentType};
use crate::agent::scratchpad::Scratchpad;
use crate::error::LunaError;
use crate::memory::MemorySystem;

#[allow(dead_code)]
const ORCHESTRATOR_SYSTEM_PROMPT: &str = r#"You are a Workspace Orchestrator for Luna OS.
Your job is to receive a task from the Conductor and coordinate leaf agents to complete it.

You receive a task description and context. Break it down into concrete steps.
For each step, decide what action is needed and what payload to pass.

Respond with a brief explanation of your plan, then a JSON array of sub-tasks:
[
  {"action_type": "...", "payload": {...}, "description": "why this step"}
]

Keep it focused — 2-4 sub-tasks maximum. The StubLeafAgent will handle execution.
"#;

pub struct WorkspaceOrchestrator {
    pub id: String,
    pub workspace_id: String,
    leaf_agents: Vec<Box<dyn LeafAgent>>,
}

impl WorkspaceOrchestrator {
    pub fn new(workspace_id: &str) -> Self {
        let id = format!("orchestrator_{}", workspace_id);

        // Register a stub leaf agent for Phase 2
        let stub = StubLeafAgent::new(
            &format!("leaf_{}", workspace_id),
            vec!["agent.task.create", "memory.store", "system.notify"],
        );

        Self {
            id,
            workspace_id: workspace_id.to_string(),
            leaf_agents: vec![Box::new(stub)],
        }
    }

    /// Handle a delegated task from the Conductor.
    /// Returns the final result to send back via MessageBus.
    pub async fn handle_delegation(
        &self,
        task_id: &TaskId,
        task: &str,
        context: &serde_json::Value,
        scratchpad: &Arc<Scratchpad>,
        memory: &Arc<MemorySystem>,
    ) -> AgentMessage {
        info!(
            orchestrator = %self.id,
            task_id = %task_id,
            task = %task,
            "Orchestrator received delegation"
        );

        // Post initial scratchpad entry
        scratchpad.write(
            &self.workspace_id,
            task_id,
            &self.id,
            0,
            &format!("Received task: {}", task),
            None,
        ).await;

        // Record in working memory
        memory.working.push_observation(&self.id, format!("Task {}: {}", task_id, task)).await;

        // For Phase 2, decompose the task using the stub leaf agent
        // In Phase 4, this will call the LLM with the orchestrator system prompt
        let decomposition = self.decompose_task_stub(task, context, task_id, scratchpad).await;

        decomposition
    }

    /// Phase 2 stub: decompose and execute using leaf agents without LLM call.
    /// Returns a Complete message to send back to Conductor.
    async fn decompose_task_stub(
        &self,
        task: &str,
        _context: &serde_json::Value,
        task_id: &TaskId,
        scratchpad: &Arc<Scratchpad>,
    ) -> AgentMessage {
        // Find the first leaf agent that can handle generic tasks
        if let Some(leaf) = self.leaf_agents.first() {
            scratchpad.write(
                &self.workspace_id,
                task_id,
                &self.id,
                1,
                &format!("Assigning to leaf agent: {}", leaf.agent_id()),
                None,
            ).await;

            let assign_msg = AgentMessage::Assign {
                task_id: task_id.clone(),
                action_type: "agent.task.create".to_string(),
                payload: serde_json::json!({
                    "name": task,
                    "description": format!("Delegated task: {}", task)
                }),
                timeout_ms: 5000,
            };

            // Call leaf agent with timeout
            let result = timeout(
                Duration::from_millis(5000),
                self.execute_with_leaf(leaf.as_ref(), task_id, &assign_msg),
            ).await;

            match result {
                Ok(Ok(report)) => {
                    scratchpad.write(
                        &self.workspace_id,
                        task_id,
                        &self.id,
                        2,
                        "Leaf agent completed task",
                        None,
                    ).await;

                    AgentMessage::Complete {
                        task_id: task_id.clone(),
                        result: if let AgentMessage::Report { result, .. } = report {
                            result
                        } else {
                            serde_json::json!({"status": "completed"})
                        },
                    }
                }
                Ok(Err(e)) => {
                    warn!(error = %e, "Leaf agent returned error");
                    AgentMessage::Escalate {
                        task_id: task_id.clone(),
                        from_agent: self.id.clone(),
                        reason: format!("Leaf agent error: {}", e),
                    }
                }
                Err(_) => {
                    warn!(task_id = %task_id, "Leaf agent timed out");
                    AgentMessage::Escalate {
                        task_id: task_id.clone(),
                        from_agent: self.id.clone(),
                        reason: "Leaf agent timed out after 5 seconds".to_string(),
                    }
                }
            }
        } else {
            AgentMessage::Escalate {
                task_id: task_id.clone(),
                from_agent: self.id.clone(),
                reason: "No leaf agents available".to_string(),
            }
        }
    }

    async fn execute_with_leaf(
        &self,
        leaf: &dyn LeafAgent,
        task_id: &TaskId,
        msg: &AgentMessage,
    ) -> Result<AgentMessage, LunaError> {
        if let AgentMessage::Assign { action_type, payload, .. } = msg {
            leaf.handle(task_id, action_type, payload.clone()).await
        } else {
            Err(LunaError::Agent("Expected Assign message".to_string()))
        }
    }

    pub fn agent_metadata(&self) -> AgentMetadata {
        AgentMetadata {
            agent_id: self.id.clone(),
            agent_type: AgentType::WorkspaceOrchestrator,
            capabilities: vec![
                "agent.delegate".to_string(),
                "agent.task.create".to_string(),
            ],
            workspace_id: Some(self.workspace_id.clone()),
            status: AgentStatus::Idle,
        }
    }

    /// Spawn this orchestrator as a background task listening on the MessageBus.
    pub fn spawn(
        orchestrator: Arc<Self>,
        message_bus: Arc<MessageBus>,
        agent_registry: Arc<AgentRegistry>,
        scratchpad: Arc<Scratchpad>,
        memory: Arc<MemorySystem>,
    ) {
        let id = orchestrator.id.clone();
        tauri::async_runtime::spawn(async move {
            let mut rx = message_bus.register(&id).await;
            agent_registry.set_status(&id, AgentStatus::Idle).await;

            info!(orchestrator = %id, "Orchestrator started, listening for messages");

            while let Some(msg) = rx.recv().await {
                match msg {
                    AgentMessage::Delegate { ref task_id, ref task, ref context } => {
                        agent_registry.set_status(&id, AgentStatus::Busy).await;

                        let result = orchestrator.handle_delegation(
                            task_id,
                            task,
                            context,
                            &scratchpad,
                            &memory,
                        ).await;

                        // Send result back to Conductor
                        if let Err(e) = message_bus.send("conductor", result).await {
                            warn!(error = %e, "Failed to send result to Conductor");
                        }

                        agent_registry.set_status(&id, AgentStatus::Idle).await;
                    }
                    _ => {
                        warn!(orchestrator = %id, "Received unexpected message type");
                    }
                }
            }

            warn!(orchestrator = %id, "Orchestrator message loop ended");
        });
    }
}
