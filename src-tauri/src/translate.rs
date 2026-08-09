use anyhow::{Context, Result};
use serde::Serialize;
use std::time::Duration;

/// Translation prompt templates per target language.
pub fn translation_prompt(target: &str) -> &'static str {
    match target {
        "zh-CN" => "你是一个专业的翻译器。请将以下文本翻译成简体中文。只输出翻译后的文本，不要添加任何解释、标注或前后缀。",
        "en" => "You are a professional translator. Translate the following text into English. Output only the translated text without any explanation, annotations, or prefixes.",
        "ja" => "あなたはプロの翻訳者です。以下のテキストを日本語に翻訳してください。翻訳後のテキストのみを出力し、説明や注釈、前後につける文は一切不要です。",
        _ => "You are a professional translator. Translate the following text accurately. Output only the translated text without any explanation, annotations, or prefixes.",
    }
}

/// Human-readable target language name for display.
pub fn target_language_name(target: &str) -> &str {
    match target {
        "zh-CN" => "简体中文",
        "en" => "English",
        "ja" => "日本語",
        _ => target,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TranslateResult {
    pub text: String,
    pub tokens_used: i64,
    pub target: String,
}

fn translate_endpoint(api_base_url: &str) -> Result<reqwest::Url> {
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

pub async fn translate_text(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
    raw_text: &str,
    target: &str,
    timeout_secs: u64,
) -> Result<TranslateResult> {
    let endpoint = translate_endpoint(api_base_url)?;

    let system_prompt = translation_prompt(target);

    let model = if model.trim().is_empty() { "gpt-4o-mini" } else { model };

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": raw_text
            }
        ],
        "temperature": 0.3
    });

    let resp = client
        .post(endpoint)
        .bearer_auth(api_key)
        .timeout(Duration::from_secs(timeout_secs.max(10)))
        .json(&body)
        .send()
        .await
        .context("Network error")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let shortened = if body_text.len() > 500 {
            format!("{}…", &body_text[..body_text.floor_char_boundary(500)])
        } else {
            body_text
        };
        anyhow::bail!("Translate API error {}: {}", status, shortened);
    }

    let json: serde_json::Value = resp.json().await.context("Failed to parse translate API response")?;

    if let Some(err) = json.get("error") {
        let msg = err
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown error");
        anyhow::bail!("Translate API error: {}", msg);
    }

    json.pointer("/choices/0/message/content")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            let tokens_used = json
                .pointer("/usage/total_tokens")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0);
            TranslateResult {
                text: s.to_owned(),
                tokens_used,
                target: target.to_string(),
            }
        })
        .ok_or_else(|| anyhow::anyhow!("Missing content in translate API response"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_translation_prompt_zh() {
        let prompt = translation_prompt("zh-CN");
        assert!(prompt.contains("简体中文"));
    }

    #[test]
    fn test_translation_prompt_en() {
        let prompt = translation_prompt("en");
        assert!(prompt.contains("English"));
    }

    #[test]
    fn test_translation_prompt_ja() {
        let prompt = translation_prompt("ja");
        assert!(prompt.contains("日本語"));
    }

    #[test]
    fn test_translation_prompt_unknown() {
        let prompt = translation_prompt("fr");
        assert!(prompt.contains("accurately"));
    }

    #[test]
    fn test_target_language_name() {
        assert_eq!(target_language_name("zh-CN"), "简体中文");
        assert_eq!(target_language_name("en"), "English");
        assert_eq!(target_language_name("ja"), "日本語");
        assert_eq!(target_language_name("fr"), "fr");
    }

    #[test]
    fn test_translate_endpoint_standard() {
        let url = translate_endpoint("https://api.openai.com/v1").unwrap();
        assert_eq!(url.as_str(), "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn test_translate_endpoint_already_full() {
        let url = translate_endpoint("https://api.openai.com/v1/chat/completions").unwrap();
        assert_eq!(url.as_str(), "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn test_translate_endpoint_no_v1() {
        let url = translate_endpoint("https://api.example.com").unwrap();
        assert_eq!(url.as_str(), "https://api.example.com/v1/chat/completions");
    }

    #[test]
    fn test_translate_endpoint_empty() {
        assert!(translate_endpoint("").is_err());
    }
}
