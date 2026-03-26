use futures::StreamExt;
use reqwest::Client;
use tokio::sync::mpsc;
use tracing::{info, warn};

use super::llm_client::LlmMessage;
use crate::error::LunaError;

/// Events emitted during LLM streaming.
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// Incremental text token.
    Token(String),
    /// Usage statistics at the end.
    Usage { input: u32, output: u32 },
    /// Stream completed successfully.
    Done,
    /// Stream error.
    Error(String),
}

pub type StreamReceiver = mpsc::UnboundedReceiver<StreamEvent>;
pub type StreamSender = mpsc::UnboundedSender<StreamEvent>;

/// Send a streaming request to the Anthropic API.
pub async fn stream_anthropic(
    client: &Client,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    messages: &[LlmMessage],
    max_tokens: u32,
) -> Result<StreamReceiver, LunaError> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "system": system_prompt,
        "messages": messages,
    });

    info!(model = %model, "Starting streaming request to Anthropic");

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(LunaError::Api(format!(
            "Anthropic streaming API error ({}): {}",
            status, error_text
        )));
    }

    let (tx, rx) = mpsc::unbounded_channel();

    tokio::spawn(async move {
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut input_tokens: u32 = 0;
        let mut output_tokens: u32 = 0;

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));

                    // Process complete SSE lines
                    while let Some(pos) = buffer.find("\n\n") {
                        let event_block = buffer[..pos].to_string();
                        buffer = buffer[pos + 2..].to_string();

                        if let Some(data) = extract_sse_data(&event_block) {
                            process_anthropic_sse(&data, &tx, &mut input_tokens, &mut output_tokens);
                        }
                    }
                }
                Err(e) => {
                    let _ = tx.send(StreamEvent::Error(e.to_string()));
                    return;
                }
            }
        }

        // Send usage and done
        let _ = tx.send(StreamEvent::Usage {
            input: input_tokens,
            output: output_tokens,
        });
        let _ = tx.send(StreamEvent::Done);
    });

    Ok(rx)
}

/// Send a streaming request to the OpenAI API.
pub async fn stream_openai(
    client: &Client,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    messages: &[LlmMessage],
    max_tokens: u32,
) -> Result<StreamReceiver, LunaError> {
    let mut oai_messages = vec![serde_json::json!({
        "role": "system",
        "content": system_prompt,
    })];
    for msg in messages {
        oai_messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    let body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": oai_messages,
    });

    info!(model = %model, "Starting streaming request to OpenAI");

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(LunaError::Api(format!(
            "OpenAI streaming API error ({}): {}",
            status, error_text
        )));
    }

    let (tx, rx) = mpsc::unbounded_channel();

    tokio::spawn(async move {
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut input_tokens: u32 = 0;
        let mut output_tokens: u32 = 0;

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));

                    while let Some(pos) = buffer.find('\n') {
                        let line = buffer[..pos].to_string();
                        buffer = buffer[pos + 1..].to_string();

                        let trimmed = line.trim();
                        if trimmed.is_empty() || trimmed.starts_with(':') {
                            continue;
                        }

                        if let Some(data) = trimmed.strip_prefix("data: ") {
                            if data == "[DONE]" {
                                let _ = tx.send(StreamEvent::Usage {
                                    input: input_tokens,
                                    output: output_tokens,
                                });
                                let _ = tx.send(StreamEvent::Done);
                                return;
                            }
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                // Extract token content
                                if let Some(content) = parsed
                                    .pointer("/choices/0/delta/content")
                                    .and_then(|v| v.as_str())
                                {
                                    if !content.is_empty() {
                                        let _ = tx.send(StreamEvent::Token(content.to_string()));
                                    }
                                }
                                // Extract usage from final chunk
                                if let Some(usage) = parsed.get("usage") {
                                    input_tokens = usage
                                        .get("prompt_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0) as u32;
                                    output_tokens = usage
                                        .get("completion_tokens")
                                        .and_then(|v| v.as_u64())
                                        .unwrap_or(0) as u32;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = tx.send(StreamEvent::Error(e.to_string()));
                    return;
                }
            }
        }

        let _ = tx.send(StreamEvent::Usage {
            input: input_tokens,
            output: output_tokens,
        });
        let _ = tx.send(StreamEvent::Done);
    });

    Ok(rx)
}

/// Extract the "data:" field from an SSE event block.
fn extract_sse_data(event_block: &str) -> Option<String> {
    for line in event_block.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            return Some(data.to_string());
        }
    }
    None
}

/// Process a single Anthropic SSE data payload.
fn process_anthropic_sse(
    data: &str,
    tx: &StreamSender,
    input_tokens: &mut u32,
    output_tokens: &mut u32,
) {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) else {
        return;
    };

    let event_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match event_type {
        "content_block_delta" => {
            if let Some(text) = parsed
                .pointer("/delta/text")
                .and_then(|v| v.as_str())
            {
                if !text.is_empty() {
                    let _ = tx.send(StreamEvent::Token(text.to_string()));
                }
            }
        }
        "message_delta" => {
            if let Some(usage) = parsed.get("usage") {
                *output_tokens = usage
                    .get("output_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
            }
        }
        "message_start" => {
            if let Some(usage) = parsed.pointer("/message/usage") {
                *input_tokens = usage
                    .get("input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
            }
        }
        "message_stop" | "error" => {
            if event_type == "error" {
                let msg = parsed
                    .pointer("/error/message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown error");
                warn!(error = %msg, "Anthropic stream error");
                let _ = tx.send(StreamEvent::Error(msg.to_string()));
            }
        }
        _ => {}
    }
}
