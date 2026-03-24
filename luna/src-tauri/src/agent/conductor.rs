use tracing::info;

use super::llm_client::{LlmClient, LlmMessage};
use super::response_parser;
use crate::action::types::Action;
use crate::error::LunaError;

const CONDUCTOR_SYSTEM_PROMPT: &str = r#"You are the Conductor of Luna, an LLM-native operating system. You receive user requests and respond with structured JSON actions that the OS executes directly.

You MUST respond with a JSON array of actions. Each action has an "action_type" and a "payload".

Available actions:

1. "agent.response" — Send a text response to the user
   payload: { "text": "your response text" }

2. "window.create" — Create a new window on the desktop
   payload: { "title": "Window Title", "content_type": "response" }
   content_type can be: "response", "editor", "panel", "canvas"

Example response:
```json
[
  { "action_type": "agent.response", "payload": { "text": "Here's what I found..." } }
]
```

For most queries, respond with a single "agent.response" action containing your helpful answer.
If the user asks you to create something visual, also include a "window.create" action.

Always respond with valid JSON. No markdown outside the JSON. No explanatory text before or after.
"#;

pub struct ConductorAgent {
    pub id: String,
    llm_client: LlmClient,
    conversation_history: Vec<LlmMessage>,
}

impl ConductorAgent {
    pub fn new(llm_client: LlmClient) -> Self {
        Self {
            id: "conductor".to_string(),
            llm_client,
            conversation_history: Vec::new(),
        }
    }

    pub async fn handle_user_input(&mut self, text: String) -> Result<Vec<Action>, LunaError> {
        // Add user message to history
        self.conversation_history.push(LlmMessage {
            role: "user".to_string(),
            content: text,
        });

        // Keep history bounded (last 20 messages to stay within context)
        if self.conversation_history.len() > 20 {
            let drain_count = self.conversation_history.len() - 20;
            self.conversation_history.drain(..drain_count);
        }

        info!(
            history_len = self.conversation_history.len(),
            "Conductor processing user input"
        );

        // Send to LLM
        let response = self
            .llm_client
            .send(CONDUCTOR_SYSTEM_PROMPT, &self.conversation_history, 4096)
            .await?;

        // Add assistant response to history
        self.conversation_history.push(LlmMessage {
            role: "assistant".to_string(),
            content: response.content.clone(),
        });

        // Parse response into actions
        let actions = response_parser::parse_response(&response.content);

        info!(
            action_count = actions.len(),
            input_tokens = response.input_tokens,
            output_tokens = response.output_tokens,
            "Conductor produced actions"
        );

        Ok(actions)
    }
}
