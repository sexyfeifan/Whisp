use crate::history::{HistoryEntry, HistoryManager, STATUS_SUCCESS};
use crate::paste::EnigoState;
use crate::settings::{self, AppSettings};
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
pub fn delete_history_entry(
    history: State<'_, Arc<HistoryManager>>,
    id: i64,
) -> Result<(), String> {
    history.delete_entry(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_history_entries(
    history: State<'_, Arc<HistoryManager>>,
    ids: Vec<i64>,
) -> Result<(), String> {
    history.delete_entries(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_history(history: State<'_, Arc<HistoryManager>>) -> Result<(), String> {
    history.clear_all().map_err(|e| e.to_string())
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
        crate::re_register_shortcut(&app, &old_settings.shortcut, &settings);
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
    crate::register_shortcut(&app, &settings);
    log::info!("Shortcuts resumed");
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
    let mut csv = String::from("id,timestamp,text,model,provider,language,status,duration_ms\n");
    for entry in entries {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            entry.id,
            entry.timestamp,
            csv_escape(&entry.text),
            csv_escape(&entry.model),
            csv_escape(&entry.provider),
            csv_escape(&entry.language),
            csv_escape(&entry.status),
            entry.duration_ms.map(|d| d.to_string()).unwrap_or_default()
        ));
    }
    Ok(csv)
}

fn csv_escape(field: &str) -> String {
    if field.contains(',') || field.contains('"') || field.contains('\n') || field.contains('\r') {
        format!("\"{}\"", field.replace('"', "\"\""))
    } else {
        field.to_string()
    }
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
    let audio_path = entry
        .audio_path
        .as_ref()
        .ok_or("No audio file for this entry")?;

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
        wav_data,
        lang,
        prompt,
        settings.request_timeout_sec,
        settings.retry_count,
    )
    .await
    .map_err(|e| e.to_string())?;

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
            Ok(result) => result.text,
            Err(e) => {
                log::warn!("Polish failed during retry, using original: {}", e);
                text.clone()
            }
        }
    } else {
        text.clone()
    };

    let provider = transcribe::provider_name(&settings.api_base_url);

    // Update entry in place (preserves ID and audio_path)
    history
        .update_entry(
            id,
            &polished_text,
            &settings.model,
            STATUS_SUCCESS,
            None,
            &provider,
            &settings.api_base_url,
            &settings.language,
        )
        .map_err(|e| e.to_string())?;

    // Copy + paste
    let _ = app.clipboard().write_text(&polished_text);
    if settings.auto_paste_enabled {
        crate::paste::simulate_paste(&app).ok();
    }

    let _ = app.emit("history-updated", ());

    Ok(text)
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

#[tauri::command]
pub async fn test_polish_connection(
    app: AppHandle,
    api_key: String,
    api_base_url: String,
    model: String,
) -> Result<(), String> {
    let client = app
        .try_state::<reqwest::Client>()
        .ok_or("HTTP client not initialized")?;
    crate::polish::validate_polish_key(&client, &api_key, &api_base_url, &model)
        .await
        .map_err(|e| e.to_string())
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
            match json.as_array().and_then(|arr| {
                arr.iter().find(|r| !r["draft"].as_bool().unwrap_or(false)).cloned()
            }) {
                Some(r) => r,
                None => continue,
            }
        };

        let tag = release["tag_name"].as_str().unwrap_or("");
        let latest = tag.trim_start_matches('v').to_string();
        let has_update = matches!(
            compare_versions(&latest, &current_version),
            std::cmp::Ordering::Greater
        );
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

#[tauri::command]
pub fn get_default_polish_prompt() -> String {
    crate::polish::DEFAULT_SYSTEM_PROMPT.to_string()
}

