use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::error::LunaError;

// ── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum IsolationLevel {
    /// No cross-workspace communication
    Strict,
    /// Summarized data flows with conductor mediation
    Standard,
    /// Free data flow between workspaces
    Open,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspacePolicy {
    pub workspace_id: String,
    pub isolation_level: IsolationLevel,
    /// Explicit allow list of workspace IDs this workspace can communicate with
    pub allowed_peers: HashSet<String>,
}

// ── WorkspaceIsolation ──────────────────────────────────────────────────────

pub struct WorkspaceIsolation {
    policies: RwLock<HashMap<String, WorkspacePolicy>>,
    default_level: RwLock<IsolationLevel>,
}

impl WorkspaceIsolation {
    pub fn new() -> Self {
        Self {
            policies: RwLock::new(HashMap::new()),
            default_level: RwLock::new(IsolationLevel::Standard),
        }
    }

    /// Set isolation policy for a workspace.
    pub async fn set_policy(&self, policy: WorkspacePolicy) {
        let mut policies = self.policies.write().await;
        policies.insert(policy.workspace_id.clone(), policy);
    }

    /// Get isolation policy for a workspace. Returns a default policy if not set.
    pub async fn get_policy(&self, workspace_id: &str) -> WorkspacePolicy {
        let policies = self.policies.read().await;
        if let Some(policy) = policies.get(workspace_id) {
            policy.clone()
        } else {
            let default_level = self.default_level.read().await;
            WorkspacePolicy {
                workspace_id: workspace_id.to_string(),
                isolation_level: default_level.clone(),
                allowed_peers: HashSet::new(),
            }
        }
    }

    /// Set the default isolation level for new workspaces.
    pub async fn set_default_level(&self, level: IsolationLevel) {
        let mut default = self.default_level.write().await;
        *default = level;
    }

    /// Check if communication is allowed between two workspaces.
    pub async fn can_communicate(&self, from_workspace: &str, to_workspace: &str) -> bool {
        // Same workspace: always allowed
        if from_workspace == to_workspace {
            return true;
        }

        let from_policy = self.get_policy(from_workspace).await;
        let to_policy = self.get_policy(to_workspace).await;

        // If either workspace is Open, allow communication
        if from_policy.isolation_level == IsolationLevel::Open
            || to_policy.isolation_level == IsolationLevel::Open
        {
            return true;
        }

        // If either workspace is Strict, only allow if the other is in allowed_peers
        if from_policy.isolation_level == IsolationLevel::Strict {
            return from_policy.allowed_peers.contains(to_workspace);
        }
        if to_policy.isolation_level == IsolationLevel::Strict {
            return to_policy.allowed_peers.contains(from_workspace);
        }

        // Both Standard: allowed (data will be summarized by conductor)
        true
    }

    /// Add a peer to a workspace's allow list.
    pub async fn add_peer(&self, workspace_id: &str, peer_id: &str) {
        let mut policies = self.policies.write().await;
        let policy = policies
            .entry(workspace_id.to_string())
            .or_insert_with(|| {
                // We need to read default_level but we already hold a write lock on policies.
                // Use a sensible default; callers should set_policy first for full control.
                WorkspacePolicy {
                    workspace_id: workspace_id.to_string(),
                    isolation_level: IsolationLevel::Standard,
                    allowed_peers: HashSet::new(),
                }
            });
        policy.allowed_peers.insert(peer_id.to_string());
    }

    /// Remove a peer from a workspace's allow list.
    pub async fn remove_peer(&self, workspace_id: &str, peer_id: &str) {
        let mut policies = self.policies.write().await;
        if let Some(policy) = policies.get_mut(workspace_id) {
            policy.allowed_peers.remove(peer_id);
        }
    }

    /// Check if a message should be filtered/summarized.
    /// True if either workspace is Standard (not Open).
    pub async fn should_summarize(&self, from_workspace: &str, to_workspace: &str) -> bool {
        if from_workspace == to_workspace {
            return false;
        }

        let from_policy = self.get_policy(from_workspace).await;
        let to_policy = self.get_policy(to_workspace).await;

        // Only skip summarization when both are Open
        from_policy.isolation_level != IsolationLevel::Open
            || to_policy.isolation_level != IsolationLevel::Open
    }

