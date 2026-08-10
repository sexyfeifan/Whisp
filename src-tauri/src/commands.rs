use crate::history::{HistoryEntry, HistoryManager, NewHistoryEntry, STATUS_FAILED, STATUS_SUCCESS};
use crate::paste::EnigoState;
use crate::settings::{self, AppSettings};
use crate::shortcut::{
    re_register_global_record_hotkey, re_register_shortcut, register_global_record_hotkey, register_shortcut,
    unregister_global_record_hotkey,
};

fn tr(ui_language: &str, zh: &str, en: &str, ja: &str) -> String {
    match ui_language {
        "en" => en.to_string(),
        "ja" => ja.to_string(),
        _ => zh.to_string(),
    }
}
use base64::Engine;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Serialize)]
pub struct UpdateInfo {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub release_notes: String,
    pub published_at: String,
    pub assets: Vec<ReleaseAsset>,
    pub error: String,
}

#[derive(Serialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
}

#[tauri::command]
pub fn get_history(history: State<'_, Arc<HistoryManager>>) -> Result<Vec<HistoryEntry>, String> {
    history.get_entries().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_history_page(
    history: State<'_, Arc<HistoryManager>>,
    limit: i64,
    offset: i64,
) -> Result<Vec<HistoryEntry>, String> {
    history.get_entries_page(limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_history_entry(history: State<'_, Arc<HistoryManager>>, id: i64) -> Result<(), String> {
    history.delete_entry(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_history_entries(history: State<'_, Arc<HistoryManager>>, ids: Vec<i64>) -> Result<(), String> {
    history.delete_entries(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_history(history: State<'_, Arc<HistoryManager>>) -> Result<(), String> {
    history.clear_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_history(history: State<'_, Arc<HistoryManager>>, query: String) -> Result<Vec<HistoryEntry>, String> {
    history.search_history(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_fulltext(history: State<'_, Arc<HistoryManager>>, query: String) -> Result<Vec<HistoryEntry>, String> {
    history.search_fulltext(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    settings::get_settings()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    log::info!("Settings saved");
    let old_settings = settings::get_settings();
    settings::save_settings(&settings)?;

    // Hot-reload shortcut if changed
    if settings.shortcut != old_settings.shortcut {
        re_register_shortcut(&app, &old_settings.shortcut, &settings);
    }

    // Hot-reload global record hotkey if changed
    if settings.global_hotkey != old_settings.global_hotkey
        || settings.global_hotkey_enabled != old_settings.global_hotkey_enabled
    {
        re_register_global_record_hotkey(
            &app,
            &old_settings.global_hotkey,
            &settings.global_hotkey,
            settings.global_hotkey_enabled,
        );
    }

    // Apply launch-at-startup if changed
    if settings.launch_at_startup != old_settings.launch_at_startup {
        let autolaunch = app.autolaunch();
        if settings.launch_at_startup {
            let _ = autolaunch.enable();
        } else {
            let _ = autolaunch.disable();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn check_accessibility() -> bool {
    crate::paste::is_accessibility_trusted()
}

#[tauri::command]
pub fn request_accessibility() -> bool {
    crate::paste::request_accessibility_with_prompt()
}

#[tauri::command]
pub fn check_microphone() -> bool {
    crate::permissions::check_microphone_permission()
}

#[tauri::command]
pub fn request_microphone() -> bool {
    crate::permissions::request_microphone_permission()
}

#[tauri::command]
pub async fn validate_api_key(
    app: AppHandle,
    api_key: String,
    api_base_url: String,
    model: String,
) -> Result<(), String> {
    log::info!("API key validation requested");
    let client = app
        .try_state::<reqwest::Client>()
        .ok_or("HTTP client not initialized")?;
    crate::transcribe::validate_api_key(&client, &api_key, &api_base_url, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pause_shortcut(app: AppHandle) {
    crate::hotkey::pause();
    let settings = settings::get_settings();
    if let Ok(shortcut) = settings.shortcut.parse::<Shortcut>() {
        let _ = app.global_shortcut().unregister(shortcut);
    }
    log::info!("Shortcuts paused for capture");
}

#[tauri::command]
pub fn resume_shortcut(app: AppHandle) {
    crate::hotkey::resume();
    let settings = settings::get_settings();
    register_shortcut(&app, &settings);
    log::info!("Shortcuts resumed");
}

/// Return a list of common hardware key names that can be used in hotkey combinations.
/// These are the valid key identifiers recognized by tauri-plugin-global-shortcut.
#[tauri::command]
pub fn list_global_shortcuts() -> Vec<&'static str> {
    vec![
        "A",
        "B",
        "C",
        "D",
        "E",
        "F",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
        "M",
        "N",
        "O",
        "P",
        "Q",
        "R",
        "S",
        "T",
        "U",
        "V",
        "W",
        "X",
        "Y",
        "Z",
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "F1",
        "F2",
        "F3",
        "F4",
        "F5",
        "F6",
        "F7",
        "F8",
        "F9",
        "F10",
        "F11",
        "F12",
        "Space",
        "Escape",
        "Enter",
        "Tab",
        "Backspace",
        "Delete",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "Insert",
        "PrintScreen",
        "ScrollLock",
        "Pause",
        "Num0",
        "Num1",
        "Num2",
        "Num3",
        "Num4",
        "Num5",
        "Num6",
        "Num7",
        "Num8",
        "Num9",
        "NumAdd",
        "NumSubtract",
        "NumMultiply",
        "NumDivide",
        "NumDecimal",
        "Comma",
        "Period",
        "Slash",
        "Backslash",
        "Semicolon",
        "Quote",
        "Minus",
        "Equal",
        "BracketLeft",
        "BracketRight",
    ]
}

/// Set or update the global recording hotkey.
/// The hotkey can start/stop recording from ANY application (not just when Whisp is focused).
/// Example key: "Ctrl+Shift+R"
#[tauri::command]
pub fn set_global_record_hotkey(app: AppHandle, key: String) -> Result<(), String> {
    log::info!("set_global_record_hotkey: {}", key);

    // Unregister any existing hotkey first
    let old_settings = settings::get_settings();
    if !old_settings.global_hotkey.is_empty() {
        unregister_global_record_hotkey(&app, &old_settings.global_hotkey);
    }

    // Register the new hotkey
    if !key.is_empty() {
        register_global_record_hotkey(&app, &key)?;
    }

    // Save to settings
    let mut s = old_settings;
    s.global_hotkey = key;
    s.global_hotkey_enabled = true;
    settings::save_settings(&s)?;

    Ok(())
}

/// Clear (unregister) the global recording hotkey.
#[tauri::command]
pub fn clear_global_record_hotkey(app: AppHandle) -> Result<(), String> {
    log::info!("clear_global_record_hotkey");

    let old_settings = settings::get_settings();
    if !old_settings.global_hotkey.is_empty() {
        unregister_global_record_hotkey(&app, &old_settings.global_hotkey);
    }

    let mut s = old_settings;
    s.global_hotkey = String::new();
    s.global_hotkey_enabled = false;
    settings::save_settings(&s)?;

    Ok(())
}

#[tauri::command]
pub fn save_overlay_position(x: f64, y: f64) {
    let mut s = settings::get_settings();
    s.overlay_x = Some(x);
    s.overlay_y = Some(y);
    let _ = settings::save_settings(&s);
}

#[tauri::command]
pub fn initialize_enigo(app: AppHandle) -> Result<(), String> {
    if !crate::paste::is_accessibility_trusted() {
        return Err("Accessibility not granted".into());
    }
    if app.try_state::<EnigoState>().is_some() {
        return Ok(());
    }
    let state = EnigoState::new()?;
    app.manage(state);
    Ok(())
}

#[tauri::command]
pub fn export_history(history: State<'_, Arc<HistoryManager>>) -> Result<String, String> {
    let entries = history.get_entries().map_err(|e| e.to_string())?;
    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record([
        "id",
        "timestamp",
        "text",
        "model",
        "provider",
        "language",
        "status",
        "duration_ms",
    ])
    .map_err(|e| e.to_string())?;
    for entry in entries {
        wtr.write_record(&[
            entry.id.to_string(),
            entry.timestamp.to_string(),
            sanitize_csv_field(&entry.text),
            sanitize_csv_field(&entry.model),
            sanitize_csv_field(&entry.provider),
            sanitize_csv_field(&entry.language),
            sanitize_csv_field(&entry.status),
            entry.duration_ms.map(|d| d.to_string()).unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
    }
    let data = wtr.into_inner().map_err(|e| e.to_string())?;
    String::from_utf8(data).map_err(|e| e.to_string())
}

/// Prevent CSV formula injection by prefixing dangerous leading chars with a single quote.
fn sanitize_csv_field(field: &str) -> String {
    if field.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{}", field)
    } else {
        field.to_string()
    }
}

#[tauri::command]
pub fn export_history_srt(history: State<'_, Arc<HistoryManager>>, ids: Vec<i64>) -> Result<String, String> {
    history.export_srt(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_history_markdown(history: State<'_, Arc<HistoryManager>>, ids: Vec<i64>) -> Result<String, String> {
    history.export_markdown(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pricing_config() -> Result<serde_json::Value, String> {
    let config = crate::cost::load_prices();
    serde_json::to_value(config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_pricing_config(config_json: String) -> Result<(), String> {
    let config: crate::cost::PriceConfig =
        serde_json::from_str(&config_json).map_err(|e| format!("Invalid pricing config: {e}"))?;
    let path = crate::data_dir().join("prices.json");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    // Prices will take effect after app restart (cached in OnceLock)
    Ok(())
}

#[tauri::command]
pub fn reset_pricing_config() -> Result<(), String> {
    let path = crate::data_dir().join("prices.json");
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    // Prices will take effect after app restart (cached in OnceLock)
    Ok(())
}

/// Get waveform data from the pending recording for preview visualization.
/// Returns downsampled amplitude values (0.0-1.0) suitable for drawing a waveform.
#[tauri::command]
pub fn get_pending_waveform() -> Result<Option<serde_json::Value>, String> {
    let pending = crate::PENDING_AUDIO.get_or_init(|| std::sync::Mutex::new(None));
    let guard = pending.lock().unwrap_or_else(|e| e.into_inner());
    match guard.as_ref() {
        Some(audio) => {
            // Downsample to ~200 bars for visualization
            let target_bars = 200usize;
            let samples = &audio.samples;
            let chunk_size = (samples.len() / target_bars).max(1);
            let mut amplitudes: Vec<f32> = Vec::with_capacity(target_bars);
            for chunk in samples.chunks(chunk_size) {
                let rms: f32 = chunk.iter().map(|s| s * s).sum::<f32>();
                let rms = (rms / chunk.len() as f32).sqrt();
                amplitudes.push((rms * 8.0).min(1.0)); // Scale for visibility
            }
            Ok(Some(serde_json::json!({
                "amplitudes": amplitudes,
                "duration_ms": audio.duration_ms,
                "sample_rate": audio.sample_rate,
            })))
        }
        None => Ok(None),
    }
}

/// Confirm the pending recording and proceed with transcription.
#[tauri::command]
pub fn confirm_pending_transcription(app: AppHandle) -> Result<(), String> {
    crate::confirm_pending_transcription_impl(&app)
}

/// Discard the pending recording without transcribing.
#[tauri::command]
pub fn discard_pending_recording(app: AppHandle) -> Result<(), String> {
    let pending = crate::PENDING_AUDIO.get_or_init(|| std::sync::Mutex::new(None));
    let mut guard = pending.lock().unwrap_or_else(|e| e.into_inner());
    *guard = None;
    crate::close_overlay(&app);
    let _ = app.emit("recording-cancelled", ());
    Ok(())
}

#[tauri::command]
pub fn trigger_sync(history: State<'_, Arc<HistoryManager>>) -> Result<serde_json::Value, String> {
    let settings = crate::settings::get_settings();
    let device = &settings.device_name;
    let (exported, imported) = crate::sync::full_sync(history.inner().as_ref(), device)?;
    Ok(serde_json::json!({
        "exported": exported,
        "imported": imported,
        "device": device,
        "sync_dir": settings.sync_dir,
    }))
}

#[tauri::command]
pub fn get_sync_status() -> Result<serde_json::Value, String> {
    let settings = crate::settings::get_settings();
    let dir = crate::sync::sync_dir();
    Ok(serde_json::json!({
        "configured": dir.is_some(),
        "sync_dir": settings.sync_dir,
        "device_name": settings.device_name,
        "dir_exists": dir.map(|d| d.exists()).unwrap_or(false),
    }))
}

#[tauri::command]
pub fn toggle_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())
    } else {
        autolaunch.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn retry_transcription(
    app: AppHandle,
    history: State<'_, Arc<HistoryManager>>,
    id: i64,
) -> Result<String, String> {
    log::info!("Retry transcription requested for entry id={}", id);
    use crate::transcribe;

    // Get the specific entry by ID
    let entry = history
        .get_entry_by_id(id)
        .map_err(|e| e.to_string())?
        .ok_or("Entry not found")?;
    let audio_path = entry.audio_path.as_ref().ok_or("No audio file for this entry")?;

    // Read WAV file
    let wav_data = std::fs::read(audio_path).map_err(|e| e.to_string())?;

    let settings = crate::settings::get_settings();
    if settings.api_key.is_empty() {
        return Err(match settings.ui_language.as_str() {
            "en" => "API key not configured".into(),
            "ja" => "API キーが未設定です".into(),
            _ => "尚未配置 API Key".into(),
        });
    }

    let lang = if settings.language == "auto" {
        None
    } else {
        Some(settings.language.as_str())
    };

    let client = app
        .try_state::<reqwest::Client>()
        .ok_or("HTTP client not initialized")?;
    let prompt = if settings.whisper_prompt.trim().is_empty() {
        None
    } else {
        Some(settings.whisper_prompt.as_str())
    };
    let text = transcribe::transcribe_audio(
        &client,
        &settings.api_key,
        &settings.api_base_url,
        &settings.model,
        &wav_data,
        lang,
        prompt,
        settings.request_timeout_sec,
        settings.retry_count,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Run post-transcription plugins
    let (text, _plugin_results) = crate::plugin::run_plugin_hook("post-transcription", &text).await;

    let polished_text = if settings.ai_polish_enabled && !settings.ai_polish_api_key.is_empty() {
        match crate::polish::polish_text(
            &client,
            &settings.ai_polish_api_key,
            &settings.ai_polish_api_url,
            &settings.ai_polish_model,
            &text,
            &settings.ai_polish_prompt,
            settings.request_timeout_sec,
        )
        .await
        {
            Ok(result) => Some(result.text),
            Err(e) => {
                log::warn!("Polish failed during retry, using original: {}", e);
                None
            }
        }
    } else {
        None
    };

    let provider = transcribe::provider_name(&settings.api_base_url);

    let display_text = polished_text.clone().unwrap_or(text.clone());

    // Update entry in place (preserves ID and audio_path)
    history
        .update_entry(
            id,
            &text,
            &settings.model,
            STATUS_SUCCESS,
            None,
            &provider,
            &settings.api_base_url,
            &settings.language,
            polished_text.as_deref(),
        )
        .map_err(|e| e.to_string())?;

    // Copy + paste
    let _ = app.clipboard().write_text(&display_text);
    if settings.auto_paste_enabled {
        crate::paste::simulate_paste(&app).ok();
    }

    let _ = app.emit("history-updated", ());

    Ok(display_text)
}

#[derive(Serialize)]
pub struct PolishOutput {
    pub text: String,
    pub tokens_used: i64,
}

#[tauri::command]
pub async fn polish_text(
    app: AppHandle,
    api_key: String,
    api_base_url: String,
    model: String,
    text: String,
    prompt: String,
) -> Result<PolishOutput, String> {
    log::info!("AI polish requested via command");
    let client = app
        .try_state::<reqwest::Client>()
        .ok_or("HTTP client not initialized")?;
    let timeout = settings::get_settings().request_timeout_sec;
    let result = crate::polish::polish_text(&client, &api_key, &api_base_url, &model, &text, &prompt, timeout)
        .await
        .map_err(|e| e.to_string())?;
    Ok(PolishOutput {
        text: result.text,
        tokens_used: result.tokens_used,
    })
}

#[derive(Serialize)]
pub struct TranslateOutput {
    pub text: String,
    pub tokens_used: i64,
    pub target: String,
}

#[tauri::command]
pub async fn translate_text(
    app: AppHandle,
    api_key: String,
    api_base_url: String,
    model: String,
    text: String,
    target: String,
) -> Result<TranslateOutput, String> {
    log::info!("Translation requested to target: {}", target);
    let client = app
        .try_state::<reqwest::Client>()
        .ok_or("HTTP client not initialized")?;
    let timeout = settings::get_settings().request_timeout_sec;
    let result = crate::translate::translate_text(&client, &api_key, &api_base_url, &model, &text, &target, timeout)
        .await
        .map_err(|e| e.to_string())?;
    Ok(TranslateOutput {
        text: result.text,
        tokens_used: result.tokens_used,
        target: result.target,
    })
}

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
            .split('-')
            .next()
            .unwrap_or(v)
            .split('.')
            .filter_map(|s| s.parse().ok())
            .collect()
    };
    let pa = parse(a);
    let pb = parse(b);
    pa.cmp(&pb)
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> UpdateInfo {
    log::info!("Update check requested");
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let github_repo = "sexyfeifan/Whisp";

    let client = app
        .try_state::<reqwest::Client>()
        .map(|s| (*s).clone())
        .unwrap_or_else(|| reqwest::Client::new());

    // Try /releases/latest first (non-prerelease), fall back to /releases (includes prerelease)
    let urls = [
        format!("https://api.github.com/repos/{}/releases/latest", github_repo),
        format!("https://api.github.com/repos/{}/releases?per_page=10", github_repo),
    ];

    for (i, url) in urls.iter().enumerate() {
        let resp = match client
            .get(url)
            .header("Accept", "application/vnd.github.v3+json")
            .header("User-Agent", format!("Whisp/{}", current_version))
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                if i == urls.len() - 1 {
                    return UpdateInfo {
                        has_update: false,
                        current_version,
                        latest_version: String::new(),
                        release_url: String::new(),
                        release_notes: String::new(),
                        published_at: String::new(),
                        assets: vec![],
                        error: e.to_string(),
                    };
                }
                continue;
            }
        };

        if !resp.status().is_success() {
            if i == urls.len() - 1 {
                return UpdateInfo {
                    has_update: false,
                    current_version,
                    latest_version: String::new(),
                    release_url: String::new(),
                    release_notes: String::new(),
                    published_at: String::new(),
                    assets: vec![],
                    error: format!("HTTP {}", resp.status()),
                };
            }
            continue;
        }

        let json: serde_json::Value = match resp.json().await {
            Ok(j) => j,
            Err(_) => continue,
        };

        // /releases/latest returns a single object, /releases returns an array
        let release = if i == 0 {
            json.clone()
        } else {
            match json
                .as_array()
                .and_then(|arr| arr.iter().find(|r| !r["draft"].as_bool().unwrap_or(false)).cloned())
            {
                Some(r) => r,
                None => continue,
            }
        };

        let tag = release["tag_name"].as_str().unwrap_or("");
        let latest = tag.trim_start_matches('v').to_string();
        let has_update = matches!(compare_versions(&latest, &current_version), std::cmp::Ordering::Greater);
        let release_url = release["html_url"].as_str().unwrap_or("").to_string();
        let release_notes = release["body"].as_str().unwrap_or("").to_string();
        let published_at = release["published_at"].as_str().unwrap_or("").to_string();
        let assets: Vec<ReleaseAsset> = release["assets"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|a| ReleaseAsset {
                        name: a["name"].as_str().unwrap_or("").to_string(),
                        url: a["browser_download_url"].as_str().unwrap_or("").to_string(),
                        size: a["size"].as_u64().unwrap_or(0),
                    })
                    .collect()
            })
            .unwrap_or_default();

        return UpdateInfo {
            has_update,
            current_version,
            latest_version: latest,
            release_url,
            release_notes,
            published_at,
            assets,
            error: String::new(),
        };
    }

    UpdateInfo {
        has_update: false,
        current_version,
        latest_version: String::new(),
        release_url: String::new(),
        release_notes: String::new(),
        published_at: String::new(),
        assets: vec![],
        error: "No releases found".to_string(),
    }
}

#[tauri::command]
pub fn get_logs() -> Vec<crate::log_buffer::LogEntry> {
    log::debug!("Logs requested by frontend");
    crate::log_buffer::get_logs()
}

#[tauri::command]
pub fn clear_logs() {
    log::info!("Logs cleared by user");
    crate::log_buffer::clear_logs()
}

#[tauri::command]
pub fn read_audio_file(path: String) -> Result<String, String> {
    std::fs::read(&path)
        .map(|bytes| base64::engine::general_purpose::STANDARD.encode(&bytes))
        .map_err(|e| e.to_string())
}

// --- Batch File Transcription ---

/// Result for a single file in a batch transcription.
#[derive(Clone, Serialize)]
pub struct BatchFileResult {
    pub file_path: String,
    pub file_name: String,
    pub success: bool,
    pub text: Option<String>,
    pub error: Option<String>,
    pub duration_ms: Option<i64>,
}

/// Progress event emitted during batch transcription.
#[derive(Clone, Serialize)]
pub struct BatchProgress {
    pub current: usize,
    pub total: usize,
    pub file_name: String,
    pub file_path: String,
    pub status: String, // "processing", "success", "failed"
    pub error: Option<String>,
}

/// Transcribe multiple WAV audio files sequentially.
/// Each file is processed independently — failures in one file
/// do not abort the batch. Progress events are emitted via
/// `batch-transcribe-progress` for every file, and a final
/// `batch-transcribe-complete` event carries the full results.
#[tauri::command]
pub async fn batch_transcribe(
    app: AppHandle,
    history: State<'_, Arc<HistoryManager>>,
    file_paths: Vec<String>,
) -> Result<Vec<BatchFileResult>, String> {
    log::info!("Batch transcription requested for {} files", file_paths.len());

    let settings = crate::settings::get_settings();
    if settings.api_key.is_empty() {
        return Err(match settings.ui_language.as_str() {
            "en" => "API key not configured".into(),
            "ja" => "API キーが未設定です".into(),
            _ => "尚未配置 API Key".into(),
        });
    }

    let client = app
        .try_state::<reqwest::Client>()
        .ok_or("HTTP client not initialized")?;

    let lang = if settings.language == "auto" {
        None
    } else {
        Some(settings.language.as_str())
    };

    let prompt = if settings.whisper_prompt.trim().is_empty() {
        None
    } else {
        Some(settings.whisper_prompt.as_str())
    };

    let provider = crate::transcribe::provider_name(&settings.api_base_url);
    let total = file_paths.len();
    let mut results: Vec<BatchFileResult> = Vec::with_capacity(total);

    for (index, file_path) in file_paths.iter().enumerate() {
        let path = std::path::Path::new(file_path);
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| file_path.clone());

        // Emit "processing" progress
        let _ = app.emit(
            "batch-transcribe-progress",
            BatchProgress {
                current: index + 1,
                total,
                file_name: file_name.clone(),
                file_path: file_path.clone(),
                status: "processing".to_string(),
                error: None,
            },
        );

        // Read file
        let wav_data = match std::fs::read(file_path) {
            Ok(data) => data,
            Err(e) => {
                let err_msg = format!("Failed to read file: {}", e);
                log::warn!("Batch: {} — {}", file_name, err_msg);
                let result = BatchFileResult {
                    file_path: file_path.clone(),
                    file_name: file_name.clone(),
                    success: false,
                    text: None,
                    error: Some(err_msg.clone()),
                    duration_ms: None,
                };
                let _ = app.emit(
                    "batch-transcribe-progress",
                    BatchProgress {
                        current: index + 1,
                        total,
                        file_name: file_name.clone(),
                        file_path: file_path.clone(),
                        status: "failed".to_string(),
                        error: Some(err_msg),
                    },
                );
                results.push(result);
                continue;
            }
        };

        // Try to read duration from WAV header (best-effort, non-fatal)
        let duration_ms: Option<i64> = hound::WavReader::new(std::io::Cursor::new(&wav_data))
            .ok()
            .map(|reader| {
                let spec = reader.spec();
                let sample_count = reader.duration() as i64;
                if spec.sample_rate > 0 {
                    sample_count * 1000 / spec.sample_rate as i64
                } else {
                    0
                }
            });

        // Transcribe
        match crate::transcribe::transcribe_audio(
            &client,
            &settings.api_key,
            &settings.api_base_url,
            &settings.model,
            &wav_data,
            lang,
            prompt,
            settings.request_timeout_sec,
            settings.retry_count,
        )
        .await
        {
            Ok(text) => {
                log::info!("Batch [{}]: {} — success, {} chars", index + 1, file_name, text.len());

                let asr_duration_sec = duration_ms.unwrap_or(0) as f64 / 1000.0;
                let estimated_cost =
                    crate::cost::estimate_asr_cost(&settings.api_base_url, &settings.model, asr_duration_sec);

                // Save to history
                let entry = NewHistoryEntry {
                    text: text.clone(),
                    model: settings.model.clone(),
                    duration_ms,
                    audio_path: Some(file_path.clone()),
                    status: STATUS_SUCCESS.to_string(),
                    error_message: None,
                    provider: provider.clone(),
                    api_base_url: settings.api_base_url.clone(),
                    language: settings.language.clone(),
                    retry_of: None,
                    asr_duration_sec: Some(asr_duration_sec),
                    polish_tokens: None,
                    estimated_cost: Some(estimated_cost),
                    polished_text: None,
                    recorded_at: 0,
                };
                let _ = history.add_entry(&entry);

                let result = BatchFileResult {
                    file_path: file_path.clone(),
                    file_name: file_name.clone(),
                    success: true,
                    text: Some(text),
                    error: None,
                    duration_ms,
                };
                let _ = app.emit(
                    "batch-transcribe-progress",
                    BatchProgress {
                        current: index + 1,
                        total,
                        file_name: file_name.clone(),
                        file_path: file_path.clone(),
                        status: "success".to_string(),
                        error: None,
                    },
                );
                results.push(result);
            }
            Err(e) => {
                let err_msg = e.to_string();
                log::warn!("Batch [{}]: {} — failed: {}", index + 1, file_name, err_msg);

                // Save failed entry to history
                let entry = NewHistoryEntry {
                    text: format!("转写失败: {}", &err_msg.chars().take(100).collect::<String>()),
                    model: settings.model.clone(),
                    duration_ms,
                    audio_path: Some(file_path.clone()),
                    status: STATUS_FAILED.to_string(),
                    error_message: Some(err_msg.clone()),
                    provider: provider.clone(),
                    api_base_url: settings.api_base_url.clone(),
                    language: settings.language.clone(),
                    retry_of: None,
                    asr_duration_sec: None,
                    polish_tokens: None,
                    estimated_cost: None,
                    polished_text: None,
                    recorded_at: 0,
                };
                let _ = history.add_entry(&entry);

                let result = BatchFileResult {
                    file_path: file_path.clone(),
                    file_name: file_name.clone(),
                    success: false,
                    text: None,
                    error: Some(err_msg.clone()),
                    duration_ms,
                };
                let _ = app.emit(
                    "batch-transcribe-progress",
                    BatchProgress {
                        current: index + 1,
                        total,
                        file_name: file_name.clone(),
                        file_path: file_path.clone(),
                        status: "failed".to_string(),
                        error: Some(err_msg),
                    },
                );
                results.push(result);
            }
        }
    }

    // Notify frontend to refresh history
    let _ = app.emit("history-updated", ());
    // Emit completion event with full results
    let _ = app.emit("batch-transcribe-complete", &results);

    log::info!(
        "Batch transcription complete: {}/{} succeeded",
        results.iter().filter(|r| r.success).count(),
        total
    );

    Ok(results)
}

#[tauri::command]
pub fn get_default_polish_prompt() -> String {
    crate::polish::DEFAULT_SYSTEM_PROMPT.to_string()
}

#[tauri::command]
pub fn export_settings_json() -> Result<String, String> {
    let s = settings::get_settings();
    let map = serde_json::json!({
        "api_base_url": s.api_base_url,
        "model": s.model,
        "language": s.language,
        "shortcut": s.shortcut,
        "auto_paste_enabled": s.auto_paste_enabled,
        "paste_delay_ms": s.paste_delay_ms,
        "save_audio_files": s.save_audio_files,
        "sound_enabled": s.sound_enabled,
        "ui_language": s.ui_language,
        "request_timeout_sec": s.request_timeout_sec,
        "retry_count": s.retry_count,
        "silence_timeout_sec": s.silence_timeout_sec,
        "silence_threshold": s.silence_threshold,
        "trim_silence_enabled": s.trim_silence_enabled,
        "whisper_prompt": s.whisper_prompt,
        "whisper_config_json": s.whisper_config_json,
        "launch_at_startup": s.launch_at_startup,
        "ai_polish_enabled": s.ai_polish_enabled,
        "ai_polish_api_url": s.ai_polish_api_url,
        "ai_polish_model": s.ai_polish_model,
        "ai_polish_prompt": s.ai_polish_prompt,
        "audio_retention_limit": s.audio_retention_limit,
        "translation_target": s.translation_target,
    });
    serde_json::to_string_pretty(&map).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_settings_json(app: AppHandle, json: String) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    let obj = value.as_object().ok_or("JSON must be an object")?;

    let mut s = settings::get_settings();

    if let Some(v) = obj.get("api_base_url").and_then(|v| v.as_str()) {
        s.api_base_url = v.to_string();
    }
    if let Some(v) = obj.get("api_key").and_then(|v| v.as_str()) {
        s.api_key = v.to_string();
    }
    if let Some(v) = obj.get("model").and_then(|v| v.as_str()) {
        s.model = v.to_string();
    }
    if let Some(v) = obj.get("language").and_then(|v| v.as_str()) {
        s.language = v.to_string();
    }
    if let Some(v) = obj.get("shortcut").and_then(|v| v.as_str()) {
        s.shortcut = v.to_string();
    }
    if let Some(v) = obj.get("auto_paste_enabled").and_then(|v| v.as_bool()) {
        s.auto_paste_enabled = v;
    }
    if let Some(v) = obj.get("paste_delay_ms").and_then(|v| v.as_u64()) {
        s.paste_delay_ms = v;
    }
    if let Some(v) = obj.get("save_audio_files").and_then(|v| v.as_bool()) {
        s.save_audio_files = v;
    }
    if let Some(v) = obj.get("sound_enabled").and_then(|v| v.as_bool()) {
        s.sound_enabled = v;
    }
    if let Some(v) = obj.get("ui_language").and_then(|v| v.as_str()) {
        s.ui_language = v.to_string();
    }
    if let Some(v) = obj.get("request_timeout_sec").and_then(|v| v.as_u64()) {
        s.request_timeout_sec = v;
    }
    if let Some(v) = obj.get("retry_count").and_then(|v| v.as_u64()) {
        s.retry_count = v as u8;
    }
    if let Some(v) = obj.get("silence_timeout_sec").and_then(|v| v.as_u64()) {
        s.silence_timeout_sec = v;
    }
    if let Some(v) = obj.get("silence_threshold").and_then(|v| v.as_f64()) {
        s.silence_threshold = v;
    }
    if let Some(v) = obj.get("trim_silence_enabled").and_then(|v| v.as_bool()) {
        s.trim_silence_enabled = v;
    }
    if let Some(v) = obj.get("whisper_prompt").and_then(|v| v.as_str()) {
        s.whisper_prompt = v.to_string();
    }
    if let Some(v) = obj.get("whisper_config_json").and_then(|v| v.as_str()) {
        s.whisper_config_json = v.to_string();
    }
    if let Some(v) = obj.get("launch_at_startup").and_then(|v| v.as_bool()) {
        s.launch_at_startup = v;
    }
    if let Some(v) = obj.get("ai_polish_enabled").and_then(|v| v.as_bool()) {
        s.ai_polish_enabled = v;
    }
    if let Some(v) = obj.get("ai_polish_api_url").and_then(|v| v.as_str()) {
        s.ai_polish_api_url = v.to_string();
    }
    if let Some(v) = obj.get("ai_polish_api_key").and_then(|v| v.as_str()) {
        s.ai_polish_api_key = v.to_string();
    }
    if let Some(v) = obj.get("ai_polish_model").and_then(|v| v.as_str()) {
        s.ai_polish_model = v.to_string();
    }
    if let Some(v) = obj.get("ai_polish_prompt").and_then(|v| v.as_str()) {
        s.ai_polish_prompt = v.to_string();
    }
    if let Some(v) = obj.get("audio_retention_limit").and_then(|v| v.as_u64()) {
        s.audio_retention_limit = v as usize;
    }
    if let Some(v) = obj.get("translation_target").and_then(|v| v.as_str()) {
        s.translation_target = v.to_string();
    }

    let old_settings = settings::get_settings();
    settings::save_settings(&s).map_err(|e| e.to_string())?;

    if s.shortcut != old_settings.shortcut {
        re_register_shortcut(&app, &old_settings.shortcut, &s);
    }

    log::info!("Settings imported successfully");
    Ok("Settings imported successfully".to_string())
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle, url: String, filename: String) -> Result<String, String> {
    use std::io::Write;

    let client = app
        .try_state::<reqwest::Client>()
        .map(|s| (*s).clone())
        .unwrap_or_else(|| reqwest::Client::new());

    log::info!("Downloading update from: {}", url);

    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(600))
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with HTTP {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    // Save to user's Downloads folder
    let downloads_dir = dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
        .unwrap_or_else(|| std::env::temp_dir());

    let file_path = downloads_dir.join(&filename);
    let mut file = std::fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    log::info!("Update downloaded to: {}", file_path.display());

    // Auto-open the installer
    let s = settings::get_settings();
    let lang = &s.ui_language;

    #[cfg(target_os = "macos")]
    {
        if filename.ends_with(".dmg") {
            let _ = std::process::Command::new("open").arg(&file_path).spawn();
            return Ok(tr(
                lang,
                &format!(
                    "已下载到 {}，安装窗口即将打开。请将 Whisp 拖入 Applications 完成更新。",
                    file_path.display()
                ),
                &format!(
                    "Downloaded to {}. The installer should open automatically. Drag Whisp to Applications to update.",
                    file_path.display()
                ),
                &format!(
                    "ダウンロード完了: {}。インストーラーが開きます。Whisp を Applications にドラッグしてください。",
                    file_path.display()
                ),
            ));
        }
        let _ = std::process::Command::new("open").arg(&file_path).spawn();
        return Ok(tr(
            lang,
            &format!("已下载并打开: {}", file_path.display()),
            &format!("Downloaded and opened: {}", file_path.display()),
            &format!("ダウンロードして開きました: {}", file_path.display()),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &file_path.to_string_lossy().to_string()])
            .spawn();
        return Ok(tr(
            lang,
            &format!("已下载到 {}，安装程序即将启动。", file_path.display()),
            &format!(
                "Downloaded to {}. The installer should launch shortly.",
                file_path.display()
            ),
            &format!(
                "ダウンロード完了: {}。インストーラーが起動します。",
                file_path.display()
            ),
        ));
    }

    #[cfg(target_os = "linux")]
    {
        return Ok(tr(
            lang,
            &format!("已下载到: {}", file_path.display()),
            &format!("Downloaded to: {}", file_path.display()),
            &format!("ダウンロード完了: {}", file_path.display()),
        ));
    }
}

// --- Offline Whisper Engine Commands ---

#[tauri::command]
pub fn get_whisper_config() -> crate::whisper::WhisperConfig {
    crate::whisper::WhisperEngine::new().get_config()
}

#[tauri::command]
pub fn set_whisper_config(config: crate::whisper::WhisperConfig) -> Result<(), String> {
    let mut s = settings::get_settings();
    // Store whisper config in dedicated field (not whisper_prompt)
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    s.whisper_config_json = config_json;
    settings::save_settings(&s)?;
    Ok(())
}

#[tauri::command]
pub fn list_whisper_models() -> Result<Vec<crate::whisper::ModelInfo>, String> {
    crate::whisper::WhisperEngine::list_models().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_whisper_model() -> bool {
    crate::whisper::WhisperEngine::new().is_model_loaded()
}

#[tauri::command]
pub fn get_whisper_model_dir() -> Result<String, String> {
    crate::whisper::WhisperEngine::model_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn transcribe_offline(
    model_path: String,
    audio_path: String,
    language: String,
) -> Result<crate::whisper::WhisperResult, String> {
    use crate::whisper::WhisperEngine;

    log::info!(
        "Offline transcription requested: audio={}, model={}, lang={}",
        audio_path,
        model_path,
        language
    );

    // Read WAV file with hound
    let reader = hound::WavReader::open(&audio_path).map_err(|e| format!("Failed to open audio file: {}", e))?;

    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let channels = spec.channels as u32;

    let samples: Vec<f32> = if spec.sample_format == hound::SampleFormat::Float {
        reader
            .into_samples::<f32>()
            .map(|s| s.map_err(|e| format!("Failed to read sample: {}", e)))
            .collect::<Result<Vec<_>, _>>()?
    } else {
        reader
            .into_samples::<i16>()
            .map(|s| {
                s.map_err(|e| format!("Failed to read sample: {}", e))
                    .map(|s| s as f32 / i16::MAX as f32)
            })
            .collect::<Result<Vec<_>, _>>()?
    };

    // Convert to mono if needed
    let mono_samples = if channels > 1 {
        samples
            .chunks(channels as usize)
            .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
            .collect::<Vec<_>>()
    } else {
        samples
    };

    log::info!(
        "Audio read: {} samples at {}Hz, {} channels",
        mono_samples.len(),
        sample_rate,
        channels
    );

    let engine = WhisperEngine::new();
    engine.set_config(crate::whisper::WhisperConfig {
        model_path,
        language: if language.is_empty() {
            "auto".to_string()
        } else {
            language
        },
        n_threads: 2,
        translate: false,
        prompt: String::new(),
    });

    engine.transcribe(&mono_samples, sample_rate).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_offline_models() -> Result<Vec<crate::whisper::ModelInfo>, String> {
    crate::whisper::WhisperEngine::list_models().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_known_models() -> Vec<crate::whisper::KnownModel> {
    let settings = settings::get_settings();
    crate::whisper::list_known_models(&settings.ui_language)
}

#[derive(Clone, Serialize)]
pub struct ModelDownloadProgress {
    pub model_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
}

#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model_name: String) -> Result<String, String> {
    use crate::whisper::KNOWN_MODELS;

    log::info!("Downloading Whisper model: {}", model_name);

    let client = app
        .try_state::<reqwest::Client>()
        .map(|s| (*s).clone())
        .unwrap_or_else(|| reqwest::Client::new());

    // Resolve URL
    let url = if let Some((_, url, _, _, _, _, _)) =
        KNOWN_MODELS.iter().find(|(name, _, _, _, _, _, _)| *name == model_name)
    {
        url
    } else {
        if model_name.starts_with("http://") || model_name.starts_with("https://") {
            model_name.as_str()
        } else {
            return Err(format!("Unknown model: {}", model_name));
        }
    };

    let model_dir = crate::whisper::WhisperEngine::model_dir().map_err(|e| e.to_string())?;
    let file_name = if url.ends_with(".bin") {
        url.rsplit_once('/').map(|(_, name)| name).unwrap_or("model.bin")
    } else {
        "model.bin"
    };
    let dest_path = model_dir.join(file_name);

    if dest_path.exists() {
        log::info!("Model already exists at {}", dest_path.display());
        return Ok(dest_path.to_string_lossy().to_string());
    }

    log::info!("Downloading model from {} to {}", url, dest_path.display());

    // Emit initial progress
    let _ = app.emit("model-download-progress", ModelDownloadProgress {
        model_name: model_name.clone(),
        downloaded_bytes: 0,
        total_bytes: 0,
        percentage: 0.0,
    });

    let mut response = client
        .get(url)
        .timeout(std::time::Duration::from_secs(1800))
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let dest_path_tmp = dest_path.with_extension("part");

    let mut file = std::fs::File::create(&dest_path_tmp)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut last_emit_bytes: u64 = 0;

    use std::io::Write;
    while let Some(chunk) = response.chunk().await.transpose() {
        let bytes = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
        file.write_all(&bytes).map_err(|e| format!("Failed to write chunk: {}", e))?;
        downloaded += bytes.len() as u64;

        // Emit progress every ~1MB or at end
        if downloaded - last_emit_bytes >= 1_048_576 || (total_size > 0 && downloaded >= total_size) {
            let percentage = if total_size > 0 {
                (downloaded as f64 / total_size as f64) * 100.0
            } else {
                0.0
            };
            let _ = app.emit("model-download-progress", ModelDownloadProgress {
                model_name: model_name.clone(),
                downloaded_bytes: downloaded,
                total_bytes: total_size,
                percentage,
            });
            last_emit_bytes = downloaded;
        }
    }

    file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
    drop(file);

    // Verify downloaded size
    if total_size > 0 && downloaded != total_size {
        let _ = std::fs::remove_file(&dest_path_tmp);
        return Err(format!("Download incomplete: expected {} bytes, got {}", total_size, downloaded));
    }

    std::fs::rename(&dest_path_tmp, &dest_path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

    // Emit final progress
    let _ = app.emit("model-download-progress", ModelDownloadProgress {
        model_name: model_name.clone(),
        downloaded_bytes: downloaded,
        total_bytes: total_size,
        percentage: 100.0,
    });

    log::info!("Model downloaded: {} ({:.1} MB)", file_name, downloaded as f64 / 1_048_576.0);

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_model(model_name: String) -> Result<(), String> {
    crate::whisper::WhisperEngine::delete_model(&model_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_model_disk_usage() -> Result<u64, String> {
    crate::whisper::WhisperEngine::total_model_size().map_err(|e| e.to_string())
}

// --- Plugin System ---

#[tauri::command]
pub fn list_plugins() -> Vec<crate::plugin::Plugin> {
    crate::plugin::list_plugins()
}

// --- Full Backup / Restore ---

/// Summary returned by import_full_backup.
#[derive(Serialize)]
pub struct BackupImportSummary {
    pub settings_imported: bool,
    pub entries_imported: usize,
    pub entries_skipped: usize,
    pub audio_files_copied: usize,
    pub errors: Vec<String>,
}

/// Export a complete backup as a ZIP archive containing settings, history, and audio files.
#[tauri::command]
pub fn export_full_backup(history: State<'_, Arc<HistoryManager>>, target_path: String) -> Result<String, String> {
    use std::io::Write;

    let settings = settings::get_settings();
    let settings_json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;

    let entries = history.get_entries().map_err(|e| e.to_string())?;
    let history_json = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;

    let file = std::fs::File::create(&target_path).map_err(|e| format!("Failed to create backup file: {e}"))?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Write settings.json
    zip_writer
        .start_file("settings.json", opts)
        .map_err(|e| format!("Failed to write settings.json: {e}"))?;
    zip_writer
        .write_all(settings_json.as_bytes())
        .map_err(|e| format!("Failed to write settings.json content: {e}"))?;

    // Write history.json
    zip_writer
        .start_file("history.json", opts)
        .map_err(|e| format!("Failed to write history.json: {e}"))?;
    zip_writer
        .write_all(history_json.as_bytes())
        .map_err(|e| format!("Failed to write history.json content: {e}"))?;

    // Write audio files
    for entry in &entries {
        if let Some(audio_path) = &entry.audio_path {
            let audio_file = std::path::Path::new(audio_path);
            if audio_file.exists() {
                let file_name = audio_file
                    .file_name()
                    .map(|n| format!("audio/{}", n.to_string_lossy()))
                    .unwrap_or_else(|| format!("audio/audio_{}.wav", entry.id));
                let audio_data =
                    std::fs::read(audio_path).map_err(|e| format!("Failed to read audio file {}: {e}", audio_path))?;
                zip_writer
                    .start_file(&file_name, opts)
                    .map_err(|e| format!("Failed to create zip entry {file_name}: {e}"))?;
                zip_writer
                    .write_all(&audio_data)
                    .map_err(|e| format!("Failed to write {file_name}: {e}"))?;
            }
        }
    }

    zip_writer
        .finish()
        .map_err(|e| format!("Failed to finalize backup: {e}"))?;

    log::info!("Full backup exported to {}", target_path);
    Ok(target_path)
}

/// Import a complete backup from a ZIP archive: merge settings, deduplicate history, and copy audio files.
#[tauri::command]
pub fn import_full_backup(
    app: AppHandle,
    history: State<'_, Arc<HistoryManager>>,
    source_path: String,
) -> Result<BackupImportSummary, String> {
    let file = std::fs::File::open(&source_path).map_err(|e| format!("Failed to open backup file: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Failed to read backup archive: {e}"))?;

    let mut errors: Vec<String> = Vec::new();
    let mut settings_imported = false;
    let mut entries_imported: usize = 0;
    let mut entries_skipped: usize = 0;
    let mut audio_files_copied: usize = 0;

    let mut backup_settings_json: Option<String> = None;
    let mut backup_entries: Option<Vec<HistoryEntry>> = None;
    // Map: zip file name (e.g. "audio/foo.wav") -> raw bytes
    let mut audio_files: std::collections::HashMap<String, Vec<u8>> = std::collections::HashMap::new();

    // --- Pass 1: read all entries from the ZIP ---
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry {i}: {e}"))?;
        let name = entry.name().to_string();

        if name == "settings.json" {
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut entry, &mut buf)
                .map_err(|e| format!("Failed to read settings.json: {e}"))?;
            backup_settings_json = Some(buf);
        } else if name == "history.json" {
            let mut buf = String::new();
            std::io::Read::read_to_string(&mut entry, &mut buf)
                .map_err(|e| format!("Failed to read history.json: {e}"))?;
            backup_entries = serde_json::from_str::<Vec<HistoryEntry>>(&buf).ok();
        } else if name.starts_with("audio/") && !name.ends_with('/') {
            let mut buf = Vec::new();
            std::io::Read::read_to_end(&mut entry, &mut buf).map_err(|e| format!("Failed to read {name}: {e}"))?;
            audio_files.insert(name, buf);
        }
    }

    // --- Import settings (merge with existing) ---
    if let Some(json_str) = backup_settings_json {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json_str) {
            if let Some(obj) = value.as_object() {
                let mut s = settings::get_settings();
                // Merge: only overwrite fields present in the backup
                if let Some(v) = obj.get("api_base_url").and_then(|v| v.as_str()) {
                    s.api_base_url = v.to_string();
                }
                if let Some(v) = obj.get("api_key").and_then(|v| v.as_str()) {
                    s.api_key = v.to_string();
                }
                if let Some(v) = obj.get("model").and_then(|v| v.as_str()) {
                    s.model = v.to_string();
                }
                if let Some(v) = obj.get("language").and_then(|v| v.as_str()) {
                    s.language = v.to_string();
                }
                if let Some(v) = obj.get("shortcut").and_then(|v| v.as_str()) {
                    s.shortcut = v.to_string();
                }
                if let Some(v) = obj.get("auto_paste_enabled").and_then(|v| v.as_bool()) {
                    s.auto_paste_enabled = v;
                }
                if let Some(v) = obj.get("paste_delay_ms").and_then(|v| v.as_u64()) {
                    s.paste_delay_ms = v;
                }
                if let Some(v) = obj.get("save_audio_files").and_then(|v| v.as_bool()) {
                    s.save_audio_files = v;
                }
                if let Some(v) = obj.get("sound_enabled").and_then(|v| v.as_bool()) {
                    s.sound_enabled = v;
                }
                if let Some(v) = obj.get("ui_language").and_then(|v| v.as_str()) {
                    s.ui_language = v.to_string();
                }
                if let Some(v) = obj.get("request_timeout_sec").and_then(|v| v.as_u64()) {
                    s.request_timeout_sec = v;
                }
                if let Some(v) = obj.get("retry_count").and_then(|v| v.as_u64()) {
                    s.retry_count = v as u8;
                }
                if let Some(v) = obj.get("silence_timeout_sec").and_then(|v| v.as_u64()) {
                    s.silence_timeout_sec = v;
                }
                if let Some(v) = obj.get("silence_threshold").and_then(|v| v.as_f64()) {
                    s.silence_threshold = v;
                }
                if let Some(v) = obj.get("trim_silence_enabled").and_then(|v| v.as_bool()) {
                    s.trim_silence_enabled = v;
                }
                if let Some(v) = obj.get("whisper_prompt").and_then(|v| v.as_str()) {
                    s.whisper_prompt = v.to_string();
                }
                if let Some(v) = obj.get("whisper_config_json").and_then(|v| v.as_str()) {
                    s.whisper_config_json = v.to_string();
                }
                if let Some(v) = obj.get("launch_at_startup").and_then(|v| v.as_bool()) {
                    s.launch_at_startup = v;
                }
                if let Some(v) = obj.get("ai_polish_enabled").and_then(|v| v.as_bool()) {
                    s.ai_polish_enabled = v;
                }
                if let Some(v) = obj.get("ai_polish_api_url").and_then(|v| v.as_str()) {
                    s.ai_polish_api_url = v.to_string();
                }
                if let Some(v) = obj.get("ai_polish_api_key").and_then(|v| v.as_str()) {
                    s.ai_polish_api_key = v.to_string();
                }
                if let Some(v) = obj.get("ai_polish_model").and_then(|v| v.as_str()) {
                    s.ai_polish_model = v.to_string();
                }
                if let Some(v) = obj.get("ai_polish_prompt").and_then(|v| v.as_str()) {
                    s.ai_polish_prompt = v.to_string();
                }
                if let Some(v) = obj.get("audio_retention_limit").and_then(|v| v.as_u64()) {
                    s.audio_retention_limit = v as usize;
                }
                if let Some(v) = obj.get("translation_target").and_then(|v| v.as_str()) {
                    s.translation_target = v.to_string();
                }
                if let Some(v) = obj.get("waveform_preview_enabled").and_then(|v| v.as_bool()) {
                    s.waveform_preview_enabled = v;
                }
                // Apply shortcut changes
                let old_settings = settings::get_settings();
                settings::save_settings(&s).map_err(|e| format!("Failed to save imported settings: {e}"))?;
                if s.shortcut != old_settings.shortcut {
                    re_register_shortcut(&app, &old_settings.shortcut, &s);
                }
                settings_imported = true;
            }
        } else {
            errors.push("settings.json is not valid JSON".to_string());
        }
    }

    // --- Import history entries (dedup by timestamp + text) ---
    if let Some(entries) = backup_entries {
        let existing = history.get_entries().map_err(|e| e.to_string())?;

        // Build a set of (timestamp, text) for existing entries
        let existing_keys: std::collections::HashSet<(i64, String)> =
            existing.iter().map(|e| (e.timestamp, e.text.clone())).collect();

        let audio_dir = history.audio_dir();
        std::fs::create_dir_all(&audio_dir).map_err(|e| format!("Failed to create audio directory: {e}"))?;

        for entry in &entries {
            let key = (entry.timestamp, entry.text.clone());
            if existing_keys.contains(&key) {
                entries_skipped += 1;
                continue;
            }

            // Try to copy the audio file from the backup if it exists
            let mut new_audio_path: Option<String> = None;
            if let Some(ref old_path) = entry.audio_path {
                let file_name = std::path::Path::new(old_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string());
                if let Some(name) = file_name {
                    let zip_key = format!("audio/{}", name);
                    if let Some(audio_data) = audio_files.get(&zip_key) {
                        let dest = audio_dir.join(&name);
                        if std::fs::write(&dest, audio_data).is_ok() {
                            new_audio_path = Some(dest.to_string_lossy().to_string());
                            audio_files_copied += 1;
                        } else {
                            errors.push(format!("Failed to copy audio file: {name}"));
                        }
                    }
                }
            }

            let new_entry = NewHistoryEntry {
                text: entry.text.clone(),
                model: entry.model.clone(),
                duration_ms: entry.duration_ms,
                audio_path: new_audio_path,
                status: entry.status.clone(),
                error_message: entry.error_message.clone(),
                provider: entry.provider.clone(),
                api_base_url: entry.api_base_url.clone(),
                language: entry.language.clone(),
                retry_of: entry.retry_of,
                asr_duration_sec: entry.asr_duration_sec,
                polish_tokens: entry.polish_tokens,
                estimated_cost: entry.estimated_cost,
                polished_text: entry.polished_text.clone(),
                recorded_at: entry.timestamp,
            };

            if let Err(e) = history.add_entry(&new_entry) {
                errors.push(format!("Failed to import entry id={}: {e}", entry.id));
            } else {
                entries_imported += 1;
            }
        }
    }

    if entries_imported > 0 || settings_imported {
        let _ = app.emit("history-updated", ());
    }

    log::info!(
        "Backup imported: {} settings, {} entries ({} skipped), {} audio, {} errors",
        settings_imported,
        entries_imported,
        entries_skipped,
        audio_files_copied,
        errors.len()
    );

    Ok(BackupImportSummary {
        settings_imported,
        entries_imported,
        entries_skipped,
        audio_files_copied,
        errors,
    })
}

// --- Export ---
#[tauri::command]
pub fn export_transcription(
    history: State<'_, Arc<HistoryManager>>,
    entry_id: i64,
    format: String,
) -> Result<String, String> {
    let entries = history.get_entries_by_ids(&[entry_id]).map_err(|e| e.to_string())?;
    let entry = entries.first().ok_or_else(|| "Entry not found".to_string())?;
    match format.as_str() {
        "srt" => history.export_srt(&[entry_id]).map_err(|e| e.to_string()),
        "markdown" | "md" => history.export_markdown(&[entry_id]).map_err(|e| e.to_string()),
        "csv" => {
            let mut wtr = csv::Writer::from_writer(Vec::new());
            wtr.write_record(&[
                "ID",
                "Text",
                "Timestamp",
                "Model",
                "Provider",
                "Language",
                "Status",
                "Duration (ms)",
            ])
            .map_err(|e| e.to_string())?;
            wtr.write_record(&[
                entry.id.to_string(),
                sanitize_csv_field(&entry.text),
                entry.timestamp.to_string(),
                sanitize_csv_field(&entry.model),
                sanitize_csv_field(&entry.provider),
                sanitize_csv_field(&entry.language),
                sanitize_csv_field(&entry.status),
                entry.duration_ms.map(|d| d.to_string()).unwrap_or_default(),
            ])
            .map_err(|e| e.to_string())?;
            let data = wtr.into_inner().map_err(|e| e.to_string())?;
            String::from_utf8(data).map_err(|e| e.to_string())
        }
        _ => history.export_markdown(&[entry_id]).map_err(|e| e.to_string()),
    }
}

// --- AI Summary ---

#[tauri::command]
pub async fn generate_summary(
    history: State<'_, Arc<HistoryManager>>,
    client: State<'_, reqwest::Client>,
    entry_id: i64,
) -> Result<crate::summary::SummaryResult, String> {
    let entries = history.get_entries_by_ids(&[entry_id]).map_err(|e| e.to_string())?;
    let entry = entries.first().ok_or_else(|| "Entry not found".to_string())?;

    let settings = settings::get_settings();
    // Use summary-specific API key/URL if set, otherwise fall back to main transcription key/URL
    let summary_api_key = if settings.summary_api_key.trim().is_empty() {
        settings.api_key.clone()
    } else {
        settings.summary_api_key.clone()
    };
    let summary_api_base_url = if settings.summary_api_base_url.trim().is_empty() {
        settings.api_base_url.clone()
    } else {
        settings.summary_api_base_url.clone()
    };
    let config = crate::summary::SummaryConfig {
        enabled: settings.summary_enabled,
        model: settings.summary_model.clone(),
        api_key: summary_api_key,
        api_base_url: summary_api_base_url,
        language: settings.ui_language.clone(),
    };

    crate::summary::generate_summary(&entry.text, &config, &client)
        .await
        .map_err(|e| e.to_string())
}

// --- Streaming Recording ---

#[tauri::command]
pub fn start_streaming_recording(app: AppHandle) -> Result<(), String> {
    crate::streaming::start_streaming_recording(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_streaming_recording(app: AppHandle) -> Result<(), String> {
    crate::streaming::stop_streaming_recording(&app).map_err(|e| e.to_string())
}

/// Transcribe an uploaded audio file (base64-encoded) and optionally polish the result.
/// Returns the transcribed text.
#[tauri::command]
pub async fn transcribe_file(
    app: AppHandle,
    file_data: String,
    file_name: String,
    polish: bool,
) -> Result<String, String> {
    let settings = settings::get_settings();
    if settings.api_key.is_empty() {
        return Err("API key not configured".to_string());
    }

    let client = app.state::<reqwest::Client>().inner().clone();
    let history = app.state::<Arc<HistoryManager>>().inner().clone();

    // Decode base64 file data
    let wav_data = base64::engine::general_purpose::STANDARD
        .decode(&file_data)
        .map_err(|e| format!("Failed to decode file data: {e}"))?;

    // Try to get duration from file (best-effort for WAV)
    let duration_ms: Option<i64> = hound::WavReader::new(std::io::Cursor::new(&wav_data))
        .ok()
        .map(|reader| {
            let spec = reader.spec();
            let sample_count = reader.duration() as i64;
            if spec.sample_rate > 0 {
                sample_count * 1000 / spec.sample_rate as i64
            } else {
                0
            }
        });

    let lang = if settings.language == "auto" {
        None
    } else {
        Some(settings.language.as_str())
    };
    let prompt = if settings.whisper_prompt.trim().is_empty() {
        None
    } else {
        Some(settings.whisper_prompt.as_str())
    };
    let provider = crate::transcribe::provider_name(&settings.api_base_url);

    log::info!("Transcribing uploaded file: {}", file_name);

    match crate::transcribe::transcribe_audio(
        &client,
        &settings.api_key,
        &settings.api_base_url,
        &settings.model,
        &wav_data,
        lang,
        prompt,
        settings.request_timeout_sec,
        settings.retry_count,
    )
    .await
    {
        Ok(text) => {
            log::info!("File transcription succeeded: {} chars", text.len());

            let (final_text, polish_tokens) = if polish && !settings.ai_polish_api_key.is_empty() {
                match crate::polish::polish_text(
                    &client,
                    &settings.ai_polish_api_key,
                    &settings.ai_polish_api_url,
                    &settings.ai_polish_model,
                    &text,
                    &settings.ai_polish_prompt,
                    settings.request_timeout_sec,
                )
                .await
                {
                    Ok(result) => (result.text, result.tokens_used),
                    Err(e) => {
                        log::info!("AI polish failed: {}", e);
                        let _ = app.emit("polish-error", e.to_string());
                        (text, 0i64)
                    }
                }
            } else {
                (text, 0i64)
            };

            let asr_duration_sec = duration_ms.unwrap_or(0) as f64 / 1000.0;
            let asr_cost = crate::cost::estimate_asr_cost(&settings.api_base_url, &settings.model, asr_duration_sec);
            let polish_cost = if polish_tokens > 0 {
                crate::cost::estimate_polish_cost(&settings.ai_polish_api_url, &settings.ai_polish_model, polish_tokens)
            } else {
                0.0
            };

            let entry = NewHistoryEntry {
                text: text.clone(),
                model: settings.model.clone(),
                duration_ms,
                audio_path: None, // uploaded file not saved to disk
                status: STATUS_SUCCESS.to_string(),
                error_message: None,
                provider,
                api_base_url: settings.api_base_url.clone(),
                language: settings.language.clone(),
                retry_of: None,
                asr_duration_sec: Some(asr_duration_sec),
                polish_tokens: if polish_tokens > 0 { Some(polish_tokens) } else { None },
                estimated_cost: Some(asr_cost + polish_cost),
                polished_text: if final_text != text { Some(final_text.clone()) } else { None },
                recorded_at: 0,
            };

            if let Err(e) = history.add_entry(&entry) {
                log::error!("Failed to save history: {}", e);
            }
            let _ = history.cleanup_old_audio(settings.audio_retention_limit);
            let _ = app.emit("history-updated", ());

            Ok(final_text)
        }
        Err(e) => {
            log::error!("File transcription failed: {}", e);
            let error_msg = e.to_string();

            let entry = NewHistoryEntry {
                text: format!("转写失败: {}", &error_msg.chars().take(100).collect::<String>()),
                model: settings.model.clone(),
                duration_ms,
                audio_path: None, // uploaded file not saved to disk
                status: STATUS_FAILED.to_string(),
                error_message: Some(error_msg.clone()),
                provider,
                api_base_url: settings.api_base_url.clone(),
                language: settings.language.clone(),
                retry_of: None,
                asr_duration_sec: None,
                polish_tokens: None,
                estimated_cost: None,
                polished_text: None,
                recorded_at: 0,
            };

            let _ = history.add_entry(&entry);
            let _ = app.emit("history-updated", ());
            Err(error_msg)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_csv_field_normal() {
        assert_eq!(sanitize_csv_field("hello"), "hello");
    }

    #[test]
    fn test_sanitize_csv_field_formula_injection() {
        // Formula injection attempts should be prefixed with single quote
        assert_eq!(sanitize_csv_field("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
        assert_eq!(sanitize_csv_field("+SUM(A1)"), "'+SUM(A1)");
        assert_eq!(sanitize_csv_field("-SUM(A1)"), "'-SUM(A1)");
        assert_eq!(sanitize_csv_field("@SUM(A1)"), "'@SUM(A1)");
    }

    #[test]
    fn test_compare_versions() {
        assert_eq!(compare_versions("2.8.0", "2.7.1"), std::cmp::Ordering::Greater);
        assert_eq!(compare_versions("2.7.1", "2.7.1"), std::cmp::Ordering::Equal);
        assert_eq!(compare_versions("2.7.0", "2.7.1"), std::cmp::Ordering::Less);
        assert_eq!(compare_versions("v2.8.0", "v2.7.1"), std::cmp::Ordering::Greater);
        assert_eq!(compare_versions("2.8.0-beta", "2.7.1"), std::cmp::Ordering::Greater);
    }
}
