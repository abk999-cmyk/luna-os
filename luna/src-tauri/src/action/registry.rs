use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use crate::error::LunaError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ActionTier {
    Core,
    AppRegistered,
    LlmCreated,
}

/// Describes a required or optional field in an action payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDef {
    pub name: String,
    pub required: bool,
    pub field_type: FieldType,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FieldType {
    String,
    Number,
    Boolean,
    Object,
    Array,
    Any,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTypeDefinition {
    pub action_type: String,
    pub tier: ActionTier,
    pub description: String,
    pub fields: Vec<FieldDef>,
}

impl ActionTypeDefinition {
    /// Validate a payload against this action's field definitions.
    /// Returns Ok(()) if valid, or Err with a descriptive message.
    pub fn validate_payload(&self, payload: &serde_json::Value) -> Result<(), String> {
        for field in &self.fields {
            if !field.required {
                continue;
            }
            let value = payload.get(&field.name);
            match value {
                None => {
                    return Err(format!(
                        "Required field '{}' is missing in payload for action '{}'",
                        field.name, self.action_type
                    ));
                }
                Some(v) => {
                    if !self.type_matches(v, &field.field_type) {
                        return Err(format!(
                            "Field '{}' in action '{}' expected type {:?}, got {}",
                            field.name, self.action_type, field.field_type, v
                        ));
                    }
                }
            }
        }
        Ok(())
    }

    fn type_matches(&self, value: &serde_json::Value, expected: &FieldType) -> bool {
        match expected {
            FieldType::Any => true,
            FieldType::String => value.is_string(),
            FieldType::Number => value.is_number(),
            FieldType::Boolean => value.is_boolean(),
            FieldType::Object => value.is_object(),
            FieldType::Array => value.is_array(),
        }
    }

    /// Generate a human-readable description for the LLM system prompt.
    pub fn prompt_description(&self) -> String {
        let required: Vec<String> = self.fields.iter()
            .filter(|f| f.required)
            .map(|f| format!("\"{}\" ({})", f.name, f.description))
            .collect();
        let optional: Vec<String> = self.fields.iter()
            .filter(|f| !f.required)
            .map(|f| format!("\"{}\" ({})", f.name, f.description))
            .collect();

        let mut desc = format!("\"{}\" — {}", self.action_type, self.description);
        if !required.is_empty() {
            desc.push_str(&format!("\n  Required: {}", required.join(", ")));
        }
        if !optional.is_empty() {
            desc.push_str(&format!("\n  Optional: {}", optional.join(", ")));
        }
        desc
    }
}

pub struct ActionTypeRegistry {
    types: HashMap<String, ActionTypeDefinition>,
}

impl ActionTypeRegistry {
    pub fn new_with_core_types() -> Self {
        let mut registry = Self {
            types: HashMap::new(),
        };

        // Window actions
        registry.add_core("window.create", "Create a new virtual window on the desktop", vec![
            FieldDef { name: "title".into(), required: true, field_type: FieldType::String, description: "Window title text".into() },
            FieldDef { name: "content_type".into(), required: false, field_type: FieldType::String, description: "response|editor|panel|terminal|canvas|scratchpad".into() },
            FieldDef { name: "x".into(), required: false, field_type: FieldType::Number, description: "X position in pixels".into() },
            FieldDef { name: "y".into(), required: false, field_type: FieldType::Number, description: "Y position in pixels".into() },
            FieldDef { name: "width".into(), required: false, field_type: FieldType::Number, description: "Width in pixels (min 320)".into() },
            FieldDef { name: "height".into(), required: false, field_type: FieldType::Number, description: "Height in pixels (min 240)".into() },
        ]);

        registry.add_core("window.close", "Close a window by ID", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the window to close".into() },
        ]);

        registry.add_core("window.focus", "Bring a window to front", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the window to focus".into() },
        ]);

        registry.add_core("window.update_content", "Update the content displayed in a window", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the target window".into() },
            FieldDef { name: "content".into(), required: true, field_type: FieldType::String, description: "New content to display".into() },
        ]);

        registry.add_core("window.minimize", "Minimize a window", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the window to minimize".into() },
        ]);

        registry.add_core("window.restore", "Restore a minimized window", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the window to restore".into() },
        ]);

        registry.add_core("window.resize", "Resize a window", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the window".into() },
            FieldDef { name: "width".into(), required: true, field_type: FieldType::Number, description: "New width in pixels".into() },
            FieldDef { name: "height".into(), required: true, field_type: FieldType::Number, description: "New height in pixels".into() },
        ]);

        registry.add_core("window.move", "Move a window to a new position", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the window".into() },
            FieldDef { name: "x".into(), required: true, field_type: FieldType::Number, description: "New X position".into() },
            FieldDef { name: "y".into(), required: true, field_type: FieldType::Number, description: "New Y position".into() },
        ]);

        // Agent actions
        registry.add_core("agent.response", "Send a text response to the user", vec![
            FieldDef { name: "text".into(), required: true, field_type: FieldType::String, description: "The response text (supports markdown)".into() },
            FieldDef { name: "window_id".into(), required: false, field_type: FieldType::String, description: "Target window ID (if updating existing window)".into() },
        ]);

        registry.add_core("agent.think", "Internal reasoning step, not shown to user", vec![
            FieldDef { name: "thought".into(), required: true, field_type: FieldType::String, description: "Internal reasoning text".into() },
        ]);

        registry.add_core("agent.delegate", "Delegate a task to a workspace orchestrator", vec![
            FieldDef { name: "task".into(), required: true, field_type: FieldType::String, description: "Task description".into() },
            FieldDef { name: "workspace_id".into(), required: false, field_type: FieldType::String, description: "Target workspace ID (defaults to active workspace)".into() },
            FieldDef { name: "context".into(), required: false, field_type: FieldType::Object, description: "Additional context for the orchestrator".into() },
        ]);

        registry.add_core("agent.task.create", "Create a tracked task", vec![
            FieldDef { name: "name".into(), required: true, field_type: FieldType::String, description: "Task name".into() },
            FieldDef { name: "description".into(), required: true, field_type: FieldType::String, description: "Task description".into() },
            FieldDef { name: "priority".into(), required: false, field_type: FieldType::String, description: "low|normal|high|critical".into() },
        ]);

        registry.add_core("agent.error", "Report an agent error", vec![
            FieldDef { name: "text".into(), required: true, field_type: FieldType::String, description: "Error message".into() },
        ]);

        // Memory actions
        registry.add_core("memory.store", "Store a value in semantic memory", vec![
            FieldDef { name: "key".into(), required: true, field_type: FieldType::String, description: "Unique storage key".into() },
            FieldDef { name: "value".into(), required: true, field_type: FieldType::String, description: "Value to store".into() },
            FieldDef { name: "tags".into(), required: false, field_type: FieldType::Array, description: "Tags for retrieval".into() },
        ]);

        registry.add_core("memory.retrieve", "Retrieve a value from semantic memory", vec![
            FieldDef { name: "key".into(), required: true, field_type: FieldType::String, description: "Key to retrieve".into() },
        ]);

        // System actions
        registry.add_core("system.notify", "Show a system notification", vec![
            FieldDef { name: "message".into(), required: true, field_type: FieldType::String, description: "Notification message".into() },
            FieldDef { name: "level".into(), required: false, field_type: FieldType::String, description: "info|success|warning|error".into() },
        ]);

        registry.add_core("user.text_input", "User text input from command bar", vec![
            FieldDef { name: "text".into(), required: true, field_type: FieldType::String, description: "User's input text".into() },
        ]);

        registry.add_core("system.startup", "System startup event", vec![]);
        registry.add_core("system.shutdown", "System shutdown event", vec![]);
        registry.add_core("system.session_start", "Session started", vec![]);
        registry.add_core("system.session_end", "Session ended", vec![]);

        registry
    }

    fn add_core(&mut self, action_type: &str, description: &str, fields: Vec<FieldDef>) {
        self.types.insert(
            action_type.to_string(),
            ActionTypeDefinition {
                action_type: action_type.to_string(),
                tier: ActionTier::Core,
                description: description.to_string(),
                fields,
            },
        );
    }

    pub fn validate(&self, action_type: &str) -> bool {
        self.types.contains_key(action_type)
    }

    pub fn validate_payload(&self, action_type: &str, payload: &serde_json::Value) -> Result<(), LunaError> {
        if let Some(def) = self.types.get(action_type) {
            def.validate_payload(payload).map_err(|e| LunaError::Dispatch(e))
        } else {
            Err(LunaError::Dispatch(format!("Unknown action type: {}", action_type)))
        }
    }

    pub fn register(&mut self, def: ActionTypeDefinition) -> Result<(), LunaError> {
        if def.tier == ActionTier::Core {
            return Err(LunaError::Dispatch(
                "Cannot register new core action types".to_string(),
            ));
        }
        self.types.insert(def.action_type.clone(), def);
        Ok(())
    }

    pub fn get(&self, action_type: &str) -> Option<&ActionTypeDefinition> {
        self.types.get(action_type)
    }

    pub fn list_all(&self) -> Vec<&ActionTypeDefinition> {
        self.types.values().collect()
    }

    /// Generate the action space description for LLM system prompts.
    pub fn generate_action_space_prompt(&self) -> String {
        let mut lines = vec!["## Available Actions".to_string(), String::new()];

        // Group by category
        let mut window_actions: Vec<&ActionTypeDefinition> = Vec::new();
        let mut agent_actions: Vec<&ActionTypeDefinition> = Vec::new();
        let mut memory_actions: Vec<&ActionTypeDefinition> = Vec::new();
        let mut other_actions: Vec<&ActionTypeDefinition> = Vec::new();

        for def in self.types.values() {
            if def.action_type.starts_with("window.") {
                window_actions.push(def);
            } else if def.action_type.starts_with("agent.") {
                agent_actions.push(def);
            } else if def.action_type.starts_with("memory.") {
                memory_actions.push(def);
            } else if !def.action_type.starts_with("user.") && !def.action_type.starts_with("system.") {
                other_actions.push(def);
            }
        }

        let categories = [
            ("### Window Actions", window_actions),
            ("### Agent Actions", agent_actions),
            ("### Memory Actions", memory_actions),
        ];

        for (header, mut defs) in categories {
            if defs.is_empty() { continue; }
            defs.sort_by(|a, b| a.action_type.cmp(&b.action_type));
            lines.push(header.to_string());
            for def in defs {
                lines.push(format!("- {}", def.prompt_description()));
            }
            lines.push(String::new());
        }

        lines.join("\n")
    }
}
