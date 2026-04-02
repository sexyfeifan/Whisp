use anyhow::Result;
use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};
use serde::Serialize;
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
];

#[derive(Debug, Clone, Serialize)]
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
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Utc::now().timestamp();
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
                retry_of
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
        })
    }

    pub fn get_entry_by_id(&self, id: i64) -> Result<Option<HistoryEntry>> {
        let conn = self.conn.lock().unwrap();
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
                retry_of
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
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
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
                 language = ?8
             WHERE id = ?9",
            rusqlite::params![
                text,
                model,
                timestamp,
                status,
                error_message,
                provider,
                api_base_url,
                language,
                id
            ],
        )?;
        Ok(())
    }

    pub fn get_entries(&self) -> Result<Vec<HistoryEntry>> {
        let conn = self.conn.lock().unwrap();
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
                retry_of
             FROM transcriptions
             ORDER BY timestamp DESC",
        )?;
        let entries = stmt
            .query_map([], row_to_history_entry)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    pub fn delete_entry(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let audio_path: Option<String> = conn
            .query_row(
                "SELECT audio_path FROM transcriptions WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        if let Some(path) = audio_path {
            let _ = std::fs::remove_file(&path);
        }
        conn.execute("DELETE FROM transcriptions WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn clear_all(&self) -> Result<()> {
        let audio_dir = self.audio_dir();
        if audio_dir.exists() {
            let _ = std::fs::remove_dir_all(&audio_dir);
            let _ = std::fs::create_dir_all(&audio_dir);
        }
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM transcriptions", [])?;
        Ok(())
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
    })
}
