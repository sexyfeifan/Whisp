<p align="center">
  <img src="src-tauri/logo/appicon.png" alt="Whisp" width="128" height="128">
</p>

<h1 align="center">Whisp</h1>

<p align="center">
  <strong>说话即输入，停下即粘贴。</strong><br>
  <em>Speak → Transcribe → Paste — in seconds.</em>
</p>

<p align="center">
  <a href="https://github.com/sexyfeifan/Whisp/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/sexyfeifan/Whisp?style=flat-square&color=1c1c1e"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/sexyfeifan/Whisp?style=flat-square&color=1c1c1e&cacheSeconds=1"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-333?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/sexyfeifan/Whisp/releases/latest">下载最新版本 / Download Latest</a>
</p>

---

## 软件简介 / Overview

**Whisp** 是一款跨平台桌面语音转文字工具。按一下快捷键开始说话，说完再按一次，文字就会自动粘贴到你当前光标所在的位置。无需手动复制，无需切换窗口，全程零操作成本。

**Whisp** is a cross-platform desktop voice-to-text app. Press a hotkey to start speaking, press it again when done — the transcribed text is automatically pasted at your cursor. No copy-paste, no window switching, zero friction.

### 核心工作流 / Core Workflow

```
按快捷键 → 说话 → 再按快捷键 → 文字自动粘贴到当前应用
Hotkey → Speak → Hotkey again → Text pasted into active app
```

整个过程通常在 2-5 秒内完成。/ The entire process takes 2-5 seconds.

---

## 功能特性 / Features

### 🎙️ 语音转文字 / Voice-to-Text

- **一键录音转写 / One-Key Transcription**：全局热键启停录音，无需打开任何界面。Global hotkey starts/stops recording without opening any UI.
- **实时流式转写 / Real-Time Streaming**：录音过程中在桌面弹出胶囊形浮窗，实时显示转写文字，支持打字机效果。Capsule overlay shows live transcription with typewriter effect during recording.
- **离线 Whisper 转写 / Offline Whisper**：内置 whisper-rs，无需联网即可转写，支持 tiny/base/small/medium 模型自动推荐。Built-in whisper-rs for offline transcription; auto-recommends model based on available RAM.
- **自动回退 / Auto-Fallback**：云端 API 失败时自动切换到本地 Whisper，零中断。Cloud API fails → automatically falls back to local Whisper, zero interruption.
- **智能静音检测 / Intelligent Silence Detection**：VAD 引擎带噪声底噪校准、自适应阈值和滞后机制，说完话自动停止录音。VAD engine with noise-floor calibration, adaptive threshold, and hysteresis — stops recording automatically when you stop speaking.
- **自动粘贴 / Auto-Paste**：转写完成后自动复制到剪贴板并粘贴到当前应用（Linux 支持 xdotool/ydotool/wtype 多级 fallback）。Auto-copies to clipboard and pastes into active app (Linux: xdotool/ydotool/wtype fallback chain).
- **静音裁剪 / Silence Trimming**：自动去除录音首尾的静音段，减少上传体积。Trims leading/trailing silence to reduce upload size.
- **录音音频保留 / Audio Retention**：可选保存每段录音的 WAV 文件，支持事后重试转写。Optionally saves WAV files for later re-transcription.

### ✨ AI 润色 / AI Polish

- **自动纠错 / Auto-Correction**：修正语音转写中的错别字和识别错误。Fixes typos and ASR errors.
- **去除口癖 / Filler Removal**：自动去除"嗯"、"啊"、"那个"、"就是说"等口头禅。Removes filler words (um, uh, like, you know, etc.).
- **口语转书面语 / Spoken → Written**：将口语化表达自动转换为规范的书面语。Converts casual speech to polished written form.
- **自定义提示词 / Custom Prompts**：用户可自定义 AI 润色的提示词，满足个性化需求。Customize AI polish prompts for your style.
- **多 LLM 支持 / Multi-LLM**：支持 DeepSeek、OpenAI、MiMo 等多种 AI 模型进行润色。Works with DeepSeek, OpenAI, MiMo, and more.

### 📝 AI 摘要 / AI Summary

