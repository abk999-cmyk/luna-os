use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use super::llm_stream::{self, StreamReceiver};
use crate::error::LunaError;

#[derive(Debug, Clone)]
pub struct LlmClient {
    client: Client,
    api_key: String,
    model: String,
    provider: LlmProvider,
}

#[derive(Debug, Clone)]
pub enum LlmProvider {
    Anthropic,
    OpenAI,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<LlmMessage>,
}

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<OpenAIMessage>,
}

#[derive(Debug, Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
    model: String,
    usage: AnthropicUsage,
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicContent {
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    model: String,
    usage: OpenAIUsage,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessage2,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIMessage2 {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
}

#[derive(Debug)]
pub struct LlmResponse {
    pub content: String,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub stop_reason: String,
}

impl LlmClient {
    pub fn new_anthropic(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: "claude-sonnet-4-20250514".to_string(),
            provider: LlmProvider::Anthropic,
        }
    }

    pub fn new_openai(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: "gpt-4o".to_string(),
            provider: LlmProvider::OpenAI,
        }
    }

    pub async fn send(
        &self,
        system_prompt: &str,
        messages: &[LlmMessage],
        max_tokens: u32,
    ) -> Result<LlmResponse, LunaError> {
        match self.provider {
            LlmProvider::Anthropic => self.send_anthropic(system_prompt, messages, max_tokens).await,
            LlmProvider::OpenAI => self.send_openai(system_prompt, messages, max_tokens).await,
        }
    }

    /// Send a streaming request. Returns a channel that receives incremental tokens.
    pub async fn send_streaming(
        &self,
        system_prompt: &str,
        messages: &[LlmMessage],
        max_tokens: u32,
    ) -> Result<StreamReceiver, LunaError> {
        match self.provider {
            LlmProvider::Anthropic => {
                llm_stream::stream_anthropic(
                    &self.client, &self.api_key, &self.model,
                    system_prompt, messages, max_tokens,
                ).await
            }
            LlmProvider::OpenAI => {
                llm_stream::stream_openai(
                    &self.client, &self.api_key, &self.model,
                    system_prompt, messages, max_tokens,
                ).await
            }
        }
    }

    async fn send_anthropic(
        &self,
        system_prompt: &str,
        messages: &[LlmMessage],
        max_tokens: u32,
    ) -> Result<LlmResponse, LunaError> {
        let request = AnthropicRequest {
            model: self.model.clone(),
            max_tokens,
            system: system_prompt.to_string(),
            messages: messages.to_vec(),
        };

        info!(model = %self.model, messages_count = messages.len(), "Sending request to Anthropic");

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            warn!(status = %status, error = %error_text, "Anthropic API error");
            return Err(LunaError::Api(format!(
                "Anthropic API error ({}): {}",
                status, error_text
            )));
        }

        let resp: AnthropicResponse = response.json().await?;

        let content = resp
            .content
            .first()
            .map(|c| c.text.clone())
            .unwrap_or_default();

        info!(
            input_tokens = resp.usage.input_tokens,
            output_tokens = resp.usage.output_tokens,
            "Anthropic response received"
        );

        Ok(LlmResponse {
            content,
            model: resp.model,
            input_tokens: resp.usage.input_tokens,
            output_tokens: resp.usage.output_tokens,
            stop_reason: resp.stop_reason.unwrap_or_else(|| "unknown".to_string()),
        })
    }

    async fn send_openai(
        &self,
        system_prompt: &str,
        messages: &[LlmMessage],
        max_tokens: u32,
    ) -> Result<LlmResponse, LunaError> {
        let mut oai_messages = vec![OpenAIMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        }];
        for msg in messages {
            oai_messages.push(OpenAIMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        let request = OpenAIRequest {
            model: self.model.clone(),
            max_tokens,
            messages: oai_messages,
        };

        info!(model = %self.model, messages_count = messages.len(), "Sending request to OpenAI");

        let response = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            warn!(status = %status, error = %error_text, "OpenAI API error");
            return Err(LunaError::Api(format!(
                "OpenAI API error ({}): {}",
                status, error_text
            )));
        }

        let resp: OpenAIResponse = response.json().await?;

        let content = resp
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default();

        info!(
            input_tokens = resp.usage.prompt_tokens,
            output_tokens = resp.usage.completion_tokens,
            "OpenAI response received"
        );

        Ok(LlmResponse {
            content,
            model: resp.model,
            input_tokens: resp.usage.prompt_tokens,
            output_tokens: resp.usage.completion_tokens,
            stop_reason: resp
                .choices
                .first()
                .and_then(|c| c.finish_reason.clone())
                .unwrap_or_else(|| "unknown".to_string()),
        })
    }
}
