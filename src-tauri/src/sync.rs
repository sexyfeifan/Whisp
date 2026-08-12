//! 多设备同步：基于共享目录的简单同步协议。
//!
//! 同步数据存储在 ~/.whisp/sync/ 目录下（可指向 Dropbox/iCloud 等同步文件夹）。
//! 每条历史记录导出为 JSON 格式，使用时间戳 + ID 作为文件名实现冲突检测。
//! 同步方向：合并式（两端新增的记录都会保留）。
//!
//! ## 使用方式
//! 1. 在设置中配置「同步目录」路径（如 ~/Dropbox/Whisp-sync/）
//! 2. 多台设备指向同一个同步目录
//! 3. 每次转录完成后自动同步，或手动触发同步
//!
//! ## 同步格式
//! 每条记录保存为 sync/<timestamp>_<id>.json：
//! ```json
//! {
//!   "id": 123,
//!   "text": "转录文本",
//!   "model": "whisper-1",
//!   "timestamp": 1700000000,
//!   "duration_ms": 5000,
//!   "provider": "OpenAI",
//!   "language": "en",
//!   "status": "success",
//!   "source_device": "my-laptop"
//! }
//! ```

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncRecord {
    pub id: i64,
    pub text: String,
    pub model: String,
    pub timestamp: i64,
    pub duration_ms: Option<i64>,
    pub provider: String,
    pub language: String,
    pub status: String,
    pub source_device: String,
    /// Estimated cost in USD
    #[serde(default)]
    pub estimated_cost: Option<f64>,
}

/// Get the configured sync directory path.
/// Returns None if sync is not configured.
pub fn sync_dir() -> Option<PathBuf> {
    let settings = crate::settings::get_settings();
    let path = settings.sync_dir.trim();
    if path.is_empty() {
        return None;
    }
    let p = PathBuf::from(path);
    if p.exists() || p.parent().map(|pp| pp.exists()).unwrap_or(false) {
        Some(p)
    } else {
        log::warn!("Sync directory does not exist: {}", path);
        None
    }
}

/// Export a history entry to the sync directory.
pub fn export_to_sync(entry: &crate::history::HistoryEntry, device_name: &str) -> Result<(), String> {
    let dir = match sync_dir() {
        Some(d) => d,
        None => return Ok(()), // Sync not configured, silently skip
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create sync dir: {e}"))?;

    let record = SyncRecord {
        id: entry.id,
        text: entry.text.clone(),
        model: entry.model.clone(),
        timestamp: entry.timestamp,
        duration_ms: entry.duration_ms,
        provider: entry.provider.clone(),
        language: entry.language.clone(),
        status: entry.status.clone(),
        source_device: device_name.to_string(),
        estimated_cost: entry.estimated_cost,
    };

    let filename = format!("{}_{}.json", entry.timestamp, entry.id);
    let path = dir.join(&filename);
    let json = serde_json::to_string_pretty(&record).map_err(|e| format!("Serialize: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Write sync file: {e}"))?;
    log::info!("Exported to sync: {}", path.display());
    Ok(())
}

/// Import records from the sync directory that don't exist in local history.
/// Returns the number of new records imported.
pub fn import_from_sync(history: &crate::history::HistoryManager, device_name: &str) -> Result<usize, String> {
    let dir = match sync_dir() {
        Some(d) => d,
        None => return Ok(0),
    };
    if !dir.exists() {
        return Ok(0);
    }

    let existing = history.get_entries().map_err(|e| e.to_string())?;
    let existing_keys: std::collections::HashSet<(i64, String)> =
        existing.iter().map(|e| (e.timestamp, e.provider.clone())).collect();

    let mut imported = 0;
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Read sync dir: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().map(|e| e == "json").unwrap_or(false) {
            continue;
        }

        // Skip files we exported (same device)
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let record: SyncRecord = match serde_json::from_str(&content) {
            Ok(r) => r,
            Err(e) => {
                log::warn!("Skip invalid sync file {}: {}", path.display(), e);
                continue;
            }
        };

        // Skip records from this device (already in local DB)
        if record.source_device == device_name {
            continue;
        }

        // Skip if already exists (by timestamp + provider as dedup key)
        let key = (record.timestamp, record.provider.clone());
        if existing_keys.contains(&key) {
            continue;
        }

        // Import as new history entry
        match history.add_entry(&crate::history::NewHistoryEntry {
            text: record.text,
            model: record.model,
            duration_ms: record.duration_ms,
            audio_path: None,
            status: record.status,
            error_message: None,
            provider: record.provider,
            api_base_url: String::new(),
            language: record.language,
            retry_of: None,
            asr_duration_sec: None,
            polish_tokens: None,
            estimated_cost: record.estimated_cost,
            polished_text: None,
            recorded_at: record.timestamp,
        }) {
            Ok(_) => {
                imported += 1;
                log::info!("Imported from sync: {} ({})", path.display(), record.source_device);
            }
            Err(e) => {
                log::warn!("Failed to import {}: {}", path.display(), e);
            }
        }
    }

    Ok(imported)
}

/// Full sync: export local entries + import remote entries.
pub fn full_sync(history: &crate::history::HistoryManager, device_name: &str) -> Result<(usize, usize), String> {
    let dir = match sync_dir() {
        Some(d) => d,
        None => return Ok((0, 0)),
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create sync dir: {e}"))?;

    // Export all local entries
    let local_entries = history.get_entries().map_err(|e| e.to_string())?;
    let mut exported = 0;
    for entry in &local_entries {
        let filename = format!("{}_{}.json", entry.timestamp, entry.id);
        let path = dir.join(&filename);
        if !path.exists() {
            export_to_sync(entry, device_name)?;
            exported += 1;
        }
    }

    // Import remote entries
    let imported = import_from_sync(history, device_name)?;

    Ok((exported, imported))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_record_serialization() {
        let record = SyncRecord {
            id: 1,
            text: "Hello world".into(),
            model: "whisper-1".into(),
            timestamp: 1700000000,
            duration_ms: Some(5000),
            provider: "OpenAI".into(),
            language: "en".into(),
            status: "success".into(),
            source_device: "test-device".into(),
            estimated_cost: Some(0.03),
        };
        let json = serde_json::to_string(&record).unwrap();
        let restored: SyncRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, 1);
        assert_eq!(restored.text, "Hello world");
        assert_eq!(restored.source_device, "test-device");
    }

    #[test]
    fn test_sync_dir_none_when_not_configured() {
        // This test verifies the function doesn't panic when sync_dir is empty
        // (actual behavior depends on settings, which require a running app)
        let _ = sync_dir();
    }
}
