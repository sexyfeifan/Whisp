use anyhow::Result;
use chrono::Timelike;
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
        let timestamp = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE transcriptions
             SET text = ?1,
                 model = ?2,
                 timestamp = ?3,
                 status = ?4,
                 error_message = ?5,
                 provider = ?6,
                 api_base_url = ?7,
                 language = ?8,
                 polished_text = ?9
             WHERE id = ?10",
            rusqlite::params![
                text,
                model,
                timestamp,
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
                    t.estimated_cost
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

        for (i, entry) in entries.iter().enumerate() {
            let index = i + 1;
            let start_secs = entry.timestamp;
            let duration_ms = entry.duration_ms.unwrap_or(3000);
            let end_secs = start_secs + (duration_ms / 1000);
            let end_nanos = ((duration_ms % 1000) * 1_000_000) as u32;

            let start_dt = chrono::DateTime::from_timestamp(start_secs, 0).unwrap_or_default();
            let end_dt = chrono::DateTime::from_timestamp(end_secs, end_nanos).unwrap_or_default();

            srt.push_str(&format!("{}\n", index));
            srt.push_str(&format!(
                "{:02}:{:02}:{:02},000 --> {:02}:{:02}:{:02},{:03}\n",
                start_dt.hour(),
                start_dt.minute(),
                start_dt.second(),
                end_dt.hour(),
                end_dt.minute(),
                end_dt.second(),
                end_dt.nanosecond() / 1_000_000,
            ));
            srt.push_str(&format!("{}\n\n", entry.text));
        }

        Ok(srt)
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
}
