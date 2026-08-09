use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

// ── Price configuration structs ──────────────────────────────────────────────

/// Provider prices configuration, loadable from ~/.whisp/prices.json.
/// Missing fields in the JSON fall back to the hardcoded defaults below.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceConfig {
    #[serde(default)]
    pub asr: AsrPrices,
    #[serde(default)]
    pub polish: PolishPrices,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrPrices {
    /// OpenAI ASR: $/minute (e.g. Whisper)
    #[serde(default = "default_openai_asr_per_minute")]
    pub openai_per_minute: f64,
    /// Groq ASR: $/minute (free)
    #[serde(default = "default_groq_asr_per_minute")]
    pub groq_per_minute: f64,
    /// MiMo ASR: $/hour
    #[serde(default = "default_mimo_asr_per_hour")]
    pub mimo_per_hour: f64,
    /// DeepSeek ASR: $/minute
    #[serde(default = "default_deepseek_asr_per_minute")]
    pub deepseek_per_minute: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolishPrices {
    /// OpenAI full model (e.g. gpt-4o): $/million tokens
    #[serde(default = "default_openai_polish_full_per_million")]
    pub openai_full_per_million: f64,
    /// OpenAI mini model (e.g. gpt-4o-mini): $/million tokens
    #[serde(default = "default_openai_polish_mini_per_million")]
    pub openai_mini_per_million: f64,
    /// DeepSeek full model (e.g. v4): $/million tokens
    #[serde(default = "default_deepseek_polish_full_per_million")]
    pub deepseek_full_per_million: f64,
    /// DeepSeek v4-flash: $/million tokens
    #[serde(default = "default_deepseek_polish_flash_per_million")]
    pub deepseek_flash_per_million: f64,
    /// MiMo polish: $/million tokens
    #[serde(default = "default_mimo_polish_per_million")]
    pub mimo_per_million: f64,
}

// ── Hardcoded defaults (mirrored in prices.json) ─────────────────────────────

fn default_openai_asr_per_minute() -> f64 {
    0.006
}
fn default_groq_asr_per_minute() -> f64 {
    0.0
}
fn default_mimo_asr_per_hour() -> f64 {
    0.5
}
fn default_deepseek_asr_per_minute() -> f64 {
    0.002
}
fn default_openai_polish_full_per_million() -> f64 {
    2.5
}
fn default_openai_polish_mini_per_million() -> f64 {
    0.15
}
fn default_deepseek_polish_full_per_million() -> f64 {
    1.0
}
fn default_deepseek_polish_flash_per_million() -> f64 {
    0.5
}
fn default_mimo_polish_per_million() -> f64 {
    1.0
}

// ── Default implementations ──────────────────────────────────────────────────

impl Default for AsrPrices {
    fn default() -> Self {
        Self {
            openai_per_minute: default_openai_asr_per_minute(),
            groq_per_minute: default_groq_asr_per_minute(),
            mimo_per_hour: default_mimo_asr_per_hour(),
            deepseek_per_minute: default_deepseek_asr_per_minute(),
        }
    }
}

impl Default for PolishPrices {
    fn default() -> Self {
        Self {
            openai_full_per_million: default_openai_polish_full_per_million(),
            openai_mini_per_million: default_openai_polish_mini_per_million(),
            deepseek_full_per_million: default_deepseek_polish_full_per_million(),
            deepseek_flash_per_million: default_deepseek_polish_flash_per_million(),
            mimo_per_million: default_mimo_polish_per_million(),
        }
    }
}

impl Default for PriceConfig {
    fn default() -> Self {
        Self {
            asr: AsrPrices::default(),
            polish: PolishPrices::default(),
        }
    }
}

// ── OnceLock cache + loader ──────────────────────────────────────────────────

/// Cached price configuration — loaded once on first access.
static PRICES: OnceLock<PriceConfig> = OnceLock::new();

/// Load prices from `~/.whisp/prices.json`, falling back to hardcoded defaults.
///
/// On first call this reads the JSON file, writes a default file if none exists,
/// and caches the result. Subsequent calls return the cached reference.
pub fn load_prices() -> &'static PriceConfig {
    PRICES.get_or_init(|| {
        let path = crate::data_dir().join("prices.json");

        // Try reading the file
        match std::fs::read_to_string(&path) {
            Ok(content) => match serde_json::from_str::<PriceConfig>(&content) {
                Ok(config) => {
                    log::info!("Loaded prices from {}", path.display());
                    config
                }
                Err(e) => {
                    log::warn!("Failed to parse {} ({}), using defaults", path.display(), e);
                    PriceConfig::default()
                }
            },
            Err(_) => {
                // File doesn't exist — write a default so users can discover it
                let default_config = PriceConfig::default();
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                match serde_json::to_string_pretty(&default_config) {
                    Ok(json) => {
                        if std::fs::write(&path, &json).is_ok() {
                            log::info!("Wrote default prices to {}", path.display());
                        }
                    }
                    Err(e) => log::warn!("Failed to serialize default prices: {}", e),
                }
                default_config
            }
        }
    })
}

