import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { AppSettings, HistoryEntry, LogEntry } from "./types";
import logoUrl from "./assets/logo.png";

type View = "onboarding" | "history" | "settingsApi" | "settingsPolish" | "settingsRecording" | "settingsBehavior" | "settingsApp" | "diagnostics";
type StatusFilter = "all" | "success" | "failed";
type UiLanguage = AppSettings["ui_language"];

const isMac = navigator.userAgent.includes("Mac");
const modKey = isMac ? "⌘" : "Ctrl";
const defaultHotkey = isMac ? "Right ⌘" : "Right Ctrl";
const defaultApiBaseUrl = "https://api.openai.com/v1";

const localeMap: Record<UiLanguage, string> = {
  "zh-CN": "zh-CN",
  en: "en-US",
  ja: "ja-JP",
};

const uiLanguageOptions: Array<{ value: UiLanguage; label: Record<UiLanguage, string> }> = [
  {
    value: "zh-CN",
    label: { "zh-CN": "简体中文", en: "Simplified Chinese", ja: "簡体字中国語" },
  },
  {
    value: "en",
    label: { "zh-CN": "English", en: "English", ja: "English" },
  },
  {
    value: "ja",
    label: { "zh-CN": "日本語", en: "Japanese", ja: "日本語" },
  },
];

