use anyhow::{Context, Result};
use std::time::Duration;

const DEFAULT_SYSTEM_PROMPT: &str = "You are a text editor. Clean up the following speech-to-text output: fix any transcription errors, remove filler words (um, uh, like), convert casual speech to clean written form, keep the original meaning. Output ONLY the cleaned text, nothing else.";

fn polish_endpoint(api_base_url: &str) -> Result<reqwest::Url> {
    let raw = api_base_url.trim();
    if raw.is_empty() {
        anyhow::bail!("API base URL is empty");
    }

    let endpoint = if raw.ends_with("/chat/completions") {
        raw.to_string()
    } else {
        format!("{}/chat/completions", raw.trim_end_matches('/'))
    };

    reqwest::Url::parse(&endpoint).context("Invalid API base URL")
}

pub async fn polish_text(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
    raw_text: &str,
    custom_prompt: &str,
) -> Result<String> {
    let endpoint = polish_endpoint(api_base_url)?;

    let system_prompt = if custom_prompt.trim().is_empty() {
        DEFAULT_SYSTEM_PROMPT
    } else {
        custom_prompt
    };

    let model = if model.trim().is_empty() {
        "gpt-4o-mini"
    } else {
        model
    };

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
        .timeout(Duration::from_secs(90))
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
        anyhow::bail!("Polish API error {}: {}", status, shortened);
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .context("Failed to parse polish API response")?;

    if let Some(err) = json.get("error") {
        let msg = err
            .get("message")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown error");
        anyhow::bail!("Polish API error: {}", msg);
    }

    json.pointer("/choices/0/message/content")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow::anyhow!("Missing content in polish API response"))
}

pub async fn validate_polish_key(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
) -> Result<()> {
    let endpoint = polish_endpoint(api_base_url)?;

    let model = if model.trim().is_empty() {
        "gpt-4o-mini"
    } else {
        model
    };

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You are a text editor."
            },
            {
                "role": "user",
                "content": "Hello"
            }
        ],
        "max_tokens": 5
    });

    let resp = client
        .post(endpoint)
        .bearer_auth(api_key)
        .timeout(Duration::from_secs(15))
        .json(&body)
        .send()
        .await
        .context("Network error")?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        anyhow::bail!("Invalid API key");
    }
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        anyhow::bail!("The server rejected this API key");
    }
    if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS
        || resp.status().is_server_error()
    {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let shortened = if body_text.len() > 500 {
            format!("{}…", &body_text[..body_text.floor_char_boundary(500)])
        } else {
            body_text
        };
        anyhow::bail!(
            "The upstream service is temporarily overloaded (HTTP {}). Your configuration is likely correct.\nDetails: {}",
            status.as_u16(),
            shortened
        );
    }
    if !resp.status().is_success() {
        let body_text = resp.text().await.unwrap_or_default();
        let shortened = if body_text.len() > 500 {
            format!("{}…", &body_text[..body_text.floor_char_boundary(500)])
        } else {
            body_text
        };
        anyhow::bail!("{}", shortened);
    }

    Ok(())
}
