use anyhow::{Context, Result};
use reqwest::multipart;
use reqwest::{StatusCode, Url};
use std::time::Duration;

fn transcription_endpoint(api_base_url: &str) -> Result<Url> {
    let raw = api_base_url.trim();
    if raw.is_empty() {
        anyhow::bail!("API base URL is empty");
    }

    let endpoint = if raw.ends_with("/audio/transcriptions") {
        raw.to_string()
    } else {
        format!("{}/audio/transcriptions", raw.trim_end_matches('/'))
    };

    Url::parse(&endpoint).context("Invalid API base URL")
}

pub fn provider_name(api_base_url: &str) -> String {
    let raw = api_base_url.trim().to_ascii_lowercase();
    if raw.contains("openai.com") {
        "OpenAI".to_string()
    } else if raw.contains("groq.com") {
        "Groq".to_string()
    } else if raw.contains("fireworks.ai") {
        "Fireworks".to_string()
    } else if raw.contains("deepgram.com") {
        "Deepgram".to_string()
    } else if raw.contains("googleapis.com") || raw.contains("vertexai") {
        "Google Cloud".to_string()
    } else {
        "Custom".to_string()
    }
}

fn build_form(wav_data: Vec<u8>, model: &str, language: Option<&str>) -> Result<multipart::Form> {
    let file_part = multipart::Part::bytes(wav_data)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;

    let mut form = multipart::Form::new()
        .part("file", file_part)
        .text("model", model.to_string());

    if let Some(lang) = language {
        if lang != "auto" {
            form = form.text("language", lang.to_string());
        }
    }

    Ok(form)
}

fn extract_text(json: &serde_json::Value) -> Option<String> {
    let candidates = [
        json.get("text").and_then(serde_json::Value::as_str),
        json.get("transcript").and_then(serde_json::Value::as_str),
        json.pointer("/results/channels/0/alternatives/0/transcript")
            .and_then(serde_json::Value::as_str),
        json.pointer("/results/alternatives/0/transcript")
            .and_then(serde_json::Value::as_str),
    ];

    candidates
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn should_retry_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn backoff_duration(attempt: u8) -> Duration {
    Duration::from_millis(400 * 2u64.saturating_pow(attempt as u32))
}

fn shorten_error_body(body: String) -> String {
    let trimmed = body.trim();
    if trimmed.len() <= 500 {
        trimmed.to_string()
    } else {
        format!("{}…", &trimmed[..500])
    }
}

/// Validate API key by sending a tiny silent WAV to the transcription endpoint.
pub async fn validate_api_key(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
) -> Result<()> {
    let wav = generate_silent_wav();
    let model = if model.trim().is_empty() {
        "whisper-1"
    } else {
        model
    };
    let form = build_form(wav, model, None)?;
    let endpoint = transcription_endpoint(api_base_url)?;

    let resp = client
        .post(endpoint)
        .bearer_auth(api_key)
        .timeout(Duration::from_secs(15))
        .multipart(form)
        .send()
        .await
        .context("Network error")?;

    if resp.status() == StatusCode::UNAUTHORIZED {
        anyhow::bail!("Invalid API key");
    }
    if resp.status() == StatusCode::FORBIDDEN {
        anyhow::bail!("The server rejected this API key");
    }
    if matches!(
        resp.status(),
        StatusCode::BAD_REQUEST
            | StatusCode::NOT_FOUND
            | StatusCode::METHOD_NOT_ALLOWED
            | StatusCode::UNSUPPORTED_MEDIA_TYPE
            | StatusCode::UNPROCESSABLE_ENTITY
    ) {
        let body = shorten_error_body(resp.text().await.unwrap_or_default());
        anyhow::bail!(
            "The relay rejected the validation probe. Your configuration may still work for real transcription. Details: {}",
            body
        );
    }
    if !resp.status().is_success() {
        let body = shorten_error_body(resp.text().await.unwrap_or_default());
        anyhow::bail!("{}", body);
    }
    Ok(())
}

/// Generate a minimal valid WAV file (0.5s silence, 16kHz mono 16-bit).
fn generate_silent_wav() -> Vec<u8> {
    let sample_rate: u32 = 16000;
    let num_samples: u32 = sample_rate / 2;
    let data_size = num_samples * 2;
    let file_size = 36 + data_size;

    let mut buf = Vec::with_capacity(file_size as usize + 8);
    buf.extend_from_slice(b"RIFF");
    buf.extend_from_slice(&file_size.to_le_bytes());
    buf.extend_from_slice(b"WAVEfmt ");
    buf.extend_from_slice(&16u32.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes());
    buf.extend_from_slice(&1u16.to_le_bytes());
    buf.extend_from_slice(&sample_rate.to_le_bytes());
    buf.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    buf.extend_from_slice(&2u16.to_le_bytes());
    buf.extend_from_slice(&16u16.to_le_bytes());
    buf.extend_from_slice(b"data");
    buf.extend_from_slice(&data_size.to_le_bytes());
    buf.resize(buf.len() + data_size as usize, 0);
    buf
}

pub async fn transcribe_audio(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
    wav_data: Vec<u8>,
    language: Option<&str>,
    timeout_secs: u64,
    retry_count: u8,
) -> Result<String> {
    let endpoint = transcription_endpoint(api_base_url)?;
    let timeout = Duration::from_secs(timeout_secs.max(10));
    let attempts = retry_count.saturating_add(1);

    for attempt in 0..attempts {
        let form = build_form(wav_data.clone(), model, language)?;
        let response = client
            .post(endpoint.clone())
            .bearer_auth(api_key)
            .timeout(timeout)
            .multipart(form)
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp
                    .json()
                    .await
                    .context("Failed to parse API response")?;
                if let Some(text) = extract_text(&json) {
                    return Ok(text);
                }
                anyhow::bail!("Missing transcription text in response");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = shorten_error_body(resp.text().await.unwrap_or_default());
                if attempt + 1 < attempts && should_retry_status(status) {
                    tokio::time::sleep(backoff_duration(attempt)).await;
                    continue;
                }
                anyhow::bail!("API error {}: {}", status, body);
            }
            Err(error) => {
                if attempt + 1 < attempts {
                    tokio::time::sleep(backoff_duration(attempt)).await;
                    continue;
                }
                anyhow::bail!("Failed to send transcription request: {}", error);
            }
        }
    }

    anyhow::bail!("Transcription failed after retries")
}
