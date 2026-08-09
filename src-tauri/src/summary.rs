use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

// ── Configuration ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryConfig {
    pub enabled: bool,
    pub model: String,
    pub api_key: String,
    pub api_base_url: String,
    pub language: String,
}

impl Default for SummaryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            model: "gpt-4o-mini".to_string(),
            api_key: String::new(),
            api_base_url: "https://api.openai.com/v1".to_string(),
            language: "zh".to_string(),
        }
    }
}

// ── Result ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SummaryResult {
    pub title: String,
    pub summary: String,
    pub todos: Vec<String>,
    pub keywords: Vec<String>,
}

// ── Prompt templates ─────────────────────────────────────────────────────────

fn system_prompt(language: &str) -> String {
    if language == "en" {
        "You are a professional meeting minutes assistant. Analyze the following \
        transcript and generate: 1) Title (max 50 characters) 2) Summary (bullet \
        points) 3) Action items / todos 4) Keywords. Output MUST be valid JSON \
        matching this schema: \
        {\"title\": \"...\", \"summary\": \"...\", \"todos\": [\"...\"], \"keywords\": [\"...\"]}. \
        Do NOT include any other text or markdown formatting."
            .to_string()
    } else {
        "你是一个专业的会议纪要助手。请分析以下转写文本，生成：\
        1) 标题(最多50字) 2) 摘要(要点列表) 3) 待办事项 4) 关键词。\
        以JSON格式输出，严格遵循以下schema：\
        {\"title\": \"...\", \"summary\": \"...\", \"todos\": [\"...\"], \"keywords\": [\"...\"]}。\
        不要输出任何其他文字或markdown格式。"
            .to_string()
    }
}

// ── Endpoint construction ────────────────────────────────────────────────────

fn summary_endpoint(api_base_url: &str) -> Result<reqwest::Url> {
    let raw = api_base_url.trim();
    if raw.is_empty() {
        anyhow::bail!("API base URL is empty");
    }

    if raw.ends_with("/chat/completions") {
        return reqwest::Url::parse(raw).context("Invalid API base URL");
    }

    let base = raw.trim_end_matches('/');
    let with_version = if base.contains("/v1") {
        base.to_string()
    } else {
        format!("{}/v1", base)
    };

    let endpoint = format!("{}/chat/completions", with_version.trim_end_matches('/'));
    reqwest::Url::parse(&endpoint).context("Invalid API base URL")
}

// ── MiMo helpers ─────────────────────────────────────────────────────────────

fn is_mimo_chat(api_base_url: &str) -> bool {
    api_base_url.trim().to_ascii_lowercase().contains("xiaomimimo.com")
}

// ── Retry helpers ────────────────────────────────────────────────────────────

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

// ── JSON extraction from LLM response ────────────────────────────────────────

/// Try to parse the LLM text content as JSON matching SummaryResult.
/// If that fails, fall back to heuristic text extraction.
fn extract_summary_from_text(content: &str) -> SummaryResult {
    // Try direct JSON parse
    if let Ok(parsed) = serde_json::from_str::<SummaryResult>(content.trim()) {
        if !parsed.title.is_empty() || !parsed.summary.is_empty() {
            return parsed;
        }
    }

    // Try to find a JSON block inside markdown fences
    if let Some(json_block) = extract_json_block(content) {
        if let Ok(parsed) = serde_json::from_str::<SummaryResult>(&json_block) {
            if !parsed.title.is_empty() || !parsed.summary.is_empty() {
                return parsed;
            }
        }
    }

    // Best-effort fallback: extract structured info from plain text
    fallback_text_extraction(content)
}

/// Look for a ```json ... ``` fenced block in the text.
fn extract_json_block(text: &str) -> Option<String> {
    let start_marker = "```json";
    let end_marker = "```";
    let start = text.find(start_marker)?;
    let after_start = &text[start + start_marker.len()..];
    let inner_start = after_start.find('\n').map(|n| n + 1).unwrap_or(0);
    let end = after_start[inner_start..].find(end_marker)?;
    Some(after_start[inner_start..inner_start + end].trim().to_string())
}

/// Heuristic fallback when JSON parsing fails.
fn fallback_text_extraction(text: &str) -> SummaryResult {
    let lines: Vec<&str> = text.lines().map(str::trim).collect();

    // First non-empty line as title (truncated to 50 chars)
    let title = lines
        .iter()
        .find(|l| !l.is_empty())
        .map(|l| {
            let t = l.trim_matches(|c: char| c == '#' || c == '*' || c == '-' || c.is_whitespace());
            truncate_str(t, 50)
        })
        .unwrap_or_default();

    // Lines starting with - or * as todos
    let todos: Vec<String> = lines
        .iter()
        .filter(|l| {
            let trimmed = l.trim();
            (trimmed.starts_with('-') || trimmed.starts_with('*') || trimmed.starts_with("•")) && trimmed.len() > 2
        })
        .map(|l| l.trim().trim_start_matches(['-', '*', '•']).trim().to_string())
        .take(20)
        .collect();

    // Full text as summary
    let summary = text.trim().to_string();

    // Simple keyword extraction: common 2+ char words, deduplicated
    let keywords = extract_keywords(text);

    SummaryResult {
        title,
        summary,
        todos,
        keywords,
    }
}

