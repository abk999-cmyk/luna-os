use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::LunaError;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProjectType {
    Rust,
    Node,
    Python,
    Go,
    Mixed,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedProject {
    pub project_type: ProjectType,
    pub name: Option<String>,
    pub root_path: PathBuf,
    pub detected_tools: Vec<String>,
    pub suggested_workspace_name: String,
}

// ── ProjectDetector ──────────────────────────────────────────────────────────

pub struct ProjectDetector;

impl ProjectDetector {
    /// Scan a directory for project markers and return detection results.
    pub fn detect(path: &Path) -> Result<DetectedProject, LunaError> {
        if !path.is_dir() {
            return Err(LunaError::Migration(format!(
                "Not a directory: {}",
                path.display()
            )));
        }

        let mut detected: Vec<ProjectType> = Vec::new();
        let mut tools: Vec<String> = Vec::new();

        if Self::detect_rust(path) {
            detected.push(ProjectType::Rust);
            tools.push("cargo".to_string());
        }
        if Self::detect_node(path) {
            detected.push(ProjectType::Node);
            tools.push("npm".to_string());
            if path.join("yarn.lock").exists() {
                tools.push("yarn".to_string());
            }
            if path.join("pnpm-lock.yaml").exists() {
                tools.push("pnpm".to_string());
            }
        }
        if Self::detect_python(path) {
            detected.push(ProjectType::Python);
            if path.join("pyproject.toml").exists() {
                tools.push("poetry".to_string());
            }
            if path.join("requirements.txt").exists() {
                tools.push("pip".to_string());
            }
        }
        if Self::detect_go(path) {
            detected.push(ProjectType::Go);
            tools.push("go".to_string());
        }

        // Check for common tools
        if path.join(".git").exists() {
            tools.push("git".to_string());
        }
        if path.join("Dockerfile").exists() || path.join("docker-compose.yml").exists() {
            tools.push("docker".to_string());
        }

        let project_type = match detected.len() {
            0 => ProjectType::Unknown,
            1 => detected.into_iter().next().unwrap(),
            _ => ProjectType::Mixed,
        };

        let name = Self::extract_project_name(path, &project_type);

        let suggested_workspace_name = name.clone().unwrap_or_else(|| {
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("workspace")
                .to_string()
        });

        Ok(DetectedProject {
            project_type,
            name,
            root_path: path.to_path_buf(),
            detected_tools: tools,
            suggested_workspace_name,
        })
    }

    /// Check for Cargo.toml (Rust project).
    pub fn detect_rust(path: &Path) -> bool {
        path.join("Cargo.toml").exists()
    }

    /// Check for package.json (Node project).
    pub fn detect_node(path: &Path) -> bool {
        path.join("package.json").exists()
    }

    /// Check for pyproject.toml, setup.py, or requirements.txt (Python project).
    pub fn detect_python(path: &Path) -> bool {
        path.join("pyproject.toml").exists()
            || path.join("setup.py").exists()
            || path.join("requirements.txt").exists()
    }

    /// Check for go.mod (Go project).
    pub fn detect_go(path: &Path) -> bool {
        path.join("go.mod").exists()
    }

    /// Attempt to extract the project name from manifest files.
    pub fn extract_project_name(path: &Path, project_type: &ProjectType) -> Option<String> {
        match project_type {
            ProjectType::Rust => {
                let cargo = path.join("Cargo.toml");
                let content = std::fs::read_to_string(cargo).ok()?;
                // Simple parser: find name = "..."
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("name") && trimmed.contains('=') {
                        let value = trimmed.split('=').nth(1)?.trim();
                        let name = value.trim_matches('"').trim_matches('\'');
                        if !name.is_empty() {
                            return Some(name.to_string());
                        }
                    }
                }
                None
            }
            ProjectType::Node => {
                let pkg = path.join("package.json");
                let content = std::fs::read_to_string(pkg).ok()?;
                let parsed: serde_json::Value = serde_json::from_str(&content).ok()?;
                parsed.get("name")?.as_str().map(|s| s.to_string())
            }
            ProjectType::Go => {
                let gomod = path.join("go.mod");
                let content = std::fs::read_to_string(gomod).ok()?;
                // First line is typically: module github.com/user/project
                let first = content.lines().next()?;
                let module_path = first.strip_prefix("module ")?.trim();
                // Use the last segment as project name
                module_path.rsplit('/').next().map(|s| s.to_string())
            }
            _ => None,
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_detect_rust_project() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("Cargo.toml"), "[package]\nname = \"my-app\"\nversion = \"0.1.0\"\n").unwrap();
        let result = ProjectDetector::detect(dir.path()).unwrap();
        assert_eq!(result.project_type, ProjectType::Rust);
        assert_eq!(result.name, Some("my-app".to_string()));
        assert!(result.detected_tools.contains(&"cargo".to_string()));
    }

    #[test]
    fn test_detect_node_project() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("package.json"), r#"{"name": "my-node-app"}"#).unwrap();
        let result = ProjectDetector::detect(dir.path()).unwrap();
        assert_eq!(result.project_type, ProjectType::Node);
        assert_eq!(result.name, Some("my-node-app".to_string()));
    }

    #[test]
    fn test_detect_unknown_project() {
        let dir = TempDir::new().unwrap();
        let result = ProjectDetector::detect(dir.path()).unwrap();
        assert_eq!(result.project_type, ProjectType::Unknown);
        assert_eq!(result.name, None);
    }

    #[test]
    fn test_detect_mixed_project() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("Cargo.toml"), "[package]\nname = \"mixed\"\n").unwrap();
        fs::write(dir.path().join("package.json"), r#"{"name": "mixed"}"#).unwrap();
        let result = ProjectDetector::detect(dir.path()).unwrap();
        assert_eq!(result.project_type, ProjectType::Mixed);
        assert!(result.detected_tools.contains(&"cargo".to_string()));
        assert!(result.detected_tools.contains(&"npm".to_string()));
    }
}
