use serde::{Deserialize, Serialize};

/// A component specification within an app descriptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentSpec {
    pub id: String,
    #[serde(rename = "type")]
    pub component_type: String,
    #[serde(default)]
    pub props: serde_json::Value,
    #[serde(default)]
    pub children: Vec<ComponentSpec>,
    #[serde(default)]
    pub events: serde_json::Map<String, serde_json::Value>,
    #[serde(default)]
    pub layout: serde_json::Value,
}

/// A dynamic action declared by an app.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicActionDef {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub parameters: serde_json::Value,
    #[serde(default = "default_persistence")]
    pub persistence: String,
}

fn default_persistence() -> String {
    "ephemeral".to_string()
}

/// Top-level descriptor for a dynamic app emitted by the LLM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDescriptor {
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(rename = "type", default = "default_app_type")]
    pub app_type: String,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_layout")]
    pub layout: serde_json::Value,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
    pub components: Vec<ComponentSpec>,
    #[serde(default)]
    pub actions: Vec<DynamicActionDef>,
    #[serde(default)]
    pub styles: serde_json::Value,
    #[serde(default)]
    pub data: serde_json::Value,
}

fn default_version() -> String { "1.0".to_string() }
fn default_app_type() -> String { "application".to_string() }
fn default_layout() -> serde_json::Value { serde_json::json!("vertical") }

impl AppDescriptor {
    /// Validate the descriptor. Returns a list of errors (empty = valid).
    pub fn validate(&self) -> Vec<String> {
        let mut errors = Vec::new();

        if self.id.is_empty() {
            errors.push("App id is required".to_string());
        }
        if self.title.is_empty() {
            errors.push("App title is required".to_string());
        }
        if self.components.is_empty() {
            errors.push("App must have at least one component".to_string());
        }

        // Validate component IDs are unique
        let mut seen_ids = std::collections::HashSet::new();
        self.validate_components(&self.components, &mut seen_ids, &mut errors);

        errors
    }

    fn validate_components(
        &self,
        components: &[ComponentSpec],
        seen: &mut std::collections::HashSet<String>,
        errors: &mut Vec<String>,
    ) {
        for comp in components {
            if comp.id.is_empty() {
                errors.push("Component id is required".to_string());
            }
            if !seen.insert(comp.id.clone()) {
                errors.push(format!("Duplicate component id: {}", comp.id));
            }
            if comp.component_type.is_empty() {
                errors.push(format!("Component {} has no type", comp.id));
            }
            // Recurse into children
            self.validate_components(&comp.children, seen, errors);
        }
    }
}
