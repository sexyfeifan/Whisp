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
  <a href="https://github.com/sexyfeifan/Whisp/releases/latest">下载</a>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

---

本项目源自于 NanoWhisper https://github.com/jicaiinc/nanowhisper
因为原项目无法接了第三方转发服务器的api，所以才做了对应修改。

---
Whisp 是一个桌面语音输入工具：按快捷键开始说话，再按一次结束，文字自动粘贴到当前光标位置。

默认接入 OpenAI，也支持 OpenAI 兼容转写 API；内置常用模型名，且支持自定义模型，使用 Tauri v2 构建。

## v2.0 更新亮点

- API Key 改为存进系统钥匙串，不再明文写入设置文件。
- 转写请求支持可配置超时与自动重试，稳定性更强。
- 增加静音裁剪，减少上传体积并缩短等待时间。
- 历史记录新增成功/失败状态、Provider、语言与可重试音频信息。
- 设置页新增自动粘贴、音频保留、粘贴延迟与可靠性选项。

## 软件简介

Whisp 适合“想得比打字快”的场景：

- 一键开始录音，一键结束转写；
- 不用手动复制，自动粘贴到当前应用；
- 配置轻量，开箱即用。

## 使用方式

1. 轻按 `右 ⌘` (macOS) / `右 Ctrl` (Windows)（可自定义）
2. 说话
3. 再按一次停止 — 文字瞬间转写并粘贴

## 特性

- **一个快捷键** — 全局热键启停录音，无需操作界面。
- **自动粘贴** — 转写文字直达光标位置，无需手动复制。
- **模型预置 + 自定义** — 内置主流模型名称，也可手动输入任意模型名。
- **模型说明面板** — 在设置页点击 `Model Guide` 可查看说明并一键选择。
- **波形浮窗** — 录音时显示极简的置顶波形动画。
- **历史记录** — 支持状态展示、搜索筛选与带音频重试的本地历史记录。
- **系统托盘** — 安静地驻留后台。

## 小红书风格介绍

谁懂这种效率感啊！真的会想安利给所有写字党 ✨  
`Whisp` 的快乐就是：

- 脑子里刚有句子，张嘴说，马上就是文字；
- 开会灵感、写作提纲、微信回复都能秒记；
- 再也不用在“想法”跟“敲键盘”之间来回拉扯。

一句话：**把打字焦虑，变成表达自由。**

## 从源码构建

前置条件：[Node.js](https://nodejs.org/) 和 [Rust](https://rustup.rs/)。

```bash
git clone https://github.com/sexyfeifan/Whisp.git
cd Whisp
npm install
npm run tauri dev
```

## 许可证

[Apache License 2.0](LICENSE)

---

<p align="center">
  Speak. Transcribe. Paste.<br>
  <sub>&copy; 2026 <a href="https://github.com/sexyfeifan">sexyfeifan</a></sub>
</p>
