use crate::history::HistoryManager;

use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub struct TrayRecentTexts(pub Arc<Mutex<Vec<String>>>);

/// Rebuild the system tray menu with the latest 5 history entries.
pub fn rebuild_tray_menu(app_handle: &AppHandle) {
    let history = app_handle.state::<Arc<HistoryManager>>();
    let entries = history.get_entries().unwrap_or_default();
    let recent: Vec<_> = entries.into_iter().take(5).collect();

    if let Some(tray_state) = app_handle.try_state::<TrayRecentTexts>() {
        let mut texts = tray_state.0.lock().unwrap_or_else(|e| e.into_inner());
        *texts = recent.iter().map(|e| e.text.clone()).collect();
    }

    let Some(tray) = app_handle.tray_by_id("main") else {
        return;
    };

    let show_i = tauri::menu::MenuItem::with_id(app_handle, "show", "Show Whisp", true, None::<&str>);
    let quit_i = tauri::menu::MenuItem::with_id(app_handle, "quit", "Quit", true, None::<&str>);
    let separator = tauri::menu::PredefinedMenuItem::separator(app_handle);

    let (Ok(show_i), Ok(quit_i), Ok(separator)) = (show_i, quit_i, separator) else {
        return;
    };

    let mut menu_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = vec![Box::new(show_i), Box::new(separator)];
    for (i, entry) in recent.iter().enumerate() {
        let label: String = entry.text.chars().take(40).collect();
        let label = if entry.text.chars().count() > 40 {
            format!("{}…", label)
        } else {
            label
        };
        let label = label.replace('&', "&amp;").replace('<', "&lt;");
        if let Ok(item) =
            tauri::menu::MenuItem::with_id(app_handle, format!("history_{}", i), label, true, None::<&str>)
        {
            menu_items.push(Box::new(item));
        }
    }
    if let Ok(sep2) = tauri::menu::PredefinedMenuItem::separator(app_handle) {
        menu_items.push(Box::new(sep2));
    }
    menu_items.push(Box::new(quit_i));

    let menu_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = menu_items.iter().map(|b| b.as_ref()).collect();
    if let Ok(menu) = tauri::menu::Menu::with_items(app_handle, &menu_refs) {
        let _ = tray.set_menu(Some(menu));
    }
}
