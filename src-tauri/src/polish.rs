use anyhow::{Context, Result};
use serde::Serialize;
use std::time::Duration;

pub const DEFAULT_SYSTEM_PROMPT: &str = "你是一个严格的文本修正器，只能做最小化修改。规则：\n\n【可以做的】\n1. 修正语音识别产生的错别字和同音字错误\n2. 删除语气词和口头禅（嗯、啊、呃、那个、就是说、然后的话、对吧、是不是）\n3. 修正明显的语法错误（如主语缺失、语序混乱）\n4. 补充因说话过快而遗漏的标点符号\n\n【绝对不能做的】\n- 不能改写任何句子的结构或表达方式\n- 不能替换用词（即使你觉得换一个词更好）\n- 不能删除任何实质内容（包括重复表达，那可能是说话者在强调）\n- 不能添加原文中没有的信息\n- 不能改变语气或态度（如将疑问句改为陈述句）\n- 不能进行\"润色\"或\"美化\"\n\n输出要求：\n- 直接输出修正后的文本\n- 如果原文没有明显错误，直接输出原文，不做任何修改\n- 不要添加任何解释、标注或前后缀";

#[derive(Debug, Clone, Serialize)]
pub struct PolishResult {
    pub text: String,
    pub tokens_used: i64,
}

fn polish_endpoint(api_base_url: &str) -> Result<reqwest::Url> {
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

pub async fn polish_text(
    client: &reqwest::Client,
    api_key: &str,
    api_base_url: &str,
    model: &str,
    raw_text: &str,
    custom_prompt: &str,
    timeout_secs: u64,
) -> Result<PolishResult> {
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
        .map(|s| {
            let tokens_used = json
                .pointer("/usage/total_tokens")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0);
            PolishResult {
                text: s.to_owned(),
                tokens_used,
            }
        })
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
    let shortened = if body_text.len() > 500 {
        format!("{}…", &body_text[..body_text.floor_char_boundary(500)])
    } else {
        body_text
    };

    if status == reqwest::StatusCode::NOT_FOUND {
        anyhow::bail!("Endpoint not found (HTTP 404). Check your API Base URL.\nDetails: {}", shortened);
    }
    if matches!(
        status,
        reqwest::StatusCode::BAD_REQUEST | reqwest::StatusCode::UNPROCESSABLE_ENTITY
    ) {
        anyhow::bail!(
            "Connection successful but request was rejected (HTTP {}). Your configuration is likely correct — save and try a real recording.\nDetails: {}",
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
