<p align="center">
  <img src="src-tauri/logo/appicon.png" alt="Whisp" width="128" height="128">
</p>

<h1 align="center">Whisp</h1>

<p align="center">
  <strong>Speak. Transcribe. Paste.</strong>
</p>

<p align="center">
  <a href="https://github.com/sexyfeifan/Whisp/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/sexyfeifan/Whisp?style=flat-square&color=1c1c1e"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/sexyfeifan/Whisp?style=flat-square&color=1c1c1e&cacheSeconds=1"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-333?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/sexyfeifan/Whisp/releases/latest">Download</a>
</p>

<p align="center">
  English | <a href="README.zh.md">简体中文</a>
</p>

---

Whisp is a desktop speech-to-text app focused on one thing: instantly turning your voice into text and pasting it where your cursor is.

Powered by OpenAI-compatible transcription APIs (OpenAI by default), with preset model suggestions and custom model support. Built with Tauri v2.

## Product Intro

Whisp is made for people who type a lot but think faster than they can type:

- Press once, speak naturally.
- Press again, get accurate text.
- Text is auto-pasted to the current app.

No complex workflows, no heavy setup, no context switching.

## How It Works

1. Tap `Right ⌘` on macOS / `Right Ctrl` on Windows (customizable)
2. Speak
3. Tap again to stop — text is transcribed and pasted instantly

## Features

- **One Shortcut** — Global hotkey to start/stop recording. No UI to navigate.
- **Auto-Paste** — Transcribed text goes straight to your cursor. No copy needed.
- **Model Presets + Custom Models** — Built-in popular model names plus free-form custom model input.
- **Model Guide** — In-app model guide button with model descriptions and selection hints.
- **Waveform Overlay** — Minimal always-on-top visualizer while recording.
- **History** — All transcriptions saved locally with audio files for retry.
- **System Tray** — Runs quietly in the background.

## Xiaohongshu Style Intro (中文)

真的会爱上这种“张嘴就能写字”的效率感 ✨  
`Whisp` 就是那种你用了就回不去的办公小工具：

- 开会复盘：边听边说重点，秒变文字。
- 写作卡壳：先说出来，再慢慢润色。
- 日常回复：不用来回切输入法，想到就说。

一句话总结：**把“打字焦虑”换成“说话自由”。**

## Build from Source

Prerequisites: [Node.js](https://nodejs.org/) and [Rust](https://rustup.rs/).

```bash
git clone https://github.com/sexyfeifan/Whisp.git
cd Whisp
npm install
npm run tauri dev
```

## License

[Apache License 2.0](LICENSE)

---

<p align="center">
  Speak. Transcribe. Paste.<br>
  <sub>&copy; 2026 <a href="https://github.com/sexyfeifan">sexyfeifan</a></sub>
</p>
