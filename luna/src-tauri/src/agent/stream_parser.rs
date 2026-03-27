use crate::action::types::{Action, ActionSource};

/// Incrementally parses streaming LLM tokens to detect complete JSON action objects.
/// Tracks bracket depth to find complete `{...}` and `[...]` boundaries.
pub struct StreamParser {
    buffer: String,
    original_text: String,
    agent_id: String,
    in_code_fence: bool,
}

impl StreamParser {
    pub fn new(agent_id: &str) -> Self {
        Self {
            buffer: String::new(),
            original_text: String::new(),
            agent_id: agent_id.to_string(),
            in_code_fence: false,
        }
    }

    /// Feed a token into the parser. Returns any complete actions detected.
    pub fn feed(&mut self, token: &str) -> Vec<Action> {
        self.original_text.push_str(token);
        self.buffer.push_str(token);
        self.try_extract_actions()
    }

    /// Get the full accumulated text (for conversation history).
    pub fn full_text(&self) -> &str {
        &self.original_text
    }

    fn try_extract_actions(&mut self) -> Vec<Action> {
        let mut actions = Vec::new();

        // Strip code fences and replace buffer with stripped version
        // so that find() operations work correctly against the same text.
        let stripped = self.strip_code_fences();
        self.buffer = stripped;

        // Find the outermost JSON array or object
        let trimmed = self.buffer.trim().to_string();

        // Try to find a complete JSON array
        if let Some(start) = trimmed.find('[') {
            if let Some(end) = find_matching_bracket(&trimmed[start..], '[', ']') {
                let json_str = &trimmed[start..start + end + 1];
                if let Ok(parsed) = serde_json::from_str::<Vec<ParsedAction>>(json_str) {
                    let source = ActionSource::Agent(self.agent_id.clone());
                    for p in parsed {
                        actions.push(Action::new(
                            p.action_type,
                            p.payload.unwrap_or(serde_json::Value::Null),
                            source.clone(),
                        ));
                    }
                    // Remove the parsed portion from the buffer
                    let buf_start = self.buffer.find(json_str).unwrap_or(0);
                    self.buffer = self.buffer[buf_start + json_str.len()..].to_string();
                    return actions;
                }
            }
        }

        // Try individual action objects
        let mut search_from = 0;
        while let Some(start) = trimmed[search_from..].find('{') {
            let abs_start = search_from + start;
            if let Some(end) = find_matching_bracket(&trimmed[abs_start..], '{', '}') {
                let json_str = &trimmed[abs_start..abs_start + end + 1];
                if let Ok(parsed) = serde_json::from_str::<ParsedAction>(json_str) {
                    let source = ActionSource::Agent(self.agent_id.clone());
                    actions.push(Action::new(
                        parsed.action_type,
                        parsed.payload.unwrap_or(serde_json::Value::Null),
                        source,
                    ));
                    // Remove parsed portion
                    if let Some(buf_pos) = self.buffer.find(json_str) {
                        self.buffer = self.buffer[buf_pos + json_str.len()..].to_string();
                    }
                    search_from = abs_start + end + 1;
                } else {
                    search_from = abs_start + end + 1;
                }
            } else {
                // Incomplete JSON — wait for more tokens
                break;
            }
        }

        actions
    }

    fn strip_code_fences(&mut self) -> String {
        let mut result = self.buffer.clone();

        // Track code fence state
        if result.contains("```json") {
            self.in_code_fence = true;
        }

        // Remove code fence markers for parsing
        result = result.replace("```json", "").replace("```", "");
        result
    }
}

#[derive(Debug, serde::Deserialize)]
struct ParsedAction {
    action_type: String,
    payload: Option<serde_json::Value>,
}

/// Find the index of the matching closing bracket, accounting for nesting and strings.
fn find_matching_bracket(text: &str, open: char, close: char) -> Option<usize> {
    let mut depth = 0;
    let mut in_string = false;
    let mut escape_next = false;

    for (i, ch) in text.char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }

        if ch == '\\' && in_string {
            escape_next = true;
            continue;
        }

        if ch == '"' {
            in_string = !in_string;
            continue;
        }

        if in_string {
            continue;
        }

        if ch == open {
            depth += 1;
        } else if ch == close {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
    }

    None // Incomplete
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_feed_with_complete_json_returns_action() {
        let mut parser = StreamParser::new("conductor");
        let actions = parser.feed(r#"{"action_type": "agent.response", "payload": {"text": "hi"}}"#);
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "agent.response");
    }

    #[test]
    fn test_feed_with_partial_json_returns_empty() {
        let mut parser = StreamParser::new("conductor");
        let actions = parser.feed(r#"{"action_type": "agent.res"#);
        assert!(actions.is_empty());
    }

    #[test]
    fn test_feed_with_multiple_json_objects() {
        let mut parser = StreamParser::new("conductor");
        let input = r#"[{"action_type": "window.create", "payload": {"title": "A"}}, {"action_type": "agent.response", "payload": {"text": "done"}}]"#;
        let actions = parser.feed(input);
        assert_eq!(actions.len(), 2);
        assert_eq!(actions[0].action_type, "window.create");
        assert_eq!(actions[1].action_type, "agent.response");
    }

    #[test]
    fn test_full_text_accumulates_all_tokens() {
        let mut parser = StreamParser::new("conductor");
        parser.feed("Hello ");
        parser.feed("world");
        assert_eq!(parser.full_text(), "Hello world");
    }

    #[test]
    fn test_code_fence_stripping() {
        let mut parser = StreamParser::new("conductor");
        let actions = parser.feed("```json\n{\"action_type\": \"agent.response\", \"payload\": {\"text\": \"ok\"}}\n```");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "agent.response");
    }
}
