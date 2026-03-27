use crate::error::LunaError;
use serde::{Deserialize, Serialize};

/// High-level permission categories that apps can request.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Permission {
    FileSystem,
    Network,
    Memory,
    WindowManagement,
}

impl Permission {
    /// Map an action_type string to its high-level permission category, if any.
    pub fn from_action_type(action_type: &str) -> Option<Self> {
        if action_type.starts_with("file.") {
            Some(Permission::FileSystem)
        } else if action_type.starts_with("network.") || action_type.starts_with("http.") {
            Some(Permission::Network)
        } else if action_type.starts_with("memory.") {
            Some(Permission::Memory)
        } else if action_type.starts_with("window.") {
            Some(Permission::WindowManagement)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppManifest {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    /// Required permissions for this app
    pub permissions: Vec<ManifestPermission>,
    /// Entry point — the descriptor ID or template ID
    pub entry: String,
    /// Supported primitives/component types
    pub primitives: Vec<String>,
    /// Minimum Luna OS version required
    pub min_luna_version: Option<String>,
    /// App icon path (optional)
    pub icon: Option<String>,
    /// App categories
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestPermission {
    pub action_type: String,
    pub reason: String,
    pub required: bool,
}

impl AppManifest {
    /// Construct an AppManifest from a JSON value with validation.
    pub fn from_json(value: &serde_json::Value) -> Result<Self, LunaError> {
        let manifest: AppManifest = serde_json::from_value(value.clone())
            .map_err(|e| LunaError::Migration(format!("Invalid manifest JSON: {}", e)))?;

        let errors = ManifestValidator::validate(&manifest);
        if !errors.is_empty() {
            return Err(LunaError::Migration(format!(
                "Manifest validation failed: {}",
                errors.join("; ")
            )));
        }

        Ok(manifest)
    }

    /// Validate this manifest, returning any errors found.
    pub fn validate(&self) -> Vec<String> {
        ManifestValidator::validate(self)
    }

    /// Return the high-level permission categories this app requests.
    pub fn permission_categories(&self) -> Vec<Permission> {
        self.permissions
            .iter()
            .filter_map(|p| Permission::from_action_type(&p.action_type))
            .collect()
    }
}

pub struct ManifestValidator;

impl ManifestValidator {
    /// Validate a manifest. Returns list of errors (empty = valid).
    pub fn validate(manifest: &AppManifest) -> Vec<String> {
        let mut errors = Vec::new();

        if manifest.name.is_empty() {
            errors.push("Manifest name is required".to_string());
        }
        if manifest.version.is_empty() {
            errors.push("Manifest version is required".to_string());
        }
        if manifest.entry.is_empty() {
            errors.push("Manifest entry point is required".to_string());
        }

        // Validate version format (semver-like: x.y or x.y.z)
        if !manifest.version.is_empty() && !Self::is_valid_version(&manifest.version) {
            errors.push(format!("Invalid version format: {}", manifest.version));
        }

        // Validate permissions have action_type
        for (i, perm) in manifest.permissions.iter().enumerate() {
            if perm.action_type.is_empty() {
                errors.push(format!("Permission {} has no action_type", i));
            }
        }

        // Validate primitives are known types
        let known_primitives = [
            "button",
            "text",
            "text_input",
            "number_input",
            "select",
            "checkbox",
            "slider",
            "panel",
            "container",
            "card",
            "tabs",
            "modal",
            "data_table",
            "chart",
            "image",
        ];
        for prim in &manifest.primitives {
            if !known_primitives.contains(&prim.as_str()) {
                errors.push(format!("Unknown primitive type: {}", prim));
            }
        }

        errors
    }

    fn is_valid_version(version: &str) -> bool {
        let parts: Vec<&str> = version.split('.').collect();
        if parts.len() < 2 || parts.len() > 3 {
            return false;
        }
        parts.iter().all(|p| p.parse::<u32>().is_ok())
    }

    /// Extract required permissions from a manifest.
    pub fn required_permissions(manifest: &AppManifest) -> Vec<&ManifestPermission> {
        manifest.permissions.iter().filter(|p| p.required).collect()
    }

    /// Check if a manifest's permissions are satisfied by a set of granted permissions.
    /// Returns list of UNMET required permissions.
    pub fn check_permissions(
        manifest: &AppManifest,
        granted: &[String],
    ) -> Vec<ManifestPermission> {
        manifest
            .permissions
            .iter()
            .filter(|p| p.required && !granted.contains(&p.action_type))
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_manifest(name: &str, version: &str, entry: &str) -> AppManifest {
        AppManifest {
            name: name.to_string(),
            version: version.to_string(),
            description: None,
            author: None,
            license: None,
            permissions: vec![],
            entry: entry.to_string(),
            primitives: vec![],
            min_luna_version: None,
            icon: None,
            categories: vec![],
        }
    }

    #[test]
    fn test_valid_manifest_passes_validation() {
        let manifest = make_manifest("My App", "1.0", "main_descriptor");
        let errors = ManifestValidator::validate(&manifest);
        assert!(errors.is_empty(), "Expected no errors, got: {:?}", errors);
    }

    #[test]
    fn test_missing_name_fails_validation() {
        let manifest = make_manifest("", "1.0", "main");
        let errors = ManifestValidator::validate(&manifest);
        assert!(errors.iter().any(|e| e.contains("name is required")));
    }

    #[test]
    fn test_invalid_version_format_fails() {
        let manifest = make_manifest("App", "abc", "main");
        let errors = ManifestValidator::validate(&manifest);
        assert!(errors.iter().any(|e| e.contains("Invalid version format")));

        // Single number is invalid
        let manifest2 = make_manifest("App", "1", "main");
        let errors2 = ManifestValidator::validate(&manifest2);
        assert!(errors2.iter().any(|e| e.contains("Invalid version format")));

        // Four parts is invalid
        let manifest3 = make_manifest("App", "1.2.3.4", "main");
        let errors3 = ManifestValidator::validate(&manifest3);
        assert!(errors3.iter().any(|e| e.contains("Invalid version format")));

        // Valid x.y.z should pass
        let manifest4 = make_manifest("App", "1.2.3", "main");
        let errors4 = ManifestValidator::validate(&manifest4);
        assert!(
            !errors4.iter().any(|e| e.contains("Invalid version format")),
            "1.2.3 should be valid"
        );
    }

    #[test]
    fn test_unknown_primitive_type_flagged() {
        let mut manifest = make_manifest("App", "1.0", "main");
        manifest.primitives = vec![
            "button".to_string(),
            "magic_widget".to_string(),
        ];
        let errors = ManifestValidator::validate(&manifest);
        assert!(errors.iter().any(|e| e.contains("Unknown primitive type: magic_widget")));
        // "button" is known, so no error for it
        assert!(!errors.iter().any(|e| e.contains("button")));
    }

    #[test]
    fn test_permission_check_identifies_unmet_permissions() {
        let mut manifest = make_manifest("App", "1.0", "main");
        manifest.permissions = vec![
            ManifestPermission {
                action_type: "file.read".to_string(),
                reason: "Read config files".to_string(),
                required: true,
            },
            ManifestPermission {
                action_type: "shell.execute".to_string(),
                reason: "Run scripts".to_string(),
                required: true,
            },
            ManifestPermission {
                action_type: "network.fetch".to_string(),
                reason: "Optional analytics".to_string(),
                required: false,
            },
        ];

        let granted = vec!["file.read".to_string()];
        let unmet = ManifestValidator::check_permissions(&manifest, &granted);

        // shell.execute is required but not granted
        assert_eq!(unmet.len(), 1);
        assert_eq!(unmet[0].action_type, "shell.execute");

        // network.fetch is not required, so it should not appear
        assert!(!unmet.iter().any(|p| p.action_type == "network.fetch"));
    }

    #[test]
    fn test_missing_entry_fails_validation() {
        let manifest = make_manifest("App", "1.0", "");
        let errors = ManifestValidator::validate(&manifest);
        assert!(errors.iter().any(|e| e.contains("entry point is required")));
    }

    #[test]
    fn test_permission_without_action_type_fails() {
        let mut manifest = make_manifest("App", "1.0", "main");
        manifest.permissions = vec![ManifestPermission {
            action_type: "".to_string(),
            reason: "No type".to_string(),
            required: true,
        }];
        let errors = ManifestValidator::validate(&manifest);
        assert!(errors.iter().any(|e| e.contains("has no action_type")));
    }

    #[test]
    fn test_required_permissions_extraction() {
        let mut manifest = make_manifest("App", "1.0", "main");
        manifest.permissions = vec![
            ManifestPermission {
                action_type: "file.read".to_string(),
                reason: "Needed".to_string(),
                required: true,
            },
            ManifestPermission {
                action_type: "network.fetch".to_string(),
                reason: "Optional".to_string(),
                required: false,
            },
        ];

        let required = ManifestValidator::required_permissions(&manifest);
        assert_eq!(required.len(), 1);
        assert_eq!(required[0].action_type, "file.read");
    }
}
