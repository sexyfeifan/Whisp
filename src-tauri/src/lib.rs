mod commands;
mod history;
mod hotkey;
pub mod paste;
mod permissions;
mod recorder;
mod settings;
mod sound;
mod transcribe;

use history::{HistoryManager, NewHistoryEntry, STATUS_FAILED, STATUS_SUCCESS};
use recorder::{encode_wav, trim_silence, AudioRecorder};
use settings::AppSettings;
#[cfg(target_os = "macos")]
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
#[cfg(target_os = "macos")]
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// ~/.nanowhisper/
pub fn data_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot determine home directory");
    home.join(".nanowhisper")
}

// Named constants
const OVERLAY_WIDTH: f64 = 320.0;
const OVERLAY_HEIGHT: f64 = 48.0;
const OVERLAY_BOTTOM_OFFSET: f64 = 80.0;
const SILENCE_TRIM_THRESHOLD: f32 = 0.015;
const SILENCE_TRIM_PADDING_MS: u32 = 120;
const MIN_TRANSCRIBE_MS: i64 = 300;

fn tr(ui_language: &str, zh: &str, en: &str, ja: &str) -> String {
    match ui_language {
        "en" => en.to_string(),
        "ja" => ja.to_string(),
        _ => zh.to_string(),
    }
}

