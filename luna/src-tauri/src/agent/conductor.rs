use std::sync::Arc;
use tracing::{info, warn};

use super::llm_client::{LlmClient, LlmMessage};
use super::llm_stream::StreamEvent;
use super::stream_parser::StreamParser;
use super::response_parser;
use crate::action::types::{Action, ActionSource};
use crate::error::LunaError;
use crate::memory::MemorySystem;

pub struct ConductorAgent {
    pub id: String,
    llm_client: LlmClient,
    conversation_history: tokio::sync::RwLock<Vec<LlmMessage>>,
    session_id: tokio::sync::RwLock<Option<String>>,
}

impl ConductorAgent {
    pub fn new(llm_client: LlmClient) -> Self {
        Self {
            id: "conductor".to_string(),
            llm_client,
            conversation_history: tokio::sync::RwLock::new(Vec::new()),
            session_id: tokio::sync::RwLock::new(None),
        }
    }

    /// Build the shared system prompt used by both streaming and non-streaming paths.
    fn build_system_prompt(window_list: &str, recent_memory: &str, action_space: &str) -> String {
        format!(
            "You are the Conductor for Luna OS — an LLM-native operating system.\n\
            You receive user input and respond with a JSON array of actions.\n\n\
            ## Current State\n\
            Open windows: {window_list}\n\
            Workspace: workspace_default\n\
            Memory:\n{recent_memory}\n\n\
            {action_space}\n\n\
            ## Action Reference\n\n\
            ### 1. Chat with user (ALWAYS include this)\n\
            {{\"action_type\": \"agent.response\", \"payload\": {{\"text\": \"message\"}}}}\n\n\
            ### 2. Built-in App Windows\n\
            Each content_type opens a FULL APP with toolbar, panels, and interactivity.\n\
            Pass initial data as a JSON string in the \"content\" field.\n\n\
            | content_type | App | content (JSON string) |\n\
            |---|---|---|\n\
            | editor | Rich Text Editor | Markdown: \"# Title\\n**bold**\" |\n\
            | spreadsheet | Spreadsheet (Excel) | {{\"sheets\":[\"Sheet1\"],\"data\":{{\"Sheet1\":{{\"A1\":{{\"value\":\"Name\"}},\"B1\":{{\"value\":\"Age\"}}}}}}}} |\n\
            | slides | Presentations (Slides) | {{\"slides\":[{{\"id\":\"s1\",\"template\":\"title\",\"elements\":[{{\"id\":\"t1\",\"type\":\"heading\",\"content\":\"Title\",\"x\":10,\"y\":30,\"width\":80,\"height\":15}}]}}]}} |\n\
            | email | Email Client | {{\"emails\":[{{\"id\":\"1\",\"from\":\"a@b.com\",\"to\":[\"u@b.com\"],\"subject\":\"Hi\",\"body\":\"Hello\",\"date\":\"2025-01-15\",\"read\":false,\"starred\":false,\"folder\":\"Inbox\"}}]}} |\n\
            | calendar | Calendar | {{\"events\":[{{\"id\":\"1\",\"title\":\"Meeting\",\"start\":\"2025-01-15T10:00\",\"end\":\"2025-01-15T11:00\"}}],\"view\":\"month\"}} |\n\
            | file_manager | File Manager | {{\"files\":[{{\"id\":\"1\",\"name\":\"Docs\",\"type\":\"folder\",\"path\":\"/Docs\"}}]}} |\n\
            | kanban | Kanban Board | {{\"columns\":[{{\"id\":\"todo\",\"title\":\"To Do\",\"cards\":[{{\"id\":\"c1\",\"title\":\"Task\"}}]}}]}} |\n\
            | notes | Notes | {{\"notes\":[{{\"id\":\"1\",\"title\":\"Ideas\",\"content\":\"Text\",\"pinned\":true,\"created\":\"2025-01-15\",\"modified\":\"2025-01-15\"}}]}} |\n\
            | calculator | Calculator | {{\"mode\":\"scientific\"}} or omit |\n\
            | browser | Web Browser | {{\"url\":\"https://example.com\"}} |\n\
            | music | Music Player | {{\"playlist\":[{{\"id\":\"1\",\"title\":\"Song\",\"artist\":\"Artist\",\"album\":\"Album\",\"duration\":240}}]}} |\n\
            | terminal | Terminal | plain text |\n\
            | canvas | Drawing Canvas | (none) |\n\
            | code_editor | Code Editor | {{\"language\":\"python\",\"code\":\"print('hi')\"}} |\n\n\
            Example: {{\"action_type\": \"window.create\", \"payload\": {{\"title\": \"Budget\", \"content_type\": \"spreadsheet\", \"content\": \"{{\\\"sheets\\\":[\\\"Sheet1\\\"],\\\"data\\\":{{\\\"Sheet1\\\":{{\\\"A1\\\":{{\\\"value\\\":\\\"Item\\\"}},\\\"B1\\\":{{\\\"value\\\":\\\"Cost\\\"}}}}}}}}\" }}}}\n\n\
            ### 3. Modify any existing app/window — YOU HAVE FULL CONTROL\n\
            Use window.update_content to COMPLETELY RE-RENDER any open window with new data.\n\
            For app windows (spreadsheet, slides, email, etc.), send the FULL updated JSON.\n\
            This is how you add/remove/change ANYTHING in any app — slides, cells, emails, events, etc.\n\n\
            Examples:\n\
            - Add a slide: Send updated slides JSON with the new slide appended\n\
            - Add a hyperlink to slides: Add an element with type \"text\" and HTML content like \"<a href='url'>Link</a>\"\n\
            - Add rows to spreadsheet: Send updated data JSON with new cells\n\
            - Add an email: Send updated emails array with new email appended\n\
            - Add a calendar event: Send updated events array with new event\n\
            - Bold text in editor: Send updated Markdown with **bold** syntax\n\n\
            {{\"action_type\": \"window.update_content\", \"payload\": {{\"window_id\": \"<id from Open windows>\", \"content\": \"<full updated JSON or markdown>\"}}}}\n\n\
            IMPORTANT: You can modify ANY aspect of ANY open app this way. There is no feature you cannot add — just update the content JSON.\n\n\
            ### 4. Custom Dynamic Apps (for UIs not covered by built-in apps)\n\
            {{\"action_type\": \"app.create\", \"payload\": {{\"id\": \"app-id\", \"title\": \"Title\", \"layout\": \"vertical\",\n\
              \"components\": [{{\"id\": \"c1\", \"type\": \"Type\", \"props\": {{}}}}], \"data\": {{}}\n\
            }}}}\n\n\
            ## Rules\n\
            1. Output ONLY a JSON array. No markdown fences, no extra text.\n\
            2. ALWAYS include agent.response.\n\
            3. Field name for window content is \"content\" (never \"body\"/\"text\").\n\
            4. Do NOT re-create existing windows — use window.update_content.\n\
            5. Use built-in content_types (spreadsheet, slides, etc.) for matching apps.\n\
            6. Use \"editor\" content_type for documents with Markdown.\n\
            7. You have FULL CONTROL over all apps. Any modification is possible via window.update_content with updated JSON.\n"
        )
    }

