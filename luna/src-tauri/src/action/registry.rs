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
    /// If this is an ephemeral action, which app registered it.
    #[serde(default)]
    pub app_id: Option<String>,
    /// Number of times this action has been dispatched (for promotion tracking).
    #[serde(default)]
    pub usage_count: u64,
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
            FieldDef { name: "content_type".into(), required: false, field_type: FieldType::String, description: "editor|panel|terminal|canvas|scratchpad".into() },
            FieldDef { name: "content".into(), required: false, field_type: FieldType::String, description: "Initial text content for the window".into() },
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

        // Dynamic app actions (Sprint 3)
        registry.add_core("app.create", "Create a dynamic app with an interactive UI", vec![
            FieldDef { name: "id".into(), required: true, field_type: FieldType::String, description: "Unique app identifier".into() },
            FieldDef { name: "title".into(), required: true, field_type: FieldType::String, description: "App window title".into() },
            FieldDef { name: "components".into(), required: true, field_type: FieldType::Array, description: "Array of component specs".into() },
            FieldDef { name: "layout".into(), required: false, field_type: FieldType::Any, description: "Layout direction: vertical|horizontal|grid".into() },
            FieldDef { name: "data".into(), required: false, field_type: FieldType::Object, description: "Initial data context for data binding".into() },
            FieldDef { name: "actions".into(), required: false, field_type: FieldType::Array, description: "Ephemeral action definitions".into() },
            FieldDef { name: "width".into(), required: false, field_type: FieldType::Number, description: "Window width in pixels".into() },
            FieldDef { name: "height".into(), required: false, field_type: FieldType::Number, description: "Window height in pixels".into() },
            FieldDef { name: "styles".into(), required: false, field_type: FieldType::Object, description: "Custom CSS styles".into() },
        ]);

        registry.add_core("app.update", "Update a running app's data or spec", vec![
            FieldDef { name: "app_id".into(), required: true, field_type: FieldType::String, description: "ID of the app to update".into() },
            FieldDef { name: "data".into(), required: false, field_type: FieldType::Object, description: "New/updated data context (merged)".into() },
            FieldDef { name: "components".into(), required: false, field_type: FieldType::Array, description: "New component spec (full replacement)".into() },
        ]);

        registry.add_core("app.destroy", "Destroy a running dynamic app", vec![
            FieldDef { name: "app_id".into(), required: true, field_type: FieldType::String, description: "ID of the app to destroy".into() },
        ]);

        registry.add_core("app.event", "Internal: component event routed from frontend", vec![
            FieldDef { name: "app_id".into(), required: true, field_type: FieldType::String, description: "App ID".into() },
            FieldDef { name: "handler_name".into(), required: true, field_type: FieldType::String, description: "Handler name from component events map".into() },
            FieldDef { name: "component_id".into(), required: true, field_type: FieldType::String, description: "Component that emitted the event".into() },
            FieldDef { name: "event_data".into(), required: false, field_type: FieldType::Any, description: "Event payload".into() },
        ]);

        // File system actions (spec 09)
        registry.add_core("fs.read", "Read a file's contents", vec![
            FieldDef { name: "path".into(), required: true, field_type: FieldType::String, description: "File path to read".into() },
        ]);
        registry.add_core("fs.write", "Write content to a file", vec![
            FieldDef { name: "path".into(), required: true, field_type: FieldType::String, description: "File path to write".into() },
            FieldDef { name: "content".into(), required: true, field_type: FieldType::String, description: "Content to write".into() },
        ]);
        registry.add_core("fs.delete", "Delete a file", vec![
            FieldDef { name: "path".into(), required: true, field_type: FieldType::String, description: "File path to delete".into() },
        ]);
        registry.add_core("fs.list", "List directory contents", vec![
            FieldDef { name: "path".into(), required: true, field_type: FieldType::String, description: "Directory path to list".into() },
        ]);
        registry.add_core("fs.move", "Move or rename a file", vec![
            FieldDef { name: "source".into(), required: true, field_type: FieldType::String, description: "Source path".into() },
            FieldDef { name: "destination".into(), required: true, field_type: FieldType::String, description: "Destination path".into() },
        ]);
        registry.add_core("fs.mkdir", "Create a directory", vec![
            FieldDef { name: "path".into(), required: true, field_type: FieldType::String, description: "Directory path to create".into() },
        ]);

        // Window additional actions
        registry.add_core("window.maximize", "Maximize a window to fill the screen", vec![
            FieldDef { name: "window_id".into(), required: true, field_type: FieldType::String, description: "ID of the window to maximize".into() },
        ]);
        registry.add_core("window.stack", "Stack windows in a group", vec![
            FieldDef { name: "window_ids".into(), required: true, field_type: FieldType::Array, description: "Array of window IDs to stack".into() },
        ]);

        // Agent lifecycle actions
        registry.add_core("agent.spawn", "Spawn a new leaf agent", vec![
            FieldDef { name: "agent_type".into(), required: true, field_type: FieldType::String, description: "Type of agent to spawn (file|shell|search)".into() },
            FieldDef { name: "workspace_id".into(), required: false, field_type: FieldType::String, description: "Target workspace".into() },
            FieldDef { name: "capabilities".into(), required: false, field_type: FieldType::Array, description: "Agent capabilities list".into() },
        ]);
        registry.add_core("agent.kill", "Kill/deactivate an agent", vec![
            FieldDef { name: "agent_id".into(), required: true, field_type: FieldType::String, description: "ID of the agent to kill".into() },
        ]);

        // Configuration actions
        registry.add_core("config.get", "Get a configuration value", vec![
            FieldDef { name: "key".into(), required: true, field_type: FieldType::String, description: "Configuration key".into() },
        ]);
        registry.add_core("config.set", "Set a configuration value", vec![
            FieldDef { name: "key".into(), required: true, field_type: FieldType::String, description: "Configuration key".into() },
            FieldDef { name: "value".into(), required: true, field_type: FieldType::Any, description: "New value".into() },
        ]);

        // Memory additional actions
        registry.add_core("memory.search", "Search semantic memory by tag", vec![
            FieldDef { name: "tag".into(), required: true, field_type: FieldType::String, description: "Tag to search for".into() },
        ]);
        registry.add_core("memory.delete", "Delete a value from semantic memory", vec![
            FieldDef { name: "key".into(), required: true, field_type: FieldType::String, description: "Key to delete".into() },
        ]);

        // Plan actions (spec 16)
        registry.add_core("plan.create", "Create a new plan", vec![
            FieldDef { name: "name".into(), required: true, field_type: FieldType::String, description: "Plan name".into() },
            FieldDef { name: "goal".into(), required: true, field_type: FieldType::String, description: "Plan goal description".into() },
            FieldDef { name: "steps".into(), required: true, field_type: FieldType::Array, description: "Array of plan steps".into() },
        ]);
        registry.add_core("plan.update", "Update a plan's status or steps", vec![
            FieldDef { name: "plan_id".into(), required: true, field_type: FieldType::String, description: "Plan ID".into() },
            FieldDef { name: "steps".into(), required: false, field_type: FieldType::Array, description: "Updated steps".into() },
            FieldDef { name: "status".into(), required: false, field_type: FieldType::String, description: "New status".into() },
        ]);

        // Workspace actions (spec 14)
        registry.add_core("workspace.create", "Create a new workspace", vec![
            FieldDef { name: "name".into(), required: true, field_type: FieldType::String, description: "Workspace name".into() },
            FieldDef { name: "goal".into(), required: false, field_type: FieldType::String, description: "Workspace goal".into() },
        ]);
        registry.add_core("workspace.switch", "Switch to a different workspace", vec![
            FieldDef { name: "workspace_id".into(), required: true, field_type: FieldType::String, description: "Target workspace ID".into() },
        ]);
        registry.add_core("workspace.close", "Close a workspace", vec![
            FieldDef { name: "workspace_id".into(), required: true, field_type: FieldType::String, description: "Workspace ID to close".into() },
        ]);

        // Undo action (spec 20)
        registry.add_core("system.undo", "Undo the last undoable action", vec![
            FieldDef { name: "action_id".into(), required: false, field_type: FieldType::String, description: "Specific action to undo (latest if omitted)".into() },
        ]);

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
                app_id: None,
                usage_count: 0,
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

    /// Register an ephemeral action type owned by a dynamic app.
    /// Returns an error if the action type already exists as a Core action.
    pub fn register_ephemeral(
        &mut self,
        app_id: &str,
        action_type: &str,
        description: &str,
        fields: Vec<FieldDef>,
    ) -> Result<(), LunaError> {
        if let Some(existing) = self.types.get(action_type) {
            if existing.tier == ActionTier::Core {
                return Err(LunaError::Dispatch(format!(
                    "Cannot overwrite core action type '{}'", action_type
                )));
            }
        }
        self.types.insert(
            action_type.to_string(),
            ActionTypeDefinition {
                action_type: action_type.to_string(),
                tier: ActionTier::LlmCreated,
                description: description.to_string(),
                fields,
                app_id: Some(app_id.to_string()),
                usage_count: 0,
            },
        );
        Ok(())
    }

    /// Remove all ephemeral actions registered by a specific app.
    pub fn deregister_app_actions(&mut self, app_id: &str) {
        self.types.retain(|_, def| def.app_id.as_deref() != Some(app_id));
    }

    /// Increment usage counter for an action type (for future promotion tracking).
    pub fn increment_usage(&mut self, action_type: &str) {
        if let Some(def) = self.types.get_mut(action_type) {
            def.usage_count += 1;
        }
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
        let mut app_actions: Vec<&ActionTypeDefinition> = Vec::new();
        let mut fs_actions: Vec<&ActionTypeDefinition> = Vec::new();
        let mut plan_actions: Vec<&ActionTypeDefinition> = Vec::new();
        let mut workspace_actions: Vec<&ActionTypeDefinition> = Vec::new();
        let mut other_actions: Vec<&ActionTypeDefinition> = Vec::new();

        for def in self.types.values() {
            if def.action_type.starts_with("window.") {
                window_actions.push(def);
            } else if def.action_type.starts_with("agent.") {
                agent_actions.push(def);
            } else if def.action_type.starts_with("memory.") {
                memory_actions.push(def);
            } else if def.action_type.starts_with("app.") {
                app_actions.push(def);
            } else if def.action_type.starts_with("fs.") {
                fs_actions.push(def);
            } else if def.action_type.starts_with("plan.") {
                plan_actions.push(def);
            } else if def.action_type.starts_with("workspace.") {
                workspace_actions.push(def);
            } else if !def.action_type.starts_with("user.") && !def.action_type.starts_with("system.") {
                other_actions.push(def);
            }
        }

        let categories = [
            ("### Window Actions", window_actions),
            ("### Agent Actions", agent_actions),
            ("### Memory Actions", memory_actions),
            ("### App Actions (Dynamic UI)", app_actions),
            ("### File System Actions", fs_actions),
            ("### Plan Actions", plan_actions),
            ("### Workspace Actions", workspace_actions),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_registry() -> ActionTypeRegistry {
        ActionTypeRegistry::new_with_core_types()
    }

    #[test]
    fn test_validate_returns_true_for_registered_type() {
        let reg = make_registry();
        assert!(reg.validate("window.create"));
    }

    #[test]
    fn test_validate_returns_false_for_unknown_type() {
        let reg = make_registry();
        assert!(!reg.validate("totally.unknown"));
    }

    #[test]
    fn test_validate_payload_succeeds_for_valid_payload() {
        let reg = make_registry();
        let payload = serde_json::json!({"title": "My Window"});
        assert!(reg.validate_payload("window.create", &payload).is_ok());
    }

    #[test]
    fn test_validate_payload_fails_for_missing_required_field() {
        let reg = make_registry();
        let payload = serde_json::json!({});
        // window.create requires "title"
        assert!(reg.validate_payload("window.create", &payload).is_err());
    }

    #[test]
    fn test_register_adds_new_action_type() {
        let mut reg = make_registry();
        let def = ActionTypeDefinition {
            action_type: "custom.action".to_string(),
            tier: ActionTier::AppRegistered,
            description: "A custom action".to_string(),
            fields: vec![],
            app_id: None,
            usage_count: 0,
        };
        assert!(reg.register(def).is_ok());
        assert!(reg.validate("custom.action"));
    }

    #[test]
    fn test_register_rejects_core_tier() {
        let mut reg = make_registry();
        let def = ActionTypeDefinition {
            action_type: "fake.core".to_string(),
            tier: ActionTier::Core,
            description: "Trying to register core".to_string(),
            fields: vec![],
            app_id: None,
            usage_count: 0,
        };
        assert!(reg.register(def).is_err());
    }

    #[test]
    fn test_register_ephemeral_adds_with_llm_created_tier() {
        let mut reg = make_registry();
        reg.register_ephemeral("app_1", "app_1.do_stuff", "Do stuff", vec![]).unwrap();
        let def = reg.get("app_1.do_stuff").unwrap();
        assert_eq!(def.tier, ActionTier::LlmCreated);
        assert_eq!(def.app_id, Some("app_1".to_string()));
    }

    #[test]
    fn test_deregister_app_actions_removes_app_specific() {
        let mut reg = make_registry();
        reg.register_ephemeral("app_x", "app_x.action1", "Action 1", vec![]).unwrap();
        reg.register_ephemeral("app_x", "app_x.action2", "Action 2", vec![]).unwrap();
        reg.register_ephemeral("app_y", "app_y.action1", "Action Y1", vec![]).unwrap();
        assert!(reg.validate("app_x.action1"));
        reg.deregister_app_actions("app_x");
        assert!(!reg.validate("app_x.action1"));
        assert!(!reg.validate("app_x.action2"));
        assert!(reg.validate("app_y.action1"));
    }

    #[test]
    fn test_increment_usage_increases_count() {
        let mut reg = make_registry();
        assert_eq!(reg.get("window.create").unwrap().usage_count, 0);
        reg.increment_usage("window.create");
        assert_eq!(reg.get("window.create").unwrap().usage_count, 1);
        reg.increment_usage("window.create");
        assert_eq!(reg.get("window.create").unwrap().usage_count, 2);
    }

    #[test]
    fn test_generate_action_space_prompt_includes_registered_actions() {
        let reg = make_registry();
        let prompt = reg.generate_action_space_prompt();
        assert!(prompt.contains("window.create"));
        assert!(prompt.contains("agent.response"));
        assert!(prompt.contains("Available Actions"));
    }
}
