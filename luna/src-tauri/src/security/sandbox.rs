use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::error::LunaError;

// ── Sandbox profile ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxProfile {
    pub name: String,
    /// Allowed filesystem paths (read)
    pub allowed_read_paths: Vec<PathBuf>,
    /// Allowed filesystem paths (write)
    pub allowed_write_paths: Vec<PathBuf>,
    /// Allowed shell commands (exact or prefix patterns)
    pub allowed_commands: Vec<String>,
    /// Denied shell commands (takes precedence over allowed)
    pub denied_commands: Vec<String>,
    /// Max execution time
    pub timeout: Duration,
    /// Max output size in bytes
    pub max_output_bytes: usize,
    /// Network access allowed
    pub network_allowed: bool,
    /// Max concurrent actions
    pub max_concurrent: u32,
}

// ── Sandbox tiers ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SandboxTier {
    /// Tier 1: System/Conductor — minimal restrictions
    Trusted,
    /// Tier 2: Orchestrator/registered agents — workspace-scoped
    Standard,
    /// Tier 3: LLM-created/dynamic agents — maximum restrictions
    Restricted,
}

// ── Sandbox manager ──────────────────────────────────────────────────────────

pub struct SandboxManager {
    profiles: RwLock<HashMap<String, SandboxProfile>>,
    agent_tiers: RwLock<HashMap<String, SandboxTier>>,
}

impl SandboxManager {
    /// Create a new sandbox manager with default profiles for each tier.
    pub fn new() -> Self {
        Self {
            profiles: RwLock::new(HashMap::new()),
            agent_tiers: RwLock::new(HashMap::new()),
        }
    }

    /// Get the default profile for a tier.
    pub fn default_profile(tier: SandboxTier) -> SandboxProfile {
        match tier {
            SandboxTier::Trusted => SandboxProfile {
                name: "trusted".into(),
                allowed_read_paths: vec![PathBuf::from("/")],
                allowed_write_paths: vec![PathBuf::from("/")],
                allowed_commands: vec!["*".into()],
                denied_commands: vec![],
                timeout: Duration::from_secs(300),
                max_output_bytes: 10 * 1024 * 1024, // 10 MB
                network_allowed: true,
                max_concurrent: 10,
            },
            SandboxTier::Standard => SandboxProfile {
                name: "standard".into(),
                allowed_read_paths: vec![PathBuf::from("/tmp/luna-workspace")],
                allowed_write_paths: vec![PathBuf::from("/tmp/luna-workspace")],
                allowed_commands: vec![
                    "ls".into(),
                    "cat".into(),
                    "grep".into(),
                    "git".into(),
                    "npm".into(),
                    "cargo".into(),
                    "python".into(),
                    "node".into(),
                ],
                denied_commands: vec![],
                timeout: Duration::from_secs(60),
                max_output_bytes: 1024 * 1024, // 1 MB
                network_allowed: true,
                max_concurrent: 5,
            },
            SandboxTier::Restricted => SandboxProfile {
                name: "restricted".into(),
                allowed_read_paths: vec![std::env::temp_dir()],
                allowed_write_paths: vec![std::env::temp_dir()],
                allowed_commands: vec!["echo".into(), "cat".into(), "ls".into()],
                denied_commands: vec![],
                timeout: Duration::from_secs(10),
                max_output_bytes: 100 * 1024, // 100 KB
                network_allowed: false,
                max_concurrent: 2,
            },
        }
    }

    /// Set agent tier.
    pub async fn set_agent_tier(&self, agent_id: &str, tier: SandboxTier) {
        self.agent_tiers
            .write()
            .await
            .insert(agent_id.to_string(), tier);
    }

    /// Get agent tier (defaults to Restricted for unknown agents).
    pub async fn get_agent_tier(&self, agent_id: &str) -> SandboxTier {
        self.agent_tiers
            .read()
            .await
            .get(agent_id)
            .copied()
            .unwrap_or(SandboxTier::Restricted)
    }

    /// Set a custom profile for an agent.
    pub async fn set_profile(&self, agent_id: &str, profile: SandboxProfile) {
        self.profiles
            .write()
            .await
            .insert(agent_id.to_string(), profile);
    }

    /// Get profile for an agent (custom profile if set, otherwise default for their tier).
    pub async fn get_profile(&self, agent_id: &str) -> SandboxProfile {
        if let Some(profile) = self.profiles.read().await.get(agent_id) {
            return profile.clone();
        }
        let tier = self.get_agent_tier(agent_id).await;
        Self::default_profile(tier)
    }

    /// Validate a file read operation against the agent's sandbox profile.
    pub async fn check_read(&self, agent_id: &str, path: &Path) -> Result<(), LunaError> {
        let profile = self.get_profile(agent_id).await;
        validate_path(path, &profile.allowed_read_paths, "read")
    }