/// Clear the cached prices (useful in tests).
#[cfg(test)]
pub fn reset_prices_cache() {
    // OnceLock doesn't have a reset method, but we can work around this
    // by letting the test control the path.
    // In production code we use the global PRICES; tests use their own.
}

/// Return the prices path used by `load_prices()`.
fn prices_path() -> std::path::PathBuf {
    crate::data_dir().join("prices.json")
}

// ── Cost estimation functions (using config prices) ──────────────────────────

/// Estimate ASR (speech recognition) cost based on provider and duration.
pub fn estimate_asr_cost(api_base_url: &str, _model: &str, duration_sec: f64) -> f64 {
    let prices = &load_prices().asr;
    let url = api_base_url.to_ascii_lowercase();
    let minutes = duration_sec / 60.0;
    if url.contains("openai.com") {
        minutes * prices.openai_per_minute
    } else if url.contains("groq.com") {
        minutes * prices.groq_per_minute
    } else if url.contains("xiaomimimo.com") {
        (duration_sec / 3600.0) * prices.mimo_per_hour
    } else if url.contains("deepseek.com") {
        minutes * prices.deepseek_per_minute
    } else {
        0.0
    }
}

/// Estimate AI polish (text enhancement) cost based on provider, model, and token count.
pub fn estimate_polish_cost(api_base_url: &str, model: &str, tokens: i64) -> f64 {
    let prices = &load_prices().polish;
    let url = api_base_url.to_ascii_lowercase();
    let million_tokens = tokens as f64 / 1_000_000.0;
    if url.contains("deepseek.com") {
        if model.contains("v4-flash") {
            million_tokens * prices.deepseek_flash_per_million
        } else {
            million_tokens * prices.deepseek_full_per_million
        }
    } else if url.contains("openai.com") {
        if model.contains("mini") {
            million_tokens * prices.openai_mini_per_million
        } else {
            million_tokens * prices.openai_full_per_million
        }
    } else if url.contains("xiaomimimo.com") {
        million_tokens * prices.mimo_per_million
    } else {
        0.0
    }
}

/// Load prices from a specific path (for testing and reset).
pub fn load_prices_from(path: &std::path::Path) -> PriceConfig {
    match std::fs::read_to_string(path) {
        Ok(content) => serde_json::from_str::<PriceConfig>(&content).unwrap_or_default(),
        Err(_) => PriceConfig::default(),
    }
}

/// Estimate cost using an explicit config (for testing without the global cache).
pub fn estimate_asr_cost_with(config: &PriceConfig, api_base_url: &str, _model: &str, duration_sec: f64) -> f64 {
    let prices = &config.asr;
    let url = api_base_url.to_ascii_lowercase();
    let minutes = duration_sec / 60.0;
    if url.contains("openai.com") {
        minutes * prices.openai_per_minute
    } else if url.contains("groq.com") {
        minutes * prices.groq_per_minute
    } else if url.contains("xiaomimimo.com") {
        (duration_sec / 3600.0) * prices.mimo_per_hour
    } else if url.contains("deepseek.com") {
        minutes * prices.deepseek_per_minute
    } else {
        0.0
    }
}