fn truncate_str(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        let end = s.char_indices().nth(max_chars).map(|(i, _)| i).unwrap_or(s.len());
        format!("{}…", &s[..end])
    }
}

fn extract_keywords(text: &str) -> Vec<String> {
    use std::collections::BTreeSet;
    let mut seen = BTreeSet::new();
    let mut keywords = Vec::new();

    for word in text.split(|c: char| !c.is_alphanumeric()) {
        let w = word.trim();
        if w.len() >= 2 && !w.chars().all(|c| c.is_ascii_digit()) && seen.insert(w.to_string()) {
            keywords.push(w.to_string());
        }
    }

    keywords.truncate(30);
    keywords
}

// ── Core function ────────────────────────────────────────────────────────────

/// Generate an AI-powered meeting summary from transcribed text.
///
/// Calls an OpenAI-compatible `/v1/chat/completions` endpoint,
/// or a MiMo-compatible chat endpoint with `api-key` auth header.
/// Retries up to `config.retry_count` times on transient failures.
pub async fn generate_summary(
    transcript: &str,
    config: &SummaryConfig,
    client: &reqwest::Client,
) -> Result<SummaryResult> {
    if transcript.trim().is_empty() {
        anyhow::bail!("Transcript is empty — nothing to summarize");
    }

    let endpoint = summary_endpoint(&config.api_base_url)?;
    let model = if config.model.trim().is_empty() {
        "gpt-4o-mini"
    } else {
        config.model.trim()
    };

    let system = system_prompt(&config.language);
    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system
            },
            {
                "role": "user",
                "content": transcript
            }
        ],
        "temperature": 0.3
    });

    let timeout = Duration::from_secs(60);
    let attempts = 3u8; // 1 initial + 2 retries
    let is_mimo = is_mimo_chat(&config.api_base_url);

    let mut last_error: Option<anyhow::Error> = None;

    for attempt in 0..attempts {
        let request = if is_mimo {
            client
                .post(endpoint.clone())
                .header("api-key", &config.api_key)
                .timeout(timeout)
                .json(&body)
        } else {
            client
                .post(endpoint.clone())
                .bearer_auth(&config.api_key)
                .timeout(timeout)
                .json(&body)
        };

        let response = request.send().await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp.json().await.context("Failed to parse summary API response")?;

                // Check for API-level errors
                if let Some(err) = json.get("error") {
                    let msg = err
                        .get("message")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("unknown error");
                    anyhow::bail!("Summary API error: {}", msg);
                }

                let content = json
                    .pointer("/choices/0/message/content")
                    .and_then(serde_json::Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| anyhow::anyhow!("Missing content in summary API response"))?;

                return Ok(extract_summary_from_text(content));
            }
            Ok(resp) => {
                let status = resp.status();
                let body = shorten_error_body(resp.text().await.unwrap_or_default());

                if attempt + 1 < attempts && should_retry_status(status) {
                    tokio::time::sleep(backoff_duration(attempt)).await;
                    last_error = Some(anyhow::anyhow!("Retrying after HTTP {}", status.as_u16()));
                    continue;
                }

                anyhow::bail!("Summary API error {}: {}", status, body);
            }
            Err(error) => {
                if attempt + 1 < attempts {
                    tokio::time::sleep(backoff_duration(attempt)).await;
                    last_error = Some(anyhow::anyhow!("Network error, retrying: {}", error));
                    continue;
                }
                anyhow::bail!("Failed to send summary request: {}", error);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Summary generation failed after retries")))
}

// ── Connection validation ────────────────────────────────────────────────────

