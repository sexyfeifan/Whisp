use crate::history::{HistoryEntry, HistoryManager, STATUS_SUCCESS};
use crate::paste::EnigoState;
use crate::settings::{self, AppSettings};
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

    let provider = transcribe::provider_name(&settings.api_base_url);

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
        )
        .map_err(|e| e.to_string())?;

    // Copy + paste
    let _ = app.clipboard().write_text(&text);
    if settings.auto_paste_enabled {
        crate::paste::simulate_paste(&app).ok();
    }

    let _ = app.emit("history-updated", ());

    Ok(text)
}

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
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
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let github_repo = "sexyfeifan/Whisp";
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        github_repo
    );

    let client = app
        .try_state::<reqwest::Client>()
        .map(|s| (*s).clone())
        .unwrap_or_else(|| reqwest::Client::new());

    match client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", format!("Whisp/{}", current_version))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                let tag = json["tag_name"].as_str().unwrap_or("");
                let latest = tag.trim_start_matches('v').to_string();
                let has_update = matches!(
                    compare_versions(&latest, &current_version),
                    std::cmp::Ordering::Greater
                );
                let release_url = json["html_url"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let release_notes = json["body"].as_str().unwrap_or("").to_string();
                let published_at = json["published_at"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let assets: Vec<ReleaseAsset> = json["assets"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .map(|a| ReleaseAsset {
                                name: a["name"].as_str().unwrap_or("").to_string(),
                                url: a["browser_download_url"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_string(),
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
                error: "Failed to parse response".to_string(),
            }
        }
        Ok(resp) => UpdateInfo {
            has_update: false,
            current_version,
            latest_version: String::new(),
            release_url: String::new(),
            release_notes: String::new(),
            published_at: String::new(),
            assets: vec![],
            error: format!("HTTP {}", resp.status()),
        },
        Err(e) => UpdateInfo {
            has_update: false,
            current_version,
            latest_version: String::new(),
            release_url: String::new(),
            release_notes: String::new(),
            published_at: String::new(),
            assets: vec![],
            error: e.to_string(),
        },
    }
}