    /// Validate a file write operation against the agent's sandbox profile.
    pub async fn check_write(&self, agent_id: &str, path: &Path) -> Result<(), LunaError> {
        let profile = self.get_profile(agent_id).await;
        validate_path(path, &profile.allowed_write_paths, "write")
    }

    /// Validate a shell command against the agent's sandbox profile.
    pub async fn check_command(&self, agent_id: &str, command: &str) -> Result<(), LunaError> {
        let profile = self.get_profile(agent_id).await;
        validate_command(command, &profile.allowed_commands, &profile.denied_commands)
    }

    /// Get timeout for an agent's operations.
    pub async fn get_timeout(&self, agent_id: &str) -> Duration {
        self.get_profile(agent_id).await.timeout
    }
}

// ── Validation helpers ───────────────────────────────────────────────────────

/// Validate a path against a list of allowed paths.
fn validate_path(
    path: &Path,
    allowed_paths: &[PathBuf],
    operation: &str,
) -> Result<(), LunaError> {
    // Canonicalize the path. If it doesn't exist yet, canonicalize the parent
    // and append the file name so we can still validate the intended location.
    let canonical = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // For paths that don't exist yet, try to resolve what we can.
            if let Some(parent) = path.parent() {
                match parent.canonicalize() {
                    Ok(cp) => {
                        if let Some(file) = path.file_name() {
                            cp.join(file)
                        } else {
                            cp
                        }
                    }
                    Err(_) => {
                        return Err(LunaError::Permission(format!(
                            "Sandbox violation: cannot resolve path for {operation}: {}",
                            path.display()
                        )));
                    }
                }
            } else {
                return Err(LunaError::Permission(format!(
                    "Sandbox violation: cannot resolve path for {operation}: {}",
                    path.display()
                )));
            }
        }
    };

    // Reject path traversal (should not be present after canonicalization, but
    // guard defensively).
    if canonical.components().any(|c| c == std::path::Component::ParentDir) {
        return Err(LunaError::Permission(format!(
            "Sandbox violation: path traversal detected in {operation} path: {}",
            path.display()
        )));
    }

    // Check that the canonical path falls under at least one allowed path.
    for allowed in allowed_paths {
        // Canonicalize the allowed path as well, falling back to the raw value
        // when it doesn't exist on the current system (e.g. in tests).
        let allowed_canonical = allowed.canonicalize().unwrap_or_else(|_| allowed.clone());
        if canonical.starts_with(&allowed_canonical) {
            return Ok(());
        }
    }

    Err(LunaError::Permission(format!(
        "Sandbox violation: {operation} access denied for path: {}",
        path.display()
    )))
}