#[cfg(target_os = "macos")]
fn to_white_icon(icon: &tauri::image::Image<'_>) -> tauri::image::Image<'static> {
    fn color_dist_sq(a: (u8, u8, u8), b: (u8, u8, u8)) -> u32 {
        let dr = a.0 as i32 - b.0 as i32;
        let dg = a.1 as i32 - b.1 as i32;
        let db = a.2 as i32 - b.2 as i32;
        (dr * dr + dg * dg + db * db) as u32
    }

    fn dominant_opaque_color(rgba: &[u8]) -> Option<(u8, u8, u8)> {
        let mut bins = [0u32; 16 * 16 * 16];
        for px in rgba.chunks_exact(4) {
            let alpha = px[3];
            if alpha < 220 {
                continue;
            }
            let r = (px[0] >> 4) as usize;
            let g = (px[1] >> 4) as usize;
            let b = (px[2] >> 4) as usize;
            bins[(r << 8) | (g << 4) | b] += 1;
        }
        let (idx, count) = bins
            .iter()
            .enumerate()
            .max_by_key(|(_, c)| *c)
            .unwrap_or((0, &0));
        if *count == 0 {
            return None;
        }
        let r = (((idx >> 8) & 0xF) as u8) * 16 + 8;
        let g = (((idx >> 4) & 0xF) as u8) * 16 + 8;
        let b = ((idx & 0xF) as u8) * 16 + 8;
        Some((r, g, b))
    }

    let mut rgba = icon.rgba().to_vec();
    let width = icon.width() as usize;
    let height = icon.height() as usize;
    let pixel_count = width * height;
    let mut is_background = vec![false; pixel_count];
    let background_color = dominant_opaque_color(&rgba).unwrap_or((255, 255, 255));
    let bg_tolerance_sq = 45 * 45;

    let is_background_candidate = |idx: usize, rgba_data: &[u8]| -> bool {
        let base = idx * 4;
        let alpha = rgba_data[base + 3];
        if alpha <= 24 {
            return true;
        }
        if alpha < 200 {
            return false;
        }
        let color = (rgba_data[base], rgba_data[base + 1], rgba_data[base + 2]);
        color_dist_sq(color, background_color) <= bg_tolerance_sq
    };

    let mut queue = VecDeque::new();
    for y in 0..height {
        for x in [0, width - 1] {
            let idx = y * width + x;
            if !is_background[idx] && is_background_candidate(idx, &rgba) {
                is_background[idx] = true;
                queue.push_back(idx);
            }
        }
    }
    for x in 0..width {
        for y in [0, height - 1] {
            let idx = y * width + x;
            if !is_background[idx] && is_background_candidate(idx, &rgba) {
                is_background[idx] = true;
                queue.push_back(idx);
            }
        }
    }

    while let Some(idx) = queue.pop_front() {
        let x = idx % width;
        let y = idx / width;
        let neighbors = [
            (x.wrapping_sub(1), y, x > 0),
            (x + 1, y, x + 1 < width),
            (x, y.wrapping_sub(1), y > 0),
            (x, y + 1, y + 1 < height),
        ];
        for (nx, ny, valid) in neighbors {
            if !valid {
                continue;
            }
            let nidx = ny * width + nx;
            if !is_background[nidx] && is_background_candidate(nidx, &rgba) {
                is_background[nidx] = true;
                queue.push_back(nidx);
            }
        }
    }

    for (idx, pixel) in rgba.chunks_exact_mut(4).enumerate() {
        if is_background[idx] {
            pixel[0] = 0;
            pixel[1] = 0;
            pixel[2] = 0;
            pixel[3] = 0;
            continue;
        }
        if pixel[3] > 0 {
            pixel[0] = 255;
            pixel[1] = 255;
            pixel[2] = 255;
            pixel[3] = pixel[3].max(120);
        }
    }
    tauri::image::Image::new_owned(rgba, icon.width(), icon.height())
}

pub fn run() {
    // Load .env file if present (for development)
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_history,
            commands::delete_history_entry,
            commands::clear_history,
            commands::get_settings,
            commands::save_settings,
            commands::check_accessibility,
            commands::request_accessibility,
            commands::check_microphone,
            commands::request_microphone,
            commands::initialize_enigo,
            commands::validate_api_key,
            commands::retry_transcription,
            commands::save_overlay_position,
            commands::pause_shortcut,
            commands::resume_shortcut,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize history manager
            let history_manager =
                Arc::new(HistoryManager::new().expect("Failed to init history DB"));
            app.manage(history_manager.clone());

            // Initialize audio recorder
            let recorder = Arc::new(AudioRecorder::new());
            app.manage(recorder.clone());

            // Initialize shared HTTP client
            let http_client = reqwest::Client::new();
            app.manage(http_client);

            // Initialize enigo if accessibility is already granted
            if paste::is_accessibility_trusted() {
                if let Ok(enigo_state) = paste::EnigoState::new() {
                    app.manage(enigo_state);
                }
            }

            // Create main window
            let _main_window =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("/".into()))
                    .title("Whisp")
                    .inner_size(420.0, 680.0)
                    .min_inner_size(380.0, 400.0)
                    .resizable(true)
                    .maximizable(false)
                    .visible(false)
                    .build()?;

            // System tray
            let show_i = tauri::menu::MenuItem::with_id(
                app,
                "show",
                "Show Whisp",
                true,
                None::<&str>,
            )?;
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_i, &separator, &quit_i])?;

            let mut tray_icon = app
                .default_window_icon()
                .cloned()
                .expect("No default window icon configured")
                .to_owned();
            #[cfg(target_os = "macos")]
            {
                tray_icon = to_white_icon(&tray_icon);
            }

            tauri::tray::TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .icon_as_template(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Start native hotkey monitor (Right Command on macOS, Right Ctrl on Windows)
            // hotkey.rs already has its own 500ms debounce, so we only need the CAS guard here.
            let hotkey_handle = app_handle.clone();
            hotkey::start(move || {
                if SHORTCUT_PROCESSING
                    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                    .is_err()
                {
                    return;
                }

                log::info!("Native hotkey triggered");
                let h = hotkey_handle.clone();
                std::thread::spawn(move || {
                    toggle_recording(&h);
                    SHORTCUT_PROCESSING.store(false, Ordering::SeqCst);
                });
            });

            // Register global shortcut (secondary, user-configurable)
            let settings = settings::get_settings();
            register_shortcut(&app_handle, &settings);

            // Show main window
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
            }

            log::info!("App started. Shortcut: {}", settings.shortcut);
            log::info!("API key configured: {}", !settings.api_key.is_empty());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (&app, &event);
            }
        });
}

