use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const KEYCHAIN_SERVICE: &str = "com.whisp.desktop";
const KEYCHAIN_ACCOUNT: &str = "api_key";

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
    #[serde(default)]
    pub overlay_x: Option<f64>,
    #[serde(default)]
    pub overlay_y: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredSettings {
    #[serde(default = "default_api_base_url")]
    pub api_base_url: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
    #[serde(default = "default_api_key")]
    pub api_key: String,
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
    #[serde(default)]
    pub overlay_x: Option<f64>,
    #[serde(default)]
    pub overlay_y: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct LegacySettings {
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
    #[serde(default)]
    pub overlay_x: Option<f64>,
    #[serde(default)]
    pub overlay_y: Option<f64>,
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
    true
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
            overlay_x: None,
            overlay_y: None,
        }
    }
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            api_base_url: default_api_base_url(),
            model: default_model(),
            language: default_language(),
            ui_language: default_ui_language(),
            api_key: default_api_key(),
            shortcut: default_shortcut(),
            sound_enabled: default_sound_enabled(),
            auto_paste_enabled: default_auto_paste_enabled(),
            save_audio_files: default_save_audio_files(),
            trim_silence_enabled: default_trim_silence_enabled(),
            request_timeout_sec: default_request_timeout_sec(),
            retry_count: default_retry_count(),
            paste_delay_ms: default_paste_delay_ms(),
            overlay_x: None,
            overlay_y: None,
        }
    }
}

impl Default for LegacySettings {
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
            overlay_x: None,
            overlay_y: None,
        }
    }
}

impl From<&AppSettings> for StoredSettings {
    fn from(value: &AppSettings) -> Self {
        Self {
            api_base_url: value.api_base_url.clone(),
            model: value.model.clone(),
            language: value.language.clone(),
            ui_language: value.ui_language.clone(),
            api_key: value.api_key.clone(),
            shortcut: value.shortcut.clone(),
            sound_enabled: value.sound_enabled,
            auto_paste_enabled: value.auto_paste_enabled,
            save_audio_files: value.save_audio_files,
            trim_silence_enabled: value.trim_silence_enabled,
            request_timeout_sec: value.request_timeout_sec,
            retry_count: value.retry_count,
            paste_delay_ms: value.paste_delay_ms,
            overlay_x: value.overlay_x,
            overlay_y: value.overlay_y,
        }
    }
}

impl From<LegacySettings> for AppSettings {
    fn from(value: LegacySettings) -> Self {
        Self {
            api_key: value.api_key,
            api_base_url: value.api_base_url,
            model: value.model,
            language: value.language,
            ui_language: value.ui_language,
            shortcut: value.shortcut,
            sound_enabled: value.sound_enabled,
            auto_paste_enabled: value.auto_paste_enabled,
            save_audio_files: value.save_audio_files,
            trim_silence_enabled: value.trim_silence_enabled,
            request_timeout_sec: value.request_timeout_sec,
            retry_count: value.retry_count,
            paste_delay_ms: value.paste_delay_ms,
            overlay_x: value.overlay_x,
            overlay_y: value.overlay_y,
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

fn env_api_key() -> Option<String> {
    std::env::var("WHISP_API_KEY")
        .ok()
        .or_else(|| std::env::var("OPENAI_API_KEY").ok())
}

fn load_legacy_settings() -> LegacySettings {
    let path = settings_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str::<LegacySettings>(&content).unwrap_or_default(),
        Err(_) => LegacySettings::default(),
    }
}

fn save_stored_settings(settings: &AppSettings) -> Result<(), String> {
    let dir = crate::data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("settings.json");
    let stored = StoredSettings::from(settings);
    let json = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn get_settings() -> AppSettings {
    let legacy = load_legacy_settings();
    let mut settings = AppSettings::from(legacy.clone());

    match load_api_key() {
        Ok(Some(api_key)) => settings.api_key = api_key,
        Ok(None) => {
            if !legacy.api_key.trim().is_empty() {
                settings.api_key = legacy.api_key.clone();
                if let Err(e) = store_api_key(&legacy.api_key) {
                    log::warn!("Failed to migrate API key to system keychain: {}", e);
                }
            } else if let Some(api_key) = env_api_key() {
                settings.api_key = api_key;
            }
        }
        Err(e) => {
            log::warn!("Failed to read API key from system keychain: {}", e);
            if !legacy.api_key.trim().is_empty() {
                settings.api_key = legacy.api_key;
            } else if let Some(api_key) = env_api_key() {
                settings.api_key = api_key;
            }
        }
    }

    settings
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    if let Err(e) = store_api_key(&settings.api_key) {
        log::warn!(
            "Failed to store API key in system keychain, falling back to local settings storage: {}",
            e
        );
    }
    save_stored_settings(settings)
}
