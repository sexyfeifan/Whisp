mod commands;
mod cost;
mod diarization;
mod history;
mod hotkey;
pub mod log_buffer;
pub mod paste;
mod permissions;
mod plugin;
mod polish;
mod recorder;
mod settings;
mod shortcut;
mod sound;
mod streaming;
mod summary;
mod sync;
mod transcribe;
mod translate;
mod tray;
mod whisper;

use history::{HistoryManager, NewHistoryEntry, STATUS_FAILED, STATUS_SUCCESS};
use recorder::{encode_wav, trim_silence, AudioRecorder};
use shortcut::SHORTCUT_PROCESSING;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Listener, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;

// Note: The `unwrap_or_else(|e| e.into_inner())` pattern is used throughout
// this codebase to recover poisoned Mutex guards. While this means we continue
// with potentially inconsistent state after a panic, all writes are idempotent
// (settings overwrites, history DB transactions) so the risk is minimal.
// Panics that poison Mutexes are logged at the point of occurrence.

/// Recursively copy a directory (fallback when rename() fails across filesystems).
fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// ~/.whisp/ (migrated from ~/.nanowhisper/)
pub fn data_dir() -> PathBuf {
    let home = dirs::home_dir().expect("Cannot determine home directory");
    let new_dir = home.join(".whisp");
    let old_dir = home.join(".nanowhisper");

    // Migrate from old directory if new doesn't exist but old does
    if !new_dir.exists() && old_dir.exists() {
        match std::fs::rename(&old_dir, &new_dir) {
            Ok(_) => {
                log::info!("Migrated data directory from ~/.nanowhisper to ~/.whisp");
            }
            Err(e) => {
                log::warn!(
                    "Rename migration failed (possibly cross-filesystem): {}. Trying copy+delete...",
                    e
                );
                // Fallback: copy files then delete old directory
                if let Err(e2) = copy_dir_recursive(&old_dir, &new_dir) {
                    log::warn!("Copy migration also failed: {}. Using old directory.", e2);
                    return old_dir;
                }
                let _ = std::fs::remove_dir_all(&old_dir);
                log::info!("Migrated data directory via copy from ~/.nanowhisper to ~/.whisp");
            }
        }
    }

    new_dir
}

// Named constants
const OVERLAY_WIDTH: f64 = 420.0;
const OVERLAY_HEIGHT: f64 = 80.0;
const OVERLAY_BOTTOM_OFFSET: f64 = 80.0;
const SILENCE_TRIM_THRESHOLD: f32 = 0.015;
const SILENCE_TRIM_PADDING_MS: u32 = 400;
const MIN_TRANSCRIBE_MS: i64 = 100;

// Pending audio for waveform preview flow.
// When preview mode is enabled, recording stops here instead of auto-transcribing.
// The user sees a waveform preview and can confirm or discard.
static PENDING_AUDIO: std::sync::OnceLock<Mutex<Option<PendingAudio>>> = std::sync::OnceLock::new();

struct PendingAudio {
    wav_data: Vec<u8>,
    samples: Vec<f32>,
    sample_rate: u32,
    duration_ms: i64,
    audio_path: Option<String>,
}

/// Timestamp (Unix epoch seconds) when the current recording started.
/// Used to set `recorded_at` in history entries so the displayed time matches
/// when the user actually spoke, not when the transcription completed.
static RECORDING_START_TIME: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

fn tr(ui_language: &str, zh: &str, en: &str, ja: &str) -> String {
    match ui_language {
        "en" => en.to_string(),
        "ja" => ja.to_string(),
        _ => zh.to_string(),
    }
}