static SHORTCUT_PROCESSING: AtomicBool = AtomicBool::new(false);
static LAST_SHORTCUT_TIME: AtomicU64 = AtomicU64::new(0);
const DEBOUNCE_MS: u64 = 500;
#[cfg(target_os = "macos")]
static LAST_FRONTMOST_APP_BUNDLE_ID: Mutex<Option<String>> = Mutex::new(None);

pub fn register_shortcut(app_handle: &tauri::AppHandle, settings: &AppSettings) {
    let shortcut_str = &settings.shortcut;
    if shortcut_str.is_empty() {
        return; // No custom shortcut configured; native hotkey only
    }
    let shortcut: Shortcut = match shortcut_str.parse() {
        Ok(s) => s,
        Err(e) => {
            log::error!("Invalid shortcut '{}': {}", shortcut_str, e);
            return;
        }
    };

    let handle = app_handle.clone();
    let _ = app_handle
        .global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                // Debounce: ignore duplicate events within 500ms
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                let last = LAST_SHORTCUT_TIME.load(Ordering::SeqCst);
                if now - last < DEBOUNCE_MS {
                    return;
                }
                LAST_SHORTCUT_TIME.store(now, Ordering::SeqCst);

                // CAS guard: prevent concurrent toggle
                if SHORTCUT_PROCESSING
                    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                    .is_err()
                {
                    return;
                }

                log::info!("Shortcut triggered");
                let h = handle.clone();
                std::thread::spawn(move || {
                    toggle_recording(&h);
                    SHORTCUT_PROCESSING.store(false, Ordering::SeqCst);
                });
            }
        });
}

/// Unregister old shortcut and register new one (called when settings change)
pub fn re_register_shortcut(
    app_handle: &tauri::AppHandle,
    old_shortcut_str: &str,
    new_settings: &AppSettings,
) {
    // Unregister old shortcut
    if let Ok(old) = old_shortcut_str.parse::<Shortcut>() {
        let _ = app_handle.global_shortcut().unregister(old);
        log::info!("Unregistered old shortcut: {}", old_shortcut_str);
    }
    // Register new shortcut
    register_shortcut(app_handle, new_settings);
    log::info!("Registered new shortcut: {}", new_settings.shortcut);
}

fn register_escape(app_handle: &tauri::AppHandle) {
    let escape: Shortcut = "Escape".parse().unwrap();
    let handle = app_handle.clone();
    let _ = app_handle
        .global_shortcut()
        .on_shortcut(escape, move |_app, _shortcut, event| {
            if event.state != ShortcutState::Released {
                log::info!("Escape triggered");
                let h = handle.clone();
                std::thread::spawn(move || {
                    cancel_recording(&h);
                });
            }
        });
}

fn unregister_escape(app_handle: &tauri::AppHandle) {
    if let Ok(escape) = "Escape".parse::<Shortcut>() {
        let _ = app_handle.global_shortcut().unregister(escape);
    }
}

fn toggle_recording(app_handle: &tauri::AppHandle) {
    let recorder = app_handle.state::<Arc<AudioRecorder>>();

    if recorder.is_recording() {
        log::info!("Stopping recording...");
        stop_and_transcribe(app_handle);
    } else {
        log::info!("Starting recording...");
        start_recording(app_handle);
    }
}

