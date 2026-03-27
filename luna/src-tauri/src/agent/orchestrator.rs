use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::timeout;
use tracing::{info, warn};

use crate::agent::leaf::{LeafAgent, StubLeafAgent};
use crate::agent::leaves::file_leaf::FileLeafAgent;
use crate::agent::leaves::shell_leaf::ShellLeafAgent;
use crate::agent::leaves::search_leaf::SearchLeafAgent;
use crate::agent::llm_client::{LlmClient, LlmMessage};
use crate::agent::messaging::{AgentMessage, MessageBus, TaskId};
use crate::agent::registry::{AgentMetadata, AgentRegistry, AgentStatus, AgentType};
use crate::agent::scratchpad::Scratchpad;
use crate::agent::task_graph::TaskGraph;
use crate::error::LunaError;
use crate::memory::MemorySystem;

/// All capabilities that the orchestrator knows about.
const KNOWN_CAPABILITIES: &[&str] = &[
    "file.read",
    "file.write",
    "file.list",
    "shell.execute",
    "search.local",
];

/// System prompt for LLM-powered task decomposition.
const ORCHESTRATOR_SYSTEM_PROMPT: &str = r#"You are a workspace orchestrator for Luna OS. Decompose the following task into subtasks that can be executed by specialized agents.

Available capabilities:
- file.read — Read file contents. Payload: {"path": "relative/path"}
- file.write — Write content to a file. Payload: {"path": "relative/path", "content": "..."}
- file.list — List directory entries. Payload: {"path": "relative/path"}
- shell.execute — Execute a shell command. Payload: {"command": "...", "args": ["..."], "timeout_ms": 30000}
- search.local — Search for files by name pattern. Payload: {"pattern": "*.rs", "root": "optional/path"}

Return ONLY a JSON array of subtasks. No explanation, no markdown — just the JSON array.
Each subtask must have: "action_type" (one of the capabilities above), "payload" (object), and "description" (short string).

Example:
[
  {"action_type": "file.list", "payload": {"path": "."}, "description": "List files in workspace root"},
  {"action_type": "file.read", "payload": {"path": "README.md"}, "description": "Read the README"}
]

Rules:
- Only use the capabilities listed above.
- Keep it focused: 1-5 subtasks maximum.
- If the task cannot be decomposed into the available capabilities, return a single subtask using the closest match.
"#;

/// Represents a subtask produced by LLM decomposition.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct Subtask {
    action_type: String,
    payload: serde_json::Value,
    description: String,
}

pub struct WorkspaceOrchestrator {
    pub id: String,
    pub workspace_id: String,
    llm_client: Option<LlmClient>,
    leaf_agents: RwLock<HashMap<String, Box<dyn LeafAgent>>>,
    workspace_root: PathBuf,
}

impl WorkspaceOrchestrator {
    /// Create a new orchestrator.
    /// - `workspace_id`: the workspace this orchestrator manages.
    /// - `llm_client`: optional LLM client for intelligent decomposition. Falls back to heuristics if None.
    /// - `workspace_root`: root directory for file/search leaf agents.
    pub fn new(workspace_id: &str, llm_client: Option<LlmClient>, workspace_root: PathBuf) -> Self {
        let id = format!("orchestrator_{}", workspace_id);

        Self {
            id,
            workspace_id: workspace_id.to_string(),
            llm_client,
            leaf_agents: RwLock::new(HashMap::new()),
            workspace_root,
        }
    }

