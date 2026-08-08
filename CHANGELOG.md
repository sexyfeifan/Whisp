# Changelog

## v2.8.0 (2026-08-08)

### Security Fixes
- **P0-2**: `ai_polish_api_key` now uses `skip_serializing_if = "String::is_empty"` to prevent API keys from being written to `settings.json` when stored in system keychain
- **P0-3**: `export_settings_json` no longer includes `api_key` or `ai_polish_api_key` in exported JSON — sensitive credentials stay in system keychain only
- **P0-4**: `save_overlay_position` now logs errors instead of silently ignoring `save_settings` failures

### Bug Fixes
- **P0-1**: Fixed silence detection using `buffer.len() % 512` which assumed fixed cpal callback block size — now uses cumulative sample counter (`samples_since_last_rms`) for reliable RMS calculation on all audio devices
- **P0-5**: Converted all 62 `unwrap()` calls to `expect()` with descriptive messages across `recorder.rs`, `history.rs`, `commands.rs`, and `lib.rs` to prevent cascading panics from mutex poisoning
- **P0-6**: Added `IS_TRANSCRIBING` AtomicBool guard to prevent hotkey from triggering new recording while previous transcription is still in progress
- **P1-3**: Transcription failure message now uses `tr()` for i18n (Chinese/English/Japanese) instead of hardcoded Chinese

### Testing
- Added 21 unit tests for core pure functions:
  - `recorder.rs`: `trim_silence` (4 tests), `encode_wav` (1 test)
  - `transcribe.rs`: `extract_text` (4 tests), `extract_mimo_text` (2 tests), `provider_name` (1 test), `generate_silent_wav` (1 test), `backoff_duration` (1 test)
  - `commands.rs`: `csv_escape` (5 tests)
  - `settings.rs`: API key leak prevention (2 tests), default values (1 test)

### Engineering
- ESLint + Prettier configuration (frontend)
- Clippy integration in CI (backend)

## v2.7.1 (2026-08-07)

- Fix purple text color in overlay
- Restore waveform visualization
- Minimum 3-second silence detection window

## v2.7.0 (2026-08-06)

- Notion-inspired design system overhaul
- New color palette with CSS custom properties
- Improved typography and spacing