#[tauri::command]
pub fn export_settings_json() -> Result<String, String> {
    let s = settings::get_settings();
    let map = serde_json::json!({
        "api_base_url": s.api_base_url,
        "api_key": s.api_key,
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
        "launch_at_startup": s.launch_at_startup,
        "ai_polish_enabled": s.ai_polish_enabled,
        "ai_polish_api_url": s.ai_polish_api_url,
        "ai_polish_api_key": s.ai_polish_api_key,
        "ai_polish_model": s.ai_polish_model,
        "ai_polish_prompt": s.ai_polish_prompt,
        "audio_retention_limit": s.audio_retention_limit,
    });
    serde_json::to_string_pretty(&map).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_settings_json(app: AppHandle, json: String) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    let obj = value.as_object().ok_or("JSON must be an object")?;

    let mut s = settings::get_settings();

    if let Some(v) = obj.get("api_base_url").and_then(|v| v.as_str()) { s.api_base_url = v.to_string(); }
    if let Some(v) = obj.get("api_key").and_then(|v| v.as_str()) { s.api_key = v.to_string(); }
    if let Some(v) = obj.get("model").and_then(|v| v.as_str()) { s.model = v.to_string(); }
    if let Some(v) = obj.get("language").and_then(|v| v.as_str()) { s.language = v.to_string(); }
    if let Some(v) = obj.get("shortcut").and_then(|v| v.as_str()) { s.shortcut = v.to_string(); }
    if let Some(v) = obj.get("auto_paste_enabled").and_then(|v| v.as_bool()) { s.auto_paste_enabled = v; }
    if let Some(v) = obj.get("paste_delay_ms").and_then(|v| v.as_u64()) { s.paste_delay_ms = v; }
    if let Some(v) = obj.get("save_audio_files").and_then(|v| v.as_bool()) { s.save_audio_files = v; }
    if let Some(v) = obj.get("sound_enabled").and_then(|v| v.as_bool()) { s.sound_enabled = v; }
    if let Some(v) = obj.get("ui_language").and_then(|v| v.as_str()) { s.ui_language = v.to_string(); }
    if let Some(v) = obj.get("request_timeout_sec").and_then(|v| v.as_u64()) { s.request_timeout_sec = v; }
    if let Some(v) = obj.get("retry_count").and_then(|v| v.as_u64()) { s.retry_count = v as u8; }
    if let Some(v) = obj.get("silence_timeout_sec").and_then(|v| v.as_u64()) { s.silence_timeout_sec = v; }
    if let Some(v) = obj.get("silence_threshold").and_then(|v| v.as_f64()) { s.silence_threshold = v; }
    if let Some(v) = obj.get("trim_silence_enabled").and_then(|v| v.as_bool()) { s.trim_silence_enabled = v; }
    if let Some(v) = obj.get("whisper_prompt").and_then(|v| v.as_str()) { s.whisper_prompt = v.to_string(); }
    if let Some(v) = obj.get("launch_at_startup").and_then(|v| v.as_bool()) { s.launch_at_startup = v; }
    if let Some(v) = obj.get("ai_polish_enabled").and_then(|v| v.as_bool()) { s.ai_polish_enabled = v; }
    if let Some(v) = obj.get("ai_polish_api_url").and_then(|v| v.as_str()) { s.ai_polish_api_url = v.to_string(); }
    if let Some(v) = obj.get("ai_polish_api_key").and_then(|v| v.as_str()) { s.ai_polish_api_key = v.to_string(); }
    if let Some(v) = obj.get("ai_polish_model").and_then(|v| v.as_str()) { s.ai_polish_model = v.to_string(); }
    if let Some(v) = obj.get("ai_polish_prompt").and_then(|v| v.as_str()) { s.ai_polish_prompt = v.to_string(); }
    if let Some(v) = obj.get("audio_retention_limit").and_then(|v| v.as_u64()) { s.audio_retention_limit = v as usize; }

    let old_settings = settings::get_settings();
    settings::save_settings(&s).map_err(|e| e.to_string())?;

    if s.shortcut != old_settings.shortcut {
        crate::re_register_shortcut(&app, &old_settings.shortcut, &s);
    }

    log::info!("Settings imported successfully");
    Ok("Settings imported successfully".to_string())
}

#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    url: String,
    filename: String,
) -> Result<String, String> {
    use std::io::Write;

    let client = app
        .try_state::<reqwest::Client>()
        .map(|s| (*s).clone())
        .unwrap_or_else(|| reqwest::Client::new());

    log::info!("Downloading update from: {}", url);

    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(300))
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

    let temp_dir = std::env::temp_dir().join("whisp_update");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let file_path = temp_dir.join(&filename);
    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    log::info!("Update downloaded to: {}", file_path.display());

    #[cfg(target_os = "macos")]
    {
        if filename.ends_with(".dmg") {
            let output = std::process::Command::new("hdiutil")
                .args(["attach", "-nobrowse", &file_path.to_string_lossy()])
                .output()
                .map_err(|e| format!("Failed to mount DMG: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to mount DMG: {}", stderr));
            }

            std::thread::sleep(std::time::Duration::from_secs(2));

            // Find the .app in the mounted volume
            let mount_output = std::process::Command::new("hdiutil")
                .args(["info", "-plist"])
                .output()
                .map_err(|e| format!("Failed to get mount info: {}", e))?;

            // Try to open the volume
            let volume_name = filename.strip_suffix(".dmg").unwrap_or(&filename);
            let volume_path = format!("/Volumes/{}", volume_name);
            let _ = std::process::Command::new("open")
                .arg(&volume_path)
                .spawn();

            return Ok(format!(
                "Update downloaded and mounted. Please drag Whisp to Applications to complete the update."
            ));
        }

        let _ = std::process::Command::new("open")
            .arg(&file_path)
            .spawn();
        return Ok("Update downloaded and opened.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args([
                "/C",
                "start",
                "",
                &file_path.to_string_lossy().to_string(),
            ])
            .spawn();
        return Ok(
            "Update installer launched. Please follow the installation prompts.".to_string()
        );
    }

    #[cfg(target_os = "linux")]
    {
        return Ok(format!(
            "Update downloaded to: {}",
            file_path.display()
        ));
    }
}
