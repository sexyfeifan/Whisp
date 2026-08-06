<p align="center">
  <img src="src-tauri/logo/appicon.png" alt="Whisp" width="128" height="128">
</p>

<h1 align="center">Whisp</h1>

<p align="center">
  <strong>说话即输入，停下即粘贴。</strong>
</p>

<p align="center">
  <a href="https://github.com/sexyfeifan/Whisp/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/sexyfeifan/Whisp?style=flat-square&color=1c1c1e"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/sexyfeifan/Whisp?style=flat-square&color=1c1c1e&cacheSeconds=1"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-333?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/sexyfeifan/Whisp/releases/latest">下载最新版本</a>
</p>

---

## 软件简介

Whisp 是一款极简高效的桌面语音转文字工具。按一下快捷键开始说话，再说完后再按一次，文字就会自动粘贴到你当前光标所在的位置。无需手动复制，无需切换窗口，全程零操作成本。

它适合所有"想得比打字快"的人：写作者、程序员、开会记录、快速回复消息……任何需要把想法快速变成文字的场景，Whisp 都能帮到你。

### 核心工作流

```
按快捷键 → 说话 → 再按快捷键 → 文字自动粘贴到当前应用
```

整个过程通常在 2-5 秒内完成。

---

## 功能特性

### 语音转文字

- **一键录音转写**：全局热键启停录音，无需打开任何界面
- **自动粘贴**：转写完成后自动复制到剪贴板并粘贴到当前应用
- **静音自动停止**：可配置静音时长阈值，说完话自动停止录音，无需再按快捷键
- **静音裁剪**：自动去除录音首尾的静音段，减少上传体积，加快响应
- **录音音频保留**：可选保存每段录音的 WAV 文件，支持事后重试转写

### AI 润色

- **自动纠错**：修正语音转写中的错别字和识别错误
- **去除口癖**：自动去除"嗯"、"啊"、"那个"、"就是说"等口头禅
- **口语转书面语**：将口语化表达自动转换为规范的书面语
- **自定义提示词**：用户可自定义 AI 润色的提示词，满足个性化需求
- **支持多种 LLM**：支持 DeepSeek、OpenAI、MiMo 等多种 AI 模型进行润色

### 多服务商支持

Whisp 支持所有兼容 OpenAI 格式的语音转写 API：

| 服务商 | 说明 |
|--------|------|
| **OpenAI** | 官方 Whisper API，支持 gpt-4o-transcribe 等模型 |
| **Groq** | 免费高速的 Whisper 推理服务 |
| **Fireworks** | 高性能推理平台 |
| **Deepgram** | 专业语音识别服务商 |
| **小米 MiMo** | 支持中英双语、方言、歌词转写及嘈杂环境识别 |
| **自定义** | 任何兼容 OpenAI 格式的第三方 API |

### Token 计费统计

- **费用估算**：根据服务商定价自动估算每次转写的费用
- **Token 统计**：记录 AI 润色消耗的 Token 数量
- **累计统计**：历史记录页显示累计费用和累计 Token 用量
- **音频时长记录**：记录每次转写的音频时长

### 设置导入导出

- **一键导出**：将所有设置（API 地址、密钥、模型名、快捷键等）导出为 JSON
- **一键导入**：在另一台设备上粘贴 JSON 即可恢复全部配置
- **包含密钥**：导出内容包含 API Key 和 AI 润色 Key，方便设备迁移

### 诊断与日志

- **运行日志**：实时查看应用运行日志，包含所有操作记录
- **日志复制**：支持复制单条或全部日志内容
- **连接状态**：实时显示 API 连接状态和权限状态
- **错误追踪**：转写失败时记录详细错误信息，便于排查问题

### 历史记录

- **本地存储**：所有转写记录保存在本地 SQLite 数据库
- **搜索筛选**：支持按文本内容搜索，按状态筛选
- **批量操作**：支持批量删除和清空历史记录
- **重试转写**：对失败的记录可重新转写（保留原始音频）
- **音频播放**：有音频保存的记录可直接播放回听
- **错误信息可复制**：失败记录的错误信息支持一键复制
- **CSV 导出**：支持将历史记录导出为 CSV 文件

### 界面与交互

- **侧边栏导航**：左侧固定导航栏，快速切换功能页面
- **页面切换动画**：平滑的淡入滑动过渡效果
- **空状态引导**：无记录时显示友好的引导界面
- **多语言界面**：支持简体中文、英语和日语
- **暗色模式**：跟随系统自动切换深色/浅色主题
- **系统托盘**：最小化到系统托盘，支持最近转写记录快速访问
- **开机自启**：可选登录时自动启动
- **浮窗位置记忆**：录音波形浮窗跨会话记住上次位置

### 更新机制

- **自动检测更新**：启动时自动检查 GitHub Releases 是否有新版本
- **版本提示**：侧边栏显示新版本可用提示
- **应用内下载更新**：点击下载按钮自动下载安装包到「下载」文件夹并打开安装
- **多平台安装包**：macOS DMG、Windows EXE/MSI、Linux DEB/RPM/AppImage