    /// Reset conversation history for a new session.
    pub async fn reset_session(&self, session_id: &str) {
        let current = self.session_id.read().await;
        if current.as_deref() != Some(session_id) {
            drop(current);
            self.conversation_history.write().await.clear();
            *self.session_id.write().await = Some(session_id.to_string());
        }
    }

    /// Handle user input. Returns a list of actions to execute.
    /// `action_space` is a pre-generated action space string from the registry
    /// (generated by the caller to avoid holding the registry lock here).
    pub async fn handle_user_input(
        &self,
        text: String,
        action_space: Option<String>,
        memory: Option<&Arc<MemorySystem>>,
        open_windows: Vec<String>,
        session_id: &str,
    ) -> Result<Vec<Action>, LunaError> {
        // Build system prompt
        let recent_memory = if let Some(mem) = memory {
            mem.episodic.recent_summary(session_id, 10).await
        } else {
            "Memory not available.".to_string()
        };

        let system_prompt = if let Some(space) = action_space {
            let window_list = if open_windows.is_empty() {
                "None".to_string()
            } else {
                open_windows.join(", ")
            };
            Self::build_system_prompt(&window_list, &recent_memory, &space)
        } else {
            FALLBACK_SYSTEM_PROMPT.to_string()
        };

        // Add user message to history and prepare snapshot for LLM call
        let history_snapshot = {
            let mut history = self.conversation_history.write().await;
            history.push(LlmMessage {
                role: "user".to_string(),
                content: text.clone(),
            });

            // Keep history bounded (last 20 messages)
            if history.len() > 20 {
                let drain = history.len() - 20;
                history.drain(..drain);
            }

            info!(
                history_len = history.len(),
                "Conductor processing user input"
            );

            history.clone()
        };

        // Send to LLM
        let response = self
            .llm_client
            .send(&system_prompt, &history_snapshot, 4096)
            .await?;

        // Track token usage
        if let Some(mem) = memory {
            if let Err(e) = mem.agent_state.record_tokens(
                &self.id,
                response.input_tokens,
                response.output_tokens,
            ).await {
                warn!(error = %e, "Failed to record token usage");
            }
        }

        // Add assistant response to history
        {
            let mut history = self.conversation_history.write().await;
            history.push(LlmMessage {
                role: "assistant".to_string(),
                content: response.content.clone(),
            });
        }

        // Parse response into actions, with rephrase retry on failure.
        // Clone what we need so the closure doesn't borrow self.
        let retry_client = self.llm_client.clone();
        let retry_prompt = system_prompt.clone();
        let retry_user_text = text.clone();
        let retry_content = response.content.clone();

        let actions = response_parser::parse_response_with_retry(
            &response.content,
            &self.id,
            move || {
                let client = retry_client;
                let prompt = retry_prompt;
                let retry_msgs = vec![
                    LlmMessage { role: "user".to_string(), content: retry_user_text },
                    LlmMessage { role: "assistant".to_string(), content: retry_content },
                    LlmMessage {
                        role: "user".to_string(),
                        content: "Your previous response could not be parsed. Please respond with ONLY a valid JSON array of actions.".to_string(),
                    },
                ];
                async move {
                    client.send(&prompt, &retry_msgs, 2048).await
                        .map(|r| r.content)
                        .unwrap_or_default()
                }
            }
        ).await;

        info!(
            action_count = actions.len(),
            input_tokens = response.input_tokens,
            output_tokens = response.output_tokens,
            "Conductor produced actions"
        );

        // Record episodic event
        if let Some(mem) = memory {
            if let Err(e) = mem.episodic.record(
                session_id,
                &self.id,
                "user.input_handled",
                &serde_json::json!({"text": &text}),
                &serde_json::json!({"action_count": actions.len()}),
                &["conductor".to_string(), "user_input".to_string()],
                "action",
                None,
            ).await {
                warn!(error = %e, "Failed to record episodic event");
            }
        }

        Ok(actions)
    }