/// Validate the summary API key + endpoint with a minimal probe request.
pub async fn validate_summary_key(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
) -> Result<()> {
    let endpoint = summary_endpoint(api_base_url)?;
    let model = if model.trim().is_empty() {
        "gpt-4o-mini"
    } else {
        model.trim()
    };

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a summarizer."
            },
            {
                "role": "user",
                "content": "Hello"
            }
        ],
        "max_tokens": 5
    });

    let is_mimo = is_mimo_chat(api_base_url);

    let request = if is_mimo {
        client
            .post(endpoint)
            .header("api-key", api_key)
            .timeout(Duration::from_secs(15))
            .json(&body)
    } else {
        client
            .post(endpoint)
            .bearer_auth(api_key)
            .timeout(Duration::from_secs(15))
            .json(&body)
    };

    let resp = request.send().await.context("Network error")?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        anyhow::bail!("Invalid API key");
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        anyhow::bail!("The server rejected this API key");
    }

    let body_text = if status.is_success() {
        String::new()
    } else {
        resp.text().await.unwrap_or_default()
    };
    let shortened = shorten_error_body(body_text);

    if status == reqwest::StatusCode::NOT_FOUND {
        anyhow::bail!(
            "Endpoint not found (HTTP 404). Check your API Base URL.\nDetails: {}",
            shortened
        );
    }
    if matches!(
        status,
        reqwest::StatusCode::BAD_REQUEST | reqwest::StatusCode::UNPROCESSABLE_ENTITY
    ) {
        anyhow::bail!(
            "Connection successful but request was rejected (HTTP {}). Your configuration is likely correct — save and try a real summary.\nDetails: {}",
            status.as_u16(),
            shortened
        );
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
        anyhow::bail!(
            "The upstream service is temporarily overloaded (HTTP {}). Your configuration is likely correct.\nDetails: {}",
            status.as_u16(),
            shortened
        );
    }
    if !status.is_success() {
        anyhow::bail!("{}", shortened);
    }

    Ok(())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_summary_endpoint_standard() {
        let url = summary_endpoint("https://api.openai.com/v1").unwrap();
        assert_eq!(url.as_str(), "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn test_summary_endpoint_already_full() {
        let url = summary_endpoint("https://api.openai.com/v1/chat/completions").unwrap();
        assert_eq!(url.as_str(), "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn test_summary_endpoint_no_v1() {
        let url = summary_endpoint("https://api.example.com").unwrap();
        assert_eq!(url.as_str(), "https://api.example.com/v1/chat/completions");
    }

    #[test]
    fn test_summary_endpoint_empty() {
        assert!(summary_endpoint("").is_err());
    }

    #[test]
    fn test_summary_default_config() {
        let config = SummaryConfig::default();
        assert!(config.enabled);
        assert_eq!(config.model, "gpt-4o-mini");
        assert_eq!(config.api_base_url, "https://api.openai.com/v1");
        assert_eq!(config.language, "zh");
    }

    #[test]
    fn test_is_mimo_chat() {
        assert!(is_mimo_chat("https://api.xiaomimimo.com/v1"));
        assert!(is_mimo_chat("https://API.XIAOMIMIMO.COM/v1"));
        assert!(!is_mimo_chat("https://api.openai.com/v1"));
        assert!(!is_mimo_chat("https://api.groq.com/openai/v1"));
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
    fn test_truncate_str() {
        assert_eq!(truncate_str("hello", 10), "hello");
        assert_eq!(truncate_str("hello world this is long", 10), "hello worl…");
        assert_eq!(truncate_str("你好世界你好世界你好世界", 6), "你好世界你好…");
    }

    #[test]
    fn test_extract_json_direct() {
        let json =
            r#"{"title": "测试", "summary": "要点一\n要点二", "todos": ["做A", "做B"], "keywords": ["项目", "进展"]}"#;
        let result = extract_summary_from_text(json);
        assert_eq!(result.title, "测试");
        assert_eq!(result.summary, "要点一\n要点二");
        assert_eq!(result.todos.len(), 2);
        assert_eq!(result.keywords.len(), 2);
    }

    #[test]
    fn test_extract_json_from_fence() {
        let input = "Here's a summary:\n```json\n{\"title\": \"Meeting\", \"summary\": \"stuff\", \"todos\": [\"do X\"], \"keywords\": [\"key\"]}\n```\nDone.";
        let result = extract_summary_from_text(input);
        assert_eq!(result.title, "Meeting");
        assert_eq!(result.summary, "stuff");
    }

    #[test]
    fn test_extract_fallback_text() {
        let input =
            "Team Sync\n- Prepare slides\n- Review budget\nSome extra text here with keywords project and status.";
        let result = extract_summary_from_text(input);
        assert_eq!(result.title, "Team Sync");
        assert_eq!(result.todos, vec!["Prepare slides", "Review budget"]);
        assert!(!result.summary.is_empty());
        assert!(result.keywords.contains(&"project".to_string()));
        assert!(result.keywords.contains(&"status".to_string()));
    }

    #[test]
    fn test_extract_json_block() {
        let input = "```json\n{\"title\": \"T\", \"summary\": \"S\", \"todos\": [], \"keywords\": []}\n```";
        let block = extract_json_block(input).unwrap();
        assert!(block.contains("\"title\""));
    }

    #[test]
    fn test_extract_keywords() {
        let text = "hello world hello again 123";
        let kw = extract_keywords(text);
        assert!(kw.contains(&"hello".to_string()));
        assert!(kw.contains(&"world".to_string()));
        assert!(!kw.contains(&"123".to_string())); // numeric-only filtered
        assert!(!kw.contains(&"a".to_string())); // under 2 chars
    }
}