fn start_recording(app_handle: &tauri::AppHandle) {
    let recorder = app_handle.state::<Arc<AudioRecorder>>();
    #[cfg(target_os = "macos")]
    if let Some(bundle_id) = paste::capture_frontmost_app_bundle_id() {
        if let Ok(mut guard) = LAST_FRONTMOST_APP_BUNDLE_ID.lock() {
            *guard = Some(bundle_id);
        }
    }

    // Use saved overlay position, or default to bottom-center of screen
    let saved = settings::get_settings();
    let (pos_x, pos_y) = if let (Some(x), Some(y)) = (saved.overlay_x, saved.overlay_y) {
        (x, y)
    } else if let Some(monitor) = app_handle.primary_monitor().ok().flatten() {
        let scale = monitor.scale_factor();
        let monitor_width = monitor.size().width as f64 / scale;
        let monitor_height = monitor.size().height as f64 / scale;
        let x = (monitor_width - OVERLAY_WIDTH) / 2.0;
        let y = monitor_height - OVERLAY_HEIGHT - OVERLAY_BOTTOM_OFFSET;
        (x, y)
    } else {
        (400.0, 800.0)
    };

    // Hide main window to prevent it from appearing when overlay activates the app
    if let Some(w) = app_handle.get_webview_window("main") {
        let _ = w.hide();
    }

    match tauri::WebviewWindowBuilder::new(
        app_handle,
        "overlay",
        tauri::WebviewUrl::App("/src/overlay/index.html".into()),
    )
    .title("")
    .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
    .position(pos_x, pos_y)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .focused(false)
    .accept_first_mouse(true)
    .build()
    {
        Ok(_) => {
            log::info!("Overlay window created");
        }
        Err(e) => log::error!("Failed to create overlay: {}", e),
    }

    // Play start sound BEFORE opening mic (blocking) so it won't be recorded
    if saved.sound_enabled {
        sound::play_start_sound();
    }

    if let Err(e) = recorder.start(app_handle.clone()) {
        log::error!("Failed to start recording: {}", e);
        close_overlay(app_handle);
        return;
    }
    log::info!("Recording started");

    // Register Escape only while recording
    register_escape(app_handle);
}