    /// Handle user input with streaming. Returns actions incrementally via the callback.
    /// The `on_token` callback receives each token for the frontend.
    /// The `on_actions` callback receives complete actions as they're parsed mid-stream.
    pub async fn handle_user_input_streaming<F, G>(
        &self,
        text: String,
        action_space: Option<String>,
        memory: Option<&Arc<MemorySystem>>,
        open_windows: Vec<String>,
        session_id: &str,
        mut on_token: F,
        mut on_actions: G,
    ) -> Result<(), LunaError>
    where
        F: FnMut(&str) + Send,
        G: FnMut(Vec<Action>) + Send,
    {
        // Build system prompt (same as non-streaming)
        let recent_memory = if let Some(mem) = memory {
            mem.episodic.recent_summary(session_id, 10).await
        } else {
            "Memory not available.".to_string()
        };

        let system_prompt = if let Some(space) = action_space {
            let window_list = if open_windows.is_empty() {
                "None".to_string()
            } else {
                open_windows.join(", ")
            };
            Self::build_system_prompt(&window_list, &recent_memory, &space)
        } else {
            FALLBACK_SYSTEM_PROMPT.to_string()
        };

        // Add user message to history and prepare snapshot for streaming call
        let history_snapshot = {
            let mut history = self.conversation_history.write().await;
            history.push(LlmMessage {
                role: "user".to_string(),
                content: text.clone(),
            });

            // Keep history bounded
            if history.len() > 20 {
                let drain = history.len() - 20;
                history.drain(..drain);
            }

            info!(history_len = history.len(), "Conductor streaming user input");

            history.clone()
        };

        // Start streaming
        let mut rx = self
            .llm_client
            .send_streaming(&system_prompt, &history_snapshot, 4096)
            .await?;

        let mut parser = StreamParser::new(&self.id);
        let mut input_tokens: u32 = 0;
        let mut output_tokens: u32 = 0;

        while let Some(event) = rx.recv().await {
            match event {
                StreamEvent::Token(token) => {
                    on_token(&token);
                    let actions = parser.feed(&token);
                    if !actions.is_empty() {
                        on_actions(actions);
                    }
                }
                StreamEvent::Usage { input, output } => {
                    input_tokens = input;
                    output_tokens = output;
                }
                StreamEvent::Done => break,
                StreamEvent::Error(e) => {
                    warn!(error = %e, "Stream error");
                    return Err(LunaError::Api(format!("Stream error: {}", e)));
                }
            }
        }

        let full_text = parser.full_text().to_string();

        // Add assistant response to history
        {
            let mut history = self.conversation_history.write().await;
            history.push(LlmMessage {
                role: "assistant".to_string(),
                content: full_text.clone(),
            });
        }

        // Record token usage
        if let Some(mem) = memory {
            if let Err(e) = mem.agent_state.record_tokens(&self.id, input_tokens, output_tokens).await {
                warn!(error = %e, "Failed to record token usage");
            }
        }

        // Record episodic event
        if let Some(mem) = memory {
            if let Err(e) = mem.episodic.record(
                session_id,
                &self.id,
                "user.input_handled_streaming",
                &serde_json::json!({"text": &text}),
                &serde_json::json!({"input_tokens": input_tokens, "output_tokens": output_tokens}),
                &["conductor".to_string(), "streaming".to_string()],
                "action",
                None,
            ).await {
                warn!(error = %e, "Failed to record episodic event");
            }
        }

        info!(input_tokens, output_tokens, "Conductor streaming complete");
        Ok(())
    }

    /// Check if the Conductor should delegate to the orchestrator.
    pub fn should_delegate(&self, text: &str) -> bool {
        let multi_step = ["and then", "after that", "first", "step by step", "multiple",
            "create and", "build and", "research and"];
        let lower = text.to_lowercase();
        multi_step.iter().any(|indicator| lower.contains(indicator))
    }

    /// Create a delegation action for the orchestrator.
    pub fn make_delegate_action(task: &str, workspace_id: &str) -> Action {
        Action::new(
            "agent.delegate".to_string(),
            serde_json::json!({
                "task": task,
                "workspace_id": workspace_id
            }),
            ActionSource::Agent("conductor".to_string()),
        )
    }
}

const FALLBACK_SYSTEM_PROMPT: &str = r#"You are the Conductor for Luna OS — an LLM-native operating system.
Respond ONLY with a JSON array of actions.

Available actions:
- "agent.response" — {"text": "your response"}
- "window.create" — {"title": "Title", "content_type": "response"}
- "agent.delegate" — {"task": "task description", "workspace_id": "workspace_default"}

Example: [{"action_type": "agent.response", "payload": {"text": "Hello!"}}]
"#;