pub fn run() {
    log_buffer::init();
    // Load .env file if present (for development)
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::get_history,
            commands::get_history_page,
            commands::delete_history_entry,
            commands::delete_history_entries,
            commands::clear_history,
            commands::search_history,
            commands::search_fulltext,
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
            commands::list_global_shortcuts,
            commands::set_global_record_hotkey,
            commands::clear_global_record_hotkey,
            commands::export_history,
            commands::export_history_srt,
            commands::export_history_markdown,
            commands::export_transcription,
            commands::save_export_to_file,
            commands::generate_summary,
            commands::start_streaming_recording,
            commands::stop_streaming_recording,
            commands::toggle_autostart,
            commands::check_for_updates,
            commands::polish_text,
            commands::translate_text,
            commands::get_logs,
            commands::clear_logs,
            commands::read_audio_file,
            commands::batch_transcribe,
            commands::get_default_polish_prompt,
            commands::download_and_install_update,
            commands::export_settings_json,
            commands::import_settings_json,
            commands::get_whisper_config,
            commands::set_whisper_config,
            commands::list_whisper_models,
            commands::check_whisper_model,
            commands::get_whisper_model_dir,
            commands::transcribe_offline,
            commands::list_offline_models,
            commands::list_known_models,
            commands::download_whisper_model,
            commands::delete_model,
            commands::get_model_disk_usage,
            commands::get_pricing_config,
            commands::save_pricing_config,
            commands::reset_pricing_config,
            commands::get_pending_waveform,
            commands::confirm_pending_transcription,
            commands::transcribe_file,
            commands::discard_pending_recording,
            commands::trigger_sync,
            commands::get_sync_status,
            commands::export_full_backup,
            commands::import_full_backup,
            commands::list_plugins,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize history manager with graceful degradation.
            // If the DB is corrupted, attempt to delete and recreate it once.
            let history_manager = Arc::new(HistoryManager::new().unwrap_or_else(|e| {
                log::error!("Failed to init history DB: {}. Attempting recovery...", e);
                let db_path = data_dir().join("history.db");
                if db_path.exists() {
                    let _ = std::fs::remove_file(&db_path);
                    let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
                    let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
                    log::warn!("Removed corrupted history DB (+WAL/SHM), recreating...");
                }
                HistoryManager::new().expect("Failed to init history DB even after recovery")
            }));
            app.manage(history_manager.clone());

            // Initialize audio recorder
            let recorder = Arc::new(AudioRecorder::new());
            app.manage(recorder.clone());

            // Initialize shared HTTP client
            let http_client = reqwest::Client::builder()
                .timeout(Duration::from_secs(300))
                .build()
                .expect("Failed to build HTTP client");
            app.manage(http_client);

            // Initialize enigo if accessibility is already granted
            if paste::is_accessibility_trusted() {
                if let Ok(enigo_state) = paste::EnigoState::new() {
                    app.manage(enigo_state);
                }
            }

            // Create main window
            let _main_window = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("/".into()))
                .title("Whisp")
                .inner_size(960.0, 640.0)
                .resizable(true)
                .maximizable(false)
                .visible(false)
                .build()?;

            // Apply saved launch-at-startup setting
            {
                let saved = settings::get_settings();
                let autolaunch = app.autolaunch();
                if saved.launch_at_startup {
                    let _ = autolaunch.enable();
                } else {
                    let _ = autolaunch.disable();
                }
            }

            // System tray
            let show_i = tauri::menu::MenuItem::with_id(app, "show", "Show Whisp", true, None::<&str>)?;
            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;

            // Build recent-history menu items (up to 5)
            let recent_entries = history_manager.get_entries().unwrap_or_default();
            let recent: Vec<_> = recent_entries.into_iter().take(5).collect();
            let recent_texts: Arc<Mutex<Vec<String>>> =
                Arc::new(Mutex::new(recent.iter().map(|e| e.text.clone()).collect()));
            app.manage(tray::TrayRecentTexts(recent_texts.clone()));

            let mut menu_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> =
                vec![Box::new(show_i), Box::new(separator)];
            for (i, entry) in recent.iter().enumerate() {
                let label: String = entry.text.chars().take(40).collect();
                let label = if entry.text.chars().count() > 40 {
                    format!("{}…", label)
                } else {
                    label
                };
                let label = label.replace('&', "&amp;").replace('<', "&lt;");
                let item = tauri::menu::MenuItem::with_id(app, format!("history_{}", i), label, true, None::<&str>)?;
                menu_items.push(Box::new(item));
            }
            let sep2 = tauri::menu::PredefinedMenuItem::separator(app)?;
            menu_items.push(Box::new(sep2));
            menu_items.push(Box::new(quit_i));

            let menu_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
                menu_items.iter().map(|b| b.as_ref()).collect();
            let menu = tauri::menu::Menu::with_items(app, &menu_refs)?;

            let tray_recent = recent_texts.clone();

            // Use orb icon frame 0 as default idle tray icon (purple orb, looks better than monochrome template)
            let tray_icon = {
                let bytes = include_bytes!("../icons/tray_orb_0.png");
                tauri::image::Image::from_bytes(bytes).expect("Failed to load orb tray icon")
            };

            tauri::tray::TrayIconBuilder::with_id("main")
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
                    id if id.starts_with("history_") => {
                        if let Ok(idx) = id["history_".len()..].parse::<usize>() {
                            let texts = tray_recent.lock().unwrap_or_else(|e| e.into_inner());
                            if let Some(text) = texts.get(idx) {
                                let _ = app.clipboard().write_text(text);
                                let settings = settings::get_settings();
                                if settings.auto_paste_enabled {
                                    crate::paste::simulate_paste(app).ok();
                                }
                            }
                        }
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
            shortcut::register_shortcut(&app_handle, &settings);

            // Register global record hotkey (Ctrl+Shift+R from any app)
            if settings.global_hotkey_enabled && !settings.global_hotkey.is_empty() {
                if let Err(e) = shortcut::register_global_record_hotkey(&app_handle, &settings.global_hotkey) {
                    log::error!("Failed to register global record hotkey: {}", e);
                }
            }

            // Listen for silence auto-stop from recorder worker
            let silence_handle = app_handle.clone();
            app_handle.listen("silence-auto-stop", move |_| {
                let h = silence_handle.clone();
                let _ = h.emit("silence-stopping", ());
                std::thread::spawn(move || {
                    stop_and_transcribe(&h);
                });
            });

            // Rebuild tray menu when history changes
            let tray_handle = app_handle.clone();
            app_handle.listen("history-updated", move |_| {
                tray::rebuild_tray_menu(&tray_handle);
            });

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

static TRANSCRIBING: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "macos")]
static LAST_FRONTMOST_APP_BUNDLE_ID: Mutex<Option<String>> = Mutex::new(None);

