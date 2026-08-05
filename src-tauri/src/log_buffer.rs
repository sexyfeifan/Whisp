use log::{LevelFilter, Log, Metadata, Record};
use serde::Serialize;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

struct RingBufferLogger {
    buffer: Mutex<Vec<LogEntry>>,
    max_entries: usize,
}

static LOGGER: RingBufferLogger = RingBufferLogger {
    buffer: Mutex::new(Vec::new()),
    max_entries: 500,
};

impl Log for RingBufferLogger {
    fn enabled(&self, _metadata: &Metadata) -> bool {
        true
    }
    fn log(&self, record: &Record) {
        let entry = LogEntry {
            timestamp: chrono::Local::now()
                .format("%Y-%m-%d %H:%M:%S%.3f")
                .to_string(),
            level: record.level().to_string(),
            target: record.target().to_string(),
            message: format!("{}", record.args()),
        };
        eprintln!(
            "[{}] [{}] {}: {}",
            entry.timestamp, entry.level, entry.target, entry.message
        );
        if let Ok(mut buf) = self.buffer.lock() {
            buf.push(entry);
            if buf.len() > self.max_entries {
                buf.remove(0);
            }
        }
    }
    fn flush(&self) {}
}

pub fn init() {
    let _ = log::set_logger(&LOGGER);
    log::set_max_level(LevelFilter::Info);
}

pub fn get_logs() -> Vec<LogEntry> {
    LOGGER
        .buffer
        .lock()
        .map(|buf| buf.clone())
        .unwrap_or_default()
}

pub fn clear_logs() {
    if let Ok(mut buf) = LOGGER.buffer.lock() {
        buf.clear();
    }
}
