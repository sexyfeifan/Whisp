use anyhow::{Context, Result};
use base64::Engine;
use reqwest::multipart;
use reqwest::{StatusCode, Url};
use std::sync::Arc;
use std::time::Duration;

fn transcription_endpoint(api_base_url: &str) -> Result<Url> {
    let raw = api_base_url.trim();
    if raw.is_empty() {
        anyhow::bail!("API base URL is empty");
    }

    if raw.ends_with("/audio/transcriptions") {
        return Url::parse(raw).context("Invalid API base URL");
    }

    let base = raw.trim_end_matches('/');
    let with_version = if base.contains("/v1") {
        base.to_string()
    } else {
        format!("{}/v1", base)
    };

    let endpoint = format!("{}/audio/transcriptions", with_version.trim_end_matches('/'));
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
    } else if raw.contains("xiaomimimo.com") {
        "MiMo".to_string()
    } else {
        "Custom".to_string()
    }
}

fn is_mimo_asr(model: &str) -> bool {
    model.trim().to_ascii_lowercase() == "mimo-v2.5-asr"
}

fn mimo_endpoint(api_base_url: &str) -> Result<Url> {
    let raw = api_base_url.trim();
    if raw.is_empty() {
        anyhow::bail!("API base URL is empty");
    }
    let endpoint = if raw.ends_with("/chat/completions") {
        raw.to_string()
    } else {
        format!("{}/chat/completions", raw.trim_end_matches('/'))
    };
    Url::parse(&endpoint).context("Invalid API base URL")
}

fn build_mimo_json(
    wav_data: Vec<u8>,
    model: &str,
    language: Option<&str>,
) -> Result<serde_json::Value> {
    use base64::engine::general_purpose::STANDARD;
    let encoded = STANDARD.encode(&wav_data);
    let data_url = format!("data:audio/wav;base64,{}", encoded);

    let lang = match language {
        Some(l) if l != "auto" => l.to_string(),
        _ => "auto".to_string(),
    };

    Ok(serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": data_url
                        }
                    }
                ]
            }
        ],
        "asr_options": {
            "language": lang
        }
    }))
}

fn extract_mimo_text(json: &serde_json::Value) -> Result<String> {
    if let Some(err) = json.get("error") {
        let msg = err.get("message").and_then(serde_json::Value::as_str).unwrap_or("unknown error");
        anyhow::bail!("MiMo API error: {}", msg);
    }
    json.pointer("/choices/0/message/content")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow::anyhow!("Missing transcription text in MiMo response"))
}

fn build_form(
    wav_data: Vec<u8>,
    model: &str,
    language: Option<&str>,
    prompt: Option<&str>,
) -> Result<multipart::Form> {
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

    if let Some(p) = prompt {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            form = form.text("prompt", trimmed.to_string());
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
        json.pointer("/choices/0/message/content")
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
        let end = trimmed.floor_char_boundary(500);
        format!("{}…", &trimmed[..end])
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

    let resp = if is_mimo_asr(model) {
        let endpoint = mimo_endpoint(api_base_url)?;
        let json_body = build_mimo_json(wav, model, None)?;
        client
            .post(endpoint)
            .header("api-key", api_key)
            .timeout(Duration::from_secs(15))
            .json(&json_body)
            .send()
            .await
            .context("Network error")?
    } else {
        let form = build_form(wav, model, None, None)?;
        let endpoint = transcription_endpoint(api_base_url)?;
        client
            .post(endpoint)
            .bearer_auth(api_key)
            .timeout(Duration::from_secs(15))
            .multipart(form)
            .send()
            .await
            .context("Network error")?
    };

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
    let status = resp.status();
    if matches!(status, StatusCode::TOO_MANY_REQUESTS | StatusCode::SERVICE_UNAVAILABLE) {
        let body = shorten_error_body(resp.text().await.unwrap_or_default());
        anyhow::bail!(
            "The upstream service is temporarily overloaded (HTTP {}). Your configuration is likely correct. Save your settings and try a real recording.\nDetails: {}",
            status.as_u16(),
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
    prompt: Option<&str>,
    timeout_secs: u64,
    retry_count: u8,
) -> Result<String> {
    let timeout = Duration::from_secs(timeout_secs.max(10));
    let attempts = retry_count.saturating_add(1);
    let wav_arc = Arc::new(wav_data);

    if is_mimo_asr(model) {
        let endpoint = mimo_endpoint(api_base_url)?;
        for attempt in 0..attempts {
            let json_body = build_mimo_json((*wav_arc).clone(), model, language)?;
            let response = client
                .post(endpoint.clone())
                .header("api-key", api_key)
                .timeout(timeout)
                .json(&json_body)
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    let json: serde_json::Value = resp
                        .json()
                        .await
                        .context("Failed to parse MiMo API response")?;
                    return extract_mimo_text(&json);
                }
                Ok(resp) => {
                    let status = resp.status();
                    let body = shorten_error_body(resp.text().await.unwrap_or_default());
                    if attempt + 1 < attempts && should_retry_status(status) {
                        tokio::time::sleep(backoff_duration(attempt)).await;
                        continue;
                    }
                    anyhow::bail!("MiMo API error {}: {}", status, body);
                }
                Err(error) => {
                    if attempt + 1 < attempts {
                        tokio::time::sleep(backoff_duration(attempt)).await;
                        continue;
                    }
                    anyhow::bail!("Failed to send MiMo transcription request: {}", error);
                }
            }
        }
    } else {
        let endpoint = transcription_endpoint(api_base_url)?;
        for attempt in 0..attempts {
            let form = build_form((*wav_arc).clone(), model, language, prompt)?;
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
    }

    anyhow::bail!("Transcription failed after retries")
}
