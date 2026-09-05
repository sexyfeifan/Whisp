use anyhow::Result;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub const STATUS_SUCCESS: &str = "success";
pub const STATUS_FAILED: &str = "failed";

static MIGRATIONS: &[M] = &[
    M::up(
        "CREATE TABLE IF NOT EXISTS transcriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            model TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            duration_ms INTEGER
        );",
    ),
    M::up("ALTER TABLE transcriptions ADD COLUMN audio_path TEXT;"),
    M::up("ALTER TABLE transcriptions ADD COLUMN status TEXT NOT NULL DEFAULT 'success';"),
    M::up("ALTER TABLE transcriptions ADD COLUMN error_message TEXT;"),
    M::up("ALTER TABLE transcriptions ADD COLUMN provider TEXT NOT NULL DEFAULT 'Unknown';"),
    M::up("ALTER TABLE transcriptions ADD COLUMN api_base_url TEXT NOT NULL DEFAULT '';"),
    M::up("ALTER TABLE transcriptions ADD COLUMN language TEXT NOT NULL DEFAULT 'auto';"),
    M::up("ALTER TABLE transcriptions ADD COLUMN retry_of INTEGER;"),
    M::up("CREATE INDEX IF NOT EXISTS idx_transcriptions_timestamp ON transcriptions(timestamp DESC);"),
    M::up("CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);"),
    M::up("ALTER TABLE transcriptions ADD COLUMN asr_duration_sec REAL;"),
    M::up("ALTER TABLE transcriptions ADD COLUMN polish_tokens INTEGER;"),
    M::up("ALTER TABLE transcriptions ADD COLUMN estimated_cost REAL;"),
    M::up(
        "CREATE VIRTUAL TABLE IF NOT EXISTS transcriptions_fts USING fts5(
            text, model, provider, language,
            content='transcriptions', content_rowid='id'
        );",
    ),
    M::up(
        "CREATE TRIGGER IF NOT EXISTS transcriptions_ai AFTER INSERT ON transcriptions BEGIN
            INSERT INTO transcriptions_fts(rowid, text, model, provider, language)
            VALUES (new.id, new.text, new.model, new.provider, new.language);
        END;",
    ),
    M::up(
        "CREATE TRIGGER IF NOT EXISTS transcriptions_ad AFTER DELETE ON transcriptions BEGIN
            INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text, model, provider, language)
            VALUES('delete', old.id, old.text, old.model, old.provider, old.language);
        END;",
    ),
    M::up(
        "CREATE TRIGGER IF NOT EXISTS transcriptions_au AFTER UPDATE ON transcriptions BEGIN
            INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text, model, provider, language)
            VALUES('delete', old.id, old.text, old.model, old.provider, old.language);
            INSERT INTO transcriptions_fts(rowid, text, model, provider, language)
            VALUES (new.id, new.text, new.model, new.provider, new.language);
        END;",
    ),
    M::up("ALTER TABLE transcriptions ADD COLUMN polished_text TEXT;"),
    // Tags system
    M::up(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL,
            tag TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            FOREIGN KEY (entry_id) REFERENCES transcriptions(id) ON DELETE CASCADE,
            UNIQUE(entry_id, tag)
        );",
    ),
    M::up("CREATE INDEX IF NOT EXISTS idx_tags_entry_id ON tags(entry_id);"),
    M::up("CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: i64,
    pub text: String,
    pub model: String,
    pub timestamp: i64,
    pub duration_ms: Option<i64>,
    pub audio_path: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub provider: String,
    pub api_base_url: String,
    pub language: String,
    pub retry_of: Option<i64>,
    pub asr_duration_sec: Option<f64>,
    pub polish_tokens: Option<i64>,
    pub estimated_cost: Option<f64>,
    pub polished_text: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStats {
    pub total: i64,
    pub success: i64,
    pub failed: i64,
    pub audio_saved: i64,
    pub total_cost: f64,
    pub total_tokens: i64,
    pub today_count: i64,
}

#[derive(Debug, Clone)]
pub struct NewHistoryEntry {
    pub text: String,
    pub model: String,
    pub duration_ms: Option<i64>,
    pub audio_path: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub provider: String,
    pub api_base_url: String,
    pub language: String,
    pub retry_of: Option<i64>,
    pub asr_duration_sec: Option<f64>,
    pub polish_tokens: Option<i64>,
    pub estimated_cost: Option<f64>,
    pub polished_text: Option<String>,
    /// Recording start timestamp (Unix epoch seconds). If 0, uses current time.
    pub recorded_at: i64,
}

pub struct HistoryManager {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
}

impl HistoryManager {
    pub fn new() -> Result<Self> {
        let data_dir = crate::data_dir();
        std::fs::create_dir_all(&data_dir)?;

        let audio_dir = data_dir.join("audio");
        std::fs::create_dir_all(&audio_dir)?;

        let db_path = data_dir.join("history.db");
        let mut conn = Connection::open(&db_path)?;

        // Enable WAL mode for better crash resistance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;

        // Check database integrity
        let integrity_ok: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap_or_else(|_| "ok".to_string());

        if integrity_ok != "ok" {
            log::warn!("Database integrity check failed: {}. Recreating...", integrity_ok);
            drop(conn);
            let _ = std::fs::remove_file(&db_path);
            // Also remove WAL and SHM files
            let _ = std::fs::remove_file(db_path.with_extension("db-wal"));
            let _ = std::fs::remove_file(db_path.with_extension("db-shm"));
            conn = Connection::open(&db_path)?;
            conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        }

        let migrations = Migrations::new(MIGRATIONS.to_vec());
        migrations.to_latest(&mut conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            data_dir,
        })
    }

    pub fn audio_dir(&self) -> PathBuf {
        self.data_dir.join("audio")
    }

    pub fn add_entry(&self, entry: &NewHistoryEntry) -> Result<HistoryEntry> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let timestamp = if entry.recorded_at > 0 {
            entry.recorded_at
        } else {
            chrono::Utc::now().timestamp()
        };
        conn.execute(
            "INSERT INTO transcriptions (
                text,
                model,
                timestamp,
                duration_ms,
                audio_path,
                status,
                error_message,
                provider,
                api_base_url,
                language,
                retry_of,
                asr_duration_sec,
                polish_tokens,
                estimated_cost,
                polished_text
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                entry.text,
                entry.model,
                timestamp,
                entry.duration_ms,
                entry.audio_path,
                entry.status,
                entry.error_message,
                entry.provider,
                entry.api_base_url,
                entry.language,
                entry.retry_of,
                entry.asr_duration_sec,
                entry.polish_tokens,
                entry.estimated_cost,
                entry.polished_text,
            ],
        )?;
        let id = conn.last_insert_rowid();
        Ok(HistoryEntry {
            id,
            text: entry.text.clone(),
            model: entry.model.clone(),
            timestamp,
            duration_ms: entry.duration_ms,
            audio_path: entry.audio_path.clone(),
            status: entry.status.clone(),
            error_message: entry.error_message.clone(),
            provider: entry.provider.clone(),
            api_base_url: entry.api_base_url.clone(),
            language: entry.language.clone(),
            retry_of: entry.retry_of,
            asr_duration_sec: entry.asr_duration_sec,
            polish_tokens: entry.polish_tokens,
            estimated_cost: entry.estimated_cost,
            polished_text: entry.polished_text.clone(),
        })
    }

    pub fn get_entry_by_id(&self, id: i64) -> Result<Option<HistoryEntry>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT
                id,
                text,
                model,
                timestamp,
                duration_ms,
                audio_path,
                status,
                error_message,
                provider,
                api_base_url,
                language,
                retry_of,
                asr_duration_sec,
                polish_tokens,
                estimated_cost,
                polished_text
             FROM transcriptions
             WHERE id = ?1",
        )?;
        let entry = stmt.query_row([id], row_to_history_entry).ok();
        Ok(entry)
    }

    pub fn update_entry(
        &self,
        id: i64,
        text: &str,
        model: &str,
        status: &str,
        error_message: Option<&str>,
        provider: &str,
        api_base_url: &str,
        language: &str,
        polished_text: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE transcriptions
             SET text = ?1,
                 model = ?2,
                 status = ?3,
                 error_message = ?4,
                 provider = ?5,
                 api_base_url = ?6,
                 language = ?7,
                 polished_text = ?8
             WHERE id = ?9",
            rusqlite::params![
                text,
                model,
                status,
                error_message,
                provider,
                api_base_url,
                language,
                polished_text,
                id
            ],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn update_usage(
        &self,
        id: i64,
        asr_duration_sec: Option<f64>,
        polish_tokens: Option<i64>,
        estimated_cost: Option<f64>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE transcriptions
             SET asr_duration_sec = ?1,
                 polish_tokens = ?2,
                 estimated_cost = ?3
             WHERE id = ?4",
            rusqlite::params![asr_duration_sec, polish_tokens, estimated_cost, id],
        )?;
        Ok(())
    }

    pub fn get_entries(&self) -> Result<Vec<HistoryEntry>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT
                id,
                text,
                model,
                timestamp,
                duration_ms,
                audio_path,
                status,
                error_message,
                provider,
                api_base_url,
                language,
                retry_of,
                asr_duration_sec,
                polish_tokens,
                estimated_cost,
                polished_text
             FROM transcriptions
             ORDER BY timestamp DESC",
        )?;
        let entries = stmt
            .query_map([], row_to_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    pub fn get_entries_page(&self, limit: i64, offset: i64) -> Result<Vec<HistoryEntry>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT
                id,
                text,
                model,
                timestamp,
                duration_ms,
                audio_path,
                status,
                error_message,
                provider,
                api_base_url,
                language,
                retry_of,
                asr_duration_sec,
                polish_tokens,
                estimated_cost,
                polished_text
             FROM transcriptions
             ORDER BY timestamp DESC
             LIMIT ?1 OFFSET ?2",
        )?;
        let entries = stmt
            .query_map(rusqlite::params![limit, offset], row_to_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    pub fn get_stats(&self, start_of_day: i64) -> Result<HistoryStats> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let stats = conn.query_row(
            "SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN audio_path IS NOT NULL AND audio_path != '' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(estimated_cost), 0),
                COALESCE(SUM(polish_tokens), 0),
                COALESCE(SUM(CASE WHEN timestamp >= ?1 THEN 1 ELSE 0 END), 0)
             FROM transcriptions",
            [start_of_day],
            |row| {
                Ok(HistoryStats {
                    total: row.get(0)?,
                    success: row.get(1)?,
                    failed: row.get(2)?,
                    audio_saved: row.get(3)?,
                    total_cost: row.get(4)?,
                    total_tokens: row.get(5)?,
                    today_count: row.get(6)?,
                })
            },
        )?;
        Ok(stats)
    }

    pub fn delete_entry(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let audio_path: Option<String> = conn
            .query_row("SELECT audio_path FROM transcriptions WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .ok()
            .flatten();
        if let Some(path) = audio_path {
            let _ = std::fs::remove_file(&path);
        }
        conn.execute("DELETE FROM transcriptions WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn delete_entries(&self, ids: &[i64]) -> Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let placeholders: String = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!("SELECT audio_path FROM transcriptions WHERE id IN ({})", placeholders);
        let mut stmt = conn.prepare(&query)?;
        let paths: Vec<String> = stmt
            .query_map(rusqlite::params_from_iter(ids.iter()), |row| {
                row.get::<_, Option<String>>(0)
            })?
            .filter_map(|r| r.ok())
            .flatten()
            .collect();
        drop(stmt);
        for path in paths {
            let _ = std::fs::remove_file(&path);
        }
        let del_query = format!("DELETE FROM transcriptions WHERE id IN ({})", placeholders);
        conn.execute(&del_query, rusqlite::params_from_iter(ids.iter()))?;
        Ok(())
    }

    pub fn cleanup_old_audio(&self, keep: usize) -> Result<()> {
        let paths: Vec<String> = {
            let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
            let mut stmt = conn.prepare(
                "SELECT audio_path FROM transcriptions
                 ORDER BY timestamp DESC
                 LIMIT -1 OFFSET ?1",
            )?;
            let paths: Vec<String> = stmt
                .query_map([keep as i64], |row| row.get::<_, Option<String>>(0))?
                .filter_map(|r| r.ok())
                .flatten()
                .collect();
            paths
        };

        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        for path in paths {
            if std::fs::remove_file(&path).is_ok() {
                conn.execute(
                    "UPDATE transcriptions SET audio_path = NULL WHERE audio_path = ?1",
                    [&path],
                )?;
            }
        }
        Ok(())
    }

    pub fn clear_all(&self) -> Result<()> {
        let audio_dir = self.audio_dir();
        if audio_dir.exists() {
            let _ = std::fs::remove_dir_all(&audio_dir);
            let _ = std::fs::create_dir_all(&audio_dir);
        }
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());

        // Try DELETE first; if DB is corrupted, drop and recreate tables
        match conn.execute("DELETE FROM transcriptions", []) {
            Ok(_) => Ok(()),
            Err(e) => {
                log::warn!("DELETE failed ({}), attempting DROP+recreate...", e);
                // Drop everything in correct order (triggers depend on FTS table)
                conn.execute_batch(
                    "DROP TRIGGER IF EXISTS transcriptions_ai;
                     DROP TRIGGER IF EXISTS transcriptions_ad;
                     DROP TRIGGER IF EXISTS transcriptions_au;
                     DROP TABLE IF EXISTS transcriptions_fts;
                     DROP TABLE IF EXISTS transcriptions;",
                )?;
                // Recreate the base table with all columns
                conn.execute_batch(
                    "CREATE TABLE IF NOT EXISTS transcriptions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        text TEXT NOT NULL,
                        model TEXT NOT NULL,
                        timestamp INTEGER NOT NULL,
                        duration_ms INTEGER,
                        audio_path TEXT,
                        status TEXT NOT NULL DEFAULT 'success',
                        error_message TEXT,
                        provider TEXT NOT NULL DEFAULT 'Unknown',
                        api_base_url TEXT NOT NULL DEFAULT '',
                        language TEXT NOT NULL DEFAULT 'auto',
                        retry_of INTEGER,
                        asr_duration_sec REAL,
                        polish_tokens INTEGER,
                        estimated_cost REAL,
                        polished_text TEXT
                    );
                    CREATE INDEX IF NOT EXISTS idx_transcriptions_timestamp ON transcriptions(timestamp DESC);
                    CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);
                    CREATE VIRTUAL TABLE IF NOT EXISTS transcriptions_fts USING fts5(
                        text, model, provider, language,
                        content='transcriptions', content_rowid='id'
                    );
                    CREATE TRIGGER IF NOT EXISTS transcriptions_ai AFTER INSERT ON transcriptions BEGIN
                        INSERT INTO transcriptions_fts(rowid, text, model, provider, language)
                        VALUES (new.id, new.text, new.model, new.provider, new.language);
                    END;
                    CREATE TRIGGER IF NOT EXISTS transcriptions_ad AFTER DELETE ON transcriptions BEGIN
                        INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text, model, provider, language)
                        VALUES('delete', old.id, old.text, old.model, old.provider, old.language);
                    END;
                    CREATE TRIGGER IF NOT EXISTS transcriptions_au AFTER UPDATE ON transcriptions BEGIN
                        INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text, model, provider, language)
                        VALUES('delete', old.id, old.text, old.model, old.provider, old.language);
                        INSERT INTO transcriptions_fts(rowid, text, model, provider, language)
                        VALUES (new.id, new.text, new.model, new.provider, new.language);
                    END;",
                )?;
                log::info!("Database tables recreated after corruption");
                Ok(())
            }
        }
    }

    pub fn search_history(&self, query: &str) -> Result<Vec<HistoryEntry>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let fts_query = trimmed
            .split_whitespace()
            .filter_map(|w| {
                let cleaned: String = w.chars().filter(|c| c.is_alphanumeric()).collect();
                if cleaned.is_empty() {
                    None
                } else {
                    Some(format!("\"{}\"*", cleaned))
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        if fts_query.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT
                t.id,
                t.text,
                t.model,
                t.timestamp,
                t.duration_ms,
                t.audio_path,
                t.status,
                t.error_message,
                t.provider,
                t.api_base_url,
                t.language,
                t.retry_of,
                t.asr_duration_sec,
                t.polish_tokens,
                t.estimated_cost,
                t.polished_text
             FROM transcriptions t
             INNER JOIN transcriptions_fts fts ON t.id = fts.rowid
             WHERE transcriptions_fts MATCH ?1
             ORDER BY rank
             LIMIT 200",
        )?;
        let entries = stmt
            .query_map([fts_query], row_to_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    /// Full-text search using FTS5 with BM25 ranking.
    ///
    /// Creates the FTS5 virtual table lazily if it doesn't already exist
    /// (e.g. if the migration that creates it was skipped or interrupted).
    /// Falls back to a simple LIKE search if the FTS5 module is not available.
    pub fn search_fulltext(&self, query: &str) -> Result<Vec<HistoryEntry>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());

        // Ensure the FTS5 table exists (lazy creation).
        // The migration normally creates it, but this handles edge cases.
        let fts_available = self.ensure_fts_table(&conn).is_ok();

        // Build the FTS5 query: wrap each word in double-quotes with a trailing
        // wildcard for prefix matching, and join them (AND semantics).
        let fts_query = trimmed
            .split_whitespace()
            .filter_map(|w| {
                let cleaned: String = w.chars().filter(|c| c.is_alphanumeric()).collect();
                if cleaned.is_empty() {
                    None
                } else {
                    Some(format!("\"{}\"*", cleaned))
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        if fts_query.is_empty() {
            return Ok(Vec::new());
        }

        if fts_available {
            // Use FTS5 with BM25 ranking
            match conn.prepare(
                "SELECT
                    t.id,
                    t.text,
                    t.model,
                    t.timestamp,
                    t.duration_ms,
                    t.audio_path,
                    t.status,
                    t.error_message,
                    t.provider,
                    t.api_base_url,
                    t.language,
                    t.retry_of,
                    t.asr_duration_sec,
                    t.polish_tokens,
                    t.estimated_cost,
                    t.polished_text
                 FROM transcriptions t
                 INNER JOIN transcriptions_fts fts ON t.id = fts.rowid
                 WHERE transcriptions_fts MATCH ?1
                 ORDER BY rank
                 LIMIT 200",
            ) {
                Ok(mut stmt) => {
                    let entries = stmt
                        .query_map([&fts_query], row_to_history_entry)?
                        .collect::<std::result::Result<Vec<_>, _>>()?;
                    return Ok(entries);
                }
                Err(e) => {
                    log::warn!("FTS5 search failed ({}), falling back to LIKE search", e);
                }
            }
        }

        // Fallback: simple LIKE search when FTS5 is unavailable
        let like_pattern = format!("%{}%", trimmed.replace('%', "\\%").replace('_', "\\_"));
        let mut stmt = conn.prepare(
            "SELECT
                id,
                text,
                model,
                timestamp,
                duration_ms,
                audio_path,
                status,
                error_message,
                provider,
                api_base_url,
                language,
                retry_of,
                asr_duration_sec,
                polish_tokens,
                estimated_cost,
                polished_text
             FROM transcriptions
             WHERE text LIKE ?1 ESCAPE '\\'
             ORDER BY timestamp DESC
             LIMIT 200",
        )?;
        let entries = stmt
            .query_map([&like_pattern], row_to_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    /// Ensure the FTS5 virtual table exists, creating and populating it if needed.
    /// Returns Ok(()) if FTS5 is available, Err if the module is not compiled in.
    fn ensure_fts_table(&self, conn: &Connection) -> Result<()> {
        // Check if the table already exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='transcriptions_fts'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count > 0)
            .unwrap_or(false);

        if exists {
            return Ok(());
        }

        // Create the FTS5 virtual table
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS transcriptions_fts USING fts5(
                text, model, provider, language,
                content='transcriptions', content_rowid='id'
            )",
            [],
        )?;

        // Populate from existing entries
        conn.execute(
            "INSERT INTO transcriptions_fts(rowid, text, model, provider, language)
             SELECT id, text, model, provider, language FROM transcriptions",
            [],
        )?;

        // Create triggers to keep FTS in sync going forward
        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS transcriptions_ai AFTER INSERT ON transcriptions BEGIN
                INSERT INTO transcriptions_fts(rowid, text, model, provider, language)
                VALUES (new.id, new.text, new.model, new.provider, new.language);
            END",
            [],
        )?;
        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS transcriptions_ad AFTER DELETE ON transcriptions BEGIN
                INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text, model, provider, language)
                VALUES('delete', old.id, old.text, old.model, old.provider, old.language);
            END",
            [],
        )?;
        conn.execute(
            "CREATE TRIGGER IF NOT EXISTS transcriptions_au AFTER UPDATE ON transcriptions BEGIN
                INSERT INTO transcriptions_fts(transcriptions_fts, rowid, text, model, provider, language)
                VALUES('delete', old.id, old.text, old.model, old.provider, old.language);
                INSERT INTO transcriptions_fts(rowid, text, model, provider, language)
                VALUES (new.id, new.text, new.model, new.provider, new.language);
            END",
            [],
        )?;

        log::info!("FTS5 table created and populated lazily on first search");
        Ok(())
    }

    /// Fetch entries by a list of IDs (preserving the order of the input list).
    pub fn get_entries_by_ids(&self, ids: &[i64]) -> Result<Vec<HistoryEntry>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let placeholders: String = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT
                id, text, model, timestamp, duration_ms, audio_path,
                status, error_message, provider, api_base_url, language,
                retry_of, asr_duration_sec, polish_tokens, estimated_cost, polished_text
             FROM transcriptions
             WHERE id IN ({})
             ORDER BY timestamp ASC",
            placeholders
        );
        let mut stmt = conn.prepare(&query)?;
        let entries = stmt
            .query_map(rusqlite::params_from_iter(ids.iter()), row_to_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    /// Export selected history entries as SRT subtitle format.
    /// Each entry becomes one subtitle block with its timestamp as start time
    /// and timestamp + duration as end time.
    pub fn export_srt(&self, ids: &[i64]) -> Result<String> {
        let entries = self.get_entries_by_ids(ids)?;
        let mut srt = String::new();

        // Use the first entry's timestamp as the zero point for relative offsets
        let base_ts = entries.first().map(|e| e.timestamp).unwrap_or(0);

        for (i, entry) in entries.iter().enumerate() {
            let index = i + 1;
            let start_secs = entry.timestamp.saturating_sub(base_ts);
            let duration_ms = entry.duration_ms.unwrap_or(3000);
            let end_secs = start_secs + (duration_ms / 1000);
            let end_nanos = ((duration_ms % 1000) * 1_000_000) as u32;

            let start_h = (start_secs / 3600) as u32;
            let start_m = ((start_secs % 3600) / 60) as u32;
            let start_s = (start_secs % 60) as u32;

            let end_h = (end_secs / 3600) as u32;
            let end_m = ((end_secs % 3600) / 60) as u32;
            let end_s = (end_secs % 60) as u32;

            srt.push_str(&format!("{}\n", index));
            srt.push_str(&format!(
                "{:02}:{:02}:{:02},000 --> {:02}:{:02}:{:02},{:03}\n",
                start_h,
                start_m,
                start_s,
                end_h,
                end_m,
                end_s,
                end_nanos / 1_000_000,
            ));
            srt.push_str(&format!("{}\n\n", entry.text));
        }

        Ok(srt)
    }

    // --- Tags ---

    /// Add a tag to a history entry. No-op if the tag already exists.
    pub fn add_tag(&self, entry_id: i64, tag: &str) -> Result<()> {
        let tag = tag.trim().to_lowercase();
        if tag.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT OR IGNORE INTO tags (entry_id, tag) VALUES (?1, ?2)",
            rusqlite::params![entry_id, tag],
        )?;
        Ok(())
    }

    /// Remove a tag from a history entry.
    pub fn remove_tag(&self, entry_id: i64, tag: &str) -> Result<()> {
        let tag = tag.trim().to_lowercase();
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "DELETE FROM tags WHERE entry_id = ?1 AND tag = ?2",
            rusqlite::params![entry_id, tag],
        )?;
        Ok(())
    }

    /// Get all tags for a given history entry.
    pub fn get_tags(&self, entry_id: i64) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare("SELECT tag FROM tags WHERE entry_id = ?1 ORDER BY tag ASC")?;
        let tags = stmt
            .query_map([entry_id], |row| row.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }

    /// Get all tags for multiple entries in one query. Returns a map of entry_id -> tags.
    pub fn get_tags_batch(&self, ids: &[i64]) -> Result<std::collections::HashMap<i64, Vec<String>>> {
        if ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let placeholders: String = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT entry_id, tag FROM tags WHERE entry_id IN ({}) ORDER BY tag ASC",
            placeholders
        );
        let mut stmt = conn.prepare(&query)?;
        let mut map: std::collections::HashMap<i64, Vec<String>> = std::collections::HashMap::new();
        let rows = stmt.query_map(rusqlite::params_from_iter(ids.iter()), |row| {
            let entry_id: i64 = row.get(0)?;
            let tag: String = row.get(1)?;
            Ok((entry_id, tag))
        })?;
        for row in rows {
            let (entry_id, tag) = row?;
            map.entry(entry_id).or_default().push(tag);
        }
        Ok(map)
    }

    /// Get all distinct tags in the database.
    pub fn get_all_tags(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare("SELECT DISTINCT tag FROM tags ORDER BY tag ASC")?;
        let tags = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }

    /// Get entries that have a specific tag.
    pub fn get_entries_by_tag(&self, tag: &str) -> Result<Vec<HistoryEntry>> {
        let tag = tag.trim().to_lowercase();
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT
                t.id, t.text, t.model, t.timestamp, t.duration_ms, t.audio_path,
                t.status, t.error_message, t.provider, t.api_base_url, t.language,
                t.retry_of, t.asr_duration_sec, t.polish_tokens, t.estimated_cost, t.polished_text
             FROM transcriptions t
             INNER JOIN tags tg ON t.id = tg.entry_id
             WHERE tg.tag = ?1
             ORDER BY t.timestamp DESC",
        )?;
        let entries = stmt
            .query_map([&tag], row_to_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    // --- Unified Export ---

    /// Export entries in the specified format. Supports: txt, md/markdown, csv, json, srt.
    pub fn export_entries(&self, format: &str, ids: &[i64]) -> Result<String> {
        match format {
            "json" => self.export_json(ids),
            "csv" => self.export_csv_entries(ids),
            "srt" => self.export_srt(ids),
            "md" | "markdown" => self.export_markdown(ids),
            _ => self.export_txt(ids),
        }
    }

    /// Export entries as plain text (one entry per block).
    pub fn export_txt(&self, ids: &[i64]) -> Result<String> {
        let entries = self.get_entries_by_ids(ids)?;
        let mut out = String::new();
        for entry in &entries {
            let dt = chrono::DateTime::from_timestamp(entry.timestamp, 0).unwrap_or_default();
            let formatted = dt.format("%Y-%m-%d %H:%M").to_string();
            out.push_str(&format!("[{}] {}\n", formatted, entry.text));
            if let Some(ref polished) = entry.polished_text {
                out.push_str(&format!("  (Polished: {})\n", polished));
            }
            out.push('\n');
        }
        Ok(out)
    }

    /// Export entries as JSON array.
    pub fn export_json(&self, ids: &[i64]) -> Result<String> {
        let entries = self.get_entries_by_ids(ids)?;
        serde_json::to_string_pretty(&entries).map_err(|e| anyhow::anyhow!(e))
    }

    /// Export entries as CSV with all fields.
    pub fn export_csv_entries(&self, ids: &[i64]) -> Result<String> {
        let entries = self.get_entries_by_ids(ids)?;
        let mut wtr = csv::Writer::from_writer(vec![]);
        wtr.write_record([
            "id",
            "timestamp",
            "text",
            "model",
            "provider",
            "language",
            "status",
            "duration_ms",
            "polished_text",
            "estimated_cost",
        ])
        .map_err(|e| anyhow::anyhow!(e))?;
        for entry in &entries {
            wtr.write_record(&[
                entry.id.to_string(),
                entry.timestamp.to_string(),
                entry.text.clone(),
                entry.model.clone(),
                entry.provider.clone(),
                entry.language.clone(),
                entry.status.clone(),
                entry.duration_ms.map(|d| d.to_string()).unwrap_or_default(),
                entry.polished_text.clone().unwrap_or_default(),
                entry.estimated_cost.map(|c| c.to_string()).unwrap_or_default(),
            ])
            .map_err(|e| anyhow::anyhow!(e))?;
        }
        let data = wtr.into_inner().map_err(|e| anyhow::anyhow!(e))?;
        String::from_utf8(data).map_err(|e| anyhow::anyhow!(e))
    }

    /// Export selected history entries as a Markdown document.
    pub fn export_markdown(&self, ids: &[i64]) -> Result<String> {
        let entries = self.get_entries_by_ids(ids)?;
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M").to_string();

        let mut md = format!("# Whisp Transcription Export\n\nGenerated: {}\n\n---\n\n", now);

        for entry in &entries {
            let dt = chrono::DateTime::from_timestamp(entry.timestamp, 0).unwrap_or_default();
            let formatted = dt.format("%Y-%m-%d %H:%M").to_string();

            md.push_str(&format!("## Entry {} ({})\n\n", entry.id, formatted));
            md.push_str(&format!("{}\n\n", entry.text));

            // Append metadata line
            let duration_sec = entry.duration_ms.map(|d| d as f64 / 1000.0);
            let dur_str = match duration_sec {
                Some(sec) => format!("{:.1}s", sec),
                None => "N/A".to_string(),
            };
            md.push_str(&format!(
                "*Duration: {} | Model: {} | Provider: {} | Language: {}*\n\n",
                dur_str, entry.model, entry.provider, entry.language,
            ));
            md.push_str("---\n\n");
        }

        Ok(md)
    }
}

