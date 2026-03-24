use crate::action::types::{Action, ActionSource};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ParsedAction {
    action_type: String,
    payload: Option<serde_json::Value>,
}

/// Parse an LLM response into a list of actions.
/// This function never fails — it always produces at least one action.
pub fn parse_response(response: &str) -> Vec<Action> {
    // Strategy 1: Try to parse entire response as JSON array of actions
    if let Some(actions) = try_parse_json_array(response) {
        return actions;
    }

    // Strategy 2: Try to extract JSON from markdown code blocks
    if let Some(actions) = try_extract_code_block(response) {
        return actions;
    }

    // Strategy 3: Try to parse as a single JSON action object
    if let Some(action) = try_parse_single_json(response) {
        return vec![action];
    }

    // Strategy 4: Wrap plain text as an agent.response action
    vec![Action::new(
        "agent.response".to_string(),
        serde_json::json!({ "text": response }),
        ActionSource::Agent("conductor".to_string()),
    )]
}

fn try_parse_json_array(text: &str) -> Option<Vec<Action>> {
    let trimmed = text.trim();
    if !trimmed.starts_with('[') {
        return None;
    }

    let parsed: Vec<ParsedAction> = serde_json::from_str(trimmed).ok()?;
    let actions = parsed
        .into_iter()
        .map(|p| {
            Action::new(
                p.action_type,
                p.payload.unwrap_or(serde_json::Value::Null),
                ActionSource::Agent("conductor".to_string()),
            )
        })
        .collect();
    Some(actions)
}

fn try_extract_code_block(text: &str) -> Option<Vec<Action>> {
    // Look for ```json ... ``` blocks
    let json_start = text.find("```json")?;
    let content_start = json_start + 7;
    let json_end = text[content_start..].find("```")?;
    let json_str = &text[content_start..content_start + json_end].trim();

    // Try as array first
    if let Some(actions) = try_parse_json_array(json_str) {
        return Some(actions);
    }

    // Try as single object
    if let Some(action) = try_parse_single_json(json_str) {
        return Some(vec![action]);
    }

    None
}

fn try_parse_single_json(text: &str) -> Option<Action> {
    let trimmed = text.trim();
    if !trimmed.starts_with('{') {
        return None;
    }

    let parsed: ParsedAction = serde_json::from_str(trimmed).ok()?;
    Some(Action::new(
        parsed.action_type,
        parsed.payload.unwrap_or(serde_json::Value::Null),
        ActionSource::Agent("conductor".to_string()),
    ))
}
