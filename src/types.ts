export interface HistoryEntry {
  id: number;
  text: string;
  model: string;
  timestamp: number;
  duration_ms: number | null;
  audio_path: string | null;
  status: "success" | "failed";
  error_message: string | null;
  provider: string;
  api_base_url: string;
  language: string;
  retry_of: number | null;
  asr_duration_sec: number | null;
  polish_tokens: number | null;
  estimated_cost: number | null;
}

export interface AppSettings {
  api_key: string;
  api_base_url: string;
  model: string;
  language: string;
  ui_language: "zh-CN" | "en" | "ja";
  shortcut: string;
  sound_enabled: boolean;
  auto_paste_enabled: boolean;
  save_audio_files: boolean;
  trim_silence_enabled: boolean;
  request_timeout_sec: number;
  retry_count: number;
  paste_delay_ms: number;
  silence_timeout_sec: number;
  overlay_x: number | null;
  overlay_y: number | null;
  launch_at_startup: boolean;
  whisper_prompt: string;
  silence_threshold: number;
  ai_polish_enabled: boolean;
  ai_polish_api_key: string;
  ai_polish_api_url: string;
  ai_polish_model: string;
  ai_polish_prompt: string;
  audio_retention_limit: number;
  custom_endpoints: Array<{ label: string; url: string }>;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

export interface WhisperConfig {
  model_path: string;
  language: string;
  n_threads: number;
  translate: boolean;
  prompt: string;
}

export interface WhisperModelInfo {
  name: string;
  path: string;
  size_bytes: number;
}

export interface KnownModel {
  name: string;
  url: string;
  size_bytes: number;
}

export interface WhisperResult {
  text: string;
  segments: WhisperSegment[];
  language: string;
  duration_sec: number;
}

export interface WhisperSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}