- **录音摘要 / Recording Summary**：一键为转写内容生成 AI 摘要，快速回顾要点。One-click AI summary for quick review.
- **独立 API 配置 / Independent API**：摘要可配置不同于转写的 API 端点和密钥。Separate API endpoint and key for summaries.
- **自动回退 / Auto-Fallback**：未配置摘要 API 时自动使用转写 API。Falls back to transcription API when not configured.

### 🔌 多服务商支持 / Multi-Provider

| 服务商 / Provider | 说明 / Description |
|---|---|
| **OpenAI** | 官方 Whisper API，支持 gpt-4o-transcribe 等模型 / Official Whisper API, gpt-4o-transcribe, etc. |
| **Groq** | 免费高速的 Whisper 推理服务 / Free high-speed Whisper inference |
| **DeepSeek** | 国产高性能大模型 / High-performance Chinese LLM |
| **小米 MiMo** | 支持中英双语、方言、歌词转写及嘈杂环境识别 / Bilingual, dialect, lyrics, noisy-environment |
| **自定义 / Custom** | 任何兼容 OpenAI 格式的第三方 API / Any OpenAI-compatible endpoint |

### 🧠 文字后处理 / Post-Processing Engine

- **中文纠错 / Chinese Corrections**：自动修正"的/地/得"用法、标点符号、数字格式。Auto-corrects 的/地/得 usage, punctuation, and number formatting.
- **英文纠错 / English Corrections**：自动首字母大化、句末标点、多余空格修复。Auto-capitalizes sentences, adds periods, fixes spacing.
- **领域词汇预设 / Domain Vocabulary Presets**：内置医疗、法律、科技、金融四大专业词库，显著提升专业术语准确率。Built-in medical, legal, tech, and finance vocabulary presets.
- **智能提示词注入 / Smart Prompt Injection**：根据语言和领域自动构建最优 Whisper 提示词。Automatically builds optimal Whisper prompts based on language and domain.

### 📊 Token 计费统计 / Usage Tracking

- **费用估算 / Cost Estimation**：根据服务商定价自动估算每次转写的费用。Estimates cost per transcription based on provider pricing.
- **Token 统计 / Token Stats**：记录 AI 润色消耗的 Token 数量。Tracks tokens consumed by AI polish.
- **累计统计 / Cumulative Stats**：历史记录页显示累计费用和累计 Token 用量。History page shows cumulative cost and token usage.
- **音频时长记录 / Duration Tracking**：记录每次转写的音频时长。Records audio duration for each transcription.

### 📁 历史记录 / History

- **本地存储 / Local Storage**：所有转写记录保存在本地 SQLite 数据库。All records stored in local SQLite database.
- **FTS5 全文搜索 / Full-Text Search**：支持中文和英文的全文搜索。Full-text search across Chinese and English transcriptions.
- **标签分类 / Tags & Categories**：支持给记录添加标签，按标签筛选。Tag records and filter by tag.
- **批量导出 / Batch Export**：支持 TXT/MD/CSV/JSON 多格式批量导出。Batch export to TXT, MD, CSV, JSON.
- **音频播放 / Audio Playback**：内置音频播放器，支持进度条拖动、播放/暂停控制。Built-in audio player with seek, play/pause.
- **AI 摘要 / AI Summary**：对转写记录一键生成 AI 摘要。One-click AI summary for any record.
- **重试转写 / Retry Transcription**：对失败的记录可重新转写（保留原始音频）。Retry failed transcriptions with original audio.
- **错误信息可复制 / Copyable Errors**：失败记录的错误信息支持一键复制。One-click copy of error messages.

### 🔄 多设备同步 / Multi-Device Sync

- **iCloud/Dropbox/本地 / iCloud/Dropbox/Local**：通过共享目录实现多设备历史记录同步。Sync history across devices via shared directory.
- **冲突解决 / Conflict Resolution**：Last-Write-Wins 策略，增量同步，同步状态追踪。Last-Write-Wins resolution, incremental sync, status tracking.

### 🌐 四语言界面 / 4-Language UI

- **简体中文 / Chinese** / **English / 英语** / **日本語 / Japanese** / **한국어 / Korean**
- 完整覆盖所有界面元素和错误信息。Full coverage of all UI elements and error messages.

### 🖥️ 界面与交互 / UI & Interaction

