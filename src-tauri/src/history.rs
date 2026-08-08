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
];