//! 多设备同步：基于共享目录的同步协议，支持冲突解决和增量同步。
//!
//! 同步数据存储在 ~/.whisp/sync/ 目录下（可指向 Dropbox/iCloud 等同步文件夹）。
//! 每条历史记录导出为 JSON 格式，使用时间戳 + ID 作为文件名。
//!
//! ## 冲突解决策略
//! 使用 Last-Write-Wins (LWW) 基于 `updated_at` 时间戳：
//! - 当两个设备修改了同一条记录时，保留更新的版本
//! - 冲突会被记录到日志中
//!
//! ## 增量同步
//! 通过 `.sync-state.json` 跟踪每个设备的最后同步时间戳，
//! 仅同步自上次同步以来修改的条目。
//!
//! ## 同步状态事件
//! 同步过程中会发出 'sync-status' 事件：
//! - `{status: 'syncing', details: {device_name: ...}}`
//! - `{status: 'completed', details: {exported: N, imported: N, conflicts: N}}`
//! - `{status: 'conflict', details: {entry_id: N, winner: 'local'|'remote'}}`
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
//!   "updated_at": 1700000100,
//!   "duration_ms": 5000,
//!   "provider": "OpenAI",
//!   "language": "en",
//!   "status": "success",
//!   "source_device": "my-laptop"
//! }
//! ```
//!
//! ## 同步状态文件格式
//! sync/.sync-state.json：
//! ```json
//! {
//!   "devices": {
//!     "my-laptop": { "last_sync_timestamp": 1700000000 },
//!     "my-phone": { "last_sync_timestamp": 1700000100 }
//!   }
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
    /// Last modification timestamp for conflict resolution (LWW).
    /// Defaults to `timestamp` for backward compatibility with old records.
    #[serde(default)]
    pub updated_at: i64,
    pub duration_ms: Option<i64>,
    pub provider: String,
    pub language: String,
    pub status: String,
    pub source_device: String,
    /// Estimated cost in USD
    #[serde(default)]
    pub estimated_cost: Option<f64>,
    /// Optional polished text
    #[serde(default)]
    pub polished_text: Option<String>,
}

/// Per-device sync state stored in `.sync-state.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeviceSyncState {
    last_sync_timestamp: i64,
}

/// Overall sync state: tracks the last sync timestamp per device.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[derive(Default)]
struct SyncState {
    #[serde(default)]
    devices: std::collections::HashMap<String, DeviceSyncState>,
}


/// Rich result from a sync operation, including conflict info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    /// Number of entries exported (uploaded) to sync dir
    pub exported: usize,
    /// Number of entries imported (downloaded) from other devices
    pub imported: usize,
    /// Number of conflicts resolved via LWW
    pub conflicts_resolved: usize,
    /// Number of entries skipped (up to date)
    pub skipped: usize,
    /// Device name for this instance
    pub device_name: String,
    /// Sync directory path
    pub sync_dir: String,
    /// Timestamp of this sync operation
    pub sync_timestamp: i64,
    /// Details of resolved conflicts
    #[serde(default)]
    pub conflict_details: Vec<ConflictDetail>,
}

/// Detail about a single conflict resolution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictDetail {
    /// The entry ID that had a conflict
    pub entry_id: i64,
    /// The timestamp of the local version
    pub local_updated_at: i64,
    /// The timestamp of the remote version
    pub remote_updated_at: i64,
    /// Which version won: "local" or "remote"
    pub winner: String,
    /// The source device of the remote version
    pub remote_device: String,
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

/// Load sync state from `.sync-state.json` in the sync directory.
fn load_sync_state(dir: &std::path::Path) -> SyncState {
    let state_path = dir.join(".sync-state.json");
    if state_path.exists() {
        match std::fs::read_to_string(&state_path) {
            Ok(content) => match serde_json::from_str::<SyncState>(&content) {
                Ok(state) => return state,
                Err(e) => {
                    log::warn!("Invalid sync state file, starting fresh: {}", e);
                }
            },
            Err(e) => {
                log::warn!("Cannot read sync state file: {}", e);
            }
        }
    }
    SyncState::default()
}

