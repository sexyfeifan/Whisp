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
}

export interface AppSettings {
  api_key: string;
  api_base_url: string;
  model: string;
  language: string;
  shortcut: string;
  sound_enabled: boolean;
  auto_paste_enabled: boolean;
  save_audio_files: boolean;
  trim_silence_enabled: boolean;
  request_timeout_sec: number;
  retry_count: number;
  paste_delay_ms: number;
  overlay_x: number | null;
  overlay_y: number | null;
}
