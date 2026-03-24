use std::future::Future;
use tracing::warn;

use crate::action::types::{Action, ActionSource};

#[derive(Debug, serde::Deserialize)]
struct ParsedAction {
    action_type: String,
    payload: Option<serde_json::Value>,
}

/// Parse an LLM response into a list of actions.
/// This function never fails — it always produces at least one action.
pub fn parse_response(response: &str) -> Vec<Action> {
    parse_for_agent(response, "conductor")
}

/// Parse for a specific agent source.
pub fn parse_for_agent(response: &str, agent_id: &str) -> Vec<Action> {
    let source = ActionSource::Agent(agent_id.to_string());

    // Strategy 1: Try to parse entire response as JSON array of actions
    if let Some(actions) = try_parse_json_array(response, &source) {
        return actions;
    }

    // Strategy 2: Try to extract JSON from markdown code blocks
    if let Some(actions) = try_extract_code_block(response, &source) {
        return actions;
    }

    // Strategy 3: Try to parse as a single JSON action object
    if let Some(action) = try_parse_single_json(response, &source) {
        return vec![action];
    }

    // Strategy 4: Wrap plain text as an agent.response action
    vec![Action::new(
        "agent.response".to_string(),
        serde_json::json!({ "text": response }),
        source,
    )]
}

/// Parse with a rephrase retry on failure.
/// `retry_fn` is called with no args and should return the rephrased LLM response.
pub async fn parse_response_with_retry<F, Fut>(
    response: &str,
    agent_id: &str,
    retry_fn: F,
) -> Vec<Action>
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = String>,
{
    let source = ActionSource::Agent(agent_id.to_string());

    // Try all strategies first
    if let Some(actions) = try_parse_json_array(response, &source) {
        return actions;
    }
    if let Some(actions) = try_extract_code_block(response, &source) {
        return actions;
    }
    if let Some(action) = try_parse_single_json(response, &source) {
        return vec![action];
    }

    // All strategies failed — try rephrase retry
    warn!(agent_id, "Initial parse failed, attempting rephrase retry");
    let rephrased = retry_fn().await;

    if !rephrased.is_empty() {
        if let Some(actions) = try_parse_json_array(&rephrased, &source) {
            return actions;
        }
        if let Some(actions) = try_extract_code_block(&rephrased, &source) {
            return actions;
        }
        if let Some(action) = try_parse_single_json(&rephrased, &source) {
            return vec![action];
        }
        warn!(agent_id, "Rephrase retry also failed to produce valid JSON");
    }

    // Final fallback: wrap plain text as agent.response
    vec![Action::new(
        "agent.response".to_string(),
        serde_json::json!({ "text": response }),
        source,
    )]
}

fn try_parse_json_array(text: &str, source: &ActionSource) -> Option<Vec<Action>> {
    let trimmed = text.trim();
    if !trimmed.starts_with('[') {
        return None;
    }

    let parsed: Vec<ParsedAction> = serde_json::from_str(trimmed).ok()?;
    if parsed.is_empty() {
        return None;
    }

    let actions = parsed
        .into_iter()
        .map(|p| {
            Action::new(
                p.action_type,
                p.payload.unwrap_or(serde_json::Value::Null),
                source.clone(),
            )
        })
        .collect();
    Some(actions)
}

fn try_extract_code_block(text: &str, source: &ActionSource) -> Option<Vec<Action>> {
    // Look for ```json ... ``` blocks
    let json_start = text.find("```json")?;
    let content_start = json_start + 7;
    let json_end = text[content_start..].find("```")?;
    let json_str = text[content_start..content_start + json_end].trim();

    if let Some(actions) = try_parse_json_array(json_str, source) {
        return Some(actions);
    }
    if let Some(action) = try_parse_single_json(json_str, source) {
        return Some(vec![action]);
    }

    None
}

fn try_parse_single_json(text: &str, source: &ActionSource) -> Option<Action> {
    let trimmed = text.trim();
    if !trimmed.starts_with('{') {
        return None;
    }

    let parsed: ParsedAction = serde_json::from_str(trimmed).ok()?;
    Some(Action::new(
        parsed.action_type,
        parsed.payload.unwrap_or(serde_json::Value::Null),
        source.clone(),
    ))
}