/// Validate a command against allowed and denied lists.
fn validate_command(
    command: &str,
    allowed: &[String],
    denied: &[String],
) -> Result<(), LunaError> {
    let base_command = command.split_whitespace().next().unwrap_or("");

    if base_command.is_empty() {
        return Err(LunaError::Permission(
            "Sandbox violation: empty command".into(),
        ));
    }

    // Denied commands take precedence.
    for pattern in denied {
        if base_command == pattern || base_command.starts_with(pattern) {
            return Err(LunaError::Permission(format!(
                "Sandbox violation: command '{}' is explicitly denied",
                base_command
            )));
        }
    }

    // Wildcard allows everything.
    if allowed.iter().any(|a| a == "*") {
        return Ok(());
    }

    // Check allowed commands.
    for pattern in allowed {
        if base_command == pattern || base_command.starts_with(pattern) {
            return Ok(());
        }
    }

    Err(LunaError::Permission(format!(
        "Sandbox violation: command '{}' is not allowed",
        base_command
    )))
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn default_tier_for_unknown_agent_is_restricted() {
        let mgr = SandboxManager::new();
        assert_eq!(mgr.get_agent_tier("unknown_agent").await, SandboxTier::Restricted);
    }

    #[tokio::test]
    async fn trusted_tier_allows_all_paths() {
        let mgr = SandboxManager::new();
        mgr.set_agent_tier("trusted_agent", SandboxTier::Trusted).await;

        // Any absolute path should be allowed for read and write.
        let _path = PathBuf::from("/usr/local/bin/something");
        // Trusted allows root "/", so any existing canonical path is fine.
        // We test with temp dir which definitely exists.
        let tmp = std::env::temp_dir();
        assert!(mgr.check_read("trusted_agent", &tmp).await.is_ok());
        assert!(mgr.check_write("trusted_agent", &tmp).await.is_ok());

        // Also verify with a path under root that exists.
        let root = PathBuf::from("/");
        assert!(mgr.check_read("trusted_agent", &root).await.is_ok());
    }

    #[tokio::test]
    async fn standard_tier_allows_workspace_paths() {
        let mgr = SandboxManager::new();
        mgr.set_agent_tier("std_agent", SandboxTier::Standard).await;

        // Create a temporary workspace directory to simulate /tmp/luna-workspace.
        let workspace = std::env::temp_dir().join("luna-workspace");
        std::fs::create_dir_all(&workspace).ok();
        let test_file = workspace.join("test.txt");
        std::fs::write(&test_file, "test").ok();

        // Override with a custom profile pointing to the actual workspace.
        let mut profile = SandboxManager::default_profile(SandboxTier::Standard);
        profile.allowed_read_paths = vec![workspace.clone()];
        profile.allowed_write_paths = vec![workspace.clone()];
        mgr.set_profile("std_agent", profile).await;

        assert!(mgr.check_read("std_agent", &test_file).await.is_ok());
        assert!(mgr.check_write("std_agent", &test_file).await.is_ok());

        // Cleanup
        std::fs::remove_file(&test_file).ok();
    }

    #[tokio::test]
    async fn restricted_tier_denies_paths_outside_temp() {
        let mgr = SandboxManager::new();
        // Unknown agent defaults to Restricted.
        let outside = PathBuf::from("/usr/local/bin");
        let result = mgr.check_read("dynamic_agent", &outside).await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Sandbox violation"));
    }

    #[tokio::test]
    async fn command_validation_allows_listed_commands() {
        let mgr = SandboxManager::new();
        mgr.set_agent_tier("agent_a", SandboxTier::Standard).await;

        assert!(mgr.check_command("agent_a", "ls -la").await.is_ok());
        assert!(mgr.check_command("agent_a", "git status").await.is_ok());
        assert!(mgr.check_command("agent_a", "cargo build").await.is_ok());
        assert!(mgr.check_command("agent_a", "npm install").await.is_ok());
    }

    #[tokio::test]
    async fn command_validation_denies_unlisted_commands() {
        let mgr = SandboxManager::new();
        mgr.set_agent_tier("agent_b", SandboxTier::Restricted).await;

        // Restricted only allows echo, cat, ls.
        let result = mgr.check_command("agent_b", "rm -rf /").await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("not allowed"));
    }

    #[tokio::test]
    async fn denied_commands_take_precedence_over_allowed() {
        let mgr = SandboxManager::new();

        // Create a custom profile where "git" is both allowed and denied.
        let profile = SandboxProfile {
            name: "custom".into(),
            allowed_read_paths: vec![],
            allowed_write_paths: vec![],
            allowed_commands: vec!["git".into(), "ls".into()],
            denied_commands: vec!["git".into()],
            timeout: Duration::from_secs(30),
            max_output_bytes: 1024,
            network_allowed: false,
            max_concurrent: 1,
        };
        mgr.set_profile("agent_c", profile).await;

        let result = mgr.check_command("agent_c", "git push").await;
        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("explicitly denied"));

        // "ls" is allowed and not denied.
        assert!(mgr.check_command("agent_c", "ls -la").await.is_ok());
    }

    #[tokio::test]
    async fn path_traversal_is_rejected() {
        let mgr = SandboxManager::new();
        mgr.set_agent_tier("agent_d", SandboxTier::Standard).await;

        // Create workspace for the profile.
        let workspace = std::env::temp_dir().join("luna-workspace");
        std::fs::create_dir_all(&workspace).ok();
        let mut profile = SandboxManager::default_profile(SandboxTier::Standard);
        profile.allowed_read_paths = vec![workspace.clone()];
        mgr.set_profile("agent_d", profile).await;

        // Attempt to traverse out of workspace.
        let traversal = workspace.join("..").join("..").join("etc").join("passwd");
        let result = mgr.check_read("agent_d", &traversal).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn get_timeout_returns_tier_timeout() {
        let mgr = SandboxManager::new();

        // Restricted (default) → 10s
        assert_eq!(mgr.get_timeout("unknown").await, Duration::from_secs(10));

        mgr.set_agent_tier("std", SandboxTier::Standard).await;
        assert_eq!(mgr.get_timeout("std").await, Duration::from_secs(60));

        mgr.set_agent_tier("root", SandboxTier::Trusted).await;
        assert_eq!(mgr.get_timeout("root").await, Duration::from_secs(300));
    }

    #[tokio::test]
    async fn trusted_allows_all_commands() {
        let mgr = SandboxManager::new();
        mgr.set_agent_tier("root", SandboxTier::Trusted).await;

        assert!(mgr.check_command("root", "rm -rf /").await.is_ok());
        assert!(mgr.check_command("root", "dd if=/dev/zero of=/dev/sda").await.is_ok());
    }
}