const messages = {
  "zh-CN": {
    appSubtitle: "说话、转写、粘贴",
    versionLabel: "v2.0 稳定版",
    loading: "加载中…",
    endpointPresets: "端点预设",
    apiConfiguration: "API 配置",
    apiConfigurationDesc: "配置转写服务的连接参数",
    apiBaseUrl: "API Base URL",
    apiKey: "API Key",
    apiKeyStorageHint: "API Key 会优先保存在系统钥匙串中。",
    model: "模型",
    language: "转写语言",
    uiLanguage: "界面语言",
    timeout: "超时（秒）",
    retryCount: "重试次数",
    pasteDelay: "粘贴延迟（毫秒）",
    silenceTimeout: "静音自动停止（秒，0 为关闭）",
    microphone: "麦克风",
    accessibility: "辅助功能",
    shortcut: "快捷键",
    soundEffects: "提示音",
    autoPaste: "自动粘贴",
    saveAudioFiles: "保留音频文件",
    trimSilence: "静音裁剪",
    autoPasteDesc: "复制到剪贴板后，自动粘贴回原来的应用。",
    saveAudioFilesDesc: "保留本地 WAV 文件，方便失败后重试。",
    trimSilenceDesc: "上传前裁掉头尾静音，减少等待时间和流量。",
    soundEffectsDesc: "录音开始和结束时播放提示音。",
    testConnection: "测试连接",
    testing: "测试中…",
    connected: "已连接",
    optionalValidationHint: "部分第三方中转服务会拦截测试请求，即使这里失败，保存后仍可直接录音试用。",
    modelGuide: "模型说明",
    collapseModelGuide: "收起模型说明",
    customModelHint: "可选择预置模型，也可手动输入自定义模型。",
    onboardingTitle: "Whisp v2.0",
    onboardingStep1: "API 配置",
    onboardingStep2: "麦克风权限",
    onboardingStep3: "辅助功能权限",
    onboardingStep4: "快捷键",
    allowMicrophone: "允许麦克风",
    allowAccessibility: "允许辅助功能",
    enabled: "已开启",
    getStarted: "开始使用",
    saveAndContinue: "保存并继续",
    save: "保存",
    saving: "保存中…",
    done: "完成",
    settings: "设置",
    history: "历史记录",
    clear: "清空",
    clearConfirm: "再次点击确认",
    clearSuccess: "历史记录已清空。",
    clearEmpty: "没有可清空的历史记录。",
    clearFailed: "清空历史记录失败。",
    deleteAllConfirmHint: "点击一次进入确认，再点一次执行清空。",
    total: "总数",
    failures: "失败",
    success: "成功",
    audioSaved: "已存音频",
    searchPlaceholder: "搜索文本、错误、模型或 Provider",
    filterAll: "全部",
    filterSuccess: "成功",
    filterFailed: "失败",
    noHistory: "还没有转写记录。",
    noResults: "没有匹配当前筛选条件的记录。",
    startHint: "按下 {shortcut} 开始。",
    stopHint: "再次按下结束，按 Escape 取消。",
    statusSuccess: "成功",
    statusFailed: "失败",
    copy: "复制",
    retry: "重试",
    delete: "删除",
    audioSavedLabel: "已保存音频",
    noAudio: "未保存音频",
    settingsSaved: "设置已保存。",
    invalidModifier: "快捷键必须包含修饰键。",
    pressShortcut: "请按下快捷键…",
    resetToDefault: "恢复默认",
    defaultShortcut: "默认：{shortcut}",
    historyClearButtonHint: "不再使用系统弹窗确认，避免按钮失效。",
    openSettingsIfNeeded: "如果测试失败但参数确认无误，先保存后直接试录音。",
    providerLabel: "服务商",
    notesForCustomProvider: "第三方中转通常也可用，只要兼容 OpenAI 风格的音频转写接口。",
    launchAtStartup: "开机启动",
    launchAtStartupDesc: "登录后自动启动 Whisp。",
    whisperPrompt: "Whisper 提示词（可选）",
    whisperPromptPlaceholder: "输入专有名词、特定词汇等，提升识别准确率…",
    silenceThreshold: "静音阈值（0.0–1.0）",
    exportHistory: "导出记录",
    transcriptionFailed: "转写失败",
    loadMore: "加载更多",
    deleteSelected: "删除所选",
    shortcutConflict: "快捷键冲突",
    selectAll: "全选",
    deselectAll: "取消全选",
    checkForUpdates: "检查更新",
    checkingUpdates: "检查中…",
    updateAvailable: "发现新版本",
    upToDate: "已是最新版本",
    updateError: "检查更新失败",
    downloadUpdate: "前往下载",
    viewOnGitHub: "在 GitHub 查看",
    releaseNotes: "更新日志",
    publishedAt: "发布时间",
    aiPolish: "AI 润色",
    aiPolishDesc: "转写完成后使用 AI 模型润色纠错",
    aiPolishApiUrl: "AI 润色 API URL",
    aiPolishApiKey: "AI 润色 API Key",
    aiPolishModel: "AI 润色模型",
    aiPolishPrompt: "自定义提示词（可选）",
    aiPolishPromptPlaceholder: "留空使用默认：纠错、去口癖、转书面语…",
    testPolishConnection: "测试 AI 润色连接",
    statsTotal: "总转写",
    statsToday: "今日",
    statsSuccess: "成功率",
    recordingSettings: "录音",
    recordingSettingsDesc: "静音检测、提示词与音频处理",
    behaviorSettings: "行为",
    behaviorSettingsDesc: "自动粘贴、音效与其他行为",
    shortcutsPermissions: "快捷键与权限",
    shortcutsPermissionsDesc: "全局快捷键和系统权限状态",
    appSettings: "应用",
    appSettingsDesc: "界面语言、开机启动与更新",
    aiPolishSettings: "AI 润色",
    aiPolishSettingsDesc: "使用 AI 模型润色纠错转写文本",
    home: "首页",
    diagnostics: "诊断",
    connectionStatus: "连接状态",
    permissionsStatus: "权限状态",
    dataDirectory: "数据目录",
    audioFilesCount: "音频文件数",
    lastTranscription: "最近转写",
    apiConfigured: "已配置",
    apiNotConfigured: "未配置",
    runLogs: "运行日志",
    runLogsDesc: "应用运行时的详细日志记录",
    copyAll: "复制全部",
    clearLogs: "清空日志",
    copied: "已复制",
    copyError: "复制错误",
    polishFailed: "AI 润色失败，使用原文",
    audioRetentionLimit: "音频保留数量",
    audioRetentionLimitDesc: "保留最近的音频文件数量，超出自动清理",
    playAudio: "播放",
    pauseAudio: "暂停",
    newVersionAvailable: "新版本可用",
    totalCost: "累计费用",
    totalTokens: "累计 Token",
    aiPolishPromptDesc: "留空使用上方默认提示词，修改后自动保存",
  },
  en: {
    appSubtitle: "Speak, transcribe, paste",
    versionLabel: "v2.0 stable",
    loading: "Loading…",
    endpointPresets: "Endpoint presets",
    apiConfiguration: "API Configuration",
    apiConfigurationDesc: "Configure transcription service connection",
    apiBaseUrl: "API Base URL",
    apiKey: "API Key",
    apiKeyStorageHint: "API keys are stored in the system keychain when available.",
    model: "Model",
    language: "Transcription language",
    uiLanguage: "Interface language",
    timeout: "Timeout (sec)",
    retryCount: "Retry count",
    pasteDelay: "Paste delay (ms)",
    silenceTimeout: "Silence auto-stop (sec, 0 to disable)",
    microphone: "Microphone",
    accessibility: "Accessibility",
    shortcut: "Shortcut",
    soundEffects: "Sound effects",
    autoPaste: "Auto paste",
    saveAudioFiles: "Save audio files",
    trimSilence: "Trim silence",
    autoPasteDesc: "Copy to the clipboard and optionally paste back into the previous app.",
    saveAudioFilesDesc: "Keep local WAV files so failed items can be retried later.",
    trimSilenceDesc: "Remove leading and trailing silence before upload to reduce delay and cost.",
    soundEffectsDesc: "Play a sound when recording starts and ends.",
    testConnection: "Test Connection",
    testing: "Testing…",
    connected: "Connected",
    optionalValidationHint: "Some relay providers reject test requests. Even if this check fails, you can still save and try a real recording.",
    modelGuide: "Model Guide",
    collapseModelGuide: "Hide Guide",
    customModelHint: "You can pick a preset model or type any custom model name.",
    onboardingTitle: "Whisp v2.0",
    onboardingStep1: "API setup",
    onboardingStep2: "Microphone",
    onboardingStep3: "Accessibility",
    onboardingStep4: "Shortcut",
    allowMicrophone: "Allow Microphone",
    allowAccessibility: "Allow Accessibility",
    enabled: "Enabled",
    getStarted: "Get Started",
    saveAndContinue: "Save and Continue",
    save: "Save",
    saving: "Saving…",
    done: "Done",
    settings: "Settings",
    history: "History",
    clear: "Clear",
    clearConfirm: "Tap again to clear",
    clearSuccess: "History cleared.",
    clearEmpty: "No history to clear.",
    clearFailed: "Failed to clear history.",
    deleteAllConfirmHint: "Click once to arm the action, then click again to confirm.",
    total: "Total",
    failures: "Failures",
    success: "Success",
    audioSaved: "Audio Saved",
    searchPlaceholder: "Search text, errors, model, or provider",
    filterAll: "All",
    filterSuccess: "Success",
    filterFailed: "Failed",
    noHistory: "No transcriptions yet.",
    noResults: "No entries match the current filter.",
    startHint: "Press {shortcut} to start.",
    stopHint: "Press again to stop. Escape cancels.",
    statusSuccess: "Success",
    statusFailed: "Failed",
    copy: "Copy",
    retry: "Retry",
    delete: "Delete",
    audioSavedLabel: "audio saved",
    noAudio: "no audio",
    settingsSaved: "Settings saved.",
    invalidModifier: "Shortcut must include a modifier key.",
    pressShortcut: "Press shortcut keys…",
    resetToDefault: "Reset to default",
    defaultShortcut: "Default: {shortcut}",
    historyClearButtonHint: "This uses in-app confirmation instead of the browser confirm dialog.",
    openSettingsIfNeeded: "If connection testing fails but your relay settings are correct, save first and try a real recording.",
    providerLabel: "Provider",
    notesForCustomProvider: "Third-party relay endpoints work as long as they expose an OpenAI-compatible transcription route.",
    launchAtStartup: "Launch at startup",
    launchAtStartupDesc: "Automatically start Whisp when you log in.",
    whisperPrompt: "Whisper prompt (optional)",
    whisperPromptPlaceholder: "Enter proper nouns, domain terms, etc. to improve accuracy…",
    silenceThreshold: "Silence threshold (0.0–1.0)",
    exportHistory: "Export history",
    transcriptionFailed: "Transcription failed",
    loadMore: "Load more",
    deleteSelected: "Delete selected",
    shortcutConflict: "Shortcut conflict",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    checkForUpdates: "Check for Updates",
    checkingUpdates: "Checking…",
    updateAvailable: "Update Available",
    upToDate: "You are up to date",
    updateError: "Failed to check updates",
    downloadUpdate: "Download",
    viewOnGitHub: "View on GitHub",
    releaseNotes: "Release Notes",
    publishedAt: "Published",
    aiPolish: "AI Polish",
    aiPolishDesc: "Polish transcribed text with AI after recording",
    aiPolishApiUrl: "AI Polish API URL",
    aiPolishApiKey: "AI Polish API Key",
    aiPolishModel: "AI Polish Model",
    aiPolishPrompt: "Custom prompt (optional)",
    aiPolishPromptPlaceholder: "Leave empty for default: fix errors, remove fillers, clean up…",
    testPolishConnection: "Test AI Polish",
    statsTotal: "Total",
    statsToday: "Today",
    statsSuccess: "Success",
    recordingSettings: "Recording",
    recordingSettingsDesc: "Silence detection, prompt, and audio processing",
    behaviorSettings: "Behavior",
    behaviorSettingsDesc: "Auto paste, sound effects, and other behaviors",
    shortcutsPermissions: "Shortcuts & Permissions",
    shortcutsPermissionsDesc: "Global shortcut and system permission status",
    appSettings: "App",
    appSettingsDesc: "Interface language, launch at startup, and updates",
    aiPolishSettings: "AI Polish",
    aiPolishSettingsDesc: "Polish transcribed text with AI model",
    home: "Home",
    diagnostics: "Diagnostics",
    connectionStatus: "Connection Status",
    permissionsStatus: "Permissions Status",
    dataDirectory: "Data Directory",
    audioFilesCount: "Audio Files",
    lastTranscription: "Last Transcription",
    apiConfigured: "Configured",
    apiNotConfigured: "Not Configured",
    runLogs: "Run Logs",
    runLogsDesc: "Detailed runtime logs of the application",
    copyAll: "Copy All",
    clearLogs: "Clear Logs",
    copied: "Copied",
    copyError: "Copy Error",
    polishFailed: "AI Polish failed, using original",
    audioRetentionLimit: "Audio Retention Limit",
    audioRetentionLimitDesc: "Number of recent audio files to keep, older ones are auto-cleaned",
    playAudio: "Play",
    pauseAudio: "Pause",
    newVersionAvailable: "New version available",
    totalCost: "Total Cost",
    totalTokens: "Total Tokens",
    aiPolishPromptDesc: "Leave empty to use default prompt above, changes auto-save",
  },
  ja: {
    appSubtitle: "話す、文字起こし、貼り付け",
    versionLabel: "v2.0 安定版",
    loading: "読み込み中…",
    endpointPresets: "エンドポイントプリセット",
    apiConfiguration: "API 設定",
    apiConfigurationDesc: "文字起こしサービスの接続設定",
    apiBaseUrl: "API Base URL",
    apiKey: "API キー",
    apiKeyStorageHint: "API キーは利用可能な場合、システムのキーチェーンに保存されます。",
    model: "モデル",
    language: "文字起こし言語",
    uiLanguage: "表示言語",
    timeout: "タイムアウト（秒）",
    retryCount: "再試行回数",
    pasteDelay: "貼り付け待機（ms）",
    silenceTimeout: "無音自動停止（秒、0で無効）",
    microphone: "マイク",
    accessibility: "アクセシビリティ",
    shortcut: "ショートカット",
    soundEffects: "効果音",
    autoPaste: "自動貼り付け",
    saveAudioFiles: "音声ファイルを保存",
    trimSilence: "無音トリム",
    autoPasteDesc: "クリップボードへコピーしたあと、元のアプリへ自動で貼り付けます。",
    saveAudioFilesDesc: "失敗時の再試行用に WAV ファイルを保持します。",
    trimSilenceDesc: "アップロード前に前後の無音を削って待ち時間と転送量を減らします。",
    soundEffectsDesc: "録音開始と終了時に短い音を鳴らします。",
    testConnection: "接続テスト",
    testing: "テスト中…",
    connected: "接続済み",
    optionalValidationHint: "一部の中継サービスはテスト用リクエストを拒否します。ここで失敗しても、保存して実録音を試せます。",
    modelGuide: "モデル説明",
    collapseModelGuide: "説明を閉じる",
    customModelHint: "プリセットモデルの選択、または任意のモデル名を直接入力できます。",
    onboardingTitle: "Whisp v2.0",
    onboardingStep1: "API 設定",
    onboardingStep2: "マイク権限",
    onboardingStep3: "アクセシビリティ権限",
    onboardingStep4: "ショートカット",
    allowMicrophone: "マイクを許可",
    allowAccessibility: "アクセシビリティを許可",
    enabled: "有効",
    getStarted: "開始する",
    saveAndContinue: "保存して続行",
    save: "保存",
    saving: "保存中…",
    done: "完了",
    settings: "設定",
    history: "履歴",
    clear: "全削除",
    clearConfirm: "もう一度押して確定",
    clearSuccess: "履歴を削除しました。",
    clearEmpty: "削除する履歴はありません。",
    clearFailed: "履歴の削除に失敗しました。",
    deleteAllConfirmHint: "1 回目で確認状態に入り、2 回目で実行されます。",
    total: "合計",
    failures: "失敗",
    success: "成功",
    audioSaved: "音声保存",
    searchPlaceholder: "テキスト、エラー、モデル、Provider を検索",
    filterAll: "すべて",
    filterSuccess: "成功",
    filterFailed: "失敗",
    noHistory: "まだ文字起こし履歴はありません。",
    noResults: "現在の条件に一致する履歴がありません。",
    startHint: "{shortcut} を押して開始。",
    stopHint: "もう一度押すと終了、Escape でキャンセル。",
    statusSuccess: "成功",
    statusFailed: "失敗",
    copy: "コピー",
    retry: "再試行",
    delete: "削除",
    audioSavedLabel: "音声あり",
    noAudio: "音声なし",
    settingsSaved: "設定を保存しました。",
    invalidModifier: "ショートカットには修飾キーが必要です。",
    pressShortcut: "ショートカットを押してください…",
    resetToDefault: "デフォルトに戻す",
    defaultShortcut: "デフォルト: {shortcut}",
    historyClearButtonHint: "ブラウザの confirm ではなく、アプリ内確認に変更しています。",
    openSettingsIfNeeded: "接続テストが失敗しても、中継設定が正しければ保存して実録音を試してください。",
    providerLabel: "Provider",
    notesForCustomProvider: "OpenAI 互換の音声文字起こし API であれば、中継サービスも利用できます。",
    launchAtStartup: "ログイン時に起動",
    launchAtStartupDesc: "ログイン後、自動的に Whisp を起動します。",
    whisperPrompt: "Whisper プロンプト（任意）",
    whisperPromptPlaceholder: "固有名詞や専門用語などを入力して精度を上げる…",
    silenceThreshold: "無音閾値（0.0–1.0）",
    exportHistory: "履歴をエクスポート",
    transcriptionFailed: "文字起こし失敗",
    loadMore: "さらに読み込む",
    deleteSelected: "選択を削除",
    shortcutConflict: "ショートカット競合",
    selectAll: "すべて選択",
    deselectAll: "選択解除",
    checkForUpdates: "更新を確認",
    checkingUpdates: "確認中…",
    updateAvailable: "新しいバージョンがあります",
    upToDate: "最新バージョンです",
    updateError: "更新の確認に失敗しました",
    downloadUpdate: "ダウンロード",
    viewOnGitHub: "GitHub で見る",
    releaseNotes: "リリースノート",
    publishedAt: "公開日",
    aiPolish: "AI 修正",
    aiPolishDesc: "録音後にAIでテキストを修正・校正",
    aiPolishApiUrl: "AI 修正 API URL",
    aiPolishApiKey: "AI 修正 API Key",
    aiPolishModel: "AI 修正モデル",
    aiPolishPrompt: "カスタムプロンプト（任意）",
    aiPolishPromptPlaceholder: "空欄でデフォルト：エラー修正、フィラー除去、清書…",
    testPolishConnection: "AI 修正テスト",
    statsTotal: "合計",
    statsToday: "今日",
    statsSuccess: "成功率",
    recordingSettings: "録音",
    recordingSettingsDesc: "無音検出、プロンプト、音声処理",
    behaviorSettings: "動作",
    behaviorSettingsDesc: "自動貼り付け、効果音、その他の動作",
    shortcutsPermissions: "ショートカットと権限",
    shortcutsPermissionsDesc: "グローバルショートカットとシステム権限の状態",
    appSettings: "アプリ",
    appSettingsDesc: "表示言語、ログイン時起動、更新",
    aiPolishSettings: "AI 修正",
    aiPolishSettingsDesc: "AI モデルで文字起こしテキストを修正",
    home: "ホーム",
    diagnostics: "診断",
    connectionStatus: "接続状態",
    permissionsStatus: "権限状態",
    dataDirectory: "データディレクトリ",
    audioFilesCount: "音声ファイル数",
    lastTranscription: "最新の転写",
    apiConfigured: "設定済み",
    apiNotConfigured: "未設定",
    runLogs: "実行ログ",
    runLogsDesc: "アプリケーションの実行時ログ",
    copyAll: "すべてコピー",
    clearLogs: "ログ消去",
    copied: "コピー済み",
    copyError: "エラーコピー",
    polishFailed: "AI修正失敗、原文を使用",
    audioRetentionLimit: "音声保持数",
    audioRetentionLimitDesc: "最近の音声ファイル保持数、古いファイルは自動削除",
    playAudio: "再生",
    pauseAudio: "一時停止",
    newVersionAvailable: "新しいバージョンあり",
    totalCost: "合計費用",
    totalTokens: "合計トークン",
    aiPolishPromptDesc: "空欄で上記のデフォルトプロンプト使用、変更は自動保存",
  },
} as const;