    /// Ensure a leaf agent exists for the given capability. Creates one on demand if needed.
    async fn ensure_leaf_agent(&self, capability: &str) {
        let agents = self.leaf_agents.read().await;
        // Check if we already have an agent with this capability
        for agent in agents.values() {
            if agent.capabilities().contains(&capability.to_string()) {
                return;
            }
        }
        drop(agents);

        // Create the appropriate leaf agent
        let agent: Box<dyn LeafAgent> = match capability {
            "file.read" | "file.write" | "file.list" => {
                let agent_id = format!("file_leaf_{}", self.workspace_id);
                // Check if file leaf already exists (it covers all file.* capabilities)
                let agents = self.leaf_agents.read().await;
                if agents.contains_key(&agent_id) {
                    return;
                }
                drop(agents);
                Box::new(FileLeafAgent::new(&agent_id, self.workspace_root.clone()))
            }
            "shell.execute" => {
                let agent_id = format!("shell_leaf_{}", self.workspace_id);
                Box::new(ShellLeafAgent::new(&agent_id))
            }
            "search.local" => {
                let agent_id = format!("search_leaf_{}", self.workspace_id);
                Box::new(SearchLeafAgent::new(&agent_id, self.workspace_root.clone()))
            }
            _ => {
                // Fallback to stub for unknown capabilities
                let agent_id = format!("stub_leaf_{}_{}", self.workspace_id, capability.replace('.', "_"));
                Box::new(StubLeafAgent::new(
                    &agent_id,
                    vec![capability],
                ))
            }
        };

        let agent_id = agent.agent_id().to_string();
        let mut agents = self.leaf_agents.write().await;
        agents.insert(agent_id, agent);
    }

    /// Find a leaf agent that handles the given capability.
    async fn find_leaf_for_capability(&self, capability: &str) -> Option<String> {
        let agents = self.leaf_agents.read().await;
        for (id, agent) in agents.iter() {
            if agent.capabilities().contains(&capability.to_string()) {
                return Some(id.clone());
            }
        }
        None
    }

    /// Decompose a task using the LLM, falling back to heuristic decomposition.
    async fn decompose_task(
        &self,
        task: &str,
        context: &serde_json::Value,
    ) -> Vec<Subtask> {
        if let Some(ref client) = self.llm_client {
            match self.decompose_with_llm(client, task, context).await {
                Ok(subtasks) if !subtasks.is_empty() => return subtasks,
                Ok(_) => {
                    warn!("LLM returned empty subtask list, falling back to heuristic");
                }
                Err(e) => {
                    warn!(error = %e, "LLM decomposition failed, falling back to heuristic");
                }
            }
        }

        // Heuristic fallback
        self.decompose_heuristic(task, context)
    }

    /// Use the LLM to decompose a task into subtasks.
    async fn decompose_with_llm(
        &self,
        client: &LlmClient,
        task: &str,
        context: &serde_json::Value,
    ) -> Result<Vec<Subtask>, LunaError> {
        let user_message = if context.is_null() || context.as_object().map_or(true, |o| o.is_empty()) {
            format!("Task: {}", task)
        } else {
            format!("Task: {}\nContext: {}", task, context)
        };

        let messages = vec![LlmMessage {
            role: "user".to_string(),
            content: user_message,
        }];

        let response = client
            .send(ORCHESTRATOR_SYSTEM_PROMPT, &messages, 2048)
            .await?;

        info!(
            input_tokens = response.input_tokens,
            output_tokens = response.output_tokens,
            "Orchestrator LLM decomposition complete"
        );

        // Parse the JSON array from the response
        let content = response.content.trim();

        // Try to extract JSON array from the response (handle markdown fences)
        let json_str = if let Some(start) = content.find('[') {
            if let Some(end) = content.rfind(']') {
                &content[start..=end]
            } else {
                content
            }
        } else {
            content
        };

        let subtasks: Vec<Subtask> = serde_json::from_str(json_str).map_err(|e| {
            LunaError::Agent(format!(
                "Failed to parse LLM subtask response: {}. Raw: {}",
                e,
                &content[..content.len().min(200)]
            ))
        })?;

        // Validate that all subtasks use known capabilities
        let valid_subtasks: Vec<Subtask> = subtasks
            .into_iter()
            .filter(|s| KNOWN_CAPABILITIES.contains(&s.action_type.as_str()))
            .collect();

        Ok(valid_subtasks)
    }