    /// Validate that an agent can access a workspace.
    /// Returns Ok if can_communicate, Err(Permission) otherwise.
    pub async fn check_agent_access(
        &self,
        agent_id: &str,
        agent_workspace: &str,
        target_workspace: &str,
    ) -> Result<(), LunaError> {
        if self.can_communicate(agent_workspace, target_workspace).await {
            Ok(())
        } else {
            Err(LunaError::Permission(format!(
                "Agent '{}' in workspace '{}' cannot access workspace '{}': isolation policy denies cross-workspace communication",
                agent_id, agent_workspace, target_workspace
            )))
        }
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_same_workspace_always_communicates() {
        let isolation = WorkspaceIsolation::new();
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-1".to_string(),
                isolation_level: IsolationLevel::Strict,
                allowed_peers: HashSet::new(),
            })
            .await;

        assert!(isolation.can_communicate("ws-1", "ws-1").await);
    }

    #[tokio::test]
    async fn test_strict_blocks_cross_workspace() {
        let isolation = WorkspaceIsolation::new();
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-strict".to_string(),
                isolation_level: IsolationLevel::Strict,
                allowed_peers: HashSet::new(),
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-other".to_string(),
                isolation_level: IsolationLevel::Standard,
                allowed_peers: HashSet::new(),
            })
            .await;

        assert!(!isolation.can_communicate("ws-strict", "ws-other").await);
    }

    #[tokio::test]
    async fn test_open_allows_all() {
        let isolation = WorkspaceIsolation::new();
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-open".to_string(),
                isolation_level: IsolationLevel::Open,
                allowed_peers: HashSet::new(),
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-strict".to_string(),
                isolation_level: IsolationLevel::Strict,
                allowed_peers: HashSet::new(),
            })
            .await;

        // Open overrides strict
        assert!(isolation.can_communicate("ws-open", "ws-strict").await);
        assert!(isolation.can_communicate("ws-strict", "ws-open").await);
    }

    #[tokio::test]
    async fn test_standard_standard_allowed() {
        let isolation = WorkspaceIsolation::new();
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-a".to_string(),
                isolation_level: IsolationLevel::Standard,
                allowed_peers: HashSet::new(),
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-b".to_string(),
                isolation_level: IsolationLevel::Standard,
                allowed_peers: HashSet::new(),
            })
            .await;

        assert!(isolation.can_communicate("ws-a", "ws-b").await);
    }

    #[tokio::test]
    async fn test_allowed_peers_override_strict() {
        let isolation = WorkspaceIsolation::new();
        let mut allowed = HashSet::new();
        allowed.insert("ws-friend".to_string());

        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-strict".to_string(),
                isolation_level: IsolationLevel::Strict,
                allowed_peers: allowed,
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-friend".to_string(),
                isolation_level: IsolationLevel::Standard,
                allowed_peers: HashSet::new(),
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-stranger".to_string(),
                isolation_level: IsolationLevel::Standard,
                allowed_peers: HashSet::new(),
            })
            .await;

        assert!(isolation.can_communicate("ws-strict", "ws-friend").await);
        assert!(!isolation.can_communicate("ws-strict", "ws-stranger").await);
    }

    #[tokio::test]
    async fn test_check_agent_access_denied() {
        let isolation = WorkspaceIsolation::new();
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-locked".to_string(),
                isolation_level: IsolationLevel::Strict,
                allowed_peers: HashSet::new(),
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-other".to_string(),
                isolation_level: IsolationLevel::Standard,
                allowed_peers: HashSet::new(),
            })
            .await;

        let result = isolation
            .check_agent_access("agent-1", "ws-locked", "ws-other")
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_should_summarize() {
        let isolation = WorkspaceIsolation::new();
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-a".to_string(),
                isolation_level: IsolationLevel::Open,
                allowed_peers: HashSet::new(),
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-b".to_string(),
                isolation_level: IsolationLevel::Open,
                allowed_peers: HashSet::new(),
            })
            .await;
        isolation
            .set_policy(WorkspacePolicy {
                workspace_id: "ws-c".to_string(),
                isolation_level: IsolationLevel::Standard,
                allowed_peers: HashSet::new(),
            })
            .await;

        // Both Open: no summarization
        assert!(!isolation.should_summarize("ws-a", "ws-b").await);
        // One Standard: summarize
        assert!(isolation.should_summarize("ws-a", "ws-c").await);
        // Same workspace: never summarize
        assert!(!isolation.should_summarize("ws-a", "ws-a").await);
    }
}
