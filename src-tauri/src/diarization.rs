use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Configuration for the speaker diarization API integration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiarizationConfig {
    /// Whether diarization is enabled.
    #[serde(default)]
    pub enabled: bool,
    /// API key for the diarization service (e.g. pyannote, rev.ai, etc.).
    #[serde(default)]
    pub api_key: String,
    /// Base URL of the diarization API endpoint.
    #[serde(default = "default_diarization_api_base_url")]
    pub api_base_url: String,
    /// Number of expected speakers.  0 = auto-detect.
    #[serde(default)]
    pub num_speakers: u32,
}

fn default_diarization_api_base_url() -> String {
    "https://api.pyannote.ai/v1".to_string()
}

impl Default for DiarizationConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            api_key: String::new(),
            api_base_url: default_diarization_api_base_url(),
            num_speakers: 0,
        }
    }
}

/// One speaker-tagged segment from the diarization output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeakerSegment {
    /// Speaker label, e.g. "SPEAKER_00", "SPEAKER_01".
    pub speaker: String,
    /// Segment start in milliseconds.
    pub start_ms: i64,
    /// Segment end in milliseconds.
    pub end_ms: i64,
    /// Transcript text for this segment.
    pub text: String,
}

/// The full diarization result containing all speaker segments.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiarizationResult {
    pub segments: Vec<SpeakerSegment>,
}

// ---------------------------------------------------------------------------
// Helpers (same pattern as transcribe.rs)
// ---------------------------------------------------------------------------

fn should_retry_status(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
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

// ---------------------------------------------------------------------------
// API integration (STUB – real implementation to be filled in later)
// ---------------------------------------------------------------------------

/// Send WAV audio to a diarization API and return speaker-labelled segments.
///
/// When `config.enabled` is `false` or the API is not configured, a single-
/// speaker result is returned so callers always receive a valid
/// `DiarizationResult`.
///
/// Retry logic mirrors `transcribe_audio` in `transcribe.rs`: up to
/// `config.retry_count` retries with exponential backoff on 429/5xx and
/// network errors.
pub async fn diarize(
    audio_wav: &[u8],
    config: &DiarizationConfig,
    client: &reqwest::Client,
    retry_count: u8,
) -> Result<DiarizationResult> {
    // Fast path: not configured → return a dummy single-speaker result.
    if !config.enabled || config.api_key.trim().is_empty() {
        return Ok(DiarizationResult { segments: Vec::new() });
    }

    let endpoint = config.api_base_url.trim();
    if endpoint.is_empty() {
        anyhow::bail!("Diarization API base URL is empty");
    }

    // Normalize the URL: append /diarization if it's not already a full path.
    let url = if endpoint.contains("/diarization") {
        endpoint.to_string()
    } else {
        format!("{}/diarization", endpoint.trim_end_matches('/'))
    };

    let attempts = retry_count.saturating_add(1);

    for attempt in 0..attempts {
        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key.trim()))
            .header("Content-Type", "audio/wav")
            .body(audio_wav.to_vec())
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.context("Failed to parse diarization API response")?;
                return parse_diarization_response(&json, config);
            }
            Ok(resp) => {
                let status = resp.status();
                let body = shorten_error_body(resp.text().await.unwrap_or_default());
                if attempt + 1 < attempts && should_retry_status(status) {
                    tokio::time::sleep(backoff_duration(attempt)).await;
                    continue;
                }
                anyhow::bail!("Diarization API error {}: {}", status, body);
            }
            Err(error) => {
                if attempt + 1 < attempts {
                    tokio::time::sleep(backoff_duration(attempt)).await;
                    continue;
                }
                anyhow::bail!("Failed to send diarization request: {}", error);
            }
        }
    }

    anyhow::bail!("Diarization failed after retries")
}

// ---------------------------------------------------------------------------
// Response parsing (STUB)
// ---------------------------------------------------------------------------