- **侧边栏导航 / Sidebar Navigation**：左侧固定导航栏，按使用频率分组。Fixed sidebar grouped by usage frequency.
- **页面切换动画 / Page Transitions**：平滑的淡入滑动过渡效果。Smooth fade-slide transitions.
- **暗色模式 / Dark Mode**：跟随系统自动切换深色/浅色主题。Follows system dark/light theme.
- **系统托盘 / System Tray**：最小化到系统托盘，显示紫色光球呼吸动画图标，支持最近转写记录快速访问。Purple orb breathing animation in tray, with quick access to recent transcriptions.
- **开机自启 / Launch at Login**：可选登录时自动启动，静默启动到托盘。Optional silent launch to tray at login.
- **浮窗位置记忆 / Overlay Position Memory**：录音波形浮窗跨会话记住上次位置。Overlay remembers position across sessions.

### ⚙️ 设置导入导出 / Import/Export

- **一键导出 / One-Click Export**：将所有设置（API 地址、密钥、模型名、快捷键等）导出为 JSON。Export all settings to JSON.
- **一键导入 / One-Click Import**：在另一台设备上粘贴 JSON 即可恢复全部配置。Import settings on another device by pasting JSON.

### 🔄 更新机制 / Auto-Update

- **自动检测更新 / Auto-Check**：启动时自动检查 GitHub Releases 是否有新版本。Checks GitHub Releases on startup.
- **应用内下载 / In-App Download**：点击下载按钮自动下载安装包。One-click download of installer.
- **多平台安装包 / Multi-Platform**：macOS DMG、Windows EXE/MSI、Linux DEB/RPM/AppImage。

---

## 下载安装 / Installation

