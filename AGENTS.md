# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Whisp is a minimal desktop speech-to-text app built with **Tauri v2** (Rust backend + React/TypeScript frontend). It captures microphone audio, sends it to OpenAI Whisper API (or any compatible ASR provider), and auto-pastes the transcribed text into the active application.

## Development Commands

```bash
# Run in development mode (starts Vite dev server + Tauri native app)
npm run tauri dev

# Production build
npm run tauri build

# Frontend only (Vite dev server on port 1420)
npm run dev

# Type-check + bundle frontend
npm run build
```

## Versioning

- Every user-facing update increments the patch version by exactly `0.0.1`.
- `package.json` is the version source of truth. After changing it, run `npm run sync-version` before testing or packaging.
- The sync command keeps `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json` aligned.

### Testing

```bash
# Rust unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Frontend type check
npx tsc --noEmit

# Frontend build
npm run build
```

### Linting

```bash
# Rust (Clippy)
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

# Frontend (ESLint)
npx eslint src/
```

## Architecture

### Two-Process Model (Tauri v2)

- **Rust backend** (`src-tauri/src/`): Audio capture, API calls (OpenAI/MiMo/Groq), SQLite history, keyboard simulation, system tray, global shortcuts, offline Whisper engine
- **Web frontend** (`src/`): React UI for settings, history, and recording overlay

### Two-Window Design

- **Main window** (`src/App.tsx`): Settings, history list, onboarding. Hides on close (tray app pattern).
- **Overlay window** (`src/overlay/`): Decorationless, always-on-top waveform visualization. Created/destroyed dynamically per recording session.

### Backend Modules (`src-tauri/src/`)

| File | Responsibility |
|------|---------------|
| `lib.rs` | Core app logic: window management, shortcut registration, recording flow orchestration |
| `commands.rs` | Tauri IPC command handlers (bridge between frontend and backend) |
| `recorder.rs` | Audio recording via `cpal` on a dedicated thread, real-time RMS events |
| `transcribe.rs` | ASR API client: OpenAI Whisper, MiMo ASR, Groq, Fireworks, Deepgram |
| `history.rs` | SQLite storage with `rusqlite_migration` and FTS5 search |
| `settings.rs` | JSON settings persistence + macOS Keychain integration |
| `paste.rs` | Auto-paste via `enigo` keyboard simulation, macOS Accessibility FFI |
| `whisper.rs` | Offline Whisper engine via `whisper-rs` (downloadable GGML models) |
| `polish.rs` | AI text polish via LLM APIs (GPT-4o-mini, DeepSeek, etc.) |
| `hotkey.rs` | Native single-key hotkey monitoring (Right Cmd on macOS, Right Ctrl on Windows) |
| `shortcut.rs` | Global shortcut registration and debounce (user-configurable via settings) |
| `sound.rs` | Audio feedback tones (ascending/descending) via `cpal` |
| `cost.rs` | API cost estimation for ASR and polish operations |
| `log_buffer.rs` | Ring buffer logger (VecDeque-based, 500 entries) |
| `permissions.rs` | macOS microphone and accessibility permission checks |
| `tray.rs` | System tray menu with recent transcriptions |

### Recording Flow

1. Native hotkey (default: Right Command on macOS / Right Control on Windows, solo tap) triggers `toggle_recording()`
2. **Start**: Creates overlay window → plays start sound → starts `cpal` audio stream → registers Escape for cancel
3. **Stop** (hotkey again): Unregisters Escape → stops recording → encodes WAV (16-bit mono) → calls API → clipboard write → closes overlay → waits configured delay → simulate Cmd+V → save to SQLite history
4. **Cancel** (Escape): Stops recording, discards audio, closes overlay

### Data Storage

All persisted to `~/.whisp/` (migrated from `~/.nanowhisper/`):
- `settings.json` — API config, model, language, shortcut (API keys stored in Keychain when available)
- `history.db` — SQLite (table: `transcriptions`, with FTS5 full-text search)
- `audio/` — WAV files (enables retry with different model/settings)
- `models/` — Downloaded GGML Whisper models for offline transcription

### Key Technical Decisions

- **Shortcut debounce**: 500ms debounce + `AtomicBool` CAS guard to prevent Tauri's known macOS double-fire bug
- **Transparent overlay**: Window uses `.transparent(true)` with semi-transparent background (`rgba(28, 28, 30, 0.92)`)
- **All windows created programmatically** — none defined in `tauri.conf.json`
- **enigo v0.6** wrapped in `Mutex<Enigo>` (`EnigoState`), initialized after Accessibility permission is granted
- **`.env`** loaded via `dotenvy` for dev convenience (gitignored)
- **API Key storage**: macOS Keychain (best-effort), disk fallback only when Keychain unavailable
- **Offline Whisper**: Enabled by default via `offline-whisper` Cargo feature, uses `whisper-rs` with GGML models
- **Streaming model downloads**: Large Whisper models (up to 1.5 GB) are streamed to disk to avoid OOM

### Frontend Stack

- React 18 + TypeScript (strict mode)
- Tailwind CSS v4 + custom CSS variables for light/dark theme
- Vite v6 with multi-entry build (main + overlay)
- Tauri IPC via `@tauri-apps/api` `invoke()` and `listen()`

### App Icons

Logo source files in `src-tauri/logo/`:

- **macOS**: Uses `appicon.png` (white background, rounded corners), generates `icons/icon.icns` and size variants
- **Windows**: Uses `appicon0.png` (transparent background), generates `icons/icon.ico` (16/32/48/256 sizes)

The two icon sets are independent; modifying one does not affect the other.

### CI/CD

GitHub Actions release workflow (`.github/workflows/release.yml`) triggered by `v*` tags. Builds for macOS ARM64, macOS x64, Linux x64, Windows x64. macOS builds include ad-hoc code signing; full notarization requires Apple Developer credentials as GitHub Secrets.
