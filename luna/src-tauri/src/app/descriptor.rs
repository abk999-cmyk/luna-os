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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_component(id: &str, ctype: &str) -> ComponentSpec {
        ComponentSpec {
            id: id.to_string(),
            component_type: ctype.to_string(),
            props: serde_json::Value::Null,
            children: vec![],
            events: serde_json::Map::new(),
            layout: serde_json::Value::Null,
        }
    }

    fn make_descriptor(id: &str, title: &str, components: Vec<ComponentSpec>) -> AppDescriptor {
        AppDescriptor {
            version: "1.0".to_string(),
            app_type: "application".to_string(),
            id: id.to_string(),
            title: title.to_string(),
            description: None,
            layout: serde_json::json!("vertical"),
            width: None,
            height: None,
            components,
            actions: vec![],
            styles: serde_json::Value::Null,
            data: serde_json::Value::Null,
        }
    }

    #[test]
    fn test_validate_succeeds_with_valid_descriptor() {
        let desc = make_descriptor("my_app", "My App", vec![make_component("btn1", "button")]);
        let errors = desc.validate();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_fails_without_id() {
        let desc = make_descriptor("", "My App", vec![make_component("btn1", "button")]);
        let errors = desc.validate();
        assert!(errors.iter().any(|e| e.contains("id is required")));
    }

    #[test]
    fn test_validate_fails_without_title() {
        let desc = make_descriptor("app_1", "", vec![make_component("btn1", "button")]);
        let errors = desc.validate();
        assert!(errors.iter().any(|e| e.contains("title is required")));
    }

    #[test]
    fn test_validate_fails_with_duplicate_component_ids() {
        let desc = make_descriptor(
            "app_1",
            "My App",
            vec![make_component("dup", "button"), make_component("dup", "text")],
        );
        let errors = desc.validate();
        assert!(errors.iter().any(|e| e.contains("Duplicate component id: dup")));
    }
}