fn row_to_history_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
    Ok(HistoryEntry {
        id: row.get(0)?,
        text: row.get(1)?,
        model: row.get(2)?,
        timestamp: row.get(3)?,
        duration_ms: row.get(4)?,
        audio_path: row.get(5)?,
        status: row.get(6)?,
        error_message: row.get(7)?,
        provider: row.get(8)?,
        api_base_url: row.get(9)?,
        language: row.get(10)?,
        retry_of: row.get(11)?,
        asr_duration_sec: row.get(12)?,
        polish_tokens: row.get(13)?,
        estimated_cost: row.get(14)?,
        polished_text: row.get(15)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn create_test_history() -> (Arc<HistoryManager>, tempfile::TempDir) {
        let tmp = tempfile::TempDir::new().unwrap();
        let old_home = std::env::var("HOME").unwrap_or_default();
        std::env::set_var("HOME", tmp.path().to_str().unwrap());
        let hm = Arc::new(HistoryManager::new().unwrap());
        std::env::set_var("HOME", old_home);
        (hm, tmp)
    }

    #[test]
    fn test_add_and_get_entry() {
        let (hm, _tmp) = create_test_history();
        let entry = hm
            .add_entry(&NewHistoryEntry {
                text: "Hello world".into(),
                model: "whisper-1".into(),
                duration_ms: Some(5000),
                audio_path: None,
                status: STATUS_SUCCESS.into(),
                error_message: None,
                provider: "OpenAI".into(),
                api_base_url: "https://api.openai.com/v1".into(),
                language: "en".into(),
                retry_of: None,
                asr_duration_sec: Some(5.0),
                polish_tokens: None,
                estimated_cost: Some(0.03),
                polished_text: None,
                recorded_at: 0,
            })
            .unwrap();

        assert!(entry.id > 0);
        assert_eq!(entry.text, "Hello world");
        assert_eq!(entry.model, "whisper-1");
        assert_eq!(entry.status, STATUS_SUCCESS);

        let fetched = hm.get_entry_by_id(entry.id).unwrap();
        assert!(fetched.is_some());
        let fetched = fetched.unwrap();
        assert_eq!(fetched.text, "Hello world");
        assert_eq!(fetched.duration_ms, Some(5000));
    }

    #[test]
    fn test_get_entries_empty() {
        let (hm, _tmp) = create_test_history();
        let entries = hm.get_entries().unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_delete_entry() {
        let (hm, _tmp) = create_test_history();
        let entry = hm
            .add_entry(&NewHistoryEntry {
                text: "To be deleted".into(),
                model: "whisper-1".into(),
                duration_ms: None,
                audio_path: None,
                status: STATUS_SUCCESS.into(),
                error_message: None,
                provider: "OpenAI".into(),
                api_base_url: "https://api.openai.com/v1".into(),
                language: "auto".into(),
                retry_of: None,
                asr_duration_sec: None,
                polish_tokens: None,
                estimated_cost: None,
                polished_text: None,
                recorded_at: 0,
            })
            .unwrap();

        hm.delete_entry(entry.id).unwrap();
        let fetched = hm.get_entry_by_id(entry.id).unwrap();
        assert!(fetched.is_none());
    }

    #[test]
    fn test_search_history() {
        let (hm, _tmp) = create_test_history();
        hm.add_entry(&NewHistoryEntry {
            text: "The quick brown fox".into(),
            model: "whisper-1".into(),
            duration_ms: Some(1000),
            audio_path: None,
            status: STATUS_SUCCESS.into(),
            error_message: None,
            provider: "OpenAI".into(),
            api_base_url: "https://api.openai.com/v1".into(),
            language: "en".into(),
            retry_of: None,
            asr_duration_sec: Some(1.0),
            polish_tokens: None,
            estimated_cost: None,
            polished_text: None,
            recorded_at: 0,
        })
        .unwrap();

        hm.add_entry(&NewHistoryEntry {
            text: "Hello world test".into(),
            model: "whisper-1".into(),
            duration_ms: Some(2000),
            audio_path: None,
            status: STATUS_SUCCESS.into(),
            error_message: None,
            provider: "OpenAI".into(),
            api_base_url: "https://api.openai.com/v1".into(),
            language: "en".into(),
            retry_of: None,
            asr_duration_sec: Some(2.0),
            polish_tokens: None,
            estimated_cost: None,
            polished_text: None,
            recorded_at: 0,
        })
        .unwrap();

        let results = hm.search_history("quick").unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].text.contains("quick"));

        let results = hm.search_history("hello").unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].text.contains("Hello"));

        let results = hm.search_history("").unwrap();
        assert!(results.is_empty());

        let results = hm.search_history("nonexistent").unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_get_entries_page() {
        let (hm, _tmp) = create_test_history();
        for i in 0..5 {
            hm.add_entry(&NewHistoryEntry {
                text: format!("Entry {i}"),
                model: "whisper-1".into(),
                duration_ms: Some(i * 1000),
                audio_path: None,
                status: STATUS_SUCCESS.into(),
                error_message: None,
                provider: "OpenAI".into(),
                api_base_url: "https://api.openai.com/v1".into(),
                language: "en".into(),
                retry_of: None,
                asr_duration_sec: None,
                polish_tokens: None,
                estimated_cost: None,
                polished_text: None,
                recorded_at: 0,
            })
            .unwrap();
        }

        let page1 = hm.get_entries_page(2, 0).unwrap();
        assert_eq!(page1.len(), 2);

        let page2 = hm.get_entries_page(2, 2).unwrap();
        assert_eq!(page2.len(), 2);

        let page3 = hm.get_entries_page(2, 4).unwrap();
        assert_eq!(page3.len(), 1);
    }

    #[test]
    fn test_get_stats_aggregates_all_entries() {
        let (hm, _tmp) = create_test_history();
        hm.add_entry(&NewHistoryEntry {
            text: "Success".into(),
            model: "whisper-1".into(),
            duration_ms: Some(1000),
            audio_path: Some("/tmp/whisp-test.wav".into()),
            status: STATUS_SUCCESS.into(),
            error_message: None,
            provider: "OpenAI".into(),
            api_base_url: "https://api.openai.com/v1".into(),
            language: "en".into(),
            retry_of: None,
            asr_duration_sec: Some(1.0),
            polish_tokens: Some(120),
            estimated_cost: Some(0.012),
            polished_text: None,
            recorded_at: 100,
        })
        .unwrap();
        hm.add_entry(&NewHistoryEntry {
            text: "".into(),
            model: "whisper-1".into(),
            duration_ms: None,
            audio_path: None,
            status: STATUS_FAILED.into(),
            error_message: Some("network".into()),
            provider: "OpenAI".into(),
            api_base_url: "https://api.openai.com/v1".into(),
            language: "en".into(),
            retry_of: None,
            asr_duration_sec: None,
            polish_tokens: Some(30),
            estimated_cost: Some(0.003),
            polished_text: None,
            recorded_at: 200,
        })
        .unwrap();

        let stats = hm.get_stats(150).unwrap();
        assert_eq!(stats.total, 2);
        assert_eq!(stats.success, 1);
        assert_eq!(stats.failed, 1);
        assert_eq!(stats.audio_saved, 1);
        assert_eq!(stats.total_tokens, 150);
        assert!((stats.total_cost - 0.015).abs() < f64::EPSILON);
        assert_eq!(stats.today_count, 1);
    }

    #[test]
    fn test_update_entry() {
        let (hm, _tmp) = create_test_history();
        let entry = hm
            .add_entry(&NewHistoryEntry {
                text: "Original text".into(),
                model: "whisper-1".into(),
                duration_ms: Some(1000),
                audio_path: None,
                status: STATUS_SUCCESS.into(),
                error_message: None,
                provider: "OpenAI".into(),
                api_base_url: "https://api.openai.com/v1".into(),
                language: "en".into(),
                retry_of: None,
                asr_duration_sec: None,
                polish_tokens: None,
                estimated_cost: None,
                polished_text: None,
                recorded_at: 0,
            })
            .unwrap();

        hm.update_entry(
            entry.id,
            "Updated text",
            "whisper-large-v3",
            STATUS_SUCCESS,
            None,
            "Groq",
            "https://api.groq.com/v1",
            "zh",
            None,
        )
        .unwrap();

        let updated = hm.get_entry_by_id(entry.id).unwrap().unwrap();
        assert_eq!(updated.text, "Updated text");
        assert_eq!(updated.model, "whisper-large-v3");
        assert_eq!(updated.provider, "Groq");
    }

    /// Regression test for FTS5 column-count mismatch (bug #1).
    /// The FTS5 SELECT must include all 16 columns that `row_to_history_entry`
    /// reads at indices 0..=15. If a column is missing, this test panics with
    /// "no column named ..." from rusqlite.
    #[test]
    fn test_search_fulltext_column_count_matches_row_parser() {
        let (hm, _tmp) = create_test_history();

        // Insert an entry with polished_text populated to exercise column 15
        hm.add_entry(&NewHistoryEntry {
            text: "the quick brown fox jumps over the lazy dog".into(),
            model: "whisper-1".into(),
            duration_ms: Some(3000),
            audio_path: None,
            status: STATUS_SUCCESS.into(),
            error_message: None,
            provider: "OpenAI".into(),
            api_base_url: "https://api.openai.com/v1".into(),
            language: "en".into(),
            retry_of: None,
            asr_duration_sec: Some(3.0),
            polish_tokens: None,
            estimated_cost: Some(0.01),
            polished_text: Some("The quick brown fox jumps over the lazy dog.".into()),
            recorded_at: 0,
        })
        .unwrap();

        // search_fulltext uses FTS5 when available, falling back to LIKE.
        // Either path must return all 16 columns that row_to_history_entry expects.
        let results = hm.search_fulltext("quick").unwrap();
        assert_eq!(results.len(), 1, "search_fulltext should find the entry");
        assert_eq!(results[0].text, "the quick brown fox jumps over the lazy dog");
        assert_eq!(
            results[0].polished_text.as_deref(),
            Some("The quick brown fox jumps over the lazy dog."),
            "polished_text (column 15) must be returned by search_fulltext"
        );
    }
}