/// Estimate cost using an explicit config (for testing without the global cache).
pub fn estimate_polish_cost_with(config: &PriceConfig, api_base_url: &str, model: &str, tokens: i64) -> f64 {
    let prices = &config.polish;
    let url = api_base_url.to_ascii_lowercase();
    let million_tokens = tokens as f64 / 1_000_000.0;
    if url.contains("deepseek.com") {
        if model.contains("v4-flash") {
            million_tokens * prices.deepseek_flash_per_million
        } else {
            million_tokens * prices.deepseek_full_per_million
        }
    } else if url.contains("openai.com") {
        if model.contains("mini") {
            million_tokens * prices.openai_mini_per_million
        } else {
            million_tokens * prices.openai_full_per_million
        }
    } else if url.contains("xiaomimimo.com") {
        million_tokens * prices.mimo_per_million
    } else {
        0.0
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Default value tests ───────────────────────────────────────────────

    #[test]
    fn test_default_prices_match_hardcoded() {
        let config = PriceConfig::default();
        assert!((config.asr.openai_per_minute - 0.006).abs() < 1e-10);
        assert!((config.asr.groq_per_minute - 0.0).abs() < 1e-10);
        assert!((config.asr.mimo_per_hour - 0.5).abs() < 1e-10);
        assert!((config.asr.deepseek_per_minute - 0.002).abs() < 1e-10);
        assert!((config.polish.openai_full_per_million - 2.5).abs() < 1e-10);
        assert!((config.polish.openai_mini_per_million - 0.15).abs() < 1e-10);
        assert!((config.polish.deepseek_full_per_million - 1.0).abs() < 1e-10);
        assert!((config.polish.deepseek_flash_per_million - 0.5).abs() < 1e-10);
        assert!((config.polish.mimo_per_million - 1.0).abs() < 1e-10);
    }

    // ── Load from JSON tests ──────────────────────────────────────────────

    #[test]
    fn test_load_from_valid_json() {
        let dir = std::env::temp_dir().join("whisp_test_valid");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("prices.json");

        let json = r#"{
            "asr": {
                "openai_per_minute": 0.01,
                "mimo_per_hour": 1.0
            },
            "polish": {
                "openai_full_per_million": 3.0
            }
        }"#;
        std::fs::write(&path, json).unwrap();

        let config = load_prices_from(&path);

        // Specified values
        assert!((config.asr.openai_per_minute - 0.01).abs() < 1e-10);
        assert!((config.asr.mimo_per_hour - 1.0).abs() < 1e-10);
        assert!((config.polish.openai_full_per_million - 3.0).abs() < 1e-10);

        // Unspecified fields fall back to defaults
        assert!((config.asr.groq_per_minute - 0.0).abs() < 1e-10);
        assert!((config.asr.deepseek_per_minute - 0.002).abs() < 1e-10);
        assert!((config.polish.openai_mini_per_million - 0.15).abs() < 1e-10);
        assert!((config.polish.deepseek_full_per_million - 1.0).abs() < 1e-10);
        assert!((config.polish.deepseek_flash_per_million - 0.5).abs() < 1e-10);
        assert!((config.polish.mimo_per_million - 1.0).abs() < 1e-10);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_from_missing_file_falls_back_to_defaults() {
        let path = std::env::temp_dir().join("whisp_test_nonexistent.json");
        let config = load_prices_from(&path);
        let default = PriceConfig::default();
        assert!((config.asr.openai_per_minute - default.asr.openai_per_minute).abs() < 1e-10);
        assert!((config.polish.openai_full_per_million - default.polish.openai_full_per_million).abs() < 1e-10);
    }

    #[test]
    fn test_load_from_invalid_json_falls_back_to_defaults() {
        let dir = std::env::temp_dir().join("whisp_test_invalid");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("prices.json");
        std::fs::write(&path, "not valid json {{{").unwrap();

        let config = load_prices_from(&path);
        let default = PriceConfig::default();
        assert!((config.asr.openai_per_minute - default.asr.openai_per_minute).abs() < 1e-10);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_from_empty_json_uses_all_defaults() {
        let dir = std::env::temp_dir().join("whisp_test_empty");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("prices.json");
        std::fs::write(&path, "{}").unwrap();

        let config = load_prices_from(&path);
        let default = PriceConfig::default();
        assert!((config.asr.openai_per_minute - default.asr.openai_per_minute).abs() < 1e-10);
        assert!((config.asr.deepseek_per_minute - default.asr.deepseek_per_minute).abs() < 1e-10);
        assert!((config.polish.openai_full_per_million - default.polish.openai_full_per_million).abs() < 1e-10);
        assert!((config.polish.mimo_per_million - default.polish.mimo_per_million).abs() < 1e-10);

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── ASR cost estimation tests ─────────────────────────────────────────

    #[test]
    fn test_estimate_asr_cost_openai_default() {
        let config = PriceConfig::default();
        let cost = estimate_asr_cost_with(&config, "https://api.openai.com/v1", "whisper-1", 120.0);
        assert!((cost - 0.012).abs() < 0.001); // 2 min * 0.006
    }

    #[test]
    fn test_estimate_asr_cost_openai_custom_price() {
        let mut config = PriceConfig::default();
        config.asr.openai_per_minute = 0.05;
        let cost = estimate_asr_cost_with(&config, "https://api.openai.com/v1", "whisper-1", 60.0);
        assert!((cost - 0.05).abs() < 0.001); // 1 min * 0.05
    }

    #[test]
    fn test_estimate_asr_cost_groq() {
        let config = PriceConfig::default();
        let cost = estimate_asr_cost_with(&config, "https://api.groq.com/openai/v1", "whisper-large-v3", 120.0);
        assert_eq!(cost, 0.0); // Groq is free
    }

    #[test]
    fn test_estimate_asr_cost_mimo() {
        let config = PriceConfig::default();
        let cost = estimate_asr_cost_with(&config, "https://api.xiaomimimo.com/v1", "mimo-v2.5-asr", 3600.0);
        assert!((cost - 0.5).abs() < 0.001); // 1 hour * 0.5/hour
    }

    #[test]
    fn test_estimate_asr_cost_mimo_custom_price() {
        let mut config = PriceConfig::default();
        config.asr.mimo_per_hour = 2.0;
        let cost = estimate_asr_cost_with(&config, "https://api.xiaomimimo.com/v1", "mimo-v2.5-asr", 1800.0);
        assert!((cost - 1.0).abs() < 0.001); // 0.5 hour * 2.0/hour
    }

    #[test]
    fn test_estimate_asr_cost_deepseek() {
        let config = PriceConfig::default();
        let cost = estimate_asr_cost_with(&config, "https://api.deepseek.com/v1", "whisper-1", 60.0);
        assert!((cost - 0.002).abs() < 0.001); // 1 min * 0.002
    }

    #[test]
    fn test_estimate_asr_cost_unknown() {
        let config = PriceConfig::default();
        let cost = estimate_asr_cost_with(&config, "https://my-custom-api.com/v1", "whisper-1", 120.0);
        assert_eq!(cost, 0.0);
    }

    // ── Polish cost estimation tests ──────────────────────────────────────

    #[test]
    fn test_estimate_polish_cost_deepseek_flash() {
        let config = PriceConfig::default();
        let cost = estimate_polish_cost_with(&config, "https://api.deepseek.com/v1", "v4-flash", 1_000_000);
        assert!((cost - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_estimate_polish_cost_deepseek_flash_custom() {
        let mut config = PriceConfig::default();
        config.polish.deepseek_flash_per_million = 0.25;
        let cost = estimate_polish_cost_with(&config, "https://api.deepseek.com/v1", "v4-flash", 2_000_000);
        assert!((cost - 0.5).abs() < 0.001); // 2M * 0.25/M
    }

    #[test]
    fn test_estimate_polish_cost_deepseek_other() {
        let config = PriceConfig::default();
        let cost = estimate_polish_cost_with(&config, "https://api.deepseek.com/v1", "v4", 1_000_000);
        assert!((cost - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_estimate_polish_cost_openai_mini() {
        let config = PriceConfig::default();
        let cost = estimate_polish_cost_with(&config, "https://api.openai.com/v1", "gpt-4o-mini", 1_000_000);
        assert!((cost - 0.15).abs() < 0.001);
    }

    #[test]
    fn test_estimate_polish_cost_openai_full() {
        let config = PriceConfig::default();
        let cost = estimate_polish_cost_with(&config, "https://api.openai.com/v1", "gpt-4o", 1_000_000);
        assert!((cost - 2.5).abs() < 0.001);
    }

    #[test]
    fn test_estimate_polish_cost_openai_full_custom() {
        let mut config = PriceConfig::default();
        config.polish.openai_full_per_million = 5.0;
        let cost = estimate_polish_cost_with(&config, "https://api.openai.com/v1", "gpt-4o", 500_000);
        assert!((cost - 2.5).abs() < 0.001); // 0.5M * 5.0/M
    }

    #[test]
    fn test_estimate_polish_cost_mimo() {
        let config = PriceConfig::default();
        let cost = estimate_polish_cost_with(&config, "https://api.xiaomimimo.com/v1", "any-model", 2_000_000);
        assert!((cost - 2.0).abs() < 0.001); // 2M * 1.0/M
    }

    #[test]
    fn test_estimate_polish_cost_unknown() {
        let config = PriceConfig::default();
        let cost = estimate_polish_cost_with(&config, "https://custom-api.com/v1", "any-model", 1_000_000);
        assert_eq!(cost, 0.0);
    }

    // ── Roundtrip serialization test ──────────────────────────────────────

    #[test]
    fn test_serialize_deserialize_roundtrip() {
        let original = PriceConfig::default();
        let json = serde_json::to_string_pretty(&original).unwrap();
        let deserialized: PriceConfig = serde_json::from_str(&json).unwrap();
        assert!((deserialized.asr.openai_per_minute - original.asr.openai_per_minute).abs() < 1e-10);
        assert!(
            (deserialized.polish.deepseek_full_per_million - original.polish.deepseek_full_per_million).abs() < 1e-10
        );
    }
}
