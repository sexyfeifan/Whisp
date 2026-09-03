import type { AppSettings } from "../types";

export type View = "onboarding" | "history" | "stats" | "settings" | "diagnostics" | "about";
export type SettingsTab = "api" | "recording" | "behavior" | "models" | "polish";
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
  ko: "ko-KR",
};

export const uiLanguageOptions: Array<{ value: UiLanguage; label: Record<UiLanguage, string> }> = [
  {
    value: "zh-CN",
    label: { "zh-CN": "简体中文", en: "Simplified Chinese", ja: "簡体字中国語", ko: "간체 중국어" },
  },
  {
    value: "en",
    label: { "zh-CN": "English", en: "English", ja: "English", ko: "English" },
  },
  {
    value: "ja",
    label: { "zh-CN": "日本語", en: "Japanese", ja: "日本語", ko: "일본어" },
  },
  {
    value: "ko",
    label: { "zh-CN": "한국어", en: "Korean", ja: "韓国語", ko: "한국어" },
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
  { label: "DeepSeek", value: "https://api.deepseek.com/v1" },
  { label: "MiMo", value: "https://api.xiaomimimo.com/v1" },
  { label: "MiMo Token Plan", value: "https://token-plan-cn.xiaomimimo.com/v1" },
];

export const summaryEndpointPresets = [
  { label: "OpenAI", apiUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "DeepSeek", apiUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "MiMo", apiUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5" },
  { label: "MiMo Token Plan", apiUrl: "https://token-plan-cn.xiaomimimo.com/v1", model: "mimo-v2.5" },
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
      ko: "GPT-4o 계열의 고품질 필사 모델입니다.",
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
      ko: "속도와 품질의 균형이 좋아 기본 선택에 적합합니다.",
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
      ko: "화자 분리(Diarization)를 지원하는 필사 모델입니다.",
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
      ko: "안정성과 호환성이 뛰어난 클래식 Whisper 모델입니다.",
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
      ko: "빠른 Whisper 호환 필사 모델입니다.",
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
      ko: "범용 Whisper v3 모델입니다.",
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
      ko: "Whisper v3의 저지연 turbo 버전입니다.",
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
      ko: "일반적으로 OpenAI 호환 릴레이 게이트웨이가 필요합니다.",
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
      ko: "일반적으로 OpenAI 호환 릴레이 게이트웨이가 필요합니다.",
    },
    baseUrlHint: "OpenAI-compatible relay URL",
  },
  {
    name: "mimo-v2.5-asr",
    provider: "MiMo",
    description: {
      "zh-CN": "小米 MiMo 语音识别，支持中英双语、方言、歌词转写及嘈杂环境。",
      en: "Xiaomi MiMo ASR with bilingual (CN/EN), dialect, lyrics, and noisy-environment support.",
      ja: "Xiaomi MiMo 音声認識、中国語・英語・方言・歌詞・騒音環境対応。",
      ko: "샤오미 MiMo 음성 인식, 중영 이중언어, 방언, 가사, 소음 환경 지원.",
    },
    baseUrlHint: "https://api.xiaomimimo.com/v1",
  },
  {
    name: "mimo-v2.5-asr-token-plan",
    provider: "MiMo Token Plan",
    description: {
      "zh-CN": "小米 MiMo 语音识别，Token Plan 计费。",
      en: "Xiaomi MiMo ASR, Token Plan billing.",
      ja: "Xiaomi MiMo 音声認識、Token Plan 課金。",
      ko: "샤오미 MiMo 음성 인식, Token Plan 과금.",
    },
    baseUrlHint: "https://token-plan-cn.xiaomimimo.com/v1",
  },
  {
    name: "whisper-large-v3",
    provider: "OpenAI-compatible",
    description: {
      "zh-CN": "Whisper Large V3 多语言模型，中文支持优秀，适合高质量中文转写。需配合自部署或兼容网关使用。",
      en: "Whisper Large V3 multilingual model with excellent Chinese support. Best for high-quality Chinese transcription. Requires self-hosted or compatible gateway.",
      ja: "Whisper Large V3 多言語モデル、中国語対応優秀。高品質な中国語文字起こしに最適。セルフホストまたは互換ゲートウェイが必要。",
      ko: "Whisper Large V3 다국어 모델, 중국어 지원 우수. 고품질 중국어 필사에 최적. 자체 호스팅 또는 호환 게이트웨이 필요.",
    },
    baseUrlHint: "OpenAI-compatible URL",
  },
  {
    name: "SenseVoiceSmall",
    provider: "FunAudioLLM",
    description: {
      "zh-CN": "阿里通义 SenseVoice 小模型，中文语音识别效果极佳，支持粤语、闽南语等方言。速度快，适合实时场景。",
      en: "Alibaba FunAudioLLM SenseVoice small model. Excellent Chinese ASR with Cantonese/Hokkien dialect support. Fast, ideal for real-time use.",
      ja: "Alibaba FunAudioLLM SenseVoice 小モデル、中国語音声認識優秀、広東語・福建語などの方言対応。高速でリアルタイム向き。",
      ko: "알리바바 FunAudioLLM SenseVoice 소형 모델. 중국어 음성 인식 우수, 광둥어/복건어 방언 지원. 고속, 실시간에 적합.",
    },
    baseUrlHint: "OpenAI-compatible URL",
  },
  {
    name: "SenseVoiceLarge",
    provider: "FunAudioLLM",
    description: {
      "zh-CN": "阿里通义 SenseVoice 大模型，中文语音识别最高质量，支持粤语、闽南语等方言。速度较慢但精度更高。",
      en: "Alibaba FunAudioLLM SenseVoice large model. Highest quality Chinese ASR with dialect support. Slower but more accurate.",
      ja: "Alibaba FunAudioLLM SenseVoice 大モデル、中国語音声認識最高品質、方言対応。遅いが高精度。",
      ko: "알리바바 FunAudioLLM SenseVoice 대형 모델. 최고 품질 중국어 음성 인식, 방언 지원. 느리지만 정확도 높음.",
    },
    baseUrlHint: "OpenAI-compatible URL",
  },
  {
    name: "paraformer-v2",
    provider: "Alibaba DAMO",
    description: {
      "zh-CN": "阿里达摩院 Paraformer V2，中文转写专家级模型，非自回归架构速度极快，适合长音频。",
      en: "Alibaba DAMO Paraformer V2 — Chinese transcription specialist. Non-autoregressive architecture, very fast for long audio.",
      ja: "Alibaba DAMO Paraformer V2、中国語文字起こし専門モデル。非自己回帰アーキテクチャで長音声に最適。",
      ko: "알리바바 DAMO Paraformer V2 — 중국어 필사 전문 모델. 비자기회귀 아키텍처로 긴 오디오에 매우 빠름.",
    },
    baseUrlHint: "OpenAI-compatible URL",
  },
];

export const suggestedModels = modelCatalog.map((item) => item.name);

export const viewVariants = {
  initial: { opacity: 0, x: 20, scale: 0.98 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -20, scale: 0.98 },
};
