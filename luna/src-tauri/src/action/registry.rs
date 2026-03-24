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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionTypeDefinition {
    pub action_type: String,
    pub tier: ActionTier,
    pub description: String,
}

pub struct ActionTypeRegistry {
    types: HashMap<String, ActionTypeDefinition>,
}

impl ActionTypeRegistry {
    pub fn new_with_core_types() -> Self {
        let mut registry = Self {
            types: HashMap::new(),
        };

        let core_types = vec![
            ("window.create", "Create a new virtual window"),
            ("window.close", "Close a window"),
            ("window.resize", "Resize a window"),
            ("window.move", "Move a window position"),
            ("window.minimize", "Minimize a window"),
            ("window.restore", "Restore a minimized window"),
            ("window.focus", "Bring a window to focus"),
            ("user.text_input", "User text input from command bar"),
            ("agent.response", "Agent text response"),
            ("agent.error", "Agent error message"),
            ("system.startup", "System startup event"),
            ("system.shutdown", "System shutdown event"),
            ("system.session_start", "Session started"),
            ("system.session_end", "Session ended"),
        ];

        for (action_type, description) in core_types {
            registry.types.insert(
                action_type.to_string(),
                ActionTypeDefinition {
                    action_type: action_type.to_string(),
                    tier: ActionTier::Core,
                    description: description.to_string(),
                },
            );
        }

        registry
    }

    pub fn validate(&self, action_type: &str) -> bool {
        self.types.contains_key(action_type)
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
}
