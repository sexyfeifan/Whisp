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
    /// api_key is normally empty here (stored in keychain).
    /// Written as fallback when keychain is unavailable (e.g. ad-hoc signed builds).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub api_key: String,
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

fn load_disk_settings() -> DiskSettings {
    let path = settings_path();
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str::<DiskSettings>(&content).unwrap_or_default(),
        Err(_) => DiskSettings::default(),
    }
}

fn save_disk_settings(settings: &AppSettings) -> Result<(), String> {
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
        api_key: settings.api_key.clone(), // always persist to disk; keychain is best-effort only
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

    settings
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    // Best-effort keychain store (may fail on ad-hoc signed builds)
    if let Err(e) = store_api_key(&settings.api_key) {
        log::warn!("Failed to store API key in system keychain: {}", e);
    }
    // Always persist to disk as the reliable source of truth
    save_disk_settings(settings)
}
