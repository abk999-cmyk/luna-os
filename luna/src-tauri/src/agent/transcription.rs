use reqwest::Client;
use tracing::info;

use crate::error::LunaError;

/// Transcribe audio bytes using OpenAI Whisper API.
pub async fn transcribe(
    client: &Client,
    api_key: &str,
    audio_bytes: Vec<u8>,
    format: &str,
) -> Result<String, LunaError> {
    let mime_type = match format {
        "webm" => "audio/webm",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        _ => "audio/webm",
    };

    let file_name = format!("audio.{}", format);

    let part = reqwest::multipart::Part::bytes(audio_bytes)
        .file_name(file_name)
        .mime_str(mime_type)
        .map_err(|e| LunaError::Api(format!("Failed to create multipart: {}", e)))?;

    let form = reqwest::multipart::Form::new()
        .text("model", "whisper-1")
        .part("file", part);

    info!("Sending audio to Whisper API for transcription");

    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(LunaError::Api(format!(
            "Whisper API error ({}): {}",
            status, error_text
        )));
    }

    let result: serde_json::Value = response.json().await?;
    let text = result
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    info!(chars = text.len(), "Transcription complete");
    Ok(text)
}
