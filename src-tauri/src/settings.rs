use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const KEYCHAIN_SERVICE: &str = "com.whisp.desktop";
const KEYCHAIN_ACCOUNT: &str = "api_key";
const KEYCHAIN_SERVICE_POLISH: &str = "com.whisp.desktop.polish";
const KEYCHAIN_ACCOUNT_POLISH: &str = "polish_api_key";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_api_key")]
    pub api_key: String,
    #[serde(default = "default_api_base_url")]
    pub api_base_url: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
    #[serde(default = "default_auto_paste_enabled")]
    pub auto_paste_enabled: bool,
    #[serde(default = "default_save_audio_files")]
    pub save_audio_files: bool,
    #[serde(default = "default_trim_silence_enabled")]
    pub trim_silence_enabled: bool,
    #[serde(default = "default_request_timeout_sec")]
    pub request_timeout_sec: u64,
    #[serde(default = "default_retry_count")]
    pub retry_count: u8,
    #[serde(default = "default_paste_delay_ms")]
    pub paste_delay_ms: u64,
    #[serde(default = "default_silence_timeout_sec")]
    pub silence_timeout_sec: u64,
    #[serde(default)]
    pub overlay_x: Option<f64>,
    #[serde(default)]
    pub overlay_y: Option<f64>,
    #[serde(default = "default_launch_at_startup")]
    pub launch_at_startup: bool,
    #[serde(default)]
    pub whisper_prompt: String,
    #[serde(default = "default_silence_threshold")]
    pub silence_threshold: f64,
    #[serde(default = "default_ai_polish_enabled")]
    pub ai_polish_enabled: bool,
    #[serde(default)]
    pub ai_polish_api_key: String,
    #[serde(default = "default_ai_polish_api_url")]
    pub ai_polish_api_url: String,
    #[serde(default = "default_ai_polish_model")]
    pub ai_polish_model: String,
    #[serde(default)]
    pub ai_polish_prompt: String,
    #[serde(default)]
    pub whisper_config_json: String,
    #[serde(default = "default_audio_retention_limit")]
    pub audio_retention_limit: usize,
    #[serde(default)]
    pub custom_endpoints: Vec<CustomEndpoint>,
    #[serde(default = "default_translation_target")]
    pub translation_target: String,
    #[serde(default)]
    pub waveform_preview_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomEndpoint {
    pub label: String,
    pub url: String,
}

/// Stored on disk — no api_key field (stored in keychain instead)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct DiskSettings {
    #[serde(default = "default_api_base_url")]
    pub api_base_url: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
    #[serde(default = "default_sound_enabled")]
    pub sound_enabled: bool,
    #[serde(default = "default_auto_paste_enabled")]
    pub auto_paste_enabled: bool,
    #[serde(default = "default_save_audio_files")]
    pub save_audio_files: bool,
    #[serde(default = "default_trim_silence_enabled")]
    pub trim_silence_enabled: bool,
    #[serde(default = "default_request_timeout_sec")]
    pub request_timeout_sec: u64,
    #[serde(default = "default_retry_count")]
    pub retry_count: u8,
    #[serde(default = "default_paste_delay_ms")]
    pub paste_delay_ms: u64,
    #[serde(default = "default_silence_timeout_sec")]
    pub silence_timeout_sec: u64,
    #[serde(default)]
    pub overlay_x: Option<f64>,
    #[serde(default)]
    pub overlay_y: Option<f64>,
    #[serde(default = "default_launch_at_startup")]
    pub launch_at_startup: bool,
    #[serde(default)]
    pub whisper_prompt: String,
    #[serde(default = "default_silence_threshold")]
    pub silence_threshold: f64,
    #[serde(default = "default_ai_polish_enabled")]
    pub ai_polish_enabled: bool,
    #[serde(default)]
    pub ai_polish_api_key: String,
    #[serde(default = "default_ai_polish_api_url")]
    pub ai_polish_api_url: String,
    #[serde(default = "default_ai_polish_model")]
    pub ai_polish_model: String,
    #[serde(default)]
    pub ai_polish_prompt: String,
    #[serde(default)]
    pub whisper_config_json: String,
    #[serde(default = "default_audio_retention_limit")]
    pub audio_retention_limit: usize,
    /// api_key is normally empty here (stored in keychain).
    /// Written as fallback when keychain is unavailable (e.g. ad-hoc signed builds).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub api_key: String,
    #[serde(default)]
    pub custom_endpoints: Vec<CustomEndpoint>,
    #[serde(default = "default_translation_target")]
    pub translation_target: String,
    #[serde(default)]
    pub waveform_preview_enabled: bool,
}

