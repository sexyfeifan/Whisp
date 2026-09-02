# Changelog

## v2.12.30 (2026-09-02)

- (add changes here)


## v2.12.29 (2026-09-02)

- (add changes here)


## v2.12.28 (2026-09-02)

- (add changes here)


## v2.12.27 (2026-09-01)

- Restored the animated Thinking Orb in the recording, silence-detection, and transcription states.
- Restored the v2.12.23 recording overlay proportions, waveform colours, and restrained capsule treatment.
- Kept the v2.12.26 main-interface styling and desktop behaviour unchanged.

## v2.12.26 (2026-09-01)

- Restored History as the first and primary destination in the sidebar.
- Grouped navigation into daily use, Settings, and Tools to reduce scanning effort.
- Moved model management and diagnostics out of the primary settings flow.

## v2.12.25 (2026-09-01)

- Replaced the overly neutral 2.12.24 palette with a refined ink-and-iris visual system.
- Added luminous indigo and violet brand accents, cool-spectrum data colours, and richer dark surfaces.
- Improved visual hierarchy across navigation, cards, charts, waveforms, and the recording overlay.
- Kept semantic green, amber, and red focused on status feedback.

## v2.12.24 (2026-09-01)

- Replaced the mixed teal, pink, purple, and rainbow UI palette with a quiet cool-gray system.
- Simplified sidebar selection, brand mark, recording overlay, waveforms, and statistics colours.
- Reserved colour for success, warning, and error feedback.
- Added a version-sync command and established a `0.0.1` patch increment rule for every update.

## v2.12.23 (2026-09-01)

- Prevented duplicate app instances and duplicate menu-bar icons.
- Launch at login now starts silently in the menu bar without showing the main window.
- Fixed TS build errors — unescaped quotes in i18n, moved m before use, installed plugin-opener.

## v2.12.22 (2026-08-12)

- Batch fix of 20+ bugs and code quality issues across the codebase.

## v2.12.21 (2026-08-12)

- Fixed all 3 pre-existing CI failures and dead code cleanup.
- Used ASCII API key in settings tests to avoid serde_json Unicode escaping.

## v2.12.20 (2026-08-12)

- Batch fix of 35+ bugs from a full code audit.
- Fixed dynamic RIFF chunk parsing for WAV splitting (#9).

## v2.12.19 (2026-08-12)

- Fixed crash on fresh install — i18n messages undefined when API test warns.

## v2.12.18 (2026-08-10)

- UI refinements across the app.
- Added local streaming model support.

## v2.12.17 (2026-08-10)

- Removed volume control in favour of system volume.
- Switched to teal accent colour.
- Added download speed indicator.
- Improved AI summary formatting.

## v2.12.16 (2026-08-10)

- Fixed 8 bugs from DeepSeek code review.

## v2.12.15 (2026-08-10)

- Shortened overlay waveform and widened text area.
- Removed skip buttons from overlay.

## v2.12.14 (2026-08-10)

- Overlay centering improvements.
- Added 10-second skip forward/back.
- Progress bar deduplication.
- Added model annotations in the UI.

## v2.12.13 (2026-08-10)

- Added globe tray icons for macOS.
- Improved audio playback synchronisation.
- Overlay redesign refinements.
- Fixed model download issues.
- Reverted accidental TypeScript version bump.

## v2.12.12 (2026-08-10)

- Transparent overlay and rounded capsule design.
- More reliable file export functionality.
- Fixed hsl()/hsla() colour syntax inconsistency.

## v2.12.11 (2026-08-10)

- Fixed display_text lifetime issue (borrowed &str → owned String).
- Fixed voice tail clipping at end of recordings.
- Added error copy/select and dismiss buttons.
- Fixed borrow-of-moved-value compiler error.

## v2.12.10 (2026-08-10)

- Version bump to stabilise 2.12.9 release.

## v2.12.9 (2026-08-10)

- Added subtitle colour customisation.
- Waveform and text now display simultaneously.
- Enlarged tray icon to 48×48.
- Fixed recording time display.
- Added progress bar drag-to-seek.
- Added upload audio-to-text conversion.
- Added AI polish mode selection.
- Audio chunking for MiMo 10 MB limit.
- Added playback time display and download progress.
- Fixed CI build failures and compiler warnings.

## v2.12.8 (2026-08-10)

- Improved overlay appearance and enlarged tray icon.
- Added click-to-jump in transcription text.
- Added pause/resume recording.
- Added automatic paste diagnostics.
- Updated README with v2.12 feature status.

## v2.12.7 (2026-08-10)

- Added overlay capsule design and orb idle icon.
- Added paste fallback when primary method fails.
- Faster streaming pipeline.
- Fixed sync issues.

## v2.12.6 (2026-08-10)

- Added independent API key configuration for AI summary.
- Removed unused RECORDING_ICON constant.
- Fixed broken AudioPlayer stub.
- Fixed text-audio synchronisation.
- Improved AI summary error messages.

## v2.12.4 (2026-08-10)

- Auto-hide overlay after 1.5 seconds.
- Added orb tray icon animation.
- Fixed streaming sample rate.
- Fixed play button, overlay rendering, text-audio sync, and AI summary.

## v2.12.2 (2026-08-10)

- Fixed tray icon restore on Linux.
- Fixed streaming type mismatch (Mutex<Option<StreamingState>>).
- Removed MutexGuard hold across await in streaming loop.
- Removed polish settings page; improved i18n for clear dialog.
- Added Chinese fallback models.

## v2.12.0 (2026-08-09)

- Streaming ASR (automatic speech recognition).
- AI summary generation for transcriptions.
- SRT, Markdown, and CSV export.
- Speaker diarization support.
- FTS5 full-text search across history.
- Global hotkey for recording.
- Custom vocabulary support.

## v2.11.0 (2026-08-09)

- Configurable pricing with CSV crate.
- Waveform preview in the UI.
- Plugin system architecture.
- Translation (i18n) improvements.
- Model management UI.
- Multi-device sync via shared directory.

## v2.10.0 (2026-08-09)

- Added Whisper model cache management commands.
- Model download and local caching improvements.

## v2.9.0 (2026-08-09)

- P0/P1/P2 comprehensive optimisation pass.
- Fixed Vec<u8> → &[u8] coercion in validate_api_key.
- Added mut to whisper.rs download_model response.
- Reverted createUpdaterArtifacts (CI signing keys not configured).
- Restored Cargo.lock from v2.8.8 to prevent dependency breakage.
- CI pipeline fixes: Rust cache bust, debug output, test capture.

## v2.8.8 (2026-08-08)

- Fixed SQL trigger syntax error — removed illegal backslash escapes in FTS5 triggers.
- Synced Cargo.lock version.

## v2.8.7 (2026-08-08)

- Forced ad-hoc codesign in CI for macOS builds.
- Improved ad-hoc signing robustness and debug logging.

## v2.8.6 (2026-08-08)

- Disabled hardenedRuntime for macOS (missing Apple notarization keys).

## v2.8.5 (2026-08-08)

- Disabled hardenedRuntime for macOS (blocking Gatekeeper without notarization).
- Added Apple notarization to macOS release CI builds.

## v2.8.4 (2026-08-08)

- Implemented all 7 remaining features from the v2.8 roadmap.

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
