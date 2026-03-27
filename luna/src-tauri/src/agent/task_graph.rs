use std::collections::HashMap;
use std::sync::RwLock;

use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub label: String,
    pub status: TaskStatus,
    pub agent_id: String,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub result: Option<serde_json::Value>,
}

/// Tracks task decomposition as a tree of TaskNodes.
pub struct TaskGraph {
    nodes: RwLock<HashMap<String, TaskNode>>,
}

impl TaskGraph {
    pub fn new() -> Self {
        Self {
            nodes: RwLock::new(HashMap::new()),
        }
    }

    /// Add a new task, optionally as a child of another task.
    pub fn add_task(
        &self,
        parent_id: Option<&str>,
        label: &str,
        agent_id: &str,
    ) -> String {
        let id = Uuid::new_v4().to_string();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let node = TaskNode {
            id: id.clone(),
            parent_id: parent_id.map(String::from),
            label: label.to_string(),
            status: TaskStatus::Pending,
            agent_id: agent_id.to_string(),
            created_at: now,
            completed_at: None,
            result: None,
        };

        let mut nodes = self.nodes.write().unwrap_or_else(|e| e.into_inner());
        nodes.insert(id.clone(), node);
        id
    }

    /// Update the status of a task.
    pub fn update_status(&self, task_id: &str, status: TaskStatus) {
        let mut nodes = self.nodes.write().unwrap_or_else(|e| e.into_inner());
        if let Some(node) = nodes.get_mut(task_id) {
            node.status = status;
        }
    }

    /// Mark a task as completed with an optional result.
    pub fn complete_task(&self, task_id: &str, result: Option<serde_json::Value>) {
        let mut nodes = self.nodes.write().unwrap_or_else(|e| e.into_inner());
        if let Some(node) = nodes.get_mut(task_id) {
            node.status = TaskStatus::Completed;
            node.completed_at = Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            );
            node.result = result;
        }
    }

    /// Mark a task as failed.
    pub fn fail_task(&self, task_id: &str, reason: &str) {
        let mut nodes = self.nodes.write().unwrap_or_else(|e| e.into_inner());
        if let Some(node) = nodes.get_mut(task_id) {
            node.status = TaskStatus::Failed;
            node.completed_at = Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
            );
            node.result = Some(serde_json::json!({ "error": reason }));
        }
    }

    /// Get the full task tree as a flat list (frontend builds tree from parent_id links).
    pub fn get_tree(&self) -> Vec<TaskNode> {
        let nodes = self.nodes.read().unwrap_or_else(|e| e.into_inner());
        nodes.values().cloned().collect()
    }

    /// Get a single task node.
    pub fn get_task(&self, task_id: &str) -> Option<TaskNode> {
        let nodes = self.nodes.read().unwrap_or_else(|e| e.into_inner());
        nodes.get(task_id).cloned()
    }

    /// Clear all tasks (for new sessions).
    pub fn clear(&self) {
        let mut nodes = self.nodes.write().unwrap_or_else(|e| e.into_inner());
        nodes.clear();
    }
}