/// Cached orb tray icon frame 0 (used as initial icon before animation thread starts)
static ORB_ICON_0: std::sync::OnceLock<tauri::image::Image<'static>> = std::sync::OnceLock::new();

pub(crate) fn toggle_recording(app_handle: &tauri::AppHandle) {
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

    let overlay_url = format!(
        "/src/overlay/index.html?lang={}&subtitleStyle={}",
        saved.ui_language, saved.overlay_subtitle_style
    );
    match tauri::WebviewWindowBuilder::new(app_handle, "overlay", tauri::WebviewUrl::App(overlay_url.into()))
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

    if let Err(e) = recorder.start(
        app_handle.clone(),
        saved.silence_timeout_sec,
        saved.silence_threshold as f32,
    ) {
        log::error!("Failed to start recording: {}", e);
        let _ = app_handle.emit(
            "transcription-error",
            tr(
                &saved.ui_language,
                "麦克风启动失败，请检查权限设置。",
                "Failed to start microphone. Check permission settings.",
                "マイクの起動に失敗しました。権限設定を確認してください。",
            ),
        );
        close_overlay(app_handle);
        return;
    }
    log::info!("Recording started, model={}", saved.model);

    // Record the actual moment the user started speaking
    RECORDING_START_TIME.store(chrono::Utc::now().timestamp(), std::sync::atomic::Ordering::Relaxed);

    // Update tray to show recording state with orb icon (animation thread will cycle frames)
    if let Some(tray) = app_handle.tray_by_id("main") {
        let _ = tray.set_tooltip(Some("● Recording..."));
        let orb_icon = ORB_ICON_0.get_or_init(|| {
            let bytes = include_bytes!("../icons/tray_orb_0.png");
            tauri::image::Image::from_bytes(bytes).expect("Failed to load orb icon")
        });
        let _ = tray.set_icon(Some(orb_icon.clone()));
        let _ = tray.set_icon_as_template(false);
    }

    // Animate tray icon with orb pulse frames during recording
    let tray_anim_handle = app_handle.clone();
    std::thread::spawn(move || {
        let frames: Vec<tauri::image::Image> = (0..8)
            .map(|i| {
                let bytes: &[u8] = match i {
                    0 => include_bytes!("../icons/tray_orb_0.png"),
                    1 => include_bytes!("../icons/tray_orb_1.png"),
                    2 => include_bytes!("../icons/tray_orb_2.png"),
                    3 => include_bytes!("../icons/tray_orb_3.png"),
                    4 => include_bytes!("../icons/tray_orb_4.png"),
                    5 => include_bytes!("../icons/tray_orb_5.png"),
                    6 => include_bytes!("../icons/tray_orb_6.png"),
                    _ => include_bytes!("../icons/tray_orb_7.png"),
                };
                tauri::image::Image::from_bytes(bytes).expect("Failed to load orb frame")
            })
            .collect();
        let mut frame_idx: usize = 0;
        loop {
            std::thread::sleep(Duration::from_millis(400));
            let recorder_state = tray_anim_handle.state::<Arc<AudioRecorder>>();
            if !recorder_state.is_recording() {
                break;
            }
            if let Some(tray) = tray_anim_handle.tray_by_id("main") {
                let _ = tray.set_icon(Some(frames[frame_idx % frames.len()].clone()));
                let _ = tray.set_icon_as_template(false);
                frame_idx += 1;
            }
        }
    });

    // Overlay stays visible during recording — tray orb icon provides additional status indication

    // Start streaming transcription task if enabled
    if saved.streaming_enabled {
        let stream_handle = app_handle.clone();
        let stream_chunk_dur = saved.streaming_chunk_duration_secs;
        let stream_lang = saved.language.clone();
        let stream_prompt = {
            let base = saved.whisper_prompt.clone();
            if saved.vocabulary_enabled && !saved.vocabulary.is_empty() {
                let vocab = saved.vocabulary.join(", ");
                if base.trim().is_empty() {
                    format!("Vocabulary: {}", vocab)
                } else {
                    format!("{}\nVocabulary: {}", base, vocab)
                }
            } else {
                base
            }
        };
        let stream_api_key = saved.api_key.clone();
        let stream_api_url = saved.api_base_url.clone();
        let stream_model = saved.model.clone();
        let stream_timeout = saved.request_timeout_sec;
        let stream_retry = saved.retry_count;

        tauri::async_runtime::spawn(async move {
            // Validate API key before starting streaming
            if stream_api_key.trim().is_empty() {
                log::warn!("Streaming enabled but API key is empty — streaming will not work");
                let _ = stream_handle.emit(
                    "streaming-error",
                    "API key is not configured. Streaming transcription disabled.",
                );
                return;
            }

            let config = crate::streaming::StreamingConfig {
                enabled: true,
                chunk_duration_secs: stream_chunk_dur,
                language: stream_lang,
                prompt: stream_prompt,
            };
            let state = crate::streaming::STREAMING_STATE.get_or_init(|| std::sync::Mutex::new(None));
            {
                let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
                // StreamingState sample_rate will be updated on first sample poll
                *guard = Some(crate::streaming::StreamingState::new(16000));
            }

            let http_client = stream_handle.state::<reqwest::Client>().inner().clone();
            let recorder = stream_handle.state::<Arc<AudioRecorder>>().inner().clone();

            let mut consecutive_errors: u8 = 0;
            // Poll for new samples every second
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                if !recorder.is_recording() {
                    // Recording stopped — emit final event
                    let _ = stream_handle.emit("streaming-final", "");
                    break;
                }

                let (new_samples, sample_rate) = recorder.take_streaming_samples();
                if new_samples.is_empty() {
                    continue;
                }

                // Update StreamingState sample rate to match actual device rate
                {
                    let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
                    if let Some(ref mut st) = *guard {
                        st.set_sample_rate(sample_rate);
                    }
                }

                match crate::streaming::process_streaming_chunk(
                    state,
                    &new_samples,
                    sample_rate,
                    &config,
                    &http_client,
                    &stream_api_key,
                    &stream_api_url,
                    &stream_model,
                    &stream_handle,
                    stream_timeout,
                    stream_retry,
                )
                .await
                {
                    Ok(text) => {
                        consecutive_errors = 0;
                        if !text.is_empty() {
                            log::info!("Streaming partial: {}", &text[..text.len().min(80)]);
                        }
                    }
                    Err(e) => {
                        consecutive_errors += 1;
                        log::warn!("Streaming chunk failed (attempt {}): {}", consecutive_errors, e);
                        if consecutive_errors >= 3 {
                            let msg = format!(
                                "Streaming transcription failed after {} attempts: {}. \
                                 Check API key and network.",
                                consecutive_errors, e,
                            );
                            let _ = stream_handle.emit("streaming-error", msg);
                        }
                    }
                }
            }
        });
    }

    // Register Escape only while recording
    shortcut::register_escape(app_handle);
}