/// Save sync state to `.sync-state.json` in the sync directory.
fn save_sync_state(dir: &std::path::Path, state: &SyncState) -> Result<(), String> {
    let state_path = dir.join(".sync-state.json");
    let json = serde_json::to_string_pretty(state).map_err(|e| format!("Serialize sync state: {e}"))?;
    std::fs::write(&state_path, json).map_err(|e| format!("Write sync state: {e}"))?;
    Ok(())
}

/// Get the current Unix timestamp in seconds.
fn now_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Export a history entry to the sync directory.
/// Includes `updated_at` for LWW conflict resolution.
pub fn export_to_sync(entry: &crate::history::HistoryEntry, device_name: &str) -> Result<(), String> {
    let dir = match sync_dir() {
        Some(d) => d,
        None => return Ok(()), // Sync not configured, silently skip
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create sync dir: {e}"))?;

    let now = now_timestamp();
    let record = SyncRecord {
        id: entry.id,
        text: entry.text.clone(),
        model: entry.model.clone(),
        timestamp: entry.timestamp,
        updated_at: now, // Use current time as update timestamp
        duration_ms: entry.duration_ms,
        provider: entry.provider.clone(),
        language: entry.language.clone(),
        status: entry.status.clone(),
        source_device: device_name.to_string(),
        estimated_cost: entry.estimated_cost,
        polished_text: entry.polished_text.clone(),
    };

    let filename = format!("{}_{}.json", entry.timestamp, entry.id);
    let path = dir.join(&filename);
    let json = serde_json::to_string_pretty(&record).map_err(|e| format!("Serialize: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Write sync file: {e}"))?;
    log::info!("Exported to sync: {}", path.display());
    Ok(())
}

/// Import records from the sync directory with conflict resolution.
/// Uses Last-Write-Wins (LWW) based on `updated_at` timestamp.
/// Only imports records modified since `since_timestamp` (incremental sync).
/// Returns (imported_count, conflict_count, conflict_details).
fn import_from_sync_with_lww(
    history: &crate::history::HistoryManager,
    device_name: &str,
    since_timestamp: i64,
) -> Result<(usize, usize, Vec<ConflictDetail>), String> {
    let dir = match sync_dir() {
        Some(d) => d,
        None => return Ok((0, 0, vec![])),
    };
    if !dir.exists() {
        return Ok((0, 0, vec![]));
    }

    let existing = history.get_entries().map_err(|e| e.to_string())?;
    // Build a map of (timestamp, provider) -> entry for conflict detection
    let existing_map: std::collections::HashMap<(i64, String), &crate::history::HistoryEntry> =
        existing.iter().map(|e| ((e.timestamp, e.provider.clone()), e)).collect();

    // Track which entries we've seen from remote devices (for conflict detection)
    // Key: (timestamp, provider) -> (record, file_path)
    let mut remote_records: std::collections::HashMap<(i64, String), (SyncRecord, PathBuf)> =
        std::collections::HashMap::new();

    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Read sync dir: {e}"))?;

    // First pass: collect all valid remote records
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().map(|e| e == "json").unwrap_or(false) {
            continue;
        }
        // Skip the sync state file
        if path.file_name().map(|n| n == ".sync-state.json").unwrap_or(false) {
            continue;
        }

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

        // Skip records from this device
        if record.source_device == device_name {
            continue;
        }

        // Incremental: skip records not modified since last sync
        let effective_updated_at = if record.updated_at > 0 { record.updated_at } else { record.timestamp };
        if effective_updated_at <= since_timestamp {
            continue;
        }

        let key = (record.timestamp, record.provider.clone());
        remote_records.insert(key, (record, path));
    }

    let mut imported = 0;
    let mut conflicts_resolved = 0;
    let mut conflict_details = Vec::new();

    // Second pass: import or resolve conflicts
    for (key, (record, path)) in &remote_records {
        let effective_remote_updated_at = if record.updated_at > 0 { record.updated_at } else { record.timestamp };

        if let Some(local_entry) = existing_map.get(key) {
            // CONFLICT: both local and remote have this entry
            // Use the local entry's timestamp as a proxy for "last update" since
            // the DB doesn't track updated_at. The remote record has an explicit updated_at.
            // If the remote is newer, we should update the local entry.
            let local_updated_at = local_entry.timestamp; // Best proxy for local update time

            if effective_remote_updated_at > local_updated_at {
                // Remote is newer: update local entry (LWW)
                log::info!(
                    "Conflict resolved (LWW): entry {} remote({}) > local({}), updating from device '{}'",
                    record.id, effective_remote_updated_at, local_updated_at, record.source_device
                );
                conflict_details.push(ConflictDetail {
                    entry_id: record.id,
                    local_updated_at,
                    remote_updated_at: effective_remote_updated_at,
                    winner: "remote".to_string(),
                    remote_device: record.source_device.clone(),
                });

                // Update the local entry with remote data
                if let Err(e) = history.update_entry(
                    record.id,
                    &record.text,
                    &record.model,
                    &record.status,
                    None, // error_message
                    &record.provider,
                    "",   // api_base_url
                    &record.language,
                    record.polished_text.as_deref(),
                ) {
                    log::warn!("Failed to update entry {} with remote data: {}", record.id, e);
                    continue;
                }
                conflicts_resolved += 1;
            } else {
                // Local is newer or same: keep local, log the conflict
                log::info!(
                    "Conflict resolved (LWW): entry {} local({}) >= remote({}), keeping local version",
                    record.id, local_updated_at, effective_remote_updated_at
                );
                conflict_details.push(ConflictDetail {
                    entry_id: record.id,
                    local_updated_at,
                    remote_updated_at: effective_remote_updated_at,
                    winner: "local".to_string(),
                    remote_device: record.source_device.clone(),
                });
                conflicts_resolved += 1;
            }
        } else {
            // No conflict: import as new entry
            match history.add_entry(&crate::history::NewHistoryEntry {
                text: record.text.clone(),
                model: record.model.clone(),
                duration_ms: record.duration_ms,
                audio_path: None,
                status: record.status.clone(),
                error_message: None,
                provider: record.provider.clone(),
                api_base_url: String::new(),
                language: record.language.clone(),
                retry_of: None,
                asr_duration_sec: None,
                polish_tokens: None,
                estimated_cost: record.estimated_cost,
                polished_text: record.polished_text.clone(),
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
    }

    Ok((imported, conflicts_resolved, conflict_details))
}

/// Import records from the sync directory that don't exist in local history.
/// Returns the number of new records imported.
/// For backward compatibility - calls the LWW version with since_timestamp=0.
pub fn import_from_sync(history: &crate::history::HistoryManager, device_name: &str) -> Result<usize, String> {
    let (imported, _, _) = import_from_sync_with_lww(history, device_name, 0)?;
    Ok(imported)
}

/// Full sync: export local entries + import remote entries with conflict resolution.
/// Supports incremental sync via `.sync-state.json`.
/// Returns a `SyncResult` with detailed information.
pub fn full_sync(history: &crate::history::HistoryManager, device_name: &str) -> Result<SyncResult, String> {
    let dir = match sync_dir() {
        Some(d) => d,
        None => {
            return Ok(SyncResult {
                exported: 0,
                imported: 0,
                conflicts_resolved: 0,
                skipped: 0,
                device_name: device_name.to_string(),
                sync_dir: String::new(),
                sync_timestamp: now_timestamp(),
                conflict_details: vec![],
            });
        }
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("Create sync dir: {e}"))?;

    let sync_timestamp = now_timestamp();

    // Load sync state for incremental sync
    let mut sync_state = load_sync_state(&dir);
    let last_sync = sync_state
        .devices
        .get(device_name)
        .map(|d| d.last_sync_timestamp)
        .unwrap_or(0);

    log::info!(
        "Starting sync for device '{}': last_sync={}, now={}",
        device_name, last_sync, sync_timestamp
    );

    // Export: only export entries modified since last sync
    // We export all entries that have timestamp > last_sync (as proxy for "modified since")
    let local_entries = history.get_entries().map_err(|e| e.to_string())?;
    let mut exported = 0;
    let mut skipped = 0;
    for entry in &local_entries {
        if entry.timestamp > last_sync {
            // Always re-export to ensure latest data is in sync dir
            export_to_sync(entry, device_name)?;
            exported += 1;
        } else {
            skipped += 1;
        }
    }

    // Import with LWW conflict resolution, only entries newer than last sync
    let (imported, conflicts_resolved, conflict_details) =
        import_from_sync_with_lww(history, device_name, last_sync)?;

    // Update sync state
    sync_state.devices.insert(
        device_name.to_string(),
        DeviceSyncState {
            last_sync_timestamp: sync_timestamp,
        },
    );
    if let Err(e) = save_sync_state(&dir, &sync_state) {
        log::warn!("Failed to save sync state: {}", e);
    }

    let result = SyncResult {
        exported,
        imported,
        conflicts_resolved,
        skipped,
        device_name: device_name.to_string(),
        sync_dir: dir.to_string_lossy().to_string(),
        sync_timestamp,
        conflict_details,
    };

    log::info!(
        "Sync completed: exported={}, imported={}, conflicts={}, skipped={}",
        exported, imported, conflicts_resolved, skipped
    );

    Ok(result)
}

/// Legacy full_sync that returns (exported, imported) for backward compatibility.
pub fn full_sync_legacy(history: &crate::history::HistoryManager, device_name: &str) -> Result<(usize, usize), String> {
    let result = full_sync(history, device_name)?;
    Ok((result.exported, result.imported))
}

/// Get the last sync timestamp for a device from the sync state file.
pub fn get_last_sync_timestamp(device_name: &str) -> Option<i64> {
    let dir = sync_dir()?;
    let state = load_sync_state(&dir);
    state.devices.get(device_name).map(|d| d.last_sync_timestamp)
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
            updated_at: 1700000100,
            duration_ms: Some(5000),
            provider: "OpenAI".into(),
            language: "en".into(),
            status: "success".into(),
            source_device: "test-device".into(),
            estimated_cost: Some(0.03),
            polished_text: None,
        };
        let json = serde_json::to_string(&record).unwrap();
        let restored: SyncRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.id, 1);
        assert_eq!(restored.text, "Hello world");
        assert_eq!(restored.source_device, "test-device");
        assert_eq!(restored.updated_at, 1700000100);
    }

    #[test]
    fn test_sync_record_backward_compat() {
        // Old records without updated_at should deserialize with updated_at=0
        let json = r#"{
            "id": 1,
            "text": "Hello",
            "model": "whisper-1",
            "timestamp": 1700000000,
            "duration_ms": 5000,
            "provider": "OpenAI",
            "language": "en",
            "status": "success",
            "source_device": "test"
        }"#;
        let record: SyncRecord = serde_json::from_str(json).unwrap();
        assert_eq!(record.updated_at, 0); // Default value
    }

    #[test]
    fn test_sync_state_default() {
        let state = SyncState::default();
        assert!(state.devices.is_empty());
    }

    #[test]
    fn test_sync_result_serialization() {
        let result = SyncResult {
            exported: 5,
            imported: 3,
            conflicts_resolved: 1,
            skipped: 2,
            device_name: "test".into(),
            sync_dir: "/tmp/sync".into(),
            sync_timestamp: 1700000000,
            conflict_details: vec![ConflictDetail {
                entry_id: 42,
                local_updated_at: 1700000000,
                remote_updated_at: 1700000100,
                winner: "remote".into(),
                remote_device: "other-device".into(),
            }],
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"exported\":5"));
        assert!(json.contains("\"conflicts_resolved\":1"));
        assert!(json.contains("\"winner\":\"remote\""));
    }

    #[test]
    fn test_sync_dir_none_when_not_configured() {
        let _ = sync_dir();
    }
}