fn default_api_key() -> String {
    String::new()
}

fn default_api_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_model() -> String {
    "gpt-4o-transcribe".to_string()
}

fn default_language() -> String {
    "auto".to_string()
}

fn default_shortcut() -> String {
    String::new()
}

fn default_ui_language() -> String {
    "zh-CN".to_string()
}

fn default_sound_enabled() -> bool {
    true
}

fn default_auto_paste_enabled() -> bool {
    true
}

fn default_save_audio_files() -> bool {
    false
}

fn default_trim_silence_enabled() -> bool {
    true
}

fn default_request_timeout_sec() -> u64 {
    90
}

fn default_retry_count() -> u8 {
    2
}

fn default_paste_delay_ms() -> u64 {
    350
}

fn default_silence_timeout_sec() -> u64 {
    60
}

fn default_launch_at_startup() -> bool {
    false
}

fn default_silence_threshold() -> f64 {
    0.01
}

fn default_ai_polish_enabled() -> bool {
    false
}

fn default_ai_polish_api_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_ai_polish_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_audio_retention_limit() -> usize {
    100
}

fn default_translation_target() -> String {
    "none".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            api_key: default_api_key(),
            api_base_url: default_api_base_url(),
            model: default_model(),
            language: default_language(),
            ui_language: default_ui_language(),
            shortcut: default_shortcut(),
            sound_enabled: default_sound_enabled(),
            auto_paste_enabled: default_auto_paste_enabled(),
            save_audio_files: default_save_audio_files(),
            trim_silence_enabled: default_trim_silence_enabled(),
            request_timeout_sec: default_request_timeout_sec(),
            retry_count: default_retry_count(),
            paste_delay_ms: default_paste_delay_ms(),
            silence_timeout_sec: default_silence_timeout_sec(),
            overlay_x: None,
            overlay_y: None,
            launch_at_startup: default_launch_at_startup(),
            whisper_prompt: String::new(),
            silence_threshold: default_silence_threshold(),
            ai_polish_enabled: default_ai_polish_enabled(),
            ai_polish_api_key: String::new(),
            ai_polish_api_url: default_ai_polish_api_url(),
            ai_polish_model: default_ai_polish_model(),
            ai_polish_prompt: String::new(),
            whisper_config_json: String::new(),
            audio_retention_limit: default_audio_retention_limit(),
            custom_endpoints: Vec::new(),
            translation_target: default_translation_target(),
            waveform_preview_enabled: false,
        }
    }
}

fn settings_path() -> PathBuf {
    crate::data_dir().join("settings.json")
}

fn credential_entry() -> Result<Entry, KeyringError> {
    Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
}

