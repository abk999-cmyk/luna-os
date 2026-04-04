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
            | code_editor | Code Editor | {{\"language\":\"python\",\"code\":\"print('hi')\"}} |\n\
            | weather | Weather | {{\"city\":\"New York\"}} |\n\
            | clock | Clock | {{\"tab\":\"worldClock\"}} |\n\
            | photos | Photos | (none) |\n\
            | settings | Settings | (none) |\n\
            | system_monitor | System Monitor | (none) |\n\
            | contacts | Contacts | {{\"contacts\":[{{\"id\":\"1\",\"firstName\":\"Alice\",\"lastName\":\"Smith\",\"email\":\"alice@example.com\",\"phone\":\"555-0100\"}}]}} |\n\
            | todo | Todo List | {{\"lists\":[{{\"id\":\"1\",\"name\":\"Tasks\",\"items\":[{{\"id\":\"t1\",\"title\":\"Buy groceries\",\"done\":false}}]}}]}} |\n\
            | text_editor | Text Editor | {{\"files\":[{{\"id\":\"f1\",\"name\":\"notes.txt\",\"content\":\"Hello\"}}]}} |\n\
            | video_player | Video Player | (none) |\n\
            | pomodoro | Pomodoro Timer | (none) |\n\n\
            Example: {{\"action_type\": \"window.create\", \"payload\": {{\"title\": \"Budget\", \"content_type\": \"spreadsheet\", \"content\": \"{{\\\"sheets\\\":[\\\"Sheet1\\\"],\\\"data\\\":{{\\\"Sheet1\\\":{{\\\"A1\\\":{{\\\"value\\\":\\\"Item\\\"}},\\\"B1\\\":{{\\\"value\\\":\\\"Cost\\\"}}}}}}}}\" }}}}\n\n\
            ### 2b. Read content from any window (Cross-App Intelligence)\n\
            You can read the content of ANY open window to compose across apps.\n\
            {{\"action_type\": \"window.read_content\", \"payload\": {{\"window_id\": \"<id from Open windows>\"}}}}\n\
            This returns the window's current content as JSON. Use this to:\n\
            - Copy data between apps (spreadsheet → slides, todo → notes)\n\
            - Summarize content from multiple windows\n\
            - Answer questions about what's in an open window\n\n\
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
            Create rich interactive apps using the component system. Every component listed below is available.\n\n\
            {{\"action_type\": \"app.create\", \"payload\": {{\"id\": \"unique-id\", \"title\": \"Title\", \"version\": \"1.0\", \"type\": \"application\",\n\
              \"layout\": \"vertical\", \"width\": 500, \"height\": 400,\n\
              \"components\": [...], \"data\": {{\"key\": \"initial value\"}}\n\
            }}}}\n\n\
            #### Available Components\n\
            | Type | Key Props | Events |\n\
            |---|---|---|\n\
            | DataTable | headers: string[], rows: any[][], sortable, searchable, pagination: {{pageSize}} | onRowSelect |\n\
            | Chart | chartType: 'bar'|'line'|'pie', data: [{{label, value}}], title | onElementClick |\n\
            | Gauge | value, min, max, label | — |\n\
            | List | items: string[], ordered, clickable | onItemClick |\n\
            | TextInput | label, placeholder, value: \"$.field\", multiline | onChange |\n\
            | NumberInput | label, value: \"$.field\", min, max, step | onChange |\n\
            | Select | options: [{{value, label}}], value: \"$.field\", label | onChange |\n\
            | Checkbox | label, checked: \"$.field\" | onChange |\n\
            | Toggle | label, value: \"$.field\" | onChange |\n\
            | Slider | label, value: \"$.field\", min, max, step | onChange |\n\
            | Button | label, variant: 'primary'|'secondary'|'danger' | onClick |\n\
            | Card | title, subtitle, content | onClick |\n\
            | Panel | title, collapsible, collapsed | onToggle |\n\
            | Stat | label, value, trend: 'up'|'down', trendValue | — |\n\
            | Tabs | tabs: [{{id, label}}], defaultTab | onTabChange |\n\
            | Grid | columns (number), gap | — |\n\
            | Container | (layout component) | — |\n\
            | Timeline | items: [{{title, subtitle, time, status}}] | onItemClick |\n\
            | Breadcrumbs | items: string[], separator | onNavigate |\n\
            | Modal | open, title, content, actions: [{{label, id}}] | onClose, onAction |\n\
            | Chat | messages: [{{role, content}}], placeholder | onSendMessage |\n\
            | CodeEditor | (code display) | — |\n\
            | Divider | direction: 'vertical' (default horizontal) | — |\n\
            | Spacer | size (pixels) | — |\n\n\
            #### Data Binding\n\
            Use \"$.fieldName\" in props to bind to data context. Components with onChange/onToggle events write back automatically.\n\
            Example: {{\"type\": \"Toggle\", \"props\": {{\"label\": \"Done\", \"value\": \"$.completed\"}}}} reads AND writes data.completed.\n\n\
            #### Example: Habit Tracker\n\
            {{\"action_type\": \"app.create\", \"payload\": {{\"id\": \"habit-tracker\", \"title\": \"Habit Tracker\", \"version\": \"1.0\", \"type\": \"application\",\n\
              \"layout\": \"vertical\", \"width\": 400, \"height\": 500,\n\
              \"components\": [\n\
                {{\"id\": \"title\", \"type\": \"Panel\", \"props\": {{\"title\": \"Today's Habits\"}}, \"children\": [\n\
                  {{\"id\": \"h1\", \"type\": \"Toggle\", \"props\": {{\"label\": \"Exercise\", \"value\": \"$.exercise\"}}}},\n\
                  {{\"id\": \"h2\", \"type\": \"Toggle\", \"props\": {{\"label\": \"Read\", \"value\": \"$.read\"}}}},\n\
                  {{\"id\": \"h3\", \"type\": \"Toggle\", \"props\": {{\"label\": \"Meditate\", \"value\": \"$.meditate\"}}}}\n\
                ]}},\n\
                {{\"id\": \"stats\", \"type\": \"Stat\", \"props\": {{\"label\": \"Streak\", \"value\": \"3 days\", \"trend\": \"up\"}}}}\n\
              ],\n\
              \"data\": {{\"exercise\": false, \"read\": true, \"meditate\": false}}\n\
            }}}}\n\n\
            #### Example: Expense Dashboard\n\
            {{\"action_type\": \"app.create\", \"payload\": {{\"id\": \"expenses\", \"title\": \"Expenses\", \"version\": \"1.0\", \"type\": \"application\",\n\
              \"layout\": \"vertical\", \"width\": 600, \"height\": 500,\n\
              \"components\": [\n\
                {{\"id\": \"chart\", \"type\": \"Chart\", \"props\": {{\"chartType\": \"bar\", \"title\": \"Monthly Spending\",\n\
                  \"data\": [{{\"label\": \"Food\", \"value\": 450}}, {{\"label\": \"Transport\", \"value\": 120}}, {{\"label\": \"Entertainment\", \"value\": 200}}]}}}},\n\
                {{\"id\": \"total\", \"type\": \"Stat\", \"props\": {{\"label\": \"Total\", \"value\": \"$770\"}}}},\n\
                {{\"id\": \"table\", \"type\": \"DataTable\", \"props\": {{\"headers\": [\"Category\", \"Amount\", \"Date\"],\n\
                  \"rows\": [[\"Food\", \"$450\", \"Mar 2026\"], [\"Transport\", \"$120\", \"Mar 2026\"]], \"sortable\": true}}}}\n\
              ], \"data\": {{}}\n\
            }}}}\n\n\
            #### Example: Todo List\n\
            {{\"action_type\": \"app.create\", \"payload\": {{\"id\": \"todo-app\", \"title\": \"Quick Todos\", \"version\": \"1.0\", \"type\": \"application\",\n\
              \"layout\": \"vertical\", \"width\": 400, \"height\": 500,\n\
              \"components\": [\n\
                {{\"id\": \"input\", \"type\": \"TextInput\", \"props\": {{\"placeholder\": \"Add a task...\", \"value\": \"$.newTask\"}}}},\n\
                {{\"id\": \"add\", \"type\": \"Button\", \"props\": {{\"label\": \"Add\", \"variant\": \"primary\"}}, \"events\": {{\"onClick\": \"addTask\"}}}},\n\
                {{\"id\": \"tasks\", \"type\": \"List\", \"props\": {{\"items\": \"$.tasks\", \"clickable\": true}}}}\n\
              ],\n\
              \"data\": {{\"newTask\": \"\", \"tasks\": [\"Buy groceries\", \"Call dentist\"]}}\n\
            }}}}\n\n\
            #### Example: Sales Dashboard\n\
            {{\"action_type\": \"app.create\", \"payload\": {{\"id\": \"dashboard\", \"title\": \"Sales Dashboard\", \"version\": \"1.0\", \"type\": \"application\",\n\
              \"layout\": \"vertical\", \"width\": 700, \"height\": 600,\n\
              \"components\": [\n\
                {{\"id\": \"stats-grid\", \"type\": \"Grid\", \"props\": {{\"columns\": 3, \"gap\": 12}}, \"children\": [\n\
                  {{\"id\": \"s1\", \"type\": \"Stat\", \"props\": {{\"label\": \"Revenue\", \"value\": \"$12,400\", \"trend\": \"up\", \"trendValue\": \"+12%\"}}}},\n\
                  {{\"id\": \"s2\", \"type\": \"Stat\", \"props\": {{\"label\": \"Users\", \"value\": \"1,234\", \"trend\": \"up\", \"trendValue\": \"+5%\"}}}},\n\
                  {{\"id\": \"s3\", \"type\": \"Stat\", \"props\": {{\"label\": \"Churn\", \"value\": \"2.1%\", \"trend\": \"down\", \"trendValue\": \"-0.3%\"}}}}\n\
                ]}},\n\
                {{\"id\": \"chart\", \"type\": \"Chart\", \"props\": {{\"chartType\": \"bar\", \"title\": \"Monthly Revenue\",\n\
                  \"data\": [{{\"label\": \"Jan\", \"value\": 9800}}, {{\"label\": \"Feb\", \"value\": 11200}}, {{\"label\": \"Mar\", \"value\": 12400}}]}}}},\n\
                {{\"id\": \"table\", \"type\": \"DataTable\", \"props\": {{\"headers\": [\"Name\", \"Amount\", \"Status\"],\n\
                  \"rows\": [[\"Acme Corp\", \"$5,200\", \"Paid\"], [\"Globex\", \"$3,100\", \"Pending\"]], \"sortable\": true}}}}\n\
              ], \"data\": {{}}\n\
            }}}}\n\n\
            #### Example: Focus Timer\n\
            {{\"action_type\": \"app.create\", \"payload\": {{\"id\": \"timer\", \"title\": \"Focus Timer\", \"version\": \"1.0\", \"type\": \"application\",\n\
              \"layout\": \"vertical\", \"width\": 350, \"height\": 300,\n\
              \"components\": [\n\
                {{\"id\": \"display\", \"type\": \"Stat\", \"props\": {{\"label\": \"Time Left\", \"value\": \"$.timeDisplay\"}}}},\n\
                {{\"id\": \"controls\", \"type\": \"Grid\", \"props\": {{\"columns\": 2, \"gap\": 8}}, \"children\": [\n\
                  {{\"id\": \"start\", \"type\": \"Button\", \"props\": {{\"label\": \"Start\", \"variant\": \"primary\"}}}},\n\
                  {{\"id\": \"reset\", \"type\": \"Button\", \"props\": {{\"label\": \"Reset\", \"variant\": \"secondary\"}}}}\n\
                ]}}\n\
              ],\n\
              \"data\": {{\"timeDisplay\": \"25:00\", \"seconds\": 1500, \"running\": false}}\n\
            }}}}\n\n\
            #### Component Best Practices\n\
            - For on/off choices: Toggle (not Checkbox, which is for multi-option forms)\n\
            - For numeric ranges: Slider with min/max/step\n\
            - For data tables: DataTable with headers and rows (not List)\n\
            - For metrics: Stat with trend arrows\n\
            - For layouts: Grid with columns:2 or 3 for dashboards\n\
            - For navigation between views: Tabs with tab definitions\n\
            - Always wrap app content in a Panel with a title\n\
            - Use Grid for multi-column layouts, not nested Containers\n\
            - Maximum 3 levels of nesting (Panel > Grid > Component)\n\
            - Always initialize data for all bound fields in the \"data\" object\n\n\
            ### 5. Modify a Dynamic App\n\
            Use app.update to change data or components in a running dynamic app.\n\
            - Update data only: {{\"action_type\": \"app.update\", \"payload\": {{\"app_id\": \"<app id>\", \"data\": {{\"key\": \"newValue\"}}}}}}\n\
            - Replace components: {{\"action_type\": \"app.update\", \"payload\": {{\"app_id\": \"<app id>\", \"spec\": {{...full updated descriptor...}}}}}}\n\n\
            When user asks to change an existing dynamic app:\n\
            1. Use window.read_content to get the current app state\n\
            2. Generate app.update with the changes\n\
            3. Ask user to confirm the changes look right\n\n\
            ## Rules\n\
            1. Output ONLY a JSON array. No markdown fences, no extra text.\n\
            2. ALWAYS include agent.response.\n\
            3. Field name for window content is \"content\" (never \"body\"/\"text\").\n\
            4. Do NOT re-create existing windows — use window.update_content.\n\
            5. Use built-in content_types (spreadsheet, slides, etc.) for matching apps.\n\
            6. Use \"editor\" content_type for documents with Markdown.\n\
            7. You have FULL CONTROL over all apps. Any modification is possible via window.update_content with updated JSON.\n\
            8. After creating a dynamic app with app.create, ALWAYS include an agent.response asking the user if the app matches their expectations and suggesting improvements.\n\
            9. Use window.read_content before modifying any existing app with app.update to understand its current state.\n\
            10. Use window.read_content to understand what's in open windows before composing across them.\n"
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
            let sanitized_windows: Vec<String> = open_windows.iter()
                .map(|w| {
                    // Strip potential injection chars and truncate
                    let clean: String = w.chars()
                        .filter(|c| !matches!(c, '"' | '\\' | '{' | '}' | '[' | ']'))
                        .take(100)
                        .collect();
                    clean
                })
                .collect();
            let window_list = if sanitized_windows.is_empty() {
                "None".to_string()
            } else {
                sanitized_windows.join(", ")
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

            // Keep history bounded (last 12 messages, trim long ones)
            if history.len() > 12 {
                let drain = history.len() - 12;
                history.drain(..drain);
            }
            // Trim excessively long messages (>2000 chars -> truncate with note)
            for msg in history.iter_mut() {
                if msg.content.len() > 2000 {
                    msg.content = format!("{}...(truncated)", &msg.content[..1997]);
                }
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
            let sanitized_windows: Vec<String> = open_windows.iter()
                .map(|w| {
                    // Strip potential injection chars and truncate
                    let clean: String = w.chars()
                        .filter(|c| !matches!(c, '"' | '\\' | '{' | '}' | '[' | ']'))
                        .take(100)
                        .collect();
                    clean
                })
                .collect();
            let window_list = if sanitized_windows.is_empty() {
                "None".to_string()
            } else {
                sanitized_windows.join(", ")
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

            // Keep history bounded (last 12 messages, trim long ones)
            if history.len() > 12 {
                let drain = history.len() - 12;
                history.drain(..drain);
            }
            // Trim excessively long messages (>2000 chars -> truncate with note)
            for msg in history.iter_mut() {
                if msg.content.len() > 2000 {
                    msg.content = format!("{}...(truncated)", &msg.content[..1997]);
                }
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
        let mut any_actions_emitted = false;

        while let Some(event) = rx.recv().await {
            match event {
                StreamEvent::Token(token) => {
                    on_token(&token);
                    let actions = parser.feed(&token);
                    if !actions.is_empty() {
                        any_actions_emitted = true;
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

        // Fallback: if streaming produced no actions, run the full parser
        // which handles plain-text → agent.response wrapping
        if !any_actions_emitted && !full_text.trim().is_empty() {
            let fallback_actions = response_parser::parse_response(&full_text);
            if !fallback_actions.is_empty() {
                on_actions(fallback_actions);
            }
        }

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
