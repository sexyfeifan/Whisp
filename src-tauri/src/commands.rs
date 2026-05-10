use crate::history::{HistoryEntry, HistoryManager, STATUS_SUCCESS};
use crate::paste::EnigoState;
use crate::settings::{self, AppSettings};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

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
        let text_escaped = entry.text.replace('"', "\"\"");
        csv.push_str(&format!(
            "{},{},\"{}\",{},{},{},{},{}\n",
            entry.id,
            entry.timestamp,
            text_escaped,
            entry.model,
            entry.provider,
            entry.language,
            entry.status,
            entry.duration_ms.map(|d| d.to_string()).unwrap_or_default()
        ));
    }
    Ok(csv)
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