---

## 下载安装

从 [Releases](https://github.com/sexyfeifan/Whisp/releases/latest) 下载最新版本：

### macOS

| 文件 | 架构 | 说明 |
|------|------|------|
| `Whisp_x.x.x_aarch64.dmg` | Apple Silicon (M1/M2/M3/M4) | **推荐** |
| `Whisp_x.x.x_x64.dmg` | Intel Mac | 2020 年前的 Mac |

### Windows

| 文件 | 说明 |
|------|------|
| `Whisp_x.x.x_x64-setup.exe` | **推荐** — NSIS 安装程序 |
| `Whisp_x.x.x_x64_en-US.msi` | 企业部署 |

### Linux

| 文件 | 发行版 |
|------|--------|
| `Whisp_x.x.x_amd64.deb` | Ubuntu、Debian、Mint — **推荐** |
| `Whisp_x.x.x-1.x86_64.rpm` | Fedora、RHEL、openSUSE |
| `Whisp_x.x.x_amd64.AppImage` | 通用便携版 |

---

## 使用方法

### 首次使用

1. 安装并启动 Whisp
2. 按照引导页面完成配置：
   - **第 1 步**：选择 API 服务商，输入 API Key
   - **第 2 步**：授权麦克风权限
   - **第 3 步**：授权辅助功能权限（macOS 需要，用于自动粘贴）
   - **第 4 步**：设置快捷键（默认：右 ⌘ 键）

### 日常使用

1. 按下快捷键（默认右 ⌘）开始录音
2. 对着麦克风说话
3. 再次按下快捷键停止录音（或等待静音自动停止）
4. 文字自动粘贴到当前光标位置

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| 右 ⌘（macOS）/ 右 Ctrl（Windows） | 开始/停止录音 |
| Esc | 取消当前录音 |

快捷键可在设置中自定义为任意组合键。

---

## 设置说明

### API 配置

- **端点预设**：内置 OpenAI、Groq、Fireworks、DeepSeek、MiMo 等常用服务商
- **API Base URL**：服务商的 API 地址，支持自定义
- **API Key**：服务商的 API 密钥，存储在系统钥匙串中
- **模型名称**：选择或输入模型名，内置常用模型列表
- **语言**：转写语言（自动检测或手动指定）

### AI 润色

- **启用/禁用**：开关 AI 润色功能
- **润色 API**：可使用与转写不同的 API 服务商和模型
- **自定义提示词**：自定义润色风格和要求
- **预设模型**：内置 DeepSeek、OpenAI、MiMo 等润色模型预设

### 录音设置

- **静音停止超时**：说完话后多久自动停止录音（默认 60 秒）
- **静音阈值**：静音检测灵敏度（0.01-0.1）
- **Whisper 提示词**：添加上下文提示提高专业词汇准确率
- **静音裁剪**：自动去除录音首尾静音段
- **音频保留数量**：保留最近多少个音频文件（默认 100）

### 行为设置

- **自动粘贴**：转写后自动粘贴到当前应用
- **粘贴延迟**：自动粘贴前的等待时间（毫秒）
- **保留音频文件**：是否保存录音的 WAV 文件
- **提示音**：录音开始/结束时的提示音

### 数据备份

- **导出设置**：将全部配置导出到剪贴板（JSON 格式）
- **导入设置**：从剪贴板导入配置（JSON 格式）

---

## 诊断功能

### 运行日志

在「诊断」页面可以查看应用的实时运行日志，包含：

- 所有转写请求的详细信息（模型、API 地址、语言）
- 成功/失败状态及错误详情
- AI 润色请求和结果
- 设置变更记录
- 权限检查结果

日志支持单条复制和全部复制，便于反馈问题时提供详细信息。

### 连接状态

- API 是否已配置
- API Key 是否已设置
- 模型是否已选择
- 麦克风权限状态
- 辅助功能权限状态

---

## 技术架构

- **前端**：React 18 + TypeScript + Tailwind CSS v4
- **后端**：Rust + Tauri v2
- **数据库**：SQLite（本地历史记录）
- **音频**：cpal（跨平台音频采集）
- **图标**：Lucide React
- **动画**：Framer Motion
- **UI 组件**：shadcn/ui 风格组件库

---

## 从源码构建

前置条件：[Node.js](https://nodejs.org/) 和 [Rust](https://rustup.rs/)。

```bash
git clone https://github.com/sexyfeifan/Whisp.git
cd Whisp
npm install
npm run tauri dev    # 开发模式
npm run tauri build  # 生产构建
```

---

## 项目来源

本项目基于 [NanoWhisper](https://github.com/jicaiinc/nanowhisper) 修改而来，主要增加了第三方 API 转发支持、多服务商适配、AI 润色、Token 计费等功能。

---

## 许可证

[Apache License 2.0](LICENSE)

---

<p align="center">
  说话即输入，停下即粘贴。<br>
  <sub>&copy; 2026 <a href="https://github.com/sexyfeifan">sexyfeifan</a></sub>
</p>
