/// Estimate ASR (speech recognition) cost based on provider and duration.
pub fn estimate_asr_cost(api_base_url: &str, _model: &str, duration_sec: f64) -> f64 {
    let url = api_base_url.to_ascii_lowercase();
    let minutes = duration_sec / 60.0;
    if url.contains("openai.com") {
        minutes * 0.006
    } else if url.contains("groq.com") {
        0.0
    } else if url.contains("xiaomimimo.com") {
        (duration_sec / 3600.0) * 0.5
    } else if url.contains("deepseek.com") {
        minutes * 0.002
    } else {
        0.0
    }
}

/// Estimate AI polish (text enhancement) cost based on provider, model, and token count.
pub fn estimate_polish_cost(api_base_url: &str, model: &str, tokens: i64) -> f64 {
    let url = api_base_url.to_ascii_lowercase();
    let million_tokens = tokens as f64 / 1_000_000.0;
    if url.contains("deepseek.com") {
        if model.contains("v4-flash") {
            million_tokens * 0.5
        } else {
            million_tokens * 1.0
        }
    } else if url.contains("openai.com") {
        if model.contains("mini") {
            million_tokens * 0.15
        } else {
            million_tokens * 2.5
        }
    } else if url.contains("xiaomimimo.com") {
        million_tokens * 1.0
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_asr_cost_openai() {
        let cost = estimate_asr_cost("https://api.openai.com/v1", "whisper-1", 120.0);
        assert!((cost - 0.012).abs() < 0.001); // 2 min * 0.006
    }

    #[test]
    fn test_estimate_asr_cost_groq() {
        let cost = estimate_asr_cost("https://api.groq.com/openai/v1", "whisper-large-v3", 120.0);
        assert_eq!(cost, 0.0); // Groq is free
    }

    #[test]
    fn test_estimate_asr_cost_mimo() {
        let cost = estimate_asr_cost("https://api.xiaomimimo.com/v1", "mimo-v2.5-asr", 3600.0);
        assert!((cost - 0.5).abs() < 0.001); // 1 hour * 0.5/hour
    }

    #[test]
    fn test_estimate_asr_cost_deepseek() {
        let cost = estimate_asr_cost("https://api.deepseek.com/v1", "whisper-1", 60.0);
        assert!((cost - 0.002).abs() < 0.001); // 1 min * 0.002
    }

    #[test]
    fn test_estimate_asr_cost_unknown() {
        let cost = estimate_asr_cost("https://my-custom-api.com/v1", "whisper-1", 120.0);
        assert_eq!(cost, 0.0);
    }

    #[test]
    fn test_estimate_polish_cost_deepseek_flash() {
        let cost = estimate_polish_cost("https://api.deepseek.com/v1", "v4-flash", 1_000_000);
        assert!((cost - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_estimate_polish_cost_deepseek_other() {
        let cost = estimate_polish_cost("https://api.deepseek.com/v1", "v4", 1_000_000);
        assert!((cost - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_estimate_polish_cost_openai_mini() {
        let cost = estimate_polish_cost("https://api.openai.com/v1", "gpt-4o-mini", 1_000_000);
        assert!((cost - 0.15).abs() < 0.001);
    }

    #[test]
    fn test_estimate_polish_cost_openai_full() {
        let cost = estimate_polish_cost("https://api.openai.com/v1", "gpt-4o", 1_000_000);
        assert!((cost - 2.5).abs() < 0.001);
    }
}