type ModelCatalogItem = {
  name: string;
  provider: string;
  description: Record<UiLanguage, string>;
  baseUrlHint: string;
  note?: Record<UiLanguage, string>;
};

const endpointPresets = [
  { label: "OpenAI", value: "https://api.openai.com/v1" },
  { label: "Groq", value: "https://api.groq.com/openai/v1" },
  { label: "Fireworks", value: "https://api.fireworks.ai/inference/v1" },
  { label: "MiMo", value: "https://api.xiaomimimo.com/v1" },
  { label: "DeepSeek", value: "https://api.deepseek.com/v1" },
  { label: "MiMo Token Plan", value: "https://token-plan-cn.xiaomimimo.com/v1" },
];

const aiPolishPresets = [
  { label: "DeepSeek V4 Flash", apiUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" },
  { label: "DeepSeek Chat", apiUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "OpenAI GPT-4o-mini", apiUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenAI GPT-4o", apiUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  { label: "MiMo V2.5", apiUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5" },
];

const modelCatalog: ModelCatalogItem[] = [
  {
    name: "gpt-4o-transcribe",
    provider: "OpenAI",
    description: {
      "zh-CN": "GPT-4o 系列中质量更高的转写模型。",
      en: "Higher-quality transcription model in the GPT-4o family.",
      ja: "GPT-4o 系列の中でも品質重視の文字起こしモデルです。",
    },
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "gpt-4o-mini-transcribe",
    provider: "OpenAI",
    description: {
      "zh-CN": "速度和质量更均衡，适合作为默认选择。",
      en: "Balanced speed and quality, good as a default choice.",
      ja: "速度と品質のバランスが良く、標準設定に向いています。",
    },
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "gpt-4o-transcribe-diarize",
    provider: "OpenAI",
    description: {
      "zh-CN": "支持说话人区分（Diarization）的转写模型。",
      en: "Transcription model with diarization support.",
      ja: "話者分離（Diarization）に対応した文字起こしモデルです。",
    },
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "whisper-1",
    provider: "OpenAI",
    description: {
      "zh-CN": "经典 Whisper 模型，稳定且应用广泛。",
      en: "Classic Whisper model with broad compatibility.",
      ja: "定番の Whisper モデルで、安定性と互換性に優れています。",
    },
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "whisper-large-v3-turbo",
    provider: "Groq",
    description: {
      "zh-CN": "速度很快的 Whisper 兼容转写模型。",
      en: "Fast Whisper-compatible transcription model.",
      ja: "高速な Whisper 互換文字起こしモデルです。",
    },
    baseUrlHint: "https://api.groq.com/openai/v1",
  },
  {
    name: "whisper-v3",
    provider: "Fireworks",
    description: {
      "zh-CN": "通用型 Whisper v3 模型。",
      en: "General-purpose Whisper v3 model.",
      ja: "汎用的な Whisper v3 モデルです。",
    },
    baseUrlHint: "https://api.fireworks.ai/inference/v1",
  },
  {
    name: "whisper-v3-turbo",
    provider: "Fireworks",
    description: {
      "zh-CN": "Whisper v3 的低延迟 turbo 版本。",
      en: "Low-latency turbo version of Whisper v3.",
      ja: "Whisper v3 の低遅延 turbo バージョンです。",
    },
    baseUrlHint: "https://api.fireworks.ai/inference/v1",
  },
  {
    name: "nova-3",
    provider: "Deepgram",
    description: {
      "zh-CN": "需要兼容 OpenAI 的代理网关接入。",
      en: "Usually needs an OpenAI-compatible relay gateway.",
      ja: "通常は OpenAI 互換の中継ゲートウェイが必要です。",
    },
    baseUrlHint: "OpenAI-compatible relay URL",
  },
  {
    name: "chirp_3",
    provider: "Google Cloud",
    description: {
      "zh-CN": "需要兼容 OpenAI 的代理网关接入。",
      en: "Usually needs an OpenAI-compatible relay gateway.",
      ja: "通常は OpenAI 互換の中継ゲートウェイが必要です。",
    },
    baseUrlHint: "OpenAI-compatible relay URL",
  },
  {
    name: "mimo-v2.5-asr",
    provider: "MiMo",
    description: {
      "zh-CN": "小米 MiMo 语音识别，支持中英双语、方言、歌词转写及嘈杂环境。",
      en: "Xiaomi MiMo ASR with bilingual, dialect, lyrics, and noisy-environment support.",
      ja: "Xiaomi MiMo 音声認識、中国語・英語・方言・歌詞・騒音環境対応。",
    },
    baseUrlHint: "https://api.xiaomimimo.com/v1",
  },
  {
    name: "mimo-v2.5-asr",
    provider: "MiMo Token Plan",
    description: {
      "zh-CN": "小米 MiMo 语音识别，Token Plan 计费。",
      en: "Xiaomi MiMo ASR, Token Plan billing.",
      ja: "Xiaomi MiMo 音声認識、Token Plan 課金。",
    },
    baseUrlHint: "https://token-plan-cn.xiaomimimo.com/v1",
  },
];

const suggestedModels = modelCatalog.map((item) => item.name);

function translateShortcut(shortcut: string): string {
  if (!shortcut) return defaultHotkey;
  return shortcut
    .replace("CmdOrCtrl", modKey)
    .replace("Cmd", "⌘")
    .replace("Ctrl", "Ctrl")
    .replace("Shift", "⇧")
    .replace("Alt", isMac ? "⌥" : "Alt")
    .replace(/\+/g, " ");
}

function codeToTauriKey(code: string): string | null {
  if (code.startsWith("Key") && code.length === 4) return code.charAt(3);
  if (code.startsWith("Digit") && code.length === 6) return code.charAt(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const map: Record<string, string> = {
    Space: "Space", Tab: "Tab", Enter: "Enter", Escape: "Escape",
    Backspace: "Backspace", Delete: "Delete", ArrowUp: "Up", ArrowDown: "Down",
    ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End",
    PageUp: "PageUp", PageDown: "PageDown", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";",
    Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  };
  return map[code] ?? null;
}

function formatTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(value),
    template,
  );
}