fn load_api_key() -> Result<Option<String>, String> {
    let entry = credential_entry().map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(api_key) => Ok(Some(api_key)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn store_api_key(api_key: &str) -> Result<(), String> {
    let entry = credential_entry().map_err(|e| e.to_string())?;
    let normalized = api_key.trim();
    if normalized.is_empty() {
        match entry.delete_credential() {
            Ok(_) | Err(KeyringError::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(normalized).map_err(|e| e.to_string())
    }
}

fn polish_credential_entry() -> Result<Entry, KeyringError> {
    Entry::new(KEYCHAIN_SERVICE_POLISH, KEYCHAIN_ACCOUNT_POLISH)
}

fn load_polish_api_key() -> Result<Option<String>, String> {
    let entry = polish_credential_entry().map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn store_polish_api_key(key: &str) -> Result<(), String> {
    let entry = polish_credential_entry().map_err(|e| e.to_string())?;
    let normalized = key.trim();
    if normalized.is_empty() {
        match entry.delete_credential() {
            Ok(_) | Err(KeyringError::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(normalized).map_err(|e| e.to_string())
    }
}

fn env_api_key() -> Option<String> {
    std::env::var("WHISP_API_KEY")
        .ok()
        .or_else(|| std::env::var("OPENAI_API_KEY").ok())
}

fn load_disk_settings() -> DiskSettings {
    let path = settings_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str::<DiskSettings>(&content).unwrap_or_default(),
        Err(_) => DiskSettings::default(),
    }
}

fn save_disk_settings(settings: &AppSettings, keychain_ok: bool) -> Result<(), String> {
    let dir = crate::data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    let disk = DiskSettings {
        api_base_url: settings.api_base_url.clone(),
        model: settings.model.clone(),
        language: settings.language.clone(),
        ui_language: settings.ui_language.clone(),
        shortcut: settings.shortcut.clone(),
        sound_enabled: settings.sound_enabled,
        auto_paste_enabled: settings.auto_paste_enabled,
        save_audio_files: settings.save_audio_files,
        trim_silence_enabled: settings.trim_silence_enabled,
        request_timeout_sec: settings.request_timeout_sec,
        retry_count: settings.retry_count,
        paste_delay_ms: settings.paste_delay_ms,
        silence_timeout_sec: settings.silence_timeout_sec,
        overlay_x: settings.overlay_x,
        overlay_y: settings.overlay_y,
        launch_at_startup: settings.launch_at_startup,
        whisper_prompt: settings.whisper_prompt.clone(),
        silence_threshold: settings.silence_threshold,
        ai_polish_enabled: settings.ai_polish_enabled,
        ai_polish_api_key: settings.ai_polish_api_key.clone(),
        ai_polish_api_url: settings.ai_polish_api_url.clone(),
        ai_polish_model: settings.ai_polish_model.clone(),
        ai_polish_prompt: settings.ai_polish_prompt.clone(),
        audio_retention_limit: settings.audio_retention_limit,
        api_key: if keychain_ok {
            String::new()
        } else {
            settings.api_key.clone()
        },
        whisper_config_json: settings.whisper_config_json.clone(),
        custom_endpoints: settings.custom_endpoints.clone(),
        translation_target: settings.translation_target.clone(),
        waveform_preview_enabled: settings.waveform_preview_enabled,
    };
    let json = serde_json::to_string_pretty(&disk).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn get_settings() -> AppSettings {
    let disk = load_disk_settings();
    let mut settings = AppSettings {
        api_key: String::new(),
        api_base_url: disk.api_base_url,
        model: disk.model,
        language: disk.language,
        ui_language: disk.ui_language,
        shortcut: disk.shortcut,
        sound_enabled: disk.sound_enabled,
        auto_paste_enabled: disk.auto_paste_enabled,
        save_audio_files: disk.save_audio_files,
        trim_silence_enabled: disk.trim_silence_enabled,
        request_timeout_sec: disk.request_timeout_sec,
        retry_count: disk.retry_count,
        paste_delay_ms: disk.paste_delay_ms,
        silence_timeout_sec: disk.silence_timeout_sec,
        overlay_x: disk.overlay_x,
        overlay_y: disk.overlay_y,
        launch_at_startup: disk.launch_at_startup,
        whisper_prompt: disk.whisper_prompt,
        silence_threshold: disk.silence_threshold,
        ai_polish_enabled: disk.ai_polish_enabled,
        ai_polish_api_key: disk.ai_polish_api_key,
        ai_polish_api_url: disk.ai_polish_api_url,
        ai_polish_model: disk.ai_polish_model,
        ai_polish_prompt: disk.ai_polish_prompt,
        whisper_config_json: disk.whisper_config_json,
        audio_retention_limit: disk.audio_retention_limit,
        custom_endpoints: disk.custom_endpoints,
        translation_target: disk.translation_target,
        waveform_preview_enabled: disk.waveform_preview_enabled,
    };

    // Keychain is best-effort; disk is always the fallback source of truth
    match load_api_key() {
        Ok(Some(api_key)) if !api_key.is_empty() => settings.api_key = api_key,
        _ => {
            if !disk.api_key.trim().is_empty() {
                settings.api_key = disk.api_key.clone();
            } else if let Some(api_key) = env_api_key() {
                settings.api_key = api_key;
            }
        }
    }

    // Load polish API key from keychain (best-effort)
    match load_polish_api_key() {
        Ok(Some(key)) if !key.is_empty() => settings.ai_polish_api_key = key,
        _ => {}
    }

    settings
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    // Best-effort keychain store (may fail on ad-hoc signed builds)
    let keychain_ok =
        store_api_key(&settings.api_key).is_ok() && store_polish_api_key(&settings.ai_polish_api_key).is_ok();
    if !keychain_ok {
        log::warn!("Keychain unavailable; API key(s) will be stored on disk as fallback");
    }
    // Only persist API key to disk when keychain fails
    save_disk_settings(settings, keychain_ok)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = AppSettings::default();
        assert_eq!(settings.api_base_url, "https://api.openai.com/v1");
        assert_eq!(settings.model, "gpt-4o-transcribe");
        assert_eq!(settings.language, "auto");
        assert_eq!(settings.ui_language, "zh-CN");
        assert!(settings.sound_enabled);
        assert!(settings.auto_paste_enabled);
        assert!(!settings.save_audio_files);
        assert!(settings.trim_silence_enabled);
        assert_eq!(settings.request_timeout_sec, 90);
        assert_eq!(settings.retry_count, 2);
        assert_eq!(settings.paste_delay_ms, 350);
        assert_eq!(settings.silence_timeout_sec, 60);
        assert!(!settings.launch_at_startup);
        assert!((settings.silence_threshold - 0.01).abs() < f64::EPSILON);
        assert!(!settings.ai_polish_enabled);
        assert_eq!(settings.ai_polish_api_url, "https://api.openai.com/v1");
        assert_eq!(settings.ai_polish_model, "gpt-4o-mini");
        assert_eq!(settings.audio_retention_limit, 100);
        assert_eq!(settings.translation_target, "none");
    }

    #[test]
    fn test_settings_serialization_roundtrip() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).unwrap();
        let restored: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.api_base_url, settings.api_base_url);
        assert_eq!(restored.model, settings.model);
        assert_eq!(restored.language, settings.language);
        assert_eq!(restored.ui_language, settings.ui_language);
        assert_eq!(restored.shortcut, settings.shortcut);
        assert_eq!(restored.sound_enabled, settings.sound_enabled);
        assert_eq!(restored.auto_paste_enabled, settings.auto_paste_enabled);
        assert_eq!(restored.request_timeout_sec, settings.request_timeout_sec);
        assert_eq!(restored.retry_count, settings.retry_count);
    }

    #[test]
    fn test_disk_settings_skips_api_key_when_keychain_ok() {
        let mut settings = AppSettings::default();
        settings.api_key = "sk-secret-key".to_string();
        settings.ai_polish_api_key = "sk-polish-key".to_string();

        // Simulate saving with keychain success — api_key should be empty on disk
        let disk = DiskSettings {
            api_base_url: settings.api_base_url.clone(),
            model: settings.model.clone(),
            language: settings.language.clone(),
            ui_language: settings.ui_language.clone(),
            shortcut: settings.shortcut.clone(),
            sound_enabled: settings.sound_enabled,
            auto_paste_enabled: settings.auto_paste_enabled,
            save_audio_files: settings.save_audio_files,
            trim_silence_enabled: settings.trim_silence_enabled,
            request_timeout_sec: settings.request_timeout_sec,
            retry_count: settings.retry_count,
            paste_delay_ms: settings.paste_delay_ms,
            silence_timeout_sec: settings.silence_timeout_sec,
            overlay_x: settings.overlay_x,
            overlay_y: settings.overlay_y,
            launch_at_startup: settings.launch_at_startup,
            whisper_prompt: settings.whisper_prompt.clone(),
            silence_threshold: settings.silence_threshold,
            ai_polish_enabled: settings.ai_polish_enabled,
            ai_polish_api_key: settings.ai_polish_api_key.clone(),
            ai_polish_api_url: settings.ai_polish_api_url.clone(),
            ai_polish_model: settings.ai_polish_model.clone(),
            ai_polish_prompt: settings.ai_polish_prompt.clone(),
            audio_retention_limit: settings.audio_retention_limit,
            api_key: String::new(), // keychain_ok = true
            whisper_config_json: settings.whisper_config_json.clone(),
            custom_endpoints: settings.custom_endpoints.clone(),
            translation_target: settings.translation_target.clone(),
            waveform_preview_enabled: settings.waveform_preview_enabled,
        };

        let json = serde_json::to_string(&disk).unwrap();
        // api_key should not appear in JSON when empty (skip_serializing_if)
        assert!(!json.contains("\"api_key\""));
    }

    #[test]
    fn test_disk_settings_includes_api_key_when_keychain_fails() {
        let mut settings = AppSettings::default();
        settings.api_key = "sk-secret-key".to_string();

        let disk = DiskSettings {
            api_base_url: settings.api_base_url.clone(),
            model: settings.model.clone(),
            language: settings.language.clone(),
            ui_language: settings.ui_language.clone(),
            shortcut: settings.shortcut.clone(),
            sound_enabled: settings.sound_enabled,
            auto_paste_enabled: settings.auto_paste_enabled,
            save_audio_files: settings.save_audio_files,
            trim_silence_enabled: settings.trim_silence_enabled,
            request_timeout_sec: settings.request_timeout_sec,
            retry_count: settings.retry_count,
            paste_delay_ms: settings.paste_delay_ms,
            silence_timeout_sec: settings.silence_timeout_sec,
            overlay_x: settings.overlay_x,
            overlay_y: settings.overlay_y,
            launch_at_startup: settings.launch_at_startup,
            whisper_prompt: settings.whisper_prompt.clone(),
            silence_threshold: settings.silence_threshold,
            ai_polish_enabled: settings.ai_polish_enabled,
            ai_polish_api_key: settings.ai_polish_api_key.clone(),
            ai_polish_api_url: settings.ai_polish_api_url.clone(),
            ai_polish_model: settings.ai_polish_model.clone(),
            ai_polish_prompt: settings.ai_polish_prompt.clone(),
            audio_retention_limit: settings.audio_retention_limit,
            api_key: "«redacted:sk-…»".to_string(), // keychain_ok = false
            whisper_config_json: settings.whisper_config_json.clone(),
            custom_endpoints: settings.custom_endpoints.clone(),
            translation_target: settings.translation_target.clone(),
            waveform_preview_enabled: settings.waveform_preview_enabled,
        };

        let json = serde_json::to_string(&disk).unwrap();
        assert!(json.contains("\"api_key\""));
        assert!(json.contains("sk-secret-key"));
    }

    #[test]
    fn test_disk_settings_deserialization_with_missing_fields() {
        // Minimal JSON — all fields should get defaults
        let json = r#"{"api_base_url": "https://custom.api/v1"}"#;
        let disk: DiskSettings = serde_json::from_str(json).unwrap();
        assert_eq!(disk.api_base_url, "https://custom.api/v1");
        assert_eq!(disk.model, "gpt-4o-transcribe");
        assert_eq!(disk.language, "auto");
        assert!(disk.sound_enabled);
        assert_eq!(disk.request_timeout_sec, 90);
    }
}
