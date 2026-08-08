import type { AppSettings } from "../types";

export type View = "onboarding" | "history" | "stats" | "settingsApi" | "settingsPolish" | "settingsRecording" | "settingsBehavior" | "settingsApp" | "diagnostics";
export type StatusFilter = "all" | "success" | "failed";
export type UiLanguage = AppSettings["ui_language"];

export const isMac = navigator.userAgent.includes("Mac");
export const modKey = isMac ? "⌘" : "Ctrl";
export const defaultHotkey = isMac ? "Right ⌘" : "Right Ctrl";
export const defaultApiBaseUrl = "https://api.openai.com/v1";

export const localeMap: Record<UiLanguage, string> = {
  "zh-CN": "zh-CN",
  en: "en-US",
  ja: "ja-JP",
};

export const uiLanguageOptions: Array<{ value: UiLanguage; label: Record<UiLanguage, string> }> = [
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

export type ModelCatalogItem = {
  name: string;
  provider: string;
  description: Record<UiLanguage, string>;
  baseUrlHint: string;
  note?: Record<UiLanguage, string>;
};

export const endpointPresets = [
  { label: "OpenAI", value: "https://api.openai.com/v1" },
  { label: "Groq", value: "https://api.groq.com/openai/v1" },
  { label: "Fireworks", value: "https://api.fireworks.ai/inference/v1" },
  { label: "MiMo", value: "https://api.xiaomimimo.com/v1" },
  { label: "DeepSeek", value: "https://api.deepseek.com/v1" },
  { label: "MiMo Token Plan", value: "https://token-plan-cn.xiaomimimo.com/v1" },
];

export const aiPolishPresets = [
  { label: "DeepSeek V4 Flash", apiUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" },
  { label: "DeepSeek Chat", apiUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "OpenAI GPT-4o-mini", apiUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "OpenAI GPT-4o", apiUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  { label: "MiMo V2.5", apiUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5" },
];

export const modelCatalog: ModelCatalogItem[] = [
  {
    name: "gpt-4o-transcribe",
    provider: "OpenAI",
    description: {
      "zh-CN": "GPT-4o 系列中质量更高的转写模型。",
      en: "Higher-quality transcription model in the GPT-4o family.",
      ja: "GPT-4o 系列の中でも品質重視の文字起しモデルです。",
    },
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "gpt-4o-mini-transcribe",
    provider: "OpenAI",
    description: {
      "zh-CN": "速度和质量更均衡，适合作为默认选择。",
      en: "Balanced speed and quality, good as a default choice.",
      ja: "速度と品質のバランが良く、標準設定に向いています。",
    },
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "gpt-4o-transcribe-diarize",
    provider: "OpenAI",
    description: {
      "zh-CN": "支持说话人区分（Diarization）的转写模型。",
      en: "Transcription model with diarization support.",
      ja: "話者分離（Diarization）に対応した文字起しモデルです。",
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
      ja: "高速な Whisper 互換文字起しモデルです。",
    },
    baseUrlHint: "https://api.groq.com/openai/v1",
  },
  {
    name: "whisper-v3",
    provider: "Fireworks",
    description: {
      "zh-CN": "通用型 Whisper v3 模型。",
      en: "General-purpose Whisper v3 model.",
      ja: "泛用的な Whisper v3 モデルです。",
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
      "zh-CN": "小米 MiMo 语音识别，支持中英双语、方言、歌词转写及嘆杂环境。",
      en: "Xiaomi MiMo ASR with bilingual, dialect, lyrics, and noisy-environment support.",
      ja: "Xiaomi MiMo 音声認讀、中国語・英語・方言・歌詞・騒音環境対応。",
    },
    baseUrlHint: "https://api.xiaomimimo.com/v1",
  },
  {
    name: "mimo-v2.5-asr",
    provider: "MiMo Token Plan",
    description: {
      "zh-CN": "小米 MiMo 语音识别，Token Plan 计费。",
      en: "Xiaomi MiMo ASR, Token Plan billing.",
      ja: "Xiaomi MiMo 音声認讀、Token Plan 課金。",
    },
    baseUrlHint: "https://token-plan-cn.xiaomimimo.com/v1",
  },
];

export const suggestedModels = modelCatalog.map((item) => item.name);

export const viewVariants = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
};
