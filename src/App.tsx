import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { AppSettings, HistoryEntry } from "./types";
import logoUrl from "./assets/logo.png";

type View = "onboarding" | "history" | "settings";
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
    label: {
      "zh-CN": "简体中文",
      en: "Simplified Chinese",
      ja: "簡体字中国語",
    },
  },
  {
    value: "en",
    label: {
      "zh-CN": "English",
      en: "English",
      ja: "English",
    },
  },
  {
    value: "ja",
    label: {
      "zh-CN": "日本語",
      en: "Japanese",
      ja: "日本語",
    },
  },
];

const messages = {
  "zh-CN": {
    appSubtitle: "说话、转写、粘贴",
    versionLabel: "v2.0 稳定版",
    loading: "加载中…",
    endpointPresets: "端点预设",
    apiConfiguration: "API 配置",
    apiBaseUrl: "API Base URL",
    apiKey: "API Key",
    apiKeyStorageHint: "API Key 会优先保存在系统钥匙串中。",
    model: "模型",
    language: "转写语言",
    uiLanguage: "界面语言",
    timeout: "超时（秒）",
    retryCount: "重试次数",
    pasteDelay: "粘贴延迟（毫秒）",
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
  },
  en: {
    appSubtitle: "Speak, transcribe, paste",
    versionLabel: "v2.0 stable",
    loading: "Loading…",
    endpointPresets: "Endpoint presets",
    apiConfiguration: "API Configuration",
    apiBaseUrl: "API Base URL",
    apiKey: "API Key",
    apiKeyStorageHint: "API keys are stored in the system keychain when available.",
    model: "Model",
    language: "Transcription language",
    uiLanguage: "Interface language",
    timeout: "Timeout (sec)",
    retryCount: "Retry count",
    pasteDelay: "Paste delay (ms)",
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
  },
  ja: {
    appSubtitle: "話す、文字起こし、貼り付け",
    versionLabel: "v2.0 安定版",
    loading: "読み込み中…",
    endpointPresets: "エンドポイントプリセット",
    apiConfiguration: "API 設定",
    apiBaseUrl: "API Base URL",
    apiKey: "API キー",
    apiKeyStorageHint: "API キーは利用可能な場合、システムのキーチェーンに保存されます。",
    model: "モデル",
    language: "文字起こし言語",
    uiLanguage: "表示言語",
    timeout: "タイムアウト（秒）",
    retryCount: "再試行回数",
    pasteDelay: "貼り付け待機（ms）",
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
    Space: "Space",
    Tab: "Tab",
    Enter: "Enter",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
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
    hour: "2-digit",
    minute: "2-digit",
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
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs"
      style={{
        background: active ? "var(--accent)" : "var(--card)",
        color: active ? "white" : "var(--text)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
      }}
    >
      {label}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {description}
          </div>
        </div>
        <button
          onClick={() => onChange(!value)}
          className="relative w-10 h-5 rounded-full transition-colors shrink-0"
          style={{ background: value ? "var(--accent)" : "var(--border)" }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
            style={{ left: value ? "calc(100% - 18px)" : "2px" }}
          />
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function ShortcutInput({
  shortcut,
  onCapture,
  invalidModifierText,
  promptText,
}: {
  shortcut: string;
  onCapture: (shortcut: string) => void;
  invalidModifierText: string;
  promptText: string;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pausedRef.current) {
        void invoke("resume_shortcut");
        pausedRef.current = false;
      }
    };
  }, []);

  const handleClick = async () => {
    if (recording) return;
    if (!pausedRef.current) {
      pausedRef.current = true;
      await invoke("pause_shortcut");
    }
    setRecording(true);
    setError(null);
  };

  const handleBlur = async () => {
    setRecording(false);
    if (pausedRef.current) {
      pausedRef.current = false;
      await invoke("resume_shortcut");
    }
  };

  const handleKeyDown = async (event: React.KeyboardEvent) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      setError(invalidModifierText);
      return;
    }
    const mainKey = codeToTauriKey(event.code);
    if (!mainKey) return;
    const parts: string[] = [];
    if (event.metaKey || event.ctrlKey) parts.push("CmdOrCtrl");
    if (event.shiftKey) parts.push("Shift");
    if (event.altKey) parts.push("Alt");
    parts.push(mainKey);
    setError(null);
    setRecording(false);
    onCapture(parts.join("+"));
    if (pausedRef.current) {
      pausedRef.current = false;
      await invoke("resume_shortcut");
    }
  };

  return (
    <div>
      <div
        tabIndex={0}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center"
        style={{
          background: "var(--card)",
          border: recording ? "1px solid var(--accent)" : error ? "1px solid #ff453a" : "1px solid var(--border)",
          color: "var(--text)",
          cursor: "pointer",
        }}
        onClick={handleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {recording ? <span style={{ color: "var(--accent)" }}>{promptText}</span> : translateShortcut(shortcut)}
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: "#ff453a" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ModelGuide({
  currentModel,
  onSelectModel,
  uiLanguage,
  toggleText,
  selectedText,
  chooseText,
}: {
  currentModel: string;
  onSelectModel: (modelName: string) => void;
  uiLanguage: UiLanguage;
  toggleText: string;
  selectedText: string;
  chooseText: string;
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
              background: "var(--card)",
              border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium">{item.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {item.provider}
                </p>
              </div>
              <button
                onClick={() => onSelectModel(item.name)}
                className="px-2 py-1 rounded-md text-xs"
                style={{
                  background: selected ? "#34c75920" : "var(--border)",
                  color: selected ? "#34c759" : "var(--text)",
                }}
              >
                {selected ? selectedText : chooseText}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              {item.description[uiLanguage]}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              {toggleText}: {item.baseUrlHint}
            </p>
            {item.note && (
              <p className="text-xs mt-1" style={{ color: "#ff9f0a" }}>
                {item.note[uiLanguage]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  children,
  accent,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md"
      style={{
        background: accent ? "var(--accent)" : "transparent",
        color: accent ? "white" : "var(--text-secondary)",
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
  const [apiKeyStatus, setApiKeyStatus] = useState<"untested" | "testing" | "ok" | "error">("untested");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [showModelGuide, setShowModelGuide] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearTimerRef = useRef<number | null>(null);

  const loadHistory = useCallback(async () => {
    const entries = await invoke<HistoryEntry[]>("get_history");
    setHistory(entries);
  }, []);

  const loadSettings = useCallback(async () => {
    const nextSettings = await invoke<AppSettings>("get_settings");
    setSettings(nextSettings);
    if (!nextSettings.api_key) {
      setView("onboarding");
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    const [microphone, accessibility] = await Promise.all([
      invoke<boolean>("check_microphone"),
      invoke<boolean>("check_accessibility"),
    ]);
    setMicrophoneOk(microphone);
    setAccessibilityOk(accessibility);
  }, []);

  const waitForPermission = useCallback(
    async (
      command: "check_microphone" | "check_accessibility",
      setter: (value: boolean) => void,
      attempts = 15,
    ) => {
      for (let index = 0; index < attempts; index += 1) {
        const ok = await invoke<boolean>(command);
        setter(ok);
        if (ok) return true;
        if (index < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      return false;
    },
    [],
  );

  useEffect(() => {
    void loadHistory();
    void loadSettings();
    void checkPermissions();
    const unlistenHistory = listen("history-updated", () => {
      void loadHistory();
    });
    const unlistenError = listen<string>("transcription-error", (event) => {
      setErrorMsg(event.payload);
      window.setTimeout(() => setErrorMsg(null), 5000);
    });
    return () => {
      unlistenHistory.then((dispose) => dispose());
      unlistenError.then((dispose) => dispose());
    };
  }, [checkPermissions, loadHistory, loadSettings]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (microphoneOk && accessibilityOk) return;
    const interval = window.setInterval(() => {
      void checkPermissions();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [microphoneOk, accessibilityOk, checkPermissions]);

  useEffect(() => {
    if (!accessibilityOk) return;
    invoke("initialize_enigo").catch((error) => {
      console.error("Failed to initialize auto-paste:", error);
    });
  }, [accessibilityOk]);

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
      setApiKeyStatus("untested");
      setApiKeyError(null);
    }
  };

  const uiLanguage: UiLanguage = settings?.ui_language ?? "zh-CN";
  const m = messages[uiLanguage];

  const persistSettings = useCallback(async () => {
    if (!settings) return false;
    setSavingSettings(true);
    setSettingsFeedback(null);
    try {
      await invoke("save_settings", { settings });
      setSettingsFeedback({ tone: "success", message: messages[settings.ui_language].settingsSaved });
      window.setTimeout(() => setSettingsFeedback(null), 2200);
      return true;
    } catch (error) {
      setSettingsFeedback({ tone: "error", message: String(error) });
      return false;
    } finally {
      setSavingSettings(false);
    }
  }, [settings]);

  const testApiKey = async (apiKey: string, apiBaseUrl: string, model: string) => {
    if (!apiKey || !apiBaseUrl) return;
    setApiKeyStatus("testing");
    setApiKeyError(null);
    try {
      await invoke("validate_api_key", { apiKey, apiBaseUrl, model });
      setApiKeyStatus("ok");
    } catch (error) {
      setApiKeyStatus("error");
      const detail = String(error);
      setApiKeyError(`${detail}\n${m.optionalValidationHint}`);
    }
  };

  const copyText = async (text: string, id: number) => {
    await writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const deleteEntry = async (id: number) => {
    await invoke("delete_history_entry", { id });
    setHistory((items) => items.filter((item) => item.id !== id));
  };

  const clearHistory = async () => {
    if (history.length === 0) {
      setSettingsFeedback({ tone: "error", message: m.clearEmpty });
      window.setTimeout(() => setSettingsFeedback(null), 2200);
      return;
    }
    if (!confirmingClear) {
      setConfirmingClear(true);
      if (clearTimerRef.current) {
        window.clearTimeout(clearTimerRef.current);
      }
      clearTimerRef.current = window.setTimeout(() => {
        setConfirmingClear(false);
      }, 2500);
      return;
    }

    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }

    try {
      await invoke("clear_history");
      setHistory([]);
      setConfirmingClear(false);
      setSettingsFeedback({ tone: "success", message: m.clearSuccess });
      window.setTimeout(() => setSettingsFeedback(null), 2200);
    } catch (error) {
      setConfirmingClear(false);
      setErrorMsg(`${m.clearFailed} ${String(error)}`);
    }
  };

  const retryEntry = async (id: number) => {
    setRetrying(id);
    try {
      await invoke("retry_transcription", { id });
      await loadHistory();
    } catch (error) {
      setErrorMsg(String(error));
    } finally {
      setRetrying(null);
    }
  };

  const filteredHistory = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return history.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      const haystack = [entry.text, entry.error_message ?? "", entry.model, entry.provider, entry.language]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [history, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = history.length;
    const failed = history.filter((entry) => entry.status === "failed").length;
    const success = total - failed;
    const audioSaved = history.filter((entry) => Boolean(entry.audio_path)).length;
    return { total, success, failed, audioSaved };
  }, [history]);

  if (!settings) {
    return (
      <div className="h-screen flex items-center justify-center text-sm" style={{ color: "var(--text-secondary)" }}>
        {m.loading}
      </div>
    );
  }

  const hasApiConfig = Boolean(settings.api_key.trim() && settings.api_base_url.trim());
  const canProceed = hasApiConfig && microphoneOk && (isMac ? accessibilityOk : true);
  const defaultShortcutText = formatTemplate(m.defaultShortcut, { shortcut: defaultHotkey });
  const startHint = formatTemplate(m.startHint, { shortcut: translateShortcut(settings.shortcut || "") });

  if (view === "onboarding") {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 mb-1">
            <img src={logoUrl} alt="" width={28} height={28} />
            <h1 className="text-xl font-semibold">{m.onboardingTitle}</h1>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {m.appSubtitle}
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                1
              </span>
              <span className="text-sm font-medium">{m.onboardingStep1}</span>
              {apiKeyStatus === "ok" && <span style={{ color: "#34c759" }}>&#10003;</span>}
            </div>

            <div className="flex gap-2 flex-wrap mb-2">
              {endpointPresets.map((preset) => (
                <FilterChip
                  key={preset.value}
                  active={settings.api_base_url === preset.value}
                  label={preset.label}
                  onClick={() => updateSettings({ api_base_url: preset.value })}
                />
              ))}
            </div>

            <input
              type="text"
              value={settings.api_base_url}
              onChange={(event) => updateSettings({ api_base_url: event.target.value })}
              placeholder={defaultApiBaseUrl}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
            />

            <input
              type="password"
              value={settings.api_key}
              onChange={(event) => updateSettings({ api_key: event.target.value })}
              placeholder="sk-proj-..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
            />

            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              {m.apiKeyStorageHint}
            </p>

            <input
              list="model-options"
              value={settings.model}
              onChange={(event) => updateSettings({ model: event.target.value })}
              placeholder="gpt-4o-transcribe"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none mt-2"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--text)" }}
            />

            <datalist id="model-options">
              {suggestedModels.map((modelName) => (
                <option key={modelName} value={modelName} />
              ))}
            </datalist>

            <div className="flex items-center justify-between mt-2">
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {m.customModelHint}
              </p>
              <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "var(--accent)" }}>
                {showModelGuide ? m.collapseModelGuide : m.modelGuide}
              </button>
            </div>

            {showModelGuide && (
              <ModelGuide
                currentModel={settings.model}
                onSelectModel={(modelName) => updateSettings({ model: modelName })}
                uiLanguage={uiLanguage}
                toggleText={m.apiBaseUrl}
                selectedText={m.connected}
                chooseText={m.save}
              />
            )}

            <button
              onClick={() => testApiKey(settings.api_key, settings.api_base_url, settings.model)}
              disabled={!settings.api_key || !settings.api_base_url || apiKeyStatus === "testing"}
              className="w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: apiKeyStatus === "ok" ? "#34c75920" : "var(--accent)",
                color: apiKeyStatus === "ok" ? "#34c759" : "white",
                opacity: !settings.api_key || !settings.api_base_url || apiKeyStatus === "testing" ? 0.5 : 1,
              }}
            >
              {apiKeyStatus === "testing" ? m.testing : apiKeyStatus === "ok" ? m.connected : m.testConnection}
            </button>

            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              {m.notesForCustomProvider}
            </p>

            {apiKeyStatus === "error" && apiKeyError && (
              <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: "#ff453a" }}>
                {apiKeyError}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                2
              </span>
              <span className="text-sm font-medium">{m.onboardingStep2}</span>
              {microphoneOk && <span style={{ color: "#34c759" }}>&#10003;</span>}
            </div>
            {microphoneOk ? (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                {m.enabled}
              </div>
            ) : (
              <button
                onClick={handleEnableMicrophone}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {m.allowMicrophone}
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                3
              </span>
              <span className="text-sm font-medium">{m.onboardingStep3}</span>
              {accessibilityOk && <span style={{ color: "#34c759" }}>&#10003;</span>}
            </div>
            {accessibilityOk ? (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                {m.enabled}
              </div>
            ) : (
              <button
                onClick={handleEnableAccessibility}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                {m.allowAccessibility}
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                4
              </span>
              <span className="text-sm font-medium">{m.onboardingStep4}</span>
            </div>
            <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {defaultShortcutText}
            </p>
            <ShortcutInput
              shortcut={settings.shortcut}
              onCapture={(shortcut) => updateSettings({ shortcut })}
              invalidModifierText={m.invalidModifier}
              promptText={m.pressShortcut}
            />
          </div>
        </div>

        <p className="text-xs mt-4" style={{ color: "var(--text-secondary)" }}>
          {m.openSettingsIfNeeded}
        </p>

        {settingsFeedback && (
          <p className="text-xs mt-3" style={{ color: settingsFeedback.tone === "success" ? "#34c759" : "#ff453a" }}>
            {settingsFeedback.message}
          </p>
        )}

        <button
          onClick={async () => {
            const ok = await persistSettings();
            if (ok) setView("history");
          }}
          disabled={!canProceed || savingSettings}
          className="w-full mt-6 py-2.5 rounded-lg text-sm font-medium"
          style={{
            background: canProceed ? "var(--accent)" : "var(--border)",
            color: canProceed ? "white" : "var(--text-secondary)",
            cursor: canProceed ? "pointer" : "not-allowed",
          }}
        >
          {savingSettings ? m.saving : apiKeyStatus === "ok" ? m.getStarted : m.saveAndContinue}
        </button>
      </div>
    );
  }

  if (view === "settings") {
    return (
      <div className="p-4 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">{m.settings}</h1>
          <button
            onClick={async () => {
              const ok = await persistSettings();
              if (ok) setView("history");
            }}
            className="text-sm"
            style={{ color: "var(--accent)" }}
          >
            {savingSettings ? m.saving : m.done}
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <label className="block text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
              {m.endpointPresets}
            </label>
            <div className="flex gap-2 flex-wrap">
              {endpointPresets.map((preset) => (
                <FilterChip
                  key={preset.value}
                  active={settings.api_base_url === preset.value}
                  label={preset.label}
                  onClick={() => updateSettings({ api_base_url: preset.value })}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              {m.uiLanguage}
            </label>
            <select
              value={settings.ui_language}
              onChange={(event) => updateSettings({ ui_language: event.target.value as UiLanguage })}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            >
              {uiLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[uiLanguage]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              {m.apiBaseUrl}
            </label>
            <input
              type="text"
              value={settings.api_base_url}
              onChange={(event) => updateSettings({ api_base_url: event.target.value })}
              placeholder={defaultApiBaseUrl}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              {m.apiKey}
            </label>
            <input
              type="password"
              value={settings.api_key}
              onChange={(event) => updateSettings({ api_key: event.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            />
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              {m.apiKeyStorageHint}
            </p>
            <button
              onClick={() => testApiKey(settings.api_key, settings.api_base_url, settings.model)}
              disabled={!settings.api_key || !settings.api_base_url || apiKeyStatus === "testing"}
              className="w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: apiKeyStatus === "ok" ? "#34c75920" : "var(--border)",
                color: apiKeyStatus === "ok" ? "#34c759" : "var(--text)",
                opacity: !settings.api_key || !settings.api_base_url || apiKeyStatus === "testing" ? 0.5 : 1,
              }}
            >
              {apiKeyStatus === "testing" ? m.testing : apiKeyStatus === "ok" ? m.connected : m.testConnection}
            </button>
            {apiKeyStatus === "error" && apiKeyError && (
              <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: "#ff453a" }}>
                {apiKeyError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              {m.model}
            </label>
            <input
              list="model-options"
              value={settings.model}
              onChange={(event) => updateSettings({ model: event.target.value })}
              placeholder="gpt-4o-transcribe"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            />
            <datalist id="model-options">
              {suggestedModels.map((modelName) => (
                <option key={modelName} value={modelName} />
              ))}
            </datalist>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {m.customModelHint}
              </p>
              <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "var(--accent)" }}>
                {showModelGuide ? m.collapseModelGuide : m.modelGuide}
              </button>
            </div>
            {showModelGuide && (
              <ModelGuide
                currentModel={settings.model}
                onSelectModel={(modelName) => updateSettings({ model: modelName })}
                uiLanguage={uiLanguage}
                toggleText={m.apiBaseUrl}
                selectedText={m.connected}
                chooseText={m.save}
              />
            )}
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              {m.language}
            </label>
            <select
              value={settings.language}
              onChange={(event) => updateSettings({ language: event.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            >
              {["auto", "zh", "en", "ja", "ko", "es", "fr", "de"].map((language) => (
                <option key={language} value={language}>
                  {displaySpeechLanguage(language, uiLanguage)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                {m.timeout}
              </label>
              <input
                type="number"
                min={10}
                max={300}
                value={settings.request_timeout_sec}
                onChange={(event) => updateSettings({ request_timeout_sec: Math.max(10, Number(event.target.value) || 10) })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                {m.retryCount}
              </label>
              <select
                value={settings.retry_count}
                onChange={(event) => updateSettings({ retry_count: Number(event.target.value) })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              {m.pasteDelay}
            </label>
            <input
              type="number"
              min={50}
              max={2000}
              step={50}
              value={settings.paste_delay_ms}
              onChange={(event) => updateSettings({ paste_delay_ms: Math.max(50, Number(event.target.value) || 50) })}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            />
          </div>

          <ToggleRow label={m.autoPaste} description={m.autoPasteDesc} value={settings.auto_paste_enabled} onChange={(value) => updateSettings({ auto_paste_enabled: value })} />
          <ToggleRow label={m.saveAudioFiles} description={m.saveAudioFilesDesc} value={settings.save_audio_files} onChange={(value) => updateSettings({ save_audio_files: value })} />
          <ToggleRow label={m.trimSilence} description={m.trimSilenceDesc} value={settings.trim_silence_enabled} onChange={(value) => updateSettings({ trim_silence_enabled: value })} />
          <ToggleRow label={m.soundEffects} description={m.soundEffectsDesc} value={settings.sound_enabled} onChange={(value) => updateSettings({ sound_enabled: value })} />

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              {m.shortcut}
            </label>
            <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {defaultShortcutText}
            </p>
            <ShortcutInput
              shortcut={settings.shortcut}
              onCapture={(shortcut) => updateSettings({ shortcut })}
              invalidModifierText={m.invalidModifier}
              promptText={m.pressShortcut}
            />
            {settings.shortcut && (
              <button onClick={() => updateSettings({ shortcut: "" })} className="text-xs mt-1" style={{ color: "var(--accent)" }}>
                {m.resetToDefault}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                {m.microphone}
              </label>
              {microphoneOk ? (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                  {m.enabled}
                </div>
              ) : (
                <button onClick={handleEnableMicrophone} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent)", color: "white" }}>
                  {m.allowMicrophone}
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                {m.accessibility}
              </label>
              {accessibilityOk ? (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                  {m.enabled}
                </div>
              ) : (
                <button onClick={handleEnableAccessibility} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent)", color: "white" }}>
                  {m.allowAccessibility}
                </button>
              )}
            </div>
          </div>

          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {m.openSettingsIfNeeded}
          </p>

          {settingsFeedback && (
            <p className="text-xs" style={{ color: settingsFeedback.tone === "success" ? "#34c759" : "#ff453a" }}>
              {settingsFeedback.message}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto">
      <div className="flex items-center justify-between p-4 pb-2" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="" width={24} height={24} />
          <div>
            <h1 className="text-lg font-semibold">Whisp</h1>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {m.versionLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearHistory}
            className="text-sm px-2 py-1 rounded-md"
            style={{ color: confirmingClear ? "#ff453a" : "var(--text-secondary)" }}
          >
            {confirmingClear ? m.clearConfirm : m.clear}
          </button>
          <button onClick={() => setView("settings")} className="text-xl px-1" style={{ color: "var(--text-secondary)" }}>
            &#9881;
          </button>
        </div>
      </div>

      <div className="px-4 pb-1">
        <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
          {m.historyClearButtonHint}
        </p>
      </div>

      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <StatCard label={m.total} value={String(stats.total)} />
        <StatCard label={m.failures} value={String(stats.failed)} />
        <StatCard label={m.success} value={String(stats.success)} />
        <StatCard label={m.audioSaved} value={String(stats.audioSaved)} />
      </div>

      <div className="px-4 pb-3 space-y-2">
        {errorMsg && (
          <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: "#ff453a20", border: "1px solid #ff453a40", color: "#ff453a" }}>
            {errorMsg}
          </div>
        )}

        {settingsFeedback && (
          <div className="px-3 py-2 rounded-lg text-xs" style={{ background: settingsFeedback.tone === "success" ? "#34c75920" : "#ff453a20", border: `1px solid ${settingsFeedback.tone === "success" ? "#34c75940" : "#ff453a40"}`, color: settingsFeedback.tone === "success" ? "#34c759" : "#ff453a" }}>
            {settingsFeedback.message}
          </div>
        )}

        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={m.searchPlaceholder}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        />

        <div className="flex gap-2 flex-wrap">
          <FilterChip active={statusFilter === "all"} label={m.filterAll} onClick={() => setStatusFilter("all")} />
          <FilterChip active={statusFilter === "success"} label={m.filterSuccess} onClick={() => setStatusFilter("success")} />
          <FilterChip active={statusFilter === "failed"} label={m.filterFailed} onClick={() => setStatusFilter("failed")} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filteredHistory.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
            {history.length === 0 ? m.noHistory : m.noResults}
            <br />
            {startHint}
            <br />
            <span className="text-xs">{m.stopHint}</span>
          </p>
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
                    background: "var(--card)",
                    border: failed ? "1px solid #ff453a40" : "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-2 flex-wrap">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: failed ? "#ff453a20" : "#34c75920",
                          color: failed ? "#ff453a" : "#34c759",
                        }}
                      >
                        {failed ? m.statusFailed : m.statusSuccess}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--border)", color: "var(--text)" }}>
                        {entry.provider}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--border)", color: "var(--text)" }}>
                        {displaySpeechLanguage(entry.language, uiLanguage)}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {formatTime(entry.timestamp, uiLanguage)}
                    </div>
                  </div>

                  <div className="mt-2">
                    {failed ? (
                      <div className="text-sm" style={{ color: "#ff453a" }}>
                        {entry.error_message ?? entry.text}
                      </div>
                    ) : (
                      <div
                        className="text-sm cursor-pointer"
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        style={{ userSelect: "text" }}
                      >
                        {expandedId === entry.id || entry.text.length <= 120 ? `${entry.text}` : `${entry.text.slice(0, 120)}...`}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {entry.model}
                      </span>
                      {entry.duration_ms ? (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--border)", color: "var(--text)" }}>
                          {formatDuration(entry.duration_ms)}
                        </span>
                      ) : null}
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {canRetry ? m.audioSavedLabel : m.noAudio}
                      </span>
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
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
