use enigo::{Direction, Enigo, Key, Keyboard, Settings};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct EnigoState(pub Mutex<Enigo>);

impl EnigoState {
    pub fn new() -> Result<Self, String> {
        let enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
        Ok(Self(Mutex::new(enigo)))
    }
}

/// Check if accessibility permission is granted (macOS)
pub fn is_accessibility_trusted() -> bool {
    #[cfg(target_os = "macos")]
    {
        extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }
        unsafe { AXIsProcessTrusted() }
    }
    #[cfg(not(target_os = "macos"))]
    true
}

/// Request accessibility permission using AXIsProcessTrustedWithOptions.
/// This adds the app to the Accessibility list and shows a system prompt.
pub fn request_accessibility_with_prompt() -> bool {
    #[cfg(target_os = "macos")]
    {
        if is_accessibility_trusted() {
            return true;
        }

        use core_foundation::base::TCFType;
        use core_foundation::boolean::CFBoolean;
        use core_foundation::dictionary::CFDictionary;
        use core_foundation::string::CFString;

        extern "C" {
            fn AXIsProcessTrustedWithOptions(options: core_foundation::base::CFTypeRef) -> bool;
        }

        let key = CFString::new("AXTrustedCheckOptionPrompt");
        let value = CFBoolean::true_value();
        let options = CFDictionary::from_CFType_pairs(&[(key, value)]);

        unsafe { AXIsProcessTrustedWithOptions(options.as_CFTypeRef()) }
    }
    #[cfg(not(target_os = "macos"))]
    true
}

/// Simulate Cmd+V (macOS) or Ctrl+V (Windows/Linux) to paste clipboard content.
/// Must be called from a dedicated OS thread, NOT from tokio async context.
///
/// On Linux, falls back to xdotool/ydotool/wtype if enigo fails.
pub fn simulate_paste(app_handle: &AppHandle) -> Result<(), String> {
    // Log environment for diagnostics
    #[cfg(target_os = "linux")]
    {
        let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".into());
        let display = std::env::var("DISPLAY").unwrap_or_else(|_| "unset".into());
        let wayland = std::env::var("WAYLAND_DISPLAY").unwrap_or_else(|_| "unset".into());
        log::info!(
            "Paste env: XDG_SESSION_TYPE={}, DISPLAY={}, WAYLAND_DISPLAY={}",
            session_type,
            display,
            wayland
        );
    }

    // Auto-initialize if not yet done but accessibility is granted
    if app_handle.try_state::<EnigoState>().is_none() {
        if !is_accessibility_trusted() {
            return Err("Accessibility not granted".into());
        }
        let state = EnigoState::new()?;
        app_handle.manage(state);
        log::info!("EnigoState auto-initialized");
    }

    let enigo_state = app_handle.try_state::<EnigoState>().ok_or("Enigo not initialized")?;
    let mut enigo = enigo_state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock Enigo: {}", e))?;

    #[cfg(target_os = "macos")]
    let (modifier, v_key) = (Key::Meta, Key::Other(9));

    #[cfg(target_os = "windows")]
    let (modifier, v_key) = (Key::Control, Key::Other(0x56));

    #[cfg(target_os = "linux")]
    let (modifier, v_key) = (Key::Control, Key::Unicode('v'));

    let enigo_result = (|| -> Result<(), String> {
        enigo
            .key(modifier, Direction::Press)
            .map_err(|e| format!("Failed to press modifier: {}", e))?;
        std::thread::sleep(std::time::Duration::from_millis(20));
        enigo
            .key(v_key, Direction::Click)
            .map_err(|e| format!("Failed to click V: {}", e))?;
        std::thread::sleep(std::time::Duration::from_millis(20));
        enigo
            .key(modifier, Direction::Release)
            .map_err(|e| format!("Failed to release modifier: {}", e))?;
        Ok(())
    })();

    match enigo_result {
        Ok(()) => {
            log::info!("Paste simulated via enigo");
            Ok(())
        }
        Err(enigo_err) => {
            log::warn!("Enigo paste failed: {} — trying fallback", enigo_err);
            #[cfg(target_os = "linux")]
            {
                if let Err(fallback_err) = paste_linux_fallback() {
                    log::error!(
                        "All paste methods failed. Enigo: {}, Fallback: {}",
                        enigo_err,
                        fallback_err
                    );
                    return Err(format!(
                        "Paste failed (enigo: {}, xdotool: {}). On Wayland install ydotool/wtype, on X11 install xdotool.",
                        enigo_err, fallback_err
                    ));
                }
                log::info!("Paste simulated via xdotool/ydotool fallback");
                return Ok(());
            }
            #[cfg(not(target_os = "linux"))]
            Err(format!("Paste failed: {}", enigo_err))
        }
    }
}

/// Linux fallback: try xdotool (X11), ydotool (Wayland), or wtype (Wayland).
#[cfg(target_os = "linux")]
fn paste_linux_fallback() -> Result<(), String> {
    let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
    log::info!("Paste fallback: XDG_SESSION_TYPE={}", session_type);

    // Try xdotool first (works on X11 and XWayland)
    if let Ok(output) = std::process::Command::new("xdotool")
        .args(["key", "ctrl+v"])
        .env("DISPLAY", std::env::var("DISPLAY").unwrap_or_else(|_| ":0".into()))
        .output()
    {
        if output.status.success() {
            return Ok(());
        }
        log::warn!("xdotool failed: {}", String::from_utf8_lossy(&output.stderr));
    } else {
        log::info!("xdotool not found in PATH");
    }

    // Try ydotool (works on Wayland)
    if let Ok(output) = std::process::Command::new("ydotool")
        .args(["key", "29:1", "47:1", "47:0", "29:0"])
        .output()
    {
        if output.status.success() {
            return Ok(());
        }
        log::warn!("ydotool failed: {}", String::from_utf8_lossy(&output.stderr));
    } else {
        log::info!("ydotool not found in PATH");
    }

    // Try wtype (Wayland native)
    if let Ok(output) = std::process::Command::new("wtype")
        .args(["-M", "ctrl", "-P", "v", "-p", "v", "-m", "ctrl"])
        .output()
    {
        if output.status.success() {
            return Ok(());
        }
        log::warn!("wtype failed: {}", String::from_utf8_lossy(&output.stderr));
    } else {
        log::info!("wtype not found in PATH");
    }

    Err("No working paste method found (tried xdotool, ydotool, wtype)".into())
}

#[cfg(target_os = "macos")]
pub fn capture_frontmost_app_bundle_id() -> Option<String> {
    let script = r#"tell application "System Events" to get bundle identifier of first application process whose frontmost is true"#;
    let output = Command::new("osascript").arg("-e").arg(script).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let bundle_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if bundle_id.is_empty() {
        None
    } else {
        Some(bundle_id)
    }
}

#[cfg(target_os = "macos")]
pub fn activate_app_by_bundle_id(bundle_id: &str) -> Result<(), String> {
    let normalized = bundle_id.trim();
    if normalized.is_empty() {
        return Err("Empty bundle id".into());
    }

    // Sanitize bundle ID: only allow alphanumeric, dots, hyphens, and underscores.
    // This prevents AppleScript injection via crafted bundle IDs.
    if !normalized
        .chars()
        .all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        log::warn!(
            "Rejected invalid bundle_id (contains unsafe characters): {}",
            normalized
        );
        return Err("Invalid bundle id: contains unsafe characters".into());
    }

    let script = format!("tell application id \"{normalized}\" to activate");
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "Failed to activate app".into()
        } else {
            err
        });
    }
    Ok(())
}