从 [Releases](https://github.com/sexyfeifan/Whisp/releases/latest) 下载最新版本。  
Download the latest version from [Releases](https://github.com/sexyfeifan/Whisp/releases/latest).

### macOS

| 文件 / File | 架构 / Arch | 说明 / Notes |
|---|---|---|
| `Whisp_x.x.x_aarch64.dmg` | Apple Silicon (M1–M4) | **推荐 / Recommended** |
| `Whisp_x.x.x_x64.dmg` | Intel Mac | 2020 年前的 Mac / Pre-2020 Mac |

### Windows

| 文件 / File | 说明 / Notes |
|---|---|
| `Whisp_x.x.x_x64-setup.exe` | **推荐** — NSIS 安装程序 / NSIS installer |
| `Whisp_x.x.x_x64_en-US.msi` | 企业部署 / Enterprise deployment |

### Linux

| 文件 / File | 发行版 / Distro |
|---|---|
| `Whisp_x.x.x_amd64.deb` | Ubuntu、Debian、Mint — **推荐 / Recommended** |
| `Whisp_x.x.x-1.x86_64.rpm` | Fedora、RHEL、openSUSE |
| `Whisp_x.x.x_amd64.AppImage` | 通用便携版 / Universal portable |

---

## 使用方法 / Usage

### 首次使用 / First Run

1. 安装并启动 Whisp / Install and launch Whisp
2. 按照引导页面完成配置 / Follow the onboarding wizard:
   - **第 1 步**：选择 API 服务商，输入 API Key / Select provider, enter API key
   - **第 2 步**：授权麦克风权限 / Grant microphone permission
   - **第 3 步**：授权辅助功能权限（macOS）/ Grant accessibility permission (macOS)
   - **第 4 步**：设置快捷键（默认：右 ⌘）/ Set hotkey (default: Right ⌘)

### 日常使用 / Daily Use

1. 按下快捷键开始录音 / Press hotkey to start recording
2. 对着麦克风说话 / Speak into microphone
3. 再次按下快捷键停止录音（或等待静音自动停止）/ Press hotkey again (or wait for auto-stop)
4. 文字自动粘贴到当前光标位置 / Text auto-pastes at cursor

---

## 快捷键 / Keyboard Shortcuts

| 快捷键 / Shortcut | 功能 / Action |
|---|---|
| 右 ⌘（macOS）/ 右 Ctrl（Win/Linux） | 开始/停止录音 / Start/stop recording |
| Esc | 取消当前录音 / Cancel recording |

快捷键可在设置中自定义为任意组合键。  
Hotkeys can be customized to any key combination in Settings.

---

## 设置说明 / Configuration

### API 配置 / API Setup

- **端点预设 / Endpoint Presets**：内置 OpenAI、Groq、DeepSeek、MiMo 等常用服务商。Built-in presets for OpenAI, Groq, DeepSeek, MiMo.
- **API Base URL**：服务商的 API 地址，支持自定义。Provider API URL, customizable.
- **API Key**：存储在系统钥匙串中，不会导出到 JSON。Stored in system keychain, excluded from exports.
- **模型名称 / Model**：选择或输入模型名。Select or type a model name.

### 录音设置 / Recording Settings

- **实时流式转写 / Streaming Transcription**：录音过程中实时显示转写结果。Show live transcription during recording.
- **静音超时 / Silence Timeout**：说完话后多久自动停止录音（默认 60 秒）。Auto-stop delay after silence (default 60s).
- **自适应静音阈值 / Adaptive Silence**：VAD 自动校准噪声底限，无需手动调节。VAD auto-calibrates noise floor.
- **离线转写 / Offline Transcription**：默认启用，支持本地 Whisper 模型。Enabled by default with local Whisper models.
- **自动回退 / Auto-Fallback**：云端失败自动切换本地。Auto-switch to local on cloud failure.
- **领域词汇 / Domain Vocabulary**：医疗、法律、科技、金融专业词库预设。Medical, legal, tech, finance presets.

### AI 润色 / AI Polish

- **启用/禁用 / Toggle**：开关 AI 润色功能。Enable/disable AI polish.
- **独立 API / Separate API**：可使用与转写不同的 API 服务商和模型。Use a different provider/model than transcription.
- **自定义提示词 / Custom Prompts**：自定义润色风格。Customize polish style.

### 数据备份 / Data Backup

- **导出设置 / Export**：将全部配置导出到剪贴板（JSON 格式）。Export all settings to clipboard (JSON).
- **导入设置 / Import**：从剪贴板导入配置。Import settings from clipboard.

---

## 诊断功能 / Diagnostics

### 运行日志 / Runtime Logs

在「诊断」页面可以查看应用的实时运行日志，包含：  
View real-time runtime logs in the Diagnostics page:

- 所有转写请求的详细信息 / Detailed transcription request info
- 成功/失败状态及错误详情 / Success/failure status with error details
- AI 润色请求和结果 / AI polish requests and results
- 设置变更记录 / Settings change log
- 权限检查结果 / Permission check results

### 连接状态 / Connection Status

- API 是否已配置 / API configured
- API Key 是否已设置 / API key set
- 模型是否已选择 / Model selected
- 麦克风权限状态 / Microphone permission
- 辅助功能权限状态 / Accessibility permission (macOS)

---

## 技术架构 / Architecture

- **前端 / Frontend**：React 18 + TypeScript + Tailwind CSS v4
- **后端 / Backend**：Rust + Tauri v2
- **数据库 / Database**：SQLite（本地历史记录 / local history）
- **音频 / Audio**：cpal（跨平台音频采集 / cross-platform audio capture）
- **离线 ASR / Offline ASR**：whisper-rs（本地 Whisper 推理 / local Whisper inference）
- **重采样 / Resampling**：rubato（sinc 重采样 / sinc resampling）
- **图标 / Icons**：Lucide React
- **动画 / Animation**：Framer Motion
- **UI 组件 / UI**：shadcn/ui 风格组件库 / shadcn/ui-style component library

---

## 从源码构建 / Build from Source

前置条件 / Prerequisites：[Node.js](https://nodejs.org/) 和 [Rust](https://rustup.rs/)。

```bash
git clone https://github.com/sexyfeifan/Whisp.git
cd Whisp
npm install
npm run tauri dev    # 开发模式 / Development
npm run tauri build  # 生产构建 / Production build
```

---

## 项目来源 / Credits

本项目基于 [NanoWhisper](https://github.com/jicaiinc/nanowhisper) 修改而来，主要增加了第三方 API 转发支持、多服务商适配、AI 润色、Token 计费、离线 Whisper、智能静音检测、流式转写等功能。  
Based on [NanoWhisper](https://github.com/jicaiinc/nanowhisper), with major additions: multi-provider API support, AI polish, usage tracking, offline Whisper, intelligent silence detection, streaming transcription, and more.

---

## 许可证 / License

[Apache License 2.0](LICENSE)

---

<p align="center">
  说话即输入，停下即粘贴。<br>
  <em>Speak, transcribe, paste.</em><br>
  <sub>&copy; 2026 <a href="https://github.com/sexyfeifan">sexyfeifan</a></sub>
</p>
