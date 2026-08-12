use anyhow::{Context, Result};
use base64::Engine;
use reqwest::multipart;
use reqwest::{StatusCode, Url};
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
    let with_version = if base.ends_with("/v1") {
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

fn build_mimo_json(wav_data: &[u8], model: &str, language: Option<&str>) -> Result<serde_json::Value> {
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
        let msg = err
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown error");
        anyhow::bail!("MiMo API error: {}", msg);
    }
    json.pointer("/choices/0/message/content")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow::anyhow!("Missing transcription text in MiMo response"))
}

fn build_form(wav_data: &[u8], model: &str, language: Option<&str>, prompt: Option<&str>) -> Result<multipart::Form> {
    let file_part = multipart::Part::bytes(wav_data.to_vec())
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
pub async fn validate_api_key(client: &reqwest::Client, api_key: &str, api_base_url: &str, model: &str) -> Result<()> {
    let wav = generate_silent_wav();
    let model = if model.trim().is_empty() { "whisper-1" } else { model };

    let resp = if is_mimo_asr(model) {
        let endpoint = mimo_endpoint(api_base_url)?;
        let json_body = build_mimo_json(&wav, model, None)?;
        client
            .post(endpoint)
            .header("api-key", api_key)
            .timeout(Duration::from_secs(15))
            .json(&json_body)
            .send()
            .await
            .context("Network error")?
    } else {
        let form = build_form(&wav, model, None, None)?;
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

    let status = resp.status();
    if status == StatusCode::UNAUTHORIZED {
        anyhow::bail!("Invalid API key");
    }
    if status == StatusCode::FORBIDDEN {
        anyhow::bail!("The server rejected this API key");
    }

    let body_text = if status.is_success() {
        String::new()
    } else {
        resp.text().await.unwrap_or_default()
    };
    let body = shorten_error_body(body_text);

    // 404 = endpoint not found (real error)
    if status == StatusCode::NOT_FOUND {
        anyhow::bail!(
            "Endpoint not found (HTTP 404). Check your API Base URL.\nDetails: {}",
            body
        );
    }
    // 405/415 = method or media type not supported (real error)
    if matches!(
        status,
        StatusCode::METHOD_NOT_ALLOWED | StatusCode::UNSUPPORTED_MEDIA_TYPE
    ) {
        anyhow::bail!(
            "The server rejected the request format (HTTP {}). Your API URL may be incorrect.\nDetails: {}",
            status.as_u16(),
            body
        );
    }
    // 400/422 = server recognized the request but rejected the probe audio (likely config is OK)
    if matches!(status, StatusCode::BAD_REQUEST | StatusCode::UNPROCESSABLE_ENTITY) {
        anyhow::bail!(
            "Connection successful but probe was rejected (HTTP {}). Your configuration is likely correct — save and try a real recording.\nDetails: {}",
            status.as_u16(),
            body
        );
    }
    if matches!(status, StatusCode::TOO_MANY_REQUESTS | StatusCode::SERVICE_UNAVAILABLE) {
        anyhow::bail!(
            "The upstream service is temporarily overloaded (HTTP {}). Your configuration is likely correct. Save your settings and try a real recording.\nDetails: {}",
            status.as_u16(),
            body
        );
    }
    if !status.is_success() {
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

fn split_wav_into_chunks(wav_data: &[u8], max_chunk_size: usize) -> Vec<Vec<u8>> {
    if wav_data.len() <= max_chunk_size {
        return vec![wav_data.to_vec()];
    }

    // WAV header is typically 44 bytes
    let header_size = 44usize;
    if wav_data.len() <= header_size {
        return vec![wav_data.to_vec()];
    }

    let header = &wav_data[..header_size];
    let audio_data = &wav_data[header_size..];
    let chunk_audio_size = max_chunk_size - header_size;

    // Align to sample boundary (2 bytes for 16-bit mono)
    let aligned_chunk_size = (chunk_audio_size / 2) * 2;

    let mut chunks = Vec::new();
    let mut offset = 0;
    while offset < audio_data.len() {
        let end = (offset + aligned_chunk_size).min(audio_data.len());
        // Align end to sample boundary
        let aligned_end = (end / 2) * 2;
        let chunk_audio = &audio_data[offset..aligned_end];

        let chunk_data_size = chunk_audio.len() as u32;
        let file_size = 36 + chunk_data_size;

        let mut chunk = Vec::with_capacity(header_size + chunk_audio.len());
        chunk.extend_from_slice(b"RIFF");
        chunk.extend_from_slice(&file_size.to_le_bytes());
        chunk.extend_from_slice(&header[8..header_size]); // rest of header
                                                          // Update data chunk size in header
                                                          // The data size field is at offset 40 (header_size - 4)
        chunk[40..44].copy_from_slice(&chunk_data_size.to_le_bytes());
        chunk.extend_from_slice(chunk_audio);

        chunks.push(chunk);
        offset = aligned_end;
    }

    chunks
}

pub async fn transcribe_audio(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
    wav_data: &[u8],
    language: Option<&str>,
    prompt: Option<&str>,
    timeout_secs: u64,
    retry_count: u8,
) -> Result<String> {
    let timeout = Duration::from_secs(timeout_secs.max(10));
    let attempts = retry_count.saturating_add(1);

    if is_mimo_asr(model) {
        let endpoint = mimo_endpoint(api_base_url)?;
        // Split large files for MiMo API (10MB limit on input_audio.data)
        const MIMO_MAX_AUDIO_BYTES: usize = 6_000_000; // ~6MB WAV -> ~8MB base64, under 10MB limit
        let chunks = split_wav_into_chunks(wav_data, MIMO_MAX_AUDIO_BYTES);
        let is_chunked = chunks.len() > 1;

        let mut all_texts = Vec::new();

        for chunk_data in &chunks {
            for attempt in 0..attempts {
                let json_body = build_mimo_json(chunk_data, model, language)?;
                let response = client
                    .post(endpoint.clone())
                    .header("api-key", api_key)
                    .timeout(timeout)
                    .json(&json_body)
                    .send()
                    .await;

                match response {
                    Ok(resp) if resp.status().is_success() => {
                        let json: serde_json::Value = resp.json().await.context("Failed to parse MiMo API response")?;
                        let text = extract_mimo_text(&json)?;
                        all_texts.push(text);
                        break;
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
        }

        if is_chunked {
            return Ok(all_texts.join(" "));
        } else {
            return all_texts
                .into_iter()
                .next()
                .ok_or_else(|| anyhow::anyhow!("Transcription returned empty result"));
        }
    } else {
        let endpoint = transcription_endpoint(api_base_url)?;
        for attempt in 0..attempts {
            let form = build_form(wav_data, model, language, prompt)?;
            let response = client
                .post(endpoint.clone())
                .bearer_auth(api_key)
                .timeout(timeout)
                .multipart(form)
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    let json: serde_json::Value = resp.json().await.context("Failed to parse API response")?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_name() {
        assert_eq!(provider_name("https://api.openai.com/v1"), "OpenAI");
        assert_eq!(provider_name("https://api.groq.com/openai/v1"), "Groq");
        assert_eq!(provider_name("https://api.fireworks.ai/v1"), "Fireworks");
        assert_eq!(provider_name("https://api.deepgram.com/v1"), "Deepgram");
        assert_eq!(provider_name("https://speech.googleapis.com/v1"), "Google Cloud");
        assert_eq!(provider_name("https://api.xiaomimimo.com/v1"), "MiMo");
        assert_eq!(provider_name("https://my-custom-api.com/v1"), "Custom");
    }

    #[test]
    fn test_provider_name_case_insensitive() {
        assert_eq!(provider_name("https://API.OPENAI.COM/v1"), "OpenAI");
        assert_eq!(provider_name("https://Api.Groq.Com/v1"), "Groq");
    }

    #[test]
    fn test_transcription_endpoint_standard() {
        let url = transcription_endpoint("https://api.openai.com/v1").unwrap();
        assert_eq!(url.as_str(), "https://api.openai.com/v1/audio/transcriptions");
    }

    #[test]
    fn test_transcription_endpoint_already_full() {
        let url = transcription_endpoint("https://api.openai.com/v1/audio/transcriptions").unwrap();
        assert_eq!(url.as_str(), "https://api.openai.com/v1/audio/transcriptions");
    }

    #[test]
    fn test_transcription_endpoint_no_v1() {
        let url = transcription_endpoint("https://api.example.com").unwrap();
        assert_eq!(url.as_str(), "https://api.example.com/v1/audio/transcriptions");
    }

    #[test]
    fn test_transcription_endpoint_empty() {
        assert!(transcription_endpoint("").is_err());
    }

    #[test]
    fn test_generate_silent_wav() {
        let wav = generate_silent_wav();
        assert!(wav.starts_with(b"RIFF"));
        assert!(wav.len() > 44); // At least header + some data
    }

    #[test]
    fn test_shorten_error_body_short() {
        assert_eq!(shorten_error_body("short error".to_string()), "short error");
    }

    #[test]
    fn test_shorten_error_body_long() {
        let long = "x".repeat(1000);
        let result = shorten_error_body(long);
        assert!(result.len() <= 503); // 500 + "…" (3 bytes UTF-8)
        assert!(result.ends_with('…'));
    }

    #[test]
    fn test_should_retry_status() {
        assert!(should_retry_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(should_retry_status(StatusCode::INTERNAL_SERVER_ERROR));
        assert!(should_retry_status(StatusCode::BAD_GATEWAY));
        assert!(!should_retry_status(StatusCode::OK));
        assert!(!should_retry_status(StatusCode::BAD_REQUEST));
        assert!(!should_retry_status(StatusCode::UNAUTHORIZED));
    }

    #[test]
    fn test_backoff_duration() {
        let d0 = backoff_duration(0);
        let d1 = backoff_duration(1);
        let d2 = backoff_duration(2);
        assert!(d1 > d0);
        assert!(d2 > d1);
        assert_eq!(d0.as_millis(), 400);
        assert_eq!(d1.as_millis(), 800);
        assert_eq!(d2.as_millis(), 1600);
    }

    #[test]
    fn test_extract_text() {
        let json = serde_json::json!({"text": "hello world"});
        assert_eq!(extract_text(&json), Some("hello world".to_string()));

        let json2 = serde_json::json!({"transcript": "test transcript"});
        assert_eq!(extract_text(&json2), Some("test transcript".to_string()));

        let json3 = serde_json::json!({"choices": [{"message": {"content": "chat result"}}]});
        assert_eq!(extract_text(&json3), Some("chat result".to_string()));

        let json4 = serde_json::json!({"empty": true});
        assert_eq!(extract_text(&json4), None);
    }

    #[test]
    fn test_is_mimo_asr() {
        assert!(is_mimo_asr("mimo-v2.5-asr"));
        assert!(is_mimo_asr("MIMO-V2.5-ASR"));
        assert!(!is_mimo_asr("whisper-1"));
        assert!(!is_mimo_asr("gpt-4o-transcribe"));
    }
}