function formatTime(timestamp: number, uiLanguage: UiLanguage): string {
  const locale = localeMap[uiLanguage];
  const date = new Date(timestamp * 1000);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return `${date.toLocaleDateString(locale, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(locale, {
    hour: "2-digit", minute: "2-digit",
  })}`;
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return "";
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${seconds}s`;
}

function displaySpeechLanguage(language: string, uiLanguage: UiLanguage): string {
  const labelMap: Record<string, Record<UiLanguage, string>> = {
    auto: { "zh-CN": "自动识别", en: "Auto", ja: "自動" },
    zh: { "zh-CN": "中文", en: "Chinese", ja: "中国語" },
    en: { "zh-CN": "英语", en: "English", ja: "英語" },
    ja: { "zh-CN": "日语", en: "Japanese", ja: "日本語" },
    ko: { "zh-CN": "韩语", en: "Korean", ja: "韓国語" },
    es: { "zh-CN": "西班牙语", en: "Spanish", ja: "スペイン語" },
    fr: { "zh-CN": "法语", en: "French", ja: "フランス語" },
    de: { "zh-CN": "德语", en: "German", ja: "ドイツ語" },
  };
  return labelMap[language]?.[uiLanguage] ?? language.toUpperCase();
}

function FilterChip({
  active, label, onClick,
}: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs transition-colors"
      style={{
        background: active ? "hsl(var(--primary))" : "hsl(var(--secondary))",
        color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
        border: active ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
      }}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  label, description, value, onChange,
}: { label: string; description: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ border: "1px solid hsl(var(--border))" }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{label}</div>
        {description && (
          <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{description}</div>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ background: value ? "hsl(var(--brand))" : "hsl(var(--muted))" }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ left: value ? "calc(100% - 18px)" : "2px" }}
        />
      </button>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
          {icon}
        </div>
        <div>
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{label}</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color: "hsl(var(--foreground))" }}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({
  icon, title, description, children,
}: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span style={{ color: "hsl(var(--muted-foreground))" }}>{icon}</span>
        <div>
          <h3 className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{title}</h3>
          <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{description}</p>
        </div>
      </div>
      <div className="rounded-xl p-4 space-y-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
        {children}
      </div>
    </div>
  );
}

function ShortcutInput({
  shortcut, onCapture, invalidModifierText, promptText,
}: {
  shortcut: string; onCapture: (shortcut: string) => void;
  invalidModifierText: string; promptText: string;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pausedRef.current) { void invoke("resume_shortcut"); pausedRef.current = false; }
    };
  }, []);

  const handleClick = async () => {
    if (recording) return;
    if (!pausedRef.current) { pausedRef.current = true; await invoke("pause_shortcut"); }
    setRecording(true); setError(null);
  };

  const handleBlur = async () => {
    setRecording(false);
    if (pausedRef.current) { pausedRef.current = false; await invoke("resume_shortcut"); }
  };

  const handleKeyDown = async (event: React.KeyboardEvent) => {
    if (!recording) return;
    event.preventDefault(); event.stopPropagation();
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    if (!event.metaKey && !event.ctrlKey && !event.altKey) { setError(invalidModifierText); return; }
    const mainKey = codeToTauriKey(event.code);
    if (!mainKey) return;
    const parts: string[] = [];
    if (event.metaKey || event.ctrlKey) parts.push("CmdOrCtrl");
    if (event.shiftKey) parts.push("Shift");
    if (event.altKey) parts.push("Alt");
    parts.push(mainKey);
    setError(null); setRecording(false); onCapture(parts.join("+"));
    if (pausedRef.current) { pausedRef.current = false; await invoke("resume_shortcut"); }
  };

  return (
    <div>
      <div
        tabIndex={0}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center cursor-pointer"
        style={{
          background: "hsl(var(--card))",
          border: recording ? "1px solid hsl(var(--brand))" : error ? "1px solid hsl(var(--destructive))" : "1px solid hsl(var(--border))",
          color: "hsl(var(--foreground))",
        }}
        onClick={handleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {recording ? <span style={{ color: "hsl(var(--brand))" }}>{promptText}</span> : translateShortcut(shortcut)}
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: "hsl(var(--destructive))" }}>{error}</p>
      )}
    </div>
  );
}

function ModelGuide({
  currentModel, onSelectModel, uiLanguage, toggleText, selectedText, chooseText,
}: {
  currentModel: string; onSelectModel: (modelName: string) => void;
  uiLanguage: UiLanguage; toggleText: string; selectedText: string; chooseText: string;
}) {
  return (
    <div className="mt-2 space-y-2">
      {modelCatalog.map((item) => {
        const selected = currentModel === item.name;
        return (
          <div
            key={item.name}
            className="rounded-lg p-3"
            style={{
              background: "hsl(var(--card))",
              border: selected ? "1px solid hsl(var(--brand))" : "1px solid hsl(var(--border))",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>{item.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{item.provider}</p>
              </div>
              <button
                onClick={() => onSelectModel(item.name)}
                className="px-2 py-1 rounded-md text-xs"
                style={{
                  background: selected ? "hsl(var(--success) / 0.15)" : "hsl(var(--secondary))",
                  color: selected ? "hsl(var(--success))" : "hsl(var(--foreground))",
                }}
              >
                {selected ? selectedText : chooseText}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>{item.description[uiLanguage]}</p>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{toggleText}: {item.baseUrlHint}</p>
            {item.note && (
              <p className="text-xs mt-1" style={{ color: "hsl(var(--warning))" }}>{item.note[uiLanguage]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IconButton({
  title, onClick, children, accent,
}: { title: string; onClick: () => void; children: React.ReactNode; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md transition-colors"
      style={{
        background: accent ? "hsl(var(--brand))" : "transparent",
        color: accent ? "hsl(var(--brand-foreground))" : "hsl(var(--muted-foreground))",
        lineHeight: 0,
      }}
    >
      {children}
    </button>
  );
}

function App() {
  const [view, setView] = useState<View>("history");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [microphoneOk, setMicrophoneOk] = useState(false);
  const [accessibilityOk, setAccessibilityOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiKeyStatus, setApiKeyStatus] = useState<"untested" | "testing" | "ok" | "error" | "warn">("untested");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [showModelGuide, setShowModelGuide] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearTimerRef = useRef<number | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [shortcutConflictMsg, setShortcutConflictMsg] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<number>(0);
  const historyOffsetRef = useRef(0);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "latest" | "error">("idle");
  const [updateInfo, setUpdateInfo] = useState<{
    latestVersion: string; releaseUrl: string; releaseNotes: string;
    publishedAt: string; assets: { name: string; url: string; size: number }[];
  } | null>(null);
  const [polishStatus, setPolishStatus] = useState<"untested" | "testing" | "ok" | "error">("untested");
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishErrorMsg, setPolishErrorMsg] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [defaultPolishPrompt, setDefaultPolishPrompt] = useState("");

  async function checkForUpdates() {
    setUpdateStatus("checking");
    try {
      const result = await invoke<{
        has_update: boolean; latest_version: string; release_url: string;
        release_notes: string; published_at: string;
        assets: { name: string; url: string; size: number }[]; error: string;
      }>("check_for_updates");
      if (result.error) { setUpdateStatus("error"); setTimeout(() => setUpdateStatus("idle"), 3000); return; }
      if (result.has_update) {
        setUpdateStatus("available");
        setUpdateInfo({
          latestVersion: result.latest_version, releaseUrl: result.release_url,
          releaseNotes: result.release_notes, publishedAt: result.published_at, assets: result.assets,
        });
      } else { setUpdateStatus("latest"); setTimeout(() => setUpdateStatus("idle"), 3000); }
    } catch { setUpdateStatus("error"); setTimeout(() => setUpdateStatus("idle"), 3000); }
  }

  useEffect(() => { getVersion().then(setAppVersion); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { checkForUpdates(); }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  const HISTORY_PAGE_SIZE = 50;

  const loadHistory = useCallback(async (reset = true) => {
    const offset = reset ? 0 : historyOffsetRef.current;
    const entries = await invoke<HistoryEntry[]>("get_history_page", { limit: HISTORY_PAGE_SIZE, offset });
    if (reset) { setHistory(entries); historyOffsetRef.current = entries.length; setSelectedIds(new Set()); }
    else { setHistory((prev) => [...prev, ...entries]); historyOffsetRef.current += entries.length; }
    setHasMore(entries.length === HISTORY_PAGE_SIZE);
  }, []);

  const loadSettings = useCallback(async () => {
    const nextSettings = await invoke<AppSettings>("get_settings");
    setSettings(nextSettings);
    if (!nextSettings.api_key) { setView("onboarding"); }
  }, []);

  const checkPermissions = useCallback(async () => {
    const [microphone, accessibility] = await Promise.all([
      invoke<boolean>("check_microphone"), invoke<boolean>("check_accessibility"),
    ]);
    setMicrophoneOk(microphone); setAccessibilityOk(accessibility);
  }, []);

  const waitForPermission = useCallback(
    async (command: "check_microphone" | "check_accessibility", setter: (value: boolean) => void, attempts = 15) => {
      for (let index = 0; index < attempts; index += 1) {
        const ok = await invoke<boolean>(command);
        setter(ok);
        if (ok) return true;
        if (index < attempts - 1) { await new Promise((resolve) => setTimeout(resolve, 1000)); }
      }
      return false;
    }, [],
  );

  useEffect(() => {
    void loadHistory(); void loadSettings(); void checkPermissions();
    const unlistenHistory = listen("history-updated", () => { void loadHistory(true); });
    const unlistenError = listen<string>("transcription-error", (event) => {
      setErrorMsg(event.payload); window.setTimeout(() => setErrorMsg(null), 5000);
    });
    const unlistenFailed = listen<string>("transcription-failed", (event) => {
      setErrorMsg(event.payload); window.setTimeout(() => setErrorMsg(null), 5000);
    });
    const unlistenShortcutConflict = listen<string>("shortcut-conflict", (event) => { setShortcutConflictMsg(event.payload); });
    const unlistenPolishError = listen<string>("polish-error", (event) => {
      setPolishErrorMsg(event.payload);
      window.setTimeout(() => setPolishErrorMsg(null), 5000);
    });
    return () => {
      unlistenHistory.then((dispose) => dispose());
      unlistenError.then((dispose) => dispose());
      unlistenFailed.then((dispose) => dispose());
      unlistenShortcutConflict.then((dispose) => dispose());
      unlistenPolishError.then((dispose) => dispose());
    };
  }, [checkPermissions, loadHistory, loadSettings]);

  useEffect(() => { return () => { if (clearTimerRef.current) { window.clearTimeout(clearTimerRef.current); } }; }, []);

  useEffect(() => {
    if (microphoneOk && accessibilityOk) return;
    const interval = window.setInterval(() => { void checkPermissions(); }, 2000);
    return () => window.clearInterval(interval);
  }, [microphoneOk, accessibilityOk, checkPermissions]);

  useEffect(() => {
    if (!accessibilityOk) return;
    invoke("initialize_enigo").catch((error) => { console.error("Failed to initialize auto-paste:", error); });
  }, [accessibilityOk]);

  useEffect(() => {
    invoke<string>("get_default_polish_prompt").then(setDefaultPolishPrompt).catch(() => {});
  }, []);

  const handleEnableMicrophone = useCallback(async () => {
    await invoke("request_microphone");
    await waitForPermission("check_microphone", setMicrophoneOk);
  }, [waitForPermission]);

  const handleEnableAccessibility = useCallback(async () => {
    await invoke("request_accessibility");
    await waitForPermission("check_accessibility", setAccessibilityOk);
  }, [waitForPermission]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    if ("api_key" in patch || "api_base_url" in patch || "model" in patch) {
      setApiKeyStatus("untested"); setApiKeyError(null);
    }
    window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      setSettings((current) => {
        if (current) { invoke("save_settings", { settings: current }).catch(() => {}); }
        return current;
      });
    }, 800);
  };

  const uiLanguage: UiLanguage = settings?.ui_language ?? "zh-CN";
  const m = messages[uiLanguage];

  const persistSettings = useCallback(async () => {
    if (!settings) return false;
    setSavingSettings(true); setSettingsFeedback(null);
    try {
      await invoke("save_settings", { settings });
      setSettingsFeedback({ tone: "success", message: messages[settings.ui_language].settingsSaved });
      window.setTimeout(() => setSettingsFeedback(null), 2200);
      return true;
    } catch (error) {
      setSettingsFeedback({ tone: "error", message: String(error) });
      return false;
    } finally { setSavingSettings(false); }
  }, [settings]);

  const testApiKey = async (apiKey: string, apiBaseUrl: string, model: string) => {
    if (!apiKey || !apiBaseUrl) return;
    setApiKeyStatus("testing"); setApiKeyError(null);
    try {
      await invoke("validate_api_key", { apiKey, apiBaseUrl, model });
      setApiKeyStatus("ok");
    } catch (error) {
      const detail = String(error);
      const isUpstreamOverload = /upstream|overloaded|429|503|upstream service/i.test(detail);
      setApiKeyStatus(isUpstreamOverload ? "warn" : "error");
      setApiKeyError(`${detail}\n${m.optionalValidationHint}`);
    }
  };

  const testPolishConnection = async () => {
    if (!settings?.ai_polish_api_url || !settings?.ai_polish_api_key) return;
    setPolishStatus("testing"); setPolishError(null);
    try {
      await invoke("validate_api_key", {
        apiKey: settings.ai_polish_api_key, apiBaseUrl: settings.ai_polish_api_url,
        model: settings.ai_polish_model || "gpt-4o-mini",
      });
      setPolishStatus("ok");
    } catch (error) { setPolishStatus("error"); setPolishError(String(error)); }
  };

  const copyText = async (text: string, id: number) => {
    await writeText(text); setCopied(id);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const playAudio = async (path: string, id: number) => {
    if (playingAudioId === id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingAudioId(null);
      return;
    }
    try {
      const base64 = await invoke<string>("read_audio_file", { path });
      const audioUrl = `data:audio/wav;base64,${base64}`;
      if (audioRef.current) { audioRef.current.pause(); }
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => { setPlayingAudioId(null); audioRef.current = null; };
      audio.onerror = () => { setPlayingAudioId(null); audioRef.current = null; };
      await audio.play();
      setPlayingAudioId(id);
    } catch (error) {
      console.error("Failed to play audio:", error);
    }
  };

  const loadLogs = useCallback(async () => {
    try {
      const entries = await invoke<LogEntry[]>("get_logs");
      setLogs(entries);
    } catch {}
  }, []);

  const clearLogs = async () => {
    await invoke("clear_logs");
    setLogs([]);
  };

  const copyAllLogs = async () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.target}: ${l.message}`).join('\n');
    await writeText(text);
  };

  const flushAutoSave = useCallback(() => {
    window.clearTimeout(autoSaveTimerRef.current);
    setSettings((current) => {
      if (current) { invoke("save_settings", { settings: current }).catch(() => {}); }
      return current;
    });
  }, []);

  useEffect(() => {
    if (view === "diagnostics") {
      loadLogs();
      const interval = window.setInterval(loadLogs, 2000);
      return () => window.clearInterval(interval);
    }
  }, [view, loadLogs]);

  useEffect(() => {
    if (logsAutoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, logsAutoScroll]);

  const deleteEntry = async (id: number) => {
    await invoke("delete_history_entry", { id });
    setHistory((items) => items.filter((item) => item.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await invoke("delete_history_entries", { ids });
    setHistory((items) => items.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
  };

  const clearHistory = async () => {
    if (history.length === 0) {
      setSettingsFeedback({ tone: "error", message: m.clearEmpty });
      window.setTimeout(() => setSettingsFeedback(null), 2200); return;
    }
    if (!confirmingClear) {
      setConfirmingClear(true);
      if (clearTimerRef.current) { window.clearTimeout(clearTimerRef.current); }
      clearTimerRef.current = window.setTimeout(() => { setConfirmingClear(false); }, 2500);
      return;
    }
    if (clearTimerRef.current) { window.clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
    try {
      await invoke("clear_history"); setHistory([]); setConfirmingClear(false);
      setSettingsFeedback({ tone: "success", message: m.clearSuccess });
      window.setTimeout(() => setSettingsFeedback(null), 2200);
    } catch (error) { setConfirmingClear(false); setErrorMsg(`${m.clearFailed} ${String(error)}`); }
  };

  const retryEntry = async (id: number) => {
    setRetrying(id);
    try { await invoke("retry_transcription", { id }); await loadHistory(); }
    catch (error) { setErrorMsg(String(error)); }
    finally { setRetrying(null); }
  };

  const filteredHistory = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return history.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [entry.text, entry.error_message ?? "", entry.model, entry.provider, entry.language].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [history, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = history.length;
    const failed = history.filter((entry) => entry.status === "failed").length;
    const success = total - failed;
    const audioSaved = history.filter((entry) => Boolean(entry.audio_path)).length;
    const totalCost = history.reduce((sum, entry) => sum + (entry.estimated_cost || 0), 0);
    const totalTokens = history.reduce((sum, entry) => sum + (entry.polish_tokens || 0), 0);
    return { total, success, failed, audioSaved, totalCost, totalTokens };
  }, [history]);

  const todayCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime() / 1000;
    return history.filter((entry) => entry.timestamp >= startOfDay).length;
  }, [history]);

  if (!settings) {
    return (
      <div className="h-screen flex items-center justify-center text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        {m.loading}
      </div>
    );
  }

  const hasApiConfig = Boolean(settings.api_key.trim() && settings.api_base_url.trim());
  const canProceed = hasApiConfig && microphoneOk && (isMac ? accessibilityOk : true);
  const startHint = formatTemplate(m.startHint, { shortcut: translateShortcut(settings.shortcut || "") });

  // Sidebar icons
  const HistoryIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );

  const SettingsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );

  const SearchIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );

  const SuccessIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  const AudioIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );

  const DownloadIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  const ApiIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );

  const PolishIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.09 3.26L16 6l-2.91.74L12 10l-1.09-3.26L8 6l2.91-.74z" />
      <path d="M18 12l.6 1.82L20.5 14.5l-1.9.68L18 17l-.6-1.82-1.9-.68 1.9-.66z" />
      <path d="M7 16l.45 1.35L9 18l-1.55.5L7 20l-.45-1.35L5 18l1.55-.5z" />
    </svg>
  );

  const MicIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );

  const BehaviorIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );

  const DiagnosticsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );

  // Sidebar nav items
  const navItems: Array<{ id: View; icon: React.ReactNode; label: string; group?: string }> = [
    { id: "history", icon: HistoryIcon, label: m.history, group: "main" },
    { id: "settingsApi", icon: ApiIcon, label: m.apiConfiguration, group: "config" },
    { id: "settingsPolish", icon: PolishIcon, label: m.aiPolishSettings, group: "config" },
    { id: "settingsRecording", icon: MicIcon, label: m.recordingSettings, group: "config" },
    { id: "settingsBehavior", icon: BehaviorIcon, label: m.behaviorSettings, group: "config" },
    { id: "settingsApp", icon: SettingsIcon, label: m.appSettings, group: "config" },
    { id: "diagnostics", icon: DiagnosticsIcon, label: m.diagnostics, group: "footer" },
  ];

  // Onboarding (standalone, no sidebar)
  if (view === "onboarding") {
    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        <div className="w-[180px] shrink-0 flex flex-col border-r" style={{ background: "hsl(var(--sidebar-bg))", borderColor: "hsl(var(--sidebar-border))" }}>
          <div className="flex items-center gap-2 px-4 py-4">
            <img src={logoUrl} alt="" width={24} height={24} />
            <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Whisp</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 ">
            <div className="flex flex-col items-center mb-6">
              <div className="flex items-center gap-2 mb-1">
                <img src={logoUrl} alt="" width={28} height={28} />
                <h1 className="text-xl font-semibold">{m.onboardingTitle}</h1>
              </div>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{m.appSubtitle}</p>
            </div>

            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--brand))", color: "white" }}>1</span>
                  <span className="text-sm font-medium">{m.onboardingStep1}</span>
                  {apiKeyStatus === "ok" && <span style={{ color: "hsl(var(--success))" }}>&#10003;</span>}
                  {apiKeyStatus === "warn" && <span style={{ color: "hsl(var(--warning))" }}>&#9888;</span>}
                </div>
                <div className="flex gap-2 flex-wrap mb-2">
                  {endpointPresets.map((preset) => (
                    <FilterChip key={preset.value} active={settings.api_base_url === preset.value} label={preset.label} onClick={() => updateSettings({ api_base_url: preset.value })} />
                  ))}
                </div>
                <input type="text" value={settings.api_base_url} onChange={(event) => updateSettings({ api_base_url: event.target.value })} placeholder={defaultApiBaseUrl} className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2" />
                <input type="password" value={settings.api_key} onChange={(event) => updateSettings({ api_key: event.target.value })} placeholder="sk-proj-..." className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                <input list="model-options" value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="gpt-4o-transcribe" className="w-full px-3 py-2 rounded-lg text-sm outline-none mt-2" />
                <datalist id="model-options">
                  {suggestedModels.map((modelName) => (<option key={modelName} value={modelName} />))}
                </datalist>
                <div className="flex items-center justify-end mt-2">
                  <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "hsl(var(--brand))" }}>
                    {showModelGuide ? m.collapseModelGuide : m.modelGuide}
                  </button>
                </div>
                {showModelGuide && (
                  <ModelGuide currentModel={settings.model} onSelectModel={(modelName) => updateSettings({ model: modelName })} uiLanguage={uiLanguage} toggleText={m.apiBaseUrl} selectedText={m.connected} chooseText={m.save} />
                )}
                <button
                  onClick={() => testApiKey(settings.api_key, settings.api_base_url, settings.model)}
                  disabled={!settings.api_key || !settings.api_base_url || apiKeyStatus === "testing"}
                  className="w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{
                    background: apiKeyStatus === "ok" ? "hsl(var(--success) / 0.15)" : apiKeyStatus === "warn" ? "hsl(var(--warning) / 0.15)" : "hsl(var(--brand))",
                    color: apiKeyStatus === "ok" ? "hsl(var(--success))" : apiKeyStatus === "warn" ? "hsl(var(--warning))" : "white",
                    opacity: !settings.api_key || !settings.api_base_url || apiKeyStatus === "testing" ? 0.5 : 1,
                  }}
                >
                  {apiKeyStatus === "testing" ? m.testing : apiKeyStatus === "ok" ? m.connected : apiKeyStatus === "warn" ? m.optionalValidationHint.split("。")[0] : m.testConnection}
                </button>
                {(apiKeyStatus === "error" || apiKeyStatus === "warn") && apiKeyError && (
                  <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: apiKeyStatus === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }}>{apiKeyError}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--brand))", color: "white" }}>2</span>
                  <span className="text-sm font-medium">{m.onboardingStep2}</span>
                  {microphoneOk && <span style={{ color: "hsl(var(--success))" }}>&#10003;</span>}
                </div>
                {microphoneOk ? (
                  <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--success))" }}>{m.enabled}</div>
                ) : (
                  <button onClick={handleEnableMicrophone} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "hsl(var(--brand))", color: "white" }}>{m.allowMicrophone}</button>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--brand))", color: "white" }}>3</span>
                  <span className="text-sm font-medium">{m.onboardingStep3}</span>
                  {accessibilityOk && <span style={{ color: "hsl(var(--success))" }}>&#10003;</span>}
                </div>
                {accessibilityOk ? (
                  <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--success))" }}>{m.enabled}</div>
                ) : (
                  <button onClick={handleEnableAccessibility} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "hsl(var(--brand))", color: "white" }}>{m.allowAccessibility}</button>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>4</span>
                  <span className="text-sm font-medium">{m.onboardingStep4}</span>
                </div>
                <ShortcutInput shortcut={settings.shortcut} onCapture={(shortcut) => updateSettings({ shortcut })} invalidModifierText={m.invalidModifier} promptText={m.pressShortcut} />
              </div>
            </div>

            {settingsFeedback && (
              <p className="text-xs mt-3" style={{ color: settingsFeedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>{settingsFeedback.message}</p>
            )}

            <button
              onClick={async () => { const ok = await persistSettings(); if (ok) setView("history"); }}
              disabled={!canProceed || savingSettings}
              className="w-full mt-6 py-2.5 rounded-lg text-sm font-medium"
              style={{
                background: canProceed ? "hsl(var(--brand))" : "hsl(var(--muted))",
                color: canProceed ? "white" : "hsl(var(--muted-foreground))",
                cursor: canProceed ? "pointer" : "not-allowed",
              }}
            >
              {savingSettings ? m.saving : (apiKeyStatus === "ok" || apiKeyStatus === "warn") ? m.getStarted : m.saveAndContinue}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sidebar component
  const Sidebar = (
    <div className="w-[180px] shrink-0 flex flex-col border-r" style={{ background: "hsl(var(--sidebar-bg))", borderColor: "hsl(var(--sidebar-border))" }}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <img src={logoUrl} alt="" width={22} height={22} />
        <span className="text-sm font-semibold" style={{ color: "hsl(var(--foreground))" }}>Whisp</span>
      </div>

      <div className="flex-1 px-3 space-y-0.5">
        {navItems.map((item, idx) => {
          const prevGroup = idx > 0 ? navItems[idx - 1].group : null;
          const showSeparator = item.group !== prevGroup && item.group === "footer";
          return (
            <React.Fragment key={item.id}>
              {showSeparator && <div className="mx-3 my-2 h-px" style={{ background: "hsl(var(--sidebar-border))" }} />}
              <button
                onClick={() => { flushAutoSave(); setView(item.id); }}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm transition-colors"
                style={{
                  background: view === item.id ? "hsl(var(--sidebar-item-active-bg))" : "transparent",
                  color: view === item.id ? "hsl(var(--sidebar-text-active))" : "hsl(var(--sidebar-text))",
                  fontWeight: view === item.id ? 500 : 400,
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="px-3 pb-4 space-y-2">
        <div className="h-px" style={{ background: "hsl(var(--sidebar-border))" }} />
        <button
          onClick={checkForUpdates}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-xs transition-colors"
          style={{ color: "hsl(var(--sidebar-text))" }}
        >
          {DownloadIcon}
          {updateStatus === "checking" ? m.checkingUpdates : updateStatus === "available" ? m.updateAvailable : m.checkForUpdates}
        </button>
        <div className="px-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {appVersion ? `v${appVersion}` : ""}
          </span>
          {updateStatus === "available" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" 
                  style={{ background: "hsl(var(--success) / 0.15)", color: "hsl(var(--success))" }}>
              {m.newVersionAvailable}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const settingsPageHeader = (title: string) => (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--foreground))" }}>{title}</h1>
        <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
          {savingSettings ? m.saving : settingsFeedback?.message ?? ""}
        </p>
      </div>
      <button
        onClick={async () => { const ok = await persistSettings(); if (ok) setView("history"); }}
        className="text-sm px-4 py-1.5 rounded-lg font-medium"
        style={{ background: "hsl(var(--brand))", color: "white" }}
      >
        {savingSettings ? m.saving : m.done}
      </button>
    </div>
  );

  // settingsApi
  if (view === "settingsApi") {
    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        {Sidebar}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {settingsPageHeader(m.apiConfiguration)}
            <div className="space-y-6">
              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>}
                title={m.apiConfiguration}
                description={m.apiConfigurationDesc}
              >
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.endpointPresets}</label>
                  <div className="flex gap-2 flex-wrap">
                    {endpointPresets.map((preset) => (
                      <FilterChip key={preset.value} active={settings.api_base_url === preset.value} label={preset.label} onClick={() => updateSettings({ api_base_url: preset.value })} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.apiBaseUrl}</label>
                  <input type="text" value={settings.api_base_url} onChange={(event) => updateSettings({ api_base_url: event.target.value })} placeholder={defaultApiBaseUrl} className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.apiKey}</label>
                  <input type="password" value={settings.api_key} onChange={(event) => updateSettings({ api_key: event.target.value })} placeholder="sk-..." className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                  <button
                    onClick={() => testApiKey(settings.api_key, settings.api_base_url, settings.model)}
                    disabled={!settings.api_key || !settings.api_base_url || apiKeyStatus === "testing"}
                    className="w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{
                      background: apiKeyStatus === "ok" ? "hsl(var(--success) / 0.15)" : apiKeyStatus === "warn" ? "hsl(var(--warning) / 0.15)" : "hsl(var(--secondary))",
                      color: apiKeyStatus === "ok" ? "hsl(var(--success))" : apiKeyStatus === "warn" ? "hsl(var(--warning))" : "hsl(var(--foreground))",
                      opacity: !settings.api_key || !settings.api_base_url || apiKeyStatus === "testing" ? 0.5 : 1,
                    }}
                  >
                    {apiKeyStatus === "testing" ? m.testing : apiKeyStatus === "ok" ? m.connected : m.testConnection}
                  </button>
                  {(apiKeyStatus === "error" || apiKeyStatus === "warn") && apiKeyError && (
                    <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: apiKeyStatus === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }}>{apiKeyError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.model}</label>
                  <input list="model-options" value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="gpt-4o-transcribe" className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                  <datalist id="model-options">
                    {suggestedModels.map((modelName) => (<option key={modelName} value={modelName} />))}
                  </datalist>
                  <div className="flex items-center justify-end mt-1">
                    <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "hsl(var(--brand))" }}>
                      {showModelGuide ? m.collapseModelGuide : m.modelGuide}
                    </button>
                  </div>
                  {showModelGuide && (
                    <ModelGuide currentModel={settings.model} onSelectModel={(modelName) => updateSettings({ model: modelName })} uiLanguage={uiLanguage} toggleText={m.apiBaseUrl} selectedText={m.connected} chooseText={m.save} />
                  )}
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.language}</label>
                  <select value={settings.language} onChange={(event) => updateSettings({ language: event.target.value })} className="w-full px-3 py-2 rounded-lg text-sm outline-none">
                    {["auto", "zh", "en", "ja", "ko", "es", "fr", "de"].map((language) => (
                      <option key={language} value={language}>{displaySpeechLanguage(language, uiLanguage)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.timeout}</label>
                    <input type="number" min={10} max={300} value={settings.request_timeout_sec} onChange={(event) => updateSettings({ request_timeout_sec: Math.max(10, Number(event.target.value) || 10) })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.retryCount}</label>
                    <select value={settings.retry_count} onChange={(event) => updateSettings({ retry_count: Number(event.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm outline-none">
                      <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                    </select>
                  </div>
                </div>
              </SettingsSection>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // settingsPolish
  if (view === "settingsPolish") {
    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        {Sidebar}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {settingsPageHeader(m.aiPolishSettings)}
            <div className="space-y-6">
              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>}
                title={m.aiPolishSettings}
                description={m.aiPolishSettingsDesc}
              >
                <ToggleRow label={m.aiPolish} description={m.aiPolishDesc} value={settings.ai_polish_enabled} onChange={(value) => updateSettings({ ai_polish_enabled: value })} />
                {settings.ai_polish_enabled && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.aiPolishApiUrl}</label>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {aiPolishPresets.map((preset) => (
                          <FilterChip key={`polish-${preset.apiUrl}-${preset.model}`} active={settings.ai_polish_api_url === preset.apiUrl && settings.ai_polish_model === preset.model} label={preset.label} onClick={() => { updateSettings({ ai_polish_api_url: preset.apiUrl, ai_polish_model: preset.model }); setPolishStatus("untested"); setPolishError(null); }} />
                        ))}
                      </div>
                      <input type="text" value={settings.ai_polish_api_url} onChange={(event) => { updateSettings({ ai_polish_api_url: event.target.value }); setPolishStatus("untested"); setPolishError(null); }} placeholder="https://api.openai.com/v1" className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.aiPolishApiKey}</label>
                      <input type="password" value={settings.ai_polish_api_key} onChange={(event) => { updateSettings({ ai_polish_api_key: event.target.value }); setPolishStatus("untested"); setPolishError(null); }} placeholder="sk-..." className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.aiPolishModel}</label>
                      <input list="polish-model-options" value={settings.ai_polish_model} onChange={(event) => updateSettings({ ai_polish_model: event.target.value })} placeholder="gpt-4o-mini" className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                      <datalist id="polish-model-options">
                        <option value="gpt-4o-mini" /><option value="gpt-4o" /><option value="deepseek-chat" /><option value="deepseek-reasoner" />
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.aiPolishPrompt}</label>
                      <textarea
                        value={settings.ai_polish_prompt}
                        onChange={(event) => updateSettings({ ai_polish_prompt: event.target.value })}
                        placeholder={defaultPolishPrompt || m.aiPolishPromptPlaceholder}
                        rows={5}
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                        style={{ fontFamily: "monospace", fontSize: "12px", lineHeight: "1.5" }}
                      />
                      <p className="text-[11px] mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {m.aiPolishPromptDesc}
                      </p>
                    </div>
                    <button
                      onClick={testPolishConnection}
                      disabled={!settings.ai_polish_api_url || !settings.ai_polish_api_key || polishStatus === "testing"}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium"
                      style={{
                        background: polishStatus === "ok" ? "hsl(var(--success) / 0.15)" : "hsl(var(--secondary))",
                        color: polishStatus === "ok" ? "hsl(var(--success))" : "hsl(var(--foreground))",
                        opacity: !settings.ai_polish_api_url || !settings.ai_polish_api_key || polishStatus === "testing" ? 0.5 : 1,
                      }}
                    >
                      {polishStatus === "testing" ? m.testing : polishStatus === "ok" ? m.connected : m.testPolishConnection}
                    </button>
                    {polishStatus === "error" && polishError && (
                      <p className="text-xs whitespace-pre-wrap" style={{ color: "hsl(var(--destructive))" }}>{polishError}</p>
                    )}
                  </div>
                )}
              </SettingsSection>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // settingsRecording
  if (view === "settingsRecording") {
    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        {Sidebar}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {settingsPageHeader(m.recordingSettings)}
            <div className="space-y-6">
              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>}
                title={m.recordingSettings}
                description={m.recordingSettingsDesc}
              >
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.silenceTimeout}</label>
                  <input type="number" min={0} max={3600} step={10} value={settings.silence_timeout_sec} onChange={(event) => updateSettings({ silence_timeout_sec: Math.max(0, Number(event.target.value) || 0) })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.silenceThreshold}</label>
                  <input type="number" min={0} max={1} step={0.005} value={settings.silence_threshold} onChange={(event) => updateSettings({ silence_threshold: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.whisperPrompt}</label>
                  <textarea value={settings.whisper_prompt} onChange={(event) => updateSettings({ whisper_prompt: event.target.value })} placeholder={m.whisperPromptPlaceholder} rows={3} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" />
                </div>
                <ToggleRow label={m.trimSilence} description={m.trimSilenceDesc} value={settings.trim_silence_enabled} onChange={(value) => updateSettings({ trim_silence_enabled: value })} />
                <div>
                  <label className="block text-xs mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                    {m.audioRetentionLimit}
                  </label>
                  <p className="text-[11px] mb-1" style={{ color: "hsl(var(--muted-foreground))" }}>{m.audioRetentionLimitDesc}</p>
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    step={10}
                    value={settings.audio_retention_limit}
                    onChange={(event) => updateSettings({ audio_retention_limit: Math.max(10, Number(event.target.value) || 10) })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  />
                </div>
              </SettingsSection>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // settingsBehavior
  if (view === "settingsBehavior") {
    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        {Sidebar}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {settingsPageHeader(m.behaviorSettings)}
            <div className="space-y-6">
              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
                title={m.behaviorSettings}
                description={m.behaviorSettingsDesc}
              >
                <ToggleRow label={m.autoPaste} description={m.autoPasteDesc} value={settings.auto_paste_enabled} onChange={(value) => updateSettings({ auto_paste_enabled: value })} />
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.pasteDelay}</label>
                  <input type="number" min={50} max={2000} step={50} value={settings.paste_delay_ms} onChange={(event) => updateSettings({ paste_delay_ms: Math.max(50, Number(event.target.value) || 50) })} className="w-full px-3 py-2 rounded-lg text-sm outline-none" />
                </div>
                <ToggleRow label={m.saveAudioFiles} description={m.saveAudioFilesDesc} value={settings.save_audio_files} onChange={(value) => updateSettings({ save_audio_files: value })} />
                <ToggleRow label={m.soundEffects} description={m.soundEffectsDesc} value={settings.sound_enabled} onChange={(value) => updateSettings({ sound_enabled: value })} />
              </SettingsSection>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // settingsApp
  if (view === "settingsApp") {
    const StatusIcon = ({ ok, label }: { ok: boolean; label: string }) => (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: ok ? "hsl(var(--success))" : "hsl(var(--destructive))" }} />
        <span className="text-sm" style={{ color: ok ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
          {ok ? m.enabled : label}
        </span>
      </div>
    );

    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        {Sidebar}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {settingsPageHeader(m.appSettings)}
            <div className="space-y-6">
              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2" /><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10" /></svg>}
                title={m.shortcutsPermissions}
                description={m.shortcutsPermissionsDesc}
              >
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.uiLanguage}</label>
                  <select value={settings.ui_language} onChange={(event) => updateSettings({ ui_language: event.target.value as UiLanguage })} className="w-full px-3 py-2 rounded-lg text-sm outline-none">
                    {uiLanguageOptions.map((option) => (<option key={option.value} value={option.value}>{option.label[uiLanguage]}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.shortcut}</label>
                  <ShortcutInput shortcut={settings.shortcut} onCapture={(shortcut) => updateSettings({ shortcut })} invalidModifierText={m.invalidModifier} promptText={m.pressShortcut} />
                  {settings.shortcut && (
                    <button onClick={() => updateSettings({ shortcut: "" })} className="text-xs mt-1" style={{ color: "hsl(var(--brand))" }}>{m.resetToDefault}</button>
                  )}
                  {shortcutConflictMsg && (
                    <p className="text-xs mt-1" style={{ color: "hsl(var(--destructive))" }}>{m.shortcutConflict}: {shortcutConflictMsg}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.microphone}</label>
                    {microphoneOk ? (
                      <StatusIcon ok={true} label={m.enabled} />
                    ) : (
                      <button onClick={handleEnableMicrophone} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "hsl(var(--brand))", color: "white" }}>{m.allowMicrophone}</button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.accessibility}</label>
                    {accessibilityOk ? (
                      <StatusIcon ok={true} label={m.enabled} />
                    ) : (
                      <button onClick={handleEnableAccessibility} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "hsl(var(--brand))", color: "white" }}>{m.allowAccessibility}</button>
                    )}
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>}
                title={m.appSettings}
                description={m.appSettingsDesc}
              >
                <ToggleRow label={m.launchAtStartup} description={m.launchAtStartupDesc} value={settings.launch_at_startup} onChange={(value) => updateSettings({ launch_at_startup: value })} />
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ border: "1px solid hsl(var(--border))" }}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "hsl(var(--foreground))" }}>{m.checkForUpdates}</div>
                    <div className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{appVersion ? `v${appVersion}` : ""}</div>
                  </div>
                  <button
                    onClick={checkForUpdates}
                    disabled={updateStatus === "checking"}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: updateStatus === "checking" ? "hsl(var(--muted))" : "hsl(var(--secondary))",
                      color: updateStatus === "checking" ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                      opacity: updateStatus === "checking" ? 0.6 : 1,
                    }}
                  >
                    {updateStatus === "checking" ? m.checkingUpdates : m.checkForUpdates}
                  </button>
                </div>
                {updateStatus === "latest" && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "hsl(var(--success))" }}>✓ {m.upToDate}</div>
                )}
                {updateStatus === "error" && (
                  <div className="text-xs" style={{ color: "hsl(var(--destructive))" }}>{m.updateError}</div>
                )}
                {updateStatus === "available" && updateInfo && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: "hsl(var(--brand))", color: "white" }}>{m.updateAvailable}</span>
                      <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>v{updateInfo.latestVersion}</span>
                    </div>
                    {updateInfo.publishedAt && (
                      <div className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>{m.publishedAt}: {new Date(updateInfo.publishedAt).toLocaleDateString()}</div>
                    )}
                    {updateInfo.releaseNotes && (
                      <details className="group">
                        <summary className="text-xs cursor-pointer" style={{ color: "hsl(var(--brand))" }}>{m.releaseNotes}</summary>
                        <div className="mt-1.5 text-xs whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto rounded-lg p-2.5" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>{updateInfo.releaseNotes}</div>
                      </details>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {updateInfo.assets.filter(a => a.name.endsWith(".dmg") || a.name.endsWith(".app.tar.gz")).map(asset => (
                        <button key={asset.name} onClick={() => window.open(asset.url)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "hsl(var(--brand))", color: "white" }}>
                          {m.downloadUpdate} ({asset.name.includes("aarch64") || asset.name.includes("arm64") ? "Apple Silicon" : asset.name.includes("x64") ? "Intel" : asset.name.split(".").pop()})
                        </button>
                      ))}
                      {updateInfo.releaseUrl && (
                        <button onClick={() => window.open(updateInfo.releaseUrl)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))" }}>
                          {m.viewOnGitHub}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </SettingsSection>

              {settingsFeedback && (
                <p className="text-xs" style={{ color: settingsFeedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>{settingsFeedback.message}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // diagnostics
  if (view === "diagnostics") {
    const lastEntry = history.length > 0 ? history[0] : null;
    const audioFileCount = history.filter((entry) => Boolean(entry.audio_path)).length;

    const StatusDot = ({ ok }: { ok: boolean }) => (
      <div className="w-2.5 h-2.5 rounded-full" style={{ background: ok ? "hsl(var(--success))" : "hsl(var(--destructive))" }} />
    );

    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        {Sidebar}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--foreground))" }}>{m.diagnostics}</h1>
            </div>

            <div className="space-y-6">
              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>}
                title={m.connectionStatus}
                description=""
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.apiBaseUrl}</span>
                    <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{settings.api_base_url || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.apiKey}</span>
                    <div className="flex items-center gap-2">
                      <StatusDot ok={Boolean(settings.api_key.trim())} />
                      <span className="text-xs" style={{ color: settings.api_key.trim() ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                        {settings.api_key.trim() ? m.apiConfigured : m.apiNotConfigured}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.model}</span>
                    <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{settings.model || "—"}</span>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>}
                title={m.permissionsStatus}
                description=""
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.microphone}</span>
                    <div className="flex items-center gap-2">
                      <StatusDot ok={microphoneOk} />
                      <span className="text-xs" style={{ color: microphoneOk ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                        {microphoneOk ? m.enabled : m.allowMicrophone}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.accessibility}</span>
                    <div className="flex items-center gap-2">
                      <StatusDot ok={accessibilityOk} />
                      <span className="text-xs" style={{ color: accessibilityOk ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                        {accessibilityOk ? m.enabled : m.allowAccessibility}
                      </span>
                    </div>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                title={m.lastTranscription}
                description=""
              >
                {lastEntry ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                      <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.model}</span>
                      <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{lastEntry.model}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                      <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.providerLabel}</span>
                      <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{lastEntry.provider}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                      <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.total}</span>
                      <span className="text-xs" style={{ color: lastEntry.status === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                        {lastEntry.status === "success" ? m.statusSuccess : m.statusFailed}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{m.noHistory}</p>
                )}
              </SettingsSection>

              <SettingsSection
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>}
                title={m.appSettings}
                description=""
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.versionLabel.split(" ")[0]}</span>
                    <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{appVersion ? `v${appVersion}` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.dataDirectory}</span>
                    <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>~/.nanowhisper</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--secondary))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--foreground))" }}>{m.audioFilesCount}</span>
                    <span className="text-xs font-mono" style={{ color: "hsl(var(--muted-foreground))" }}>{audioFileCount}</span>
                  </div>
                </div>
              </SettingsSection>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--foreground))" }}>{m.runLogs}</h2>
                  <div className="flex gap-2">
                    <button onClick={copyAllLogs} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>{m.copyAll}</button>
                    <button onClick={clearLogs} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>{m.clearLogs}</button>
                    <button onClick={() => setLogsAutoScroll(!logsAutoScroll)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: logsAutoScroll ? "hsl(var(--brand))" : "hsl(var(--secondary))", color: logsAutoScroll ? "white" : "hsl(var(--muted-foreground))" }}>
                      {logsAutoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
                    </button>
                  </div>
                </div>
                <div 
                  ref={logContainerRef}
                  className="rounded-lg border overflow-y-auto font-mono text-xs leading-relaxed"
                  style={{ 
                    background: "hsl(var(--card))", 
                    borderColor: "hsl(var(--border))",
                    height: "320px",
                    userSelect: "text",
                    WebkitUserSelect: "text",
                  }}
                >
                  {logs.length === 0 ? (
                    <div className="p-4 text-center" style={{ color: "hsl(var(--muted-foreground))" }}>暂无日志</div>
                  ) : (
                    <div className="p-2 space-y-0.5">
                      {logs.map((entry, idx) => (
                        <div key={idx} className="flex gap-2 px-2 py-0.5 rounded hover:bg-black/5 group">
                          <span className="shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>{entry.timestamp}</span>
                          <span className="shrink-0 font-semibold" style={{ 
                            color: entry.level === "ERROR" ? "hsl(var(--destructive))" : entry.level === "WARN" ? "hsl(var(--warning))" : "hsl(var(--brand))"
                          }}>[{entry.level}]</span>
                          <span className="shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>{entry.target}:</span>
                          <span className="flex-1 break-all" style={{ color: "hsl(var(--foreground))", userSelect: "text", WebkitUserSelect: "text" }}>{entry.message}</span>
                          <button 
                            onClick={async () => { await writeText(`[${entry.timestamp}] [${entry.level}] ${entry.target}: ${entry.message}`); }}
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded"
                            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}
                          >copy</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // History view (default)
  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      {Sidebar}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--foreground))" }}>{m.history}</h1>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
              {formatTemplate(m.startHint, { shortcut: translateShortcut(settings.shortcut || "") })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button onClick={deleteSelected} className="text-sm px-3 py-1.5 rounded-lg font-medium" style={{ color: "hsl(var(--destructive))", background: "hsl(var(--destructive) / 0.1)" }}>
                {m.deleteSelected} ({selectedIds.size})
              </button>
            )}
            <button onClick={clearHistory} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: confirmingClear ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))", background: confirmingClear ? "hsl(var(--destructive) / 0.1)" : "hsl(var(--secondary))" }}>
              {confirmingClear ? m.clearConfirm : m.clear}
            </button>
            <button
              onClick={async () => {
                try { const csv = await invoke<string>("export_history"); await writeText(csv); }
                catch (error) { console.error("Export failed:", error); }
              }}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{ color: "hsl(var(--muted-foreground))", background: "hsl(var(--secondary))" }}
            >
              {m.exportHistory}
            </button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="px-6 pb-3 grid grid-cols-4 gap-3">
          <StatCard
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>}
            label={m.statsTotal}
            value={String(stats.total)}
          />
          <StatCard
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
            label={m.statsToday}
            value={String(todayCount)}
          />
          <StatCard
            icon={SuccessIcon}
            label={m.statsSuccess}
            value={stats.total > 0 ? `${Math.round((stats.success / stats.total) * 100)}%` : "—"}
          />
          <StatCard
            icon={AudioIcon}
            label={m.audioSaved}
            value={String(stats.audioSaved)}
          />
        </div>
        {(stats.totalCost > 0 || stats.totalTokens > 0) && (
          <div className="px-6 pb-3 flex gap-4 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            {stats.totalCost > 0 && <span>{m.totalCost}: <strong style={{ color: "hsl(var(--foreground))" }}>¥{stats.totalCost.toFixed(4)}</strong></span>}
            {stats.totalTokens > 0 && <span>{m.totalTokens}: <strong style={{ color: "hsl(var(--foreground))" }}>{stats.totalTokens.toLocaleString()}</strong></span>}
          </div>
        )}

        {/* Search and filters */}
        <div className="px-6 pb-3 space-y-2">
          {errorMsg && (
            <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: "hsl(var(--destructive) / 0.1)", border: "1px solid hsl(var(--destructive) / 0.2)", color: "hsl(var(--destructive))" }}>
              {errorMsg}
            </div>
          )}
          {polishErrorMsg && (
            <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: "hsl(var(--warning) / 0.1)", border: "1px solid hsl(var(--warning) / 0.2)", color: "hsl(var(--warning))" }}>
              {polishErrorMsg}
            </div>
          )}
          {settingsFeedback && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ background: settingsFeedback.tone === "success" ? "hsl(var(--success) / 0.1)" : "hsl(var(--destructive) / 0.1)", border: `1px solid ${settingsFeedback.tone === "success" ? "hsl(var(--success) / 0.2)" : "hsl(var(--destructive) / 0.2)"}`, color: settingsFeedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
              {settingsFeedback.message}
            </div>
          )}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--muted-foreground))" }}>
              {SearchIcon}
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={m.searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <FilterChip active={statusFilter === "all"} label={m.filterAll} onClick={() => setStatusFilter("all")} />
            <FilterChip active={statusFilter === "success"} label={m.filterSuccess} onClick={() => setStatusFilter("success")} />
            <FilterChip active={statusFilter === "failed"} label={m.filterFailed} onClick={() => setStatusFilter("failed")} />
          </div>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12">
              <div className="mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                {history.length === 0 ? m.noHistory : m.noResults}
              </p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>{startHint}</p>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{m.stopHint}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((entry) => {
                const failed = entry.status === "failed";
                const canRetry = Boolean(entry.audio_path);
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl p-3"
                    style={{
                      background: "hsl(var(--card))",
                      border: failed ? "1px solid hsl(var(--destructive) / 0.3)" : "1px solid hsl(var(--border))",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(entry.id); else next.delete(entry.id);
                              return next;
                            });
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex gap-2 flex-wrap">
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: failed ? "hsl(var(--destructive) / 0.1)" : "hsl(var(--success) / 0.1)", color: failed ? "hsl(var(--destructive))" : "hsl(var(--success))" }}>
                            {failed ? m.statusFailed : m.statusSuccess}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}>{entry.provider}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}>{displaySpeechLanguage(entry.language, uiLanguage)}</span>
                        </div>
                      </div>
                      <div className="text-xs shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>{formatTime(entry.timestamp, uiLanguage)}</div>
                    </div>

                    <div className="mt-2">
                      {failed ? (
                        <div>
                          <div className="text-sm" style={{ color: "hsl(var(--destructive))" }}>{entry.error_message ?? entry.text}</div>
                          <button
                            onClick={async () => { await writeText(entry.error_message ?? entry.text); setCopied(entry.id); window.setTimeout(() => setCopied(null), 1500); }}
                            className="text-[11px] px-2 py-0.5 rounded mt-1 inline-flex items-center gap-1"
                            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}
                          >
                            {copied === entry.id ? m.copied : m.copyError}
                          </button>
                        </div>
                      ) : (
                        <div className="text-sm cursor-pointer" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} style={{ userSelect: "text", color: "hsl(var(--foreground))" }}>
                          {expandedId === entry.id || entry.text.length <= 120 ? `${entry.text}` : `${entry.text.slice(0, 120)}...`}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{entry.model}</span>
                        {entry.duration_ms ? (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}>{formatDuration(entry.duration_ms)}</span>
                        ) : null}
                        {entry.estimated_cost && entry.estimated_cost > 0 && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: "hsl(var(--warning) / 0.15)", color: "hsl(var(--warning))" }}>
                            ¥{entry.estimated_cost.toFixed(4)}
                          </span>
                        )}
                        {entry.polish_tokens && entry.polish_tokens > 0 && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }}>
                            {entry.polish_tokens} tokens
                          </span>
                        )}
                        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{canRetry ? m.audioSavedLabel : m.noAudio}</span>
                      </div>
                      <div className="flex gap-0.5">
                        {!failed && (
                          <IconButton title={m.copy} onClick={() => copyText(entry.text, entry.id)} accent={copied === entry.id}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </IconButton>
                        )}
                        {canRetry && (
                          <IconButton title={m.retry} onClick={() => retryEntry(entry.id)}>
                            {retrying === entry.id ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 4 23 10 17 10" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                              </svg>
                            )}
                          </IconButton>
                        )}
                        {entry.audio_path && (
                          <IconButton title={playingAudioId === entry.id ? m.pauseAudio : m.playAudio} onClick={() => playAudio(entry.audio_path!, entry.id)}>
                            {playingAudioId === entry.id ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                            )}
                          </IconButton>
                        )}
                        <IconButton title={m.delete} onClick={() => deleteEntry(entry.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </IconButton>
                      </div>
                    </div>
                  </div>
                );
              })}
              {hasMore && !searchQuery && statusFilter === "all" && (
                <button
                  onClick={() => loadHistory(false)}
                  className="w-full py-2 text-sm rounded-xl"
                  style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}
                >
                  {m.loadMore}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