fn stop_and_transcribe(app_handle: &tauri::AppHandle) {
    unregister_escape(app_handle);

    let recorder = app_handle.state::<Arc<AudioRecorder>>();
    let history = app_handle.state::<Arc<HistoryManager>>();

    // Notify overlay
    let _ = app_handle.emit("transcribing", ());

    let audio = match recorder.stop() {
        Ok(a) => a,
        Err(e) => {
            log::error!("Failed to stop recording: {}", e);
            close_overlay(app_handle);
            return;
        }
    };
    log::info!(
        "Got {} samples at {}Hz",
        audio.samples.len(),
        audio.sample_rate
    );

    let settings = settings::get_settings();

    // Play stop sound AFTER mic is closed (async, won't be recorded)
    if settings.sound_enabled {
        sound::play_stop_sound();
    }

    let processed_audio = if settings.trim_silence_enabled {
        trim_silence(&audio, SILENCE_TRIM_THRESHOLD, SILENCE_TRIM_PADDING_MS)
    } else {
        audio
    };

    let sample_count = processed_audio.samples.len();
    let sample_rate = processed_audio.sample_rate;
    let duration_ms = if sample_rate > 0 {
        Some((sample_count as i64 * 1000) / sample_rate as i64)
    } else {
        None
    };

    if duration_ms.unwrap_or_default() < MIN_TRANSCRIBE_MS {
        log::warn!("Recording too short after processing");
        close_overlay(app_handle);
        let _ = app_handle.emit(
            "transcription-error",
            tr(
                &settings.ui_language,
                "录音太短了，请稍微多说一点。",
                "Recording too short. Try speaking a little longer.",
                "録音が短すぎます。もう少し長く話してください。",
            ),
        );
        return;
    }

    let wav_data = match encode_wav(&processed_audio) {
        Ok(d) => d,
        Err(e) => {
            log::error!("Failed to encode WAV: {}", e);
            close_overlay(app_handle);
            return;
        }
    };
    log::info!("WAV size: {} bytes", wav_data.len());

    let audio_path_str = if settings.save_audio_files {
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S%.3f").to_string();
        let audio_filename = format!("{}.wav", timestamp);
        let audio_path = history.audio_dir().join(&audio_filename);
        if let Err(e) = std::fs::write(&audio_path, &wav_data) {
            log::error!("Failed to save audio file: {}", e);
            None
        } else {
            log::info!("Audio saved: {}", audio_path.display());
            Some(audio_path.to_string_lossy().to_string())
        }
    } else {
        None
    };

    if settings.api_key.is_empty() {
        log::error!("API key not configured!");
        close_overlay(app_handle);
        let _ = app_handle.emit(
            "transcription-error",
            tr(
                &settings.ui_language,
                "尚未配置 API Key，请打开设置完成配置。",
                "API key not configured. Open settings to finish setup.",
                "API キーが未設定です。設定を開いて完了してください。",
            ),
        );
        if let Some(w) = app_handle.get_webview_window("main") {
            let _ = w.show();
            let _ = w.set_focus();
        }
        return;
    }

    let handle = app_handle.clone();
    let history = history.inner().clone();
    let model = settings.model.clone();
    let language = settings.language.clone();
    let api_key = settings.api_key.clone();
    let api_base_url = settings.api_base_url.clone();
    let provider = transcribe::provider_name(&api_base_url);
    let auto_paste_enabled = settings.auto_paste_enabled;
    let paste_delay_ms = settings.paste_delay_ms;
    let request_timeout_sec = settings.request_timeout_sec;
    let retry_count = settings.retry_count;
    let http_client = app_handle.state::<reqwest::Client>().inner().clone();

    log::info!("Calling API with model={} via {}...", model, api_base_url);

    tauri::async_runtime::spawn(async move {
        let lang = if language == "auto" {
            None
        } else {
            Some(language.as_str())
        };

        match transcribe::transcribe_audio(
            &http_client,
            &api_key,
            &api_base_url,
            &model,
            wav_data,
            lang,
            request_timeout_sec,
            retry_count,
        )
        .await
        {
            Ok(text) => {
                log::info!("Transcription: {}", text);

                // Copy to clipboard and auto-paste into active app
                let _ = handle.clipboard().write_text(&text);
                close_overlay(&handle);

                if auto_paste_enabled {
                    let target_bundle_id: Option<String> = {
                        #[cfg(target_os = "macos")]
                        {
                            LAST_FRONTMOST_APP_BUNDLE_ID
                                .lock()
                                .ok()
                                .and_then(|mut guard| guard.take())
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            None
                        }
                    };
                    let paste_handle = handle.clone();
                    std::thread::spawn(move || {
                        #[cfg(target_os = "macos")]
                        if let Some(bundle_id) = target_bundle_id.as_deref() {
                            if let Err(e) = paste::activate_app_by_bundle_id(bundle_id) {
                                log::warn!("Failed to reactivate target app: {}", e);
                            }
                            std::thread::sleep(Duration::from_millis(120));
                        }
                        std::thread::sleep(Duration::from_millis(paste_delay_ms.max(50)));
                        if let Err(e) = paste::simulate_paste(&paste_handle) {
                            log::error!("Paste failed: {}", e);
                        }
                    });
                }

                let entry = NewHistoryEntry {
                    text: text.clone(),
                    model: model.clone(),
                    duration_ms,
                    audio_path: audio_path_str.clone(),
                    status: STATUS_SUCCESS.to_string(),
                    error_message: None,
                    provider: provider.clone(),
                    api_base_url: api_base_url.clone(),
                    language: language.clone(),
                    retry_of: None,
                };
                let _ = history.add_entry(&entry);
            }
            Err(e) => {
                log::error!("Transcription failed: {}", e);

                let error_message = e.to_string();
                let entry = NewHistoryEntry {
                    text: "Transcription failed".to_string(),
                    model: model.clone(),
                    duration_ms,
                    audio_path: audio_path_str.clone(),
                    status: STATUS_FAILED.to_string(),
                    error_message: Some(error_message.clone()),
                    provider: provider.clone(),
                    api_base_url: api_base_url.clone(),
                    language: language.clone(),
                    retry_of: None,
                };
                let _ = history.add_entry(&entry);

                let _ = handle.emit("transcription-error", error_message);
            }
        }

        close_overlay(&handle);
        // Notify main window to refresh (both success and failure)
        let _ = handle.emit("history-updated", ());
    });
}

fn cancel_recording(app_handle: &tauri::AppHandle) {
    let recorder = app_handle.state::<Arc<AudioRecorder>>();
    if recorder.is_recording() {
        log::info!("Cancelling recording...");
        unregister_escape(app_handle);
        recorder.cancel();
        close_overlay(app_handle);
    }
}

fn close_overlay(app_handle: &tauri::AppHandle) {
    if let Some(w) = app_handle.get_webview_window("overlay") {
        let _ = w.close();
    }
}