/// Parse a diarization API JSON response into a `DiarizationResult`.
///
/// Supports common response shapes from pyannote.audio / diart APIs.
/// TODO: add more vendor formats as needed.
fn parse_diarization_response(json: &serde_json::Value, _config: &DiarizationConfig) -> Result<DiarizationResult> {
    // Try the standard pyannote shape first:
    // { "segments": [{ "speaker": "SPEAKER_00", "start": 0.5, "end": 2.3 }, ...] }
    if let Some(segments) = json.get("segments").and_then(|s| s.as_array()) {
        let parsed: Vec<SpeakerSegment> = segments
            .iter()
            .filter_map(|seg| {
                let speaker = seg.get("speaker")?.as_str()?.to_string();
                let start_ms = (seg.get("start")?.as_f64()? * 1000.0) as i64;
                let end_ms = (seg.get("end")?.as_f64()? * 1000.0) as i64;
                let text = seg.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                Some(SpeakerSegment {
                    speaker,
                    start_ms,
                    end_ms,
                    text,
                })
            })
            .collect();

        if parsed.is_empty() {
            anyhow::bail!("Diarization response had zero parseable segments");
        }

        return Ok(DiarizationResult { segments: parsed });
    }

    // Try alternative shape: array at top level
    if let Some(arr) = json.as_array() {
        let parsed: Vec<SpeakerSegment> = arr
            .iter()
            .filter_map(|seg| {
                let speaker = seg.get("speaker")?.as_str()?.to_string();
                let start_ms = (seg.get("start")?.as_f64()? * 1000.0) as i64;
                let end_ms = (seg.get("end")?.as_f64()? * 1000.0) as i64;
                let text = seg.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                Some(SpeakerSegment {
                    speaker,
                    start_ms,
                    end_ms,
                    text,
                })
            })
            .collect();

        if parsed.is_empty() {
            anyhow::bail!("Diarization response had zero parseable segments");
        }

        return Ok(DiarizationResult { segments: parsed });
    }

    anyhow::bail!("Unrecognized diarization API response format")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = DiarizationConfig::default();
        assert!(!cfg.enabled);
        assert!(cfg.api_key.is_empty());
        assert_eq!(cfg.api_base_url, "https://api.pyannote.ai/v1");
        assert_eq!(cfg.num_speakers, 0);
    }

    #[test]
    fn test_parse_pyannote_shape() {
        let json = serde_json::json!({
            "segments": [
                {"speaker": "SPEAKER_00", "start": 0.0, "end": 1.5, "text": "Hello"},
                {"speaker": "SPEAKER_01", "start": 2.0, "end": 3.2, "text": "Hi there"}
            ]
        });
        let result = parse_diarization_response(&json, &DiarizationConfig::default()).unwrap();
        assert_eq!(result.segments.len(), 2);
        assert_eq!(result.segments[0].speaker, "SPEAKER_00");
        assert_eq!(result.segments[0].start_ms, 0);
        assert_eq!(result.segments[0].end_ms, 1500);
        assert_eq!(result.segments[0].text, "Hello");
        assert_eq!(result.segments[1].speaker, "SPEAKER_01");
        assert_eq!(result.segments[1].start_ms, 2000);
        assert_eq!(result.segments[1].end_ms, 3200);
        assert_eq!(result.segments[1].text, "Hi there");
    }

    #[test]
    fn test_parse_empty_segments_fails() {
        let json = serde_json::json!({"segments": []});
        assert!(parse_diarization_response(&json, &DiarizationConfig::default()).is_err());
    }

    #[test]
    fn test_parse_unrecognized_format_fails() {
        let json = serde_json::json!({"foo": "bar"});
        assert!(parse_diarization_response(&json, &DiarizationConfig::default()).is_err());
    }

    #[test]
    fn test_should_retry_status() {
        use reqwest::StatusCode;
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
    fn test_shorten_error_body_short() {
        assert_eq!(shorten_error_body("short error".to_string()), "short error");
    }

    #[test]
    fn test_shorten_error_body_long() {
        let long = "x".repeat(1000);
        let result = shorten_error_body(long);
        assert!(result.len() <= 503);
        assert!(result.ends_with('…'));
    }

    #[test]
    fn test_serialization_roundtrip() {
        let cfg = DiarizationConfig {
            enabled: true,
            api_key: "«redacted:hf_…»".to_string(),
            api_base_url: "https://api.pyannote.ai/v1".to_string(),
            num_speakers: 2,
        };
        let json = serde_json::to_string(&cfg).unwrap();
        let restored: DiarizationConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.enabled, cfg.enabled);
        assert_eq!(restored.api_base_url, cfg.api_base_url);
        assert_eq!(restored.num_speakers, cfg.num_speakers);
    }

    #[test]
    fn test_segment_serialization() {
        let result = DiarizationResult {
            segments: vec![SpeakerSegment {
                speaker: "SPEAKER_00".into(),
                start_ms: 0,
                end_ms: 1500,
                text: "Hello".into(),
            }],
        };
        let json = serde_json::to_string(&result).unwrap();
        let restored: DiarizationResult = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.segments.len(), 1);
        assert_eq!(restored.segments[0].speaker, "SPEAKER_00");
    }
}