fn stop_and_transcribe(app_handle: &tauri::AppHandle) {
    // Guard: prevent concurrent transcriptions
    if TRANSCRIBING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        log::warn!("Transcription already in progress, ignoring duplicate call");
        return;
    }

    // RAII guard: clears TRANSCRIBING flag on all synchronous exit paths.
    // The async path clears it explicitly at the end of the spawned task.
    struct TranscribeGuard;
    impl Drop for TranscribeGuard {
        fn drop(&mut self) {
            TRANSCRIBING.store(false, Ordering::SeqCst);
        }
    }
    let _guard = TranscribeGuard;

    shortcut::unregister_escape(app_handle);

    let recorder = app_handle.state::<Arc<AudioRecorder>>();
    let history = app_handle.state::<Arc<HistoryManager>>();

    // Notify overlay
    let _ = app_handle.emit("transcribing", ());

    // If silence auto-stop already fired, the audio is in the auto_stop channel
    let audio = if let Some(a) = recorder.take_auto_stop_audio() {
        recorder.join_worker_after_auto_stop();
        a
    } else {
        match recorder.stop() {
            Ok(a) => a,
            Err(e) => {
                log::error!("Failed to stop recording: {}", e);
                close_overlay(app_handle);
                return;
            }
        }
    };
    log::info!("Got {} samples at {}Hz", audio.samples.len(), audio.sample_rate);

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
        let _ = app_handle.emit(
            "transcription-error",
            tr(
                &settings.ui_language,
                "录音太短了，请稍微多说一点。",
                "Recording too short. Try speaking a little longer.",
                "録音が短すぎます。もう少し長く話してください。",
            ),
        );
        // Overlay self-closes after 2.5s; also schedule a fallback close
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(3000));
            close_overlay(&handle);
        });
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

    // Waveform preview mode: store audio and let user confirm before transcribing
    if settings.waveform_preview_enabled {
        let pending = PENDING_AUDIO.get_or_init(|| Mutex::new(None));
        {
            let mut guard = pending.lock().unwrap_or_else(|e| e.into_inner());
            *guard = Some(PendingAudio {
                wav_data,
                samples: processed_audio.samples.clone(),
                sample_rate: processed_audio.sample_rate,
                duration_ms: duration_ms.unwrap_or(0),
                audio_path: audio_path_str,
            });
        }
        log::info!("Preview mode: audio stored, waiting for user confirmation");
        let _ = app_handle.emit("preview-ready", ());
        return;
    }

    if settings.api_key.is_empty() {
        log::error!("API key not configured!");
        let _ = app_handle.emit(
            "transcription-error",
            tr(
                &settings.ui_language,
                "尚未配置 API Key，请打开设置完成配置。",
                "API key not configured. Open settings to finish setup.",
                "API キーが未設定です。設定を開いて完了してください。",
            ),
        );
        // Fallback close after overlay self-closes
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(3000));
            close_overlay(&handle);
        });
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
    let whisper_prompt = {
        let base = settings.whisper_prompt.clone();
        if settings.vocabulary_enabled && !settings.vocabulary.is_empty() {
            let vocab = settings.vocabulary.join(", ");
            if base.trim().is_empty() {
                format!("Vocabulary: {}", vocab)
            } else {
                format!("{}\nVocabulary: {}", base, vocab)
            }
        } else {
            base
        }
    };
    let ai_polish_enabled = settings.ai_polish_enabled;
    let ai_polish_api_key = settings.ai_polish_api_key.clone();
    let ai_polish_api_url = settings.ai_polish_api_url.clone();
    let ai_polish_model = settings.ai_polish_model.clone();
    let ai_polish_prompt = settings.ai_polish_prompt.clone();
    let audio_retention_limit = settings.audio_retention_limit;
    let ui_language = settings.ui_language.clone();
    let http_client = app_handle.state::<reqwest::Client>().inner().clone();

    log::info!(
        "Transcription requested, model={}, api_url={}, language={}",
        model,
        api_base_url,
        language
    );
    log::info!("Calling API with model={} via {}...", model, api_base_url);

    // Prevent the RAII guard from clearing the flag — the async task will clear it
    std::mem::forget(_guard);

    tauri::async_runtime::spawn(async move {
        let lang = if language == "auto" {
            None
        } else {
            Some(language.as_str())
        };
        let prompt = if whisper_prompt.trim().is_empty() {
            None
        } else {
            Some(whisper_prompt.as_str())
        };

        match transcribe::transcribe_audio(
            &http_client,
            &api_key,
            &api_base_url,
            &model,
            &wav_data,
            lang,
            prompt,
            request_timeout_sec,
            retry_count,
        )
        .await
        {
            Ok(text) => {
                log::info!("Transcription succeeded, text_length={}", text.len());

                // Run post-transcription plugins
                let (text, plugin_results) = plugin::run_plugin_hook("post-transcription", &text).await;
                for result in &plugin_results {
                    if let Some(ref err) = result.error {
                        log::warn!("Plugin {} failed: {}", result.plugin_name, err);
                        let _ = handle.emit(
                            "plugin-error",
                            serde_json::json!({
                                "plugin": result.plugin_name,
                                "error": err,
                            }),
                        );
                    }
                }

                let raw_text = text.clone();
                let (polished_text_opt, polish_tokens) = if ai_polish_enabled && !ai_polish_api_key.is_empty() {
                    log::info!("Polishing text with AI...");
                    match polish::polish_text(
                        &http_client,
                        &ai_polish_api_key,
                        &ai_polish_api_url,
                        &ai_polish_model,
                        &text,
                        &ai_polish_prompt,
                        request_timeout_sec,
                    )
                    .await
                    {
                        Ok(result) => {
                            log::info!("AI polish succeeded, text_length={}", result.text.len());
                            (Some(result.text), result.tokens_used)
                        }
                        Err(e) => {
                            log::info!("AI polish failed: {}", e);
                            let _ = handle.emit("polish-error", e.to_string());
                            (None, 0i64)
                        }
                    }
                } else {
                    (None, 0i64)
                };

                // Use polished text for display/clipboard, raw text for storage
                let display_text = polished_text_opt.clone().unwrap_or(raw_text.clone());

                let asr_duration_sec = duration_ms.unwrap_or(0) as f64 / 1000.0;
                let asr_cost = cost::estimate_asr_cost(&api_base_url, &model, asr_duration_sec);
                let polish_cost = if polish_tokens > 0 {
                    cost::estimate_polish_cost(&ai_polish_api_url, &ai_polish_model, polish_tokens)
                } else {
                    0.0
                };
                let estimated_cost = asr_cost + polish_cost;

                // Copy to clipboard and auto-paste into active app
                let _ = handle.clipboard().write_text(&display_text);
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
                    text: raw_text.clone(),
                    model: model.clone(),
                    duration_ms,
                    audio_path: audio_path_str.clone(),
                    status: STATUS_SUCCESS.to_string(),
                    error_message: None,
                    provider: provider.clone(),
                    api_base_url: api_base_url.clone(),
                    language: language.clone(),
                    retry_of: None,
                    asr_duration_sec: Some(asr_duration_sec),
                    polish_tokens: if polish_tokens > 0 { Some(polish_tokens) } else { None },
                    estimated_cost: Some(estimated_cost),
                    polished_text: polished_text_opt,
                    recorded_at: RECORDING_START_TIME.swap(0, std::sync::atomic::Ordering::Relaxed),
                };
                let _ = history.add_entry(&entry);
                let _ = history.cleanup_old_audio(audio_retention_limit);
            }
            Err(e) => {
                log::error!("Transcription failed: {}", e);

                let error_message = e.to_string();
                let entry = NewHistoryEntry {
                    text: format!(
                        "{} {}",
                        tr(&ui_language, "转写失败:", "Transcription failed:", "文字起こし失敗:"),
                        &error_message.chars().take(100).collect::<String>()
                    ),
                    model: model.clone(),
                    duration_ms,
                    audio_path: audio_path_str.clone(),
                    status: STATUS_FAILED.to_string(),
                    error_message: Some(error_message.clone()),
                    provider: provider.clone(),
                    api_base_url: api_base_url.clone(),
                    language: language.clone(),
                    retry_of: None,
                    asr_duration_sec: None,
                    polish_tokens: None,
                    estimated_cost: None,
                    polished_text: None,
                    recorded_at: RECORDING_START_TIME.swap(0, std::sync::atomic::Ordering::Relaxed),
                };
                let _ = history.add_entry(&entry);
                let _ = history.cleanup_old_audio(audio_retention_limit);

                // Emit error to overlay — overlay will show it and self-close after 2.5s
                let _ = handle.emit("transcription-error", &error_message);
                // Emit to main window for retry toast
                let _ = handle.emit("transcription-failed", &error_message);
                // Fallback close in case overlay missed the event
                let fallback_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(3000)).await;
                    close_overlay(&fallback_handle);
                });
            }
        }

        // Notify main window to refresh (both success and failure)
        let _ = handle.emit("history-updated", ());

        // Reset tray tooltip and icon — restore to idle orb icon
        if let Some(tray) = handle.tray_by_id("main") {
            let _ = tray.set_tooltip(Some("Whisp"));
            let idle_icon = ORB_ICON_0.get_or_init(|| {
                let bytes = include_bytes!("../icons/tray_orb_0.png");
                tauri::image::Image::from_bytes(bytes).expect("Failed to load orb idle icon")
            });
            let _ = tray.set_icon(Some(idle_icon.clone()));
            let _ = tray.set_icon_as_template(false);
        }

        // Clear transcription guard
        TRANSCRIBING.store(false, Ordering::SeqCst);
    });
}