    /// Heuristic-based task decomposition (no LLM needed).
    fn decompose_heuristic(&self, task: &str, _context: &serde_json::Value) -> Vec<Subtask> {
        let lower = task.to_lowercase();

        let mut subtasks = Vec::new();

        if lower.contains("list") || lower.contains("show files") || lower.contains("directory") {
            subtasks.push(Subtask {
                action_type: "file.list".to_string(),
                payload: serde_json::json!({"path": "."}),
                description: "List files in workspace".to_string(),
            });
        }

        if lower.contains("read") || lower.contains("show") || lower.contains("cat") || lower.contains("content") {
            // Try to extract a filename from the task
            subtasks.push(Subtask {
                action_type: "file.read".to_string(),
                payload: serde_json::json!({"path": "."}),
                description: format!("Read file: {}", task),
            });
        }

        if lower.contains("write") || lower.contains("create file") || lower.contains("save") {
            subtasks.push(Subtask {
                action_type: "file.write".to_string(),
                payload: serde_json::json!({"path": "output.txt", "content": ""}),
                description: format!("Write file: {}", task),
            });
        }

        if lower.contains("run") || lower.contains("execute") || lower.contains("command") || lower.contains("shell") {
            subtasks.push(Subtask {
                action_type: "shell.execute".to_string(),
                payload: serde_json::json!({"command": "echo", "args": ["task pending"]}),
                description: format!("Execute command: {}", task),
            });
        }

        if lower.contains("search") || lower.contains("find") || lower.contains("locate") {
            subtasks.push(Subtask {
                action_type: "search.local".to_string(),
                payload: serde_json::json!({"pattern": "*"}),
                description: format!("Search: {}", task),
            });
        }

        // If no heuristic matched, create a generic stub task
        if subtasks.is_empty() {
            subtasks.push(Subtask {
                action_type: "shell.execute".to_string(),
                payload: serde_json::json!({
                    "command": "echo",
                    "args": [format!("Task received: {}", task)]
                }),
                description: format!("Generic task: {}", task),
            });
        }

        subtasks
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
        task_graph: &Arc<TaskGraph>,
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

        // Add root task to task graph as Running
        let root_task_graph_id = task_graph.add_task(None, task, &self.id);
        task_graph.update_status(
            &root_task_graph_id,
            crate::agent::task_graph::TaskStatus::Running,
        );

        // Step 1: Decompose the task
        scratchpad.write(
            &self.workspace_id,
            task_id,
            &self.id,
            1,
            "Decomposing task into subtasks...",
            None,
        ).await;

        let subtasks = self.decompose_task(task, context).await;

        scratchpad.write(
            &self.workspace_id,
            task_id,
            &self.id,
            2,
            &format!("Decomposed into {} subtask(s)", subtasks.len()),
            None,
        ).await;

        info!(
            orchestrator = %self.id,
            subtask_count = subtasks.len(),
            "Task decomposed"
        );

        // Step 2: Execute subtasks sequentially
        let mut results: Vec<serde_json::Value> = Vec::new();
        let mut all_succeeded = true;
        let mut failure_reason = String::new();

        for (i, subtask) in subtasks.iter().enumerate() {
            let step = (i as u32) + 3; // Steps 3+ for execution

            // Add subtask to task graph
            let subtask_graph_id = task_graph.add_task(
                Some(&root_task_graph_id),
                &subtask.description,
                &self.id,
            );
            task_graph.update_status(
                &subtask_graph_id,
                crate::agent::task_graph::TaskStatus::Running,
            );

            scratchpad.write(
                &self.workspace_id,
                task_id,
                &self.id,
                step,
                &format!(
                    "Executing subtask {}/{}: {} ({})",
                    i + 1,
                    subtasks.len(),
                    subtask.description,
                    subtask.action_type
                ),
                None,
            ).await;

            // Ensure we have a leaf agent for this capability
            self.ensure_leaf_agent(&subtask.action_type).await;

            // Find the leaf agent
            let leaf_id = self.find_leaf_for_capability(&subtask.action_type).await;

            if let Some(leaf_id) = leaf_id {
                // Execute with the leaf agent
                let exec_result = {
                    let agents = self.leaf_agents.read().await;
                    if let Some(leaf) = agents.get(&leaf_id) {
                        timeout(
                            Duration::from_millis(30_000),
                            leaf.handle(task_id, &subtask.action_type, subtask.payload.clone()),
                        ).await
                    } else {
                        Ok(Err(LunaError::Agent("Leaf agent disappeared".to_string())))
                    }
                };

                match exec_result {
                    Ok(Ok(AgentMessage::Report { result, status, .. })) => {
                        let succeeded = status == crate::agent::messaging::TaskStatus::Completed;
                        if succeeded {
                            task_graph.complete_task(&subtask_graph_id, Some(result.clone()));
                        } else {
                            task_graph.fail_task(&subtask_graph_id, "Leaf agent reported failure");
                            all_succeeded = false;
                            failure_reason = format!("Subtask '{}' failed", subtask.description);
                        }
                        results.push(serde_json::json!({
                            "subtask": subtask.description,
                            "action_type": subtask.action_type,
                            "status": if succeeded { "completed" } else { "failed" },
                            "result": result,
                        }));
                    }
                    Ok(Ok(other)) => {
                        warn!(msg = ?other, "Unexpected message type from leaf agent");
                        task_graph.fail_task(&subtask_graph_id, "Unexpected response from leaf agent");
                        all_succeeded = false;
                        failure_reason = format!("Unexpected response for subtask '{}'", subtask.description);
                        results.push(serde_json::json!({
                            "subtask": subtask.description,
                            "action_type": subtask.action_type,
                            "status": "error",
                            "error": "Unexpected message type from leaf agent",
                        }));
                    }
                    Ok(Err(e)) => {
                        warn!(error = %e, subtask = %subtask.description, "Leaf agent error");
                        task_graph.fail_task(&subtask_graph_id, &e.to_string());
                        all_succeeded = false;
                        failure_reason = format!("Subtask '{}' error: {}", subtask.description, e);
                        results.push(serde_json::json!({
                            "subtask": subtask.description,
                            "action_type": subtask.action_type,
                            "status": "error",
                            "error": e.to_string(),
                        }));
                    }
                    Err(_) => {
                        warn!(subtask = %subtask.description, "Subtask timed out");
                        task_graph.fail_task(&subtask_graph_id, "Timed out");
                        all_succeeded = false;
                        failure_reason = format!("Subtask '{}' timed out", subtask.description);
                        results.push(serde_json::json!({
                            "subtask": subtask.description,
                            "action_type": subtask.action_type,
                            "status": "timeout",
                            "error": "Subtask timed out after 30s",
                        }));
                    }
                }
            } else {
                warn!(capability = %subtask.action_type, "No leaf agent found for capability");
                task_graph.fail_task(&subtask_graph_id, "No agent for capability");
                all_succeeded = false;
                failure_reason = format!("No agent available for capability '{}'", subtask.action_type);
                results.push(serde_json::json!({
                    "subtask": subtask.description,
                    "action_type": subtask.action_type,
                    "status": "error",
                    "error": format!("No leaf agent for capability '{}'", subtask.action_type),
                }));
            }
        }

        // Step 3: Post results to scratchpad
        let final_step = (subtasks.len() as u32) + 3;
        let summary = if all_succeeded {
            format!("All {} subtask(s) completed successfully", subtasks.len())
        } else {
            format!("Task completed with errors: {}", failure_reason)
        };

        scratchpad.write(
            &self.workspace_id,
            task_id,
            &self.id,
            final_step,
            &summary,
            None,
        ).await;

        // Update root task in task graph
        if all_succeeded {
            task_graph.complete_task(
                &root_task_graph_id,
                Some(serde_json::json!({"subtask_results": &results})),
            );

            AgentMessage::Complete {
                task_id: task_id.clone(),
                result: serde_json::json!({
                    "status": "completed",
                    "subtasks_executed": subtasks.len(),
                    "results": results,
                }),
            }
        } else {
            task_graph.fail_task(&root_task_graph_id, &failure_reason);

            AgentMessage::Escalate {
                task_id: task_id.clone(),
                from_agent: self.id.clone(),
                reason: failure_reason,
            }
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
        task_graph: Arc<TaskGraph>,
    ) {
        let id = orchestrator.id.clone();
        tauri::async_runtime::spawn(async move {
            let mut rx = message_bus.register(&id).await;
            agent_registry.set_status(&id, AgentStatus::Idle).await;

            info!(orchestrator = %id, "Orchestrator started, listening for messages");

            while let Some(envelope) = rx.recv().await {
                match &envelope.message {
                    AgentMessage::Delegate { ref task_id, ref task, ref context } => {
                        agent_registry.set_status(&id, AgentStatus::Busy).await;

                        let result = orchestrator.handle_delegation(
                            task_id,
                            task,
                            context,
                            &scratchpad,
                            &memory,
                            &task_graph,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_orchestrator(with_llm: bool) -> WorkspaceOrchestrator {
        let workspace_root = std::env::temp_dir();
        let llm_client = if with_llm {
            // We don't actually call the LLM in tests; this just verifies construction
            None
        } else {
            None
        };
        WorkspaceOrchestrator::new("test_ws", llm_client, workspace_root)
    }

    #[test]
    fn test_orchestrator_creation() {
        let orch = create_test_orchestrator(false);
        assert_eq!(orch.id, "orchestrator_test_ws");
        assert_eq!(orch.workspace_id, "test_ws");
        assert!(orch.llm_client.is_none());
    }

    #[test]
    fn test_agent_metadata() {
        let orch = create_test_orchestrator(false);
        let meta = orch.agent_metadata();
        assert_eq!(meta.agent_id, "orchestrator_test_ws");
        assert_eq!(meta.agent_type, AgentType::WorkspaceOrchestrator);
        assert!(meta.capabilities.contains(&"agent.delegate".to_string()));
    }

    #[test]
    fn test_heuristic_decompose_list() {
        let orch = create_test_orchestrator(false);
        let subtasks = orch.decompose_heuristic("list all files in the project", &serde_json::json!({}));
        assert!(!subtasks.is_empty());
        assert!(subtasks.iter().any(|s| s.action_type == "file.list"));
    }

    #[test]
    fn test_heuristic_decompose_read() {
        let orch = create_test_orchestrator(false);
        let subtasks = orch.decompose_heuristic("read the README file", &serde_json::json!({}));
        assert!(!subtasks.is_empty());
        assert!(subtasks.iter().any(|s| s.action_type == "file.read"));
    }

    #[test]
    fn test_heuristic_decompose_shell() {
        let orch = create_test_orchestrator(false);
        let subtasks = orch.decompose_heuristic("run the build command", &serde_json::json!({}));
        assert!(!subtasks.is_empty());
        assert!(subtasks.iter().any(|s| s.action_type == "shell.execute"));
    }

    #[test]
    fn test_heuristic_decompose_search() {
        let orch = create_test_orchestrator(false);
        let subtasks = orch.decompose_heuristic("search for all rust files", &serde_json::json!({}));
        assert!(!subtasks.is_empty());
        assert!(subtasks.iter().any(|s| s.action_type == "search.local"));
    }

    #[test]
    fn test_heuristic_decompose_unknown() {
        let orch = create_test_orchestrator(false);
        let subtasks = orch.decompose_heuristic("do something abstract", &serde_json::json!({}));
        assert!(!subtasks.is_empty());
        // Should fall back to shell.execute echo
        assert!(subtasks.iter().any(|s| s.action_type == "shell.execute"));
    }

    #[test]
    fn test_heuristic_decompose_multi() {
        let orch = create_test_orchestrator(false);
        let subtasks = orch.decompose_heuristic(
            "search for config files and list the directory",
            &serde_json::json!({}),
        );
        assert!(subtasks.len() >= 2);
        assert!(subtasks.iter().any(|s| s.action_type == "search.local"));
        assert!(subtasks.iter().any(|s| s.action_type == "file.list"));
    }

    #[tokio::test]
    async fn test_ensure_leaf_agent_creates_file_leaf() {
        let orch = create_test_orchestrator(false);
        orch.ensure_leaf_agent("file.read").await;

        let leaf_id = orch.find_leaf_for_capability("file.read").await;
        assert!(leaf_id.is_some());

        // The file leaf also handles file.write and file.list
        let leaf_id2 = orch.find_leaf_for_capability("file.write").await;
        assert!(leaf_id2.is_some());
    }

    #[tokio::test]
    async fn test_ensure_leaf_agent_creates_shell_leaf() {
        let orch = create_test_orchestrator(false);
        orch.ensure_leaf_agent("shell.execute").await;

        let leaf_id = orch.find_leaf_for_capability("shell.execute").await;
        assert!(leaf_id.is_some());
    }

    #[tokio::test]
    async fn test_ensure_leaf_agent_creates_search_leaf() {
        let orch = create_test_orchestrator(false);
        orch.ensure_leaf_agent("search.local").await;

        let leaf_id = orch.find_leaf_for_capability("search.local").await;
        assert!(leaf_id.is_some());
    }

    #[tokio::test]
    async fn test_ensure_leaf_agent_idempotent() {
        let orch = create_test_orchestrator(false);
        orch.ensure_leaf_agent("shell.execute").await;
        orch.ensure_leaf_agent("shell.execute").await;

        let agents = orch.leaf_agents.read().await;
        // Should only have one shell agent
        let shell_count = agents
            .values()
            .filter(|a| a.capabilities().contains(&"shell.execute".to_string()))
            .count();
        assert_eq!(shell_count, 1);
    }

    #[tokio::test]
    async fn test_decompose_task_without_llm() {
        let orch = create_test_orchestrator(false);
        let subtasks = orch
            .decompose_task("list all files", &serde_json::json!({}))
            .await;
        assert!(!subtasks.is_empty());
        assert!(subtasks.iter().any(|s| s.action_type == "file.list"));
    }

    #[tokio::test]
    async fn test_handle_delegation_executes_subtask() {
        let workspace = tempfile::tempdir().unwrap();
        std::fs::write(workspace.path().join("test.txt"), "hello").unwrap();

        let orch = WorkspaceOrchestrator::new(
            "test_ws",
            None,
            workspace.path().to_path_buf(),
        );

        let scratchpad = Arc::new(Scratchpad::new());
        let memory = {
            let db = crate::persistence::db::Database::new(":memory:")
                .expect("in-memory db");
            Arc::new(MemorySystem::new(Arc::new(tokio::sync::Mutex::new(db))))
        };
        let task_graph = Arc::new(TaskGraph::new());

        let result = orch
            .handle_delegation(
                &"test_task_1".to_string(),
                "list all files in the directory",
                &serde_json::json!({}),
                &scratchpad,
                &memory,
                &task_graph,
            )
            .await;

        match result {
            AgentMessage::Complete { result, .. } => {
                assert_eq!(result["status"], "completed");
                assert!(result["subtasks_executed"].as_u64().unwrap() >= 1);
            }
            AgentMessage::Escalate { reason, .. } => {
                panic!("Expected Complete, got Escalate: {}", reason);
            }
            other => {
                panic!("Expected Complete, got {:?}", other);
            }
        }

        // Verify task graph was updated
        let tree = task_graph.get_tree();
        assert!(!tree.is_empty());
    }
}
