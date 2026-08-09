use crate::settings::AppSettings;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub static SHORTCUT_PROCESSING: AtomicBool = AtomicBool::new(false);
static LAST_SHORTCUT_TIME: AtomicU64 = AtomicU64::new(0);
const DEBOUNCE_MS: u64 = 500;

/// Register the user-configurable global shortcut (secondary hotkey).
pub fn register_shortcut(app_handle: &AppHandle, settings: &AppSettings) {
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
    if let Err(e) = app_handle
        .global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                // Debounce: ignore duplicate events within 500ms
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
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
                    crate::toggle_recording(&h);
                    SHORTCUT_PROCESSING.store(false, Ordering::SeqCst);
                });
            }
        })
    {
        log::error!("Failed to register shortcut '{}': {}", shortcut_str, e);
        let _ = app_handle.emit("shortcut-conflict", e.to_string());
    }
}

/// Unregister old shortcut and register new one (called when settings change).
pub fn re_register_shortcut(app_handle: &AppHandle, old_shortcut_str: &str, new_settings: &AppSettings) {
    // Unregister old shortcut
    if let Ok(old) = old_shortcut_str.parse::<Shortcut>() {
        let _ = app_handle.global_shortcut().unregister(old);
        log::info!("Unregistered old shortcut: {}", old_shortcut_str);
    }
    // Register new shortcut
    register_shortcut(app_handle, new_settings);
    log::info!("Registered new shortcut: {}", new_settings.shortcut);
}

/// Register Escape key handler (only while recording).
pub fn register_escape(app_handle: &AppHandle) {
    let escape: Shortcut = match "Escape".parse() {
        Ok(s) => s,
        Err(_) => return,
    };
    let handle = app_handle.clone();
    let _ = app_handle
        .global_shortcut()
        .on_shortcut(escape, move |_app, _shortcut, event| {
            if event.state != ShortcutState::Released {
                log::info!("Escape triggered");
                let h = handle.clone();
                std::thread::spawn(move || {
                    crate::cancel_recording(&h);
                });
            }
        });
}

/// Unregister Escape key handler (when recording stops).
pub fn unregister_escape(app_handle: &AppHandle) {
    if let Ok(escape) = "Escape".parse::<Shortcut>() {
        let _ = app_handle.global_shortcut().unregister(escape);
    }
}

/// Register the global record hotkey (separate from user shortcut).
/// This hotkey can start/stop recording from ANY application.
pub fn register_global_record_hotkey(app_handle: &AppHandle, hotkey_str: &str) -> Result<(), String> {
    if hotkey_str.is_empty() {
        return Ok(()); // Nothing to register
    }
    let shortcut: Shortcut = hotkey_str
        .parse()
        .map_err(|e| format!("Invalid hotkey '{}': {}", hotkey_str, e))?;

    let handle = app_handle.clone();
    app_handle
        .global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                // CAS guard: prevent concurrent toggle
                if SHORTCUT_PROCESSING
                    .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                    .is_err()
                {
                    return;
                }

                log::info!("Global record hotkey triggered: {}", hotkey_str);
                let h = handle.clone();
                std::thread::spawn(move || {
                    crate::toggle_recording(&h);
                    SHORTCUT_PROCESSING.store(false, Ordering::SeqCst);
                });
            }
        })
        .map_err(|e| format!("Failed to register global hotkey '{}': {}", hotkey_str, e))?;

    Ok(())
}

/// Unregister the global record hotkey.
pub fn unregister_global_record_hotkey(app_handle: &AppHandle, hotkey_str: &str) {
    if hotkey_str.is_empty() {
        return;
    }
    if let Ok(shortcut) = hotkey_str.parse::<Shortcut>() {
        let _ = app_handle.global_shortcut().unregister(shortcut);
        log::info!("Unregistered global record hotkey: {}", hotkey_str);
    }
}

/// Re-register global record hotkey (when settings change).
pub fn re_register_global_record_hotkey(
    app_handle: &AppHandle,
    old_hotkey_str: &str,
    new_hotkey_str: &str,
    enabled: bool,
) {
    // Unregister old
    unregister_global_record_hotkey(app_handle, old_hotkey_str);

    // Register new if enabled
    if enabled && !new_hotkey_str.is_empty() {
        if let Err(e) = register_global_record_hotkey(app_handle, new_hotkey_str) {
            log::error!("{}", e);
            let _ = app_handle.emit("shortcut-conflict", e);
        }
    }
}