pub(crate) fn cancel_recording(app_handle: &tauri::AppHandle) {
    let recorder = app_handle.state::<Arc<AudioRecorder>>();
    if recorder.is_recording() {
        log::info!("Recording cancelled by user");
        shortcut::unregister_escape(app_handle);
        recorder.cancel();
        // Show overlay if it was auto-hidden, so user sees cancelled feedback
        if let Some(w) = app_handle.get_webview_window("overlay") {
            let _ = w.show();
        }
        // Notify overlay so it can show brief "cancelled" feedback before self-closing
        let _ = app_handle.emit("recording-cancelled", ());
        // Reset tray icon back to idle orb
        if let Some(tray) = app_handle.tray_by_id("main") {
            let _ = tray.set_tooltip(Some("Whisp"));
            let idle_icon = ORB_ICON_0.get_or_init(|| {
                let bytes = include_bytes!("../icons/tray_orb_0.png");
                tauri::image::Image::from_bytes(bytes).expect("Failed to load orb idle icon")
            });
            let _ = tray.set_icon(Some(idle_icon.clone()));
            let _ = tray.set_icon_as_template(false);
        }
        // Fallback: close overlay after delay in case the frontend missed the event
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(1000));
            close_overlay(&handle);
        });
    }
}

pub fn close_overlay(app_handle: &tauri::AppHandle) {
    if let Some(w) = app_handle.get_webview_window("overlay") {
        let _ = w.close();
    }
}

/// Implementation of confirm_pending_transcription (called from commands.rs).
pub fn confirm_pending_transcription_impl(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let pending = PENDING_AUDIO.get_or_init(|| Mutex::new(None));
    let pending_audio = {
        let mut guard = pending.lock().unwrap_or_else(|e| e.into_inner());
        guard.take()
    };

    let audio = pending_audio.ok_or("No pending recording to confirm")?;
    let _ = app_handle.emit("transcribing", ());

    let settings = settings::get_settings();
    let history = app_handle.state::<Arc<HistoryManager>>();
    let history_clone = history.inner().clone();
    let handle = app_handle.clone();
    let model = settings.model.clone();
    let language = settings.language.clone();
    let api_key = settings.api_key.clone();
    let api_base_url = settings.api_base_url.clone();
    let provider = transcribe::provider_name(&api_base_url);
    let auto_paste_enabled = settings.auto_paste_enabled;
    let paste_delay_ms = settings.paste_delay_ms;
    let request_timeout_sec = settings.request_timeout_sec;
    let retry_count = settings.retry_count;
    let whisper_prompt = {
        let base = settings.whisper_prompt.clone();
        if settings.vocabulary_enabled && !settings.vocabulary.is_empty() {
            let vocab = settings.vocabulary.join(", ");
            if base.trim().is_empty() {
                format!("Vocabulary: {}", vocab)
            } else {
                format!("{}\nVocabulary: {}", base, vocab)
            }
        } else {
            base
        }
    };
    let ai_polish_enabled = settings.ai_polish_enabled;
    let ai_polish_api_key = settings.ai_polish_api_key.clone();
    let ai_polish_api_url = settings.ai_polish_api_url.clone();
    let ai_polish_model = settings.ai_polish_model.clone();
    let ai_polish_prompt = settings.ai_polish_prompt.clone();
    let audio_retention_limit = settings.audio_retention_limit;
    let _ui_language = settings.ui_language.clone();
    let http_client = app_handle.state::<reqwest::Client>().inner().clone();
    let wav_data = audio.wav_data;
    let audio_path = audio.audio_path;
    let duration_ms = Some(audio.duration_ms);

    tauri::async_runtime::spawn(async move {
        let lang = if language == "auto" {
            None
        } else {
            Some(language.as_str())
        };
        let prompt = if whisper_prompt.trim().is_empty() {
            None
        } else {
            Some(whisper_prompt.as_str())
        };

        match transcribe::transcribe_audio(
            &http_client,
            &api_key,
            &api_base_url,
            &model,
            &wav_data,
            lang,
            prompt,
            request_timeout_sec,
            retry_count,
        )
        .await
        {
            Ok(text) => {
                log::info!("Transcription succeeded (preview confirm), text_length={}", text.len());

                // Run post-transcription plugins
                let (text, plugin_results) = plugin::run_plugin_hook("post-transcription", &text).await;
                for result in &plugin_results {
                    if let Some(ref err) = result.error {
                        log::warn!("Plugin {} failed: {}", result.plugin_name, err);
                        let _ = handle.emit(
                            "plugin-error",
                            serde_json::json!({
                                "plugin": result.plugin_name,
                                "error": err,
                            }),
                        );
                    }
                }

                let raw_text = text.clone();
                let (polished_text_opt, polish_tokens) = if ai_polish_enabled && !ai_polish_api_key.is_empty() {
                    match polish::polish_text(
                        &http_client,
                        &ai_polish_api_key,
                        &ai_polish_api_url,
                        &ai_polish_model,
                        &text,
                        &ai_polish_prompt,
                        request_timeout_sec,
                    )
                    .await
                    {
                        Ok(result) => (Some(result.text), result.tokens_used),
                        Err(e) => {
                            log::info!("AI polish failed: {}", e);
                            let _ = handle.emit("polish-error", e.to_string());
                            (None, 0i64)
                        }
                    }
                } else {
                    (None, 0i64)
                };

                let display_text = polished_text_opt.clone().unwrap_or(raw_text.clone());

                let _ = handle.clipboard().write_text(&display_text);
                close_overlay(&handle);

                if auto_paste_enabled {
                    let paste_handle = handle.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_millis(paste_delay_ms));
                        paste::simulate_paste(&paste_handle).ok();
                    });
                }

                let _ = handle.emit("transcription-done", &display_text);

                let asr_duration_sec = duration_ms.unwrap_or(0) as f64 / 1000.0;
                let asr_cost = cost::estimate_asr_cost(&api_base_url, &model, asr_duration_sec);
                let polish_cost = if polish_tokens > 0 {
                    cost::estimate_polish_cost(&ai_polish_api_url, &ai_polish_model, polish_tokens)
                } else {
                    0.0
                };
                let estimated_cost = asr_cost + polish_cost;

                let entry = history_clone.add_entry(&NewHistoryEntry {
                    text: raw_text.clone(),
                    model: model.clone(),
                    duration_ms,
                    audio_path,
                    status: STATUS_SUCCESS.to_string(),
                    error_message: None,
                    provider: provider.clone(),
                    api_base_url: api_base_url.clone(),
                    language: language.clone(),
                    retry_of: None,
                    asr_duration_sec: Some(asr_duration_sec),
                    polish_tokens: if polish_tokens > 0 { Some(polish_tokens) } else { None },
                    estimated_cost: Some(estimated_cost),
                    polished_text: polished_text_opt,
                    recorded_at: RECORDING_START_TIME.swap(0, std::sync::atomic::Ordering::Relaxed),
                });

                match entry {
                    Ok(entry) => {
                        let _ = history_clone.cleanup_old_audio(audio_retention_limit);
                        let _ = handle.emit("history-updated", entry.id);
                    }
                    Err(e) => log::error!("Failed to save history: {}", e),
                }
            }
            Err(e) => {
                log::error!("Transcription failed: {}", e);
                let error_msg = e.to_string();
                let _ = handle.emit("transcription-error", error_msg.clone());
                let _ = history_clone.add_entry(&NewHistoryEntry {
                    text: String::new(),
                    model: model.clone(),
                    duration_ms,
                    audio_path,
                    status: STATUS_FAILED.to_string(),
                    error_message: Some(error_msg),
                    provider: provider.clone(),
                    api_base_url: api_base_url.clone(),
                    language: language.clone(),
                    retry_of: None,
                    asr_duration_sec: None,
                    polish_tokens: None,
                    estimated_cost: None,
                    polished_text: None,
                    recorded_at: RECORDING_START_TIME.swap(0, std::sync::atomic::Ordering::Relaxed),
                });
                let handle2 = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(3000));
                    close_overlay(&handle2);
                });
            }
        }
        TRANSCRIBING.store(false, Ordering::SeqCst);
    });

    Ok(())
}
