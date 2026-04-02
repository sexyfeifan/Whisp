import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { AppSettings, HistoryEntry } from "./types";
import logoUrl from "./assets/logo.png";

type View = "onboarding" | "history" | "settings";
type StatusFilter = "all" | "success" | "failed";

const isMac = navigator.userAgent.includes("Mac");
const modKey = isMac ? "⌘" : "Ctrl";
const defaultHotkey = isMac ? "Right ⌘" : "Right Ctrl";
const defaultApiBaseUrl = "https://api.openai.com/v1";

const endpointPresets = [
  { label: "OpenAI", value: "https://api.openai.com/v1" },
  { label: "Groq", value: "https://api.groq.com/openai/v1" },
  { label: "Fireworks", value: "https://api.fireworks.ai/inference/v1" },
];

type ModelCatalogItem = {
  name: string;
  provider: string;
  description: string;
  baseUrlHint: string;
  note?: string;
};

const modelCatalog: ModelCatalogItem[] = [
  {
    name: "gpt-4o-transcribe",
    provider: "OpenAI",
    description: "GPT-4o 系列中质量更高的转写模型。",
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "gpt-4o-mini-transcribe",
    provider: "OpenAI",
    description: "速度与质量更均衡，适合作为默认选择。",
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "gpt-4o-transcribe-diarize",
    provider: "OpenAI",
    description: "支持说话人区分（Diarization）的转写模型。",
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "whisper-1",
    provider: "OpenAI",
    description: "经典 Whisper 模型，稳定且应用广泛。",
    baseUrlHint: "https://api.openai.com/v1",
  },
  {
    name: "whisper-large-v3-turbo",
    provider: "Groq",
    description: "速度很快的 Whisper 兼容转写模型。",
    baseUrlHint: "https://api.groq.com/openai/v1",
  },
  {
    name: "whisper-v3",
    provider: "Fireworks",
    description: "通用型 Whisper v3 模型。",
    baseUrlHint: "https://api.fireworks.ai/inference/v1",
  },
  {
    name: "whisper-v3-turbo",
    provider: "Fireworks",
    description: "Whisper v3 的低延迟 turbo 版本。",
    baseUrlHint: "https://api.fireworks.ai/inference/v1",
  },
  {
    name: "nova-3",
    provider: "Deepgram",
    description: "需要兼容 OpenAI 的代理网关接入。",
    baseUrlHint: "供应商兼容网关 URL",
  },
  {
    name: "chirp_3",
    provider: "Google Cloud",
    description: "需要兼容 OpenAI 的代理网关接入。",
    baseUrlHint: "供应商兼容网关 URL",
  },
];

const suggestedModels = modelCatalog.map((item) => item.name);

function displayShortcut(shortcut: string): string {
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

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], {
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

function displayLanguage(language: string): string {
  const labelMap: Record<string, string> = {
    auto: "Auto",
    zh: "中文",
    en: "English",
    ja: "日本語",
    ko: "한국어",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
  };
  return labelMap[language] ?? language.toUpperCase();
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
}: {
  shortcut: string;
  onCapture: (shortcut: string) => void;
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
      setError("Shortcut must include a modifier key.");
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
        {recording ? (
          <span style={{ color: "var(--accent)" }}>Press shortcut keys...</span>
        ) : (
          displayShortcut(shortcut)
        )}
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
}: {
  currentModel: string;
  onSelectModel: (modelName: string) => void;
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
                {selected ? "已选择" : "使用"}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              {item.description}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Base URL 提示：{item.baseUrlHint}
            </p>
            {item.note && (
              <p className="text-xs mt-1" style={{ color: "#ff9f0a" }}>
                {item.note}
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
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null);

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

  const persistSettings = useCallback(async () => {
    if (!settings) return false;
    setSavingSettings(true);
    setSettingsFeedback(null);
    try {
      await invoke("save_settings", { settings });
      setSettingsFeedback("Settings saved.");
      window.setTimeout(() => setSettingsFeedback(null), 2200);
      return true;
    } catch (error) {
      setSettingsFeedback(String(error));
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
      setApiKeyError(String(error));
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
    if (!window.confirm("Delete all transcription history?")) return;
    await invoke("clear_history");
    setHistory([]);
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
      const haystack = [
        entry.text,
        entry.error_message ?? "",
        entry.model,
        entry.provider,
        entry.language,
      ]
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
        Loading…
      </div>
    );
  }

  const canProceed = apiKeyStatus === "ok" && microphoneOk && (isMac ? accessibilityOk : true);

  if (view === "onboarding") {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-2 mb-1">
            <img src={logoUrl} alt="" width={28} height={28} />
            <h1 className="text-xl font-semibold">Whisp v2.0</h1>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Speak. Transcribe. Paste.
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                1
              </span>
              <span className="text-sm font-medium">API Configuration</span>
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
              API Key will be stored in your system keychain, not in plain text.
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
                可选择预置模型，也可手动输入自定义模型。
              </p>
              <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "var(--accent)" }}>
                {showModelGuide ? "收起模型说明" : "模型说明"}
              </button>
            </div>

            {showModelGuide && (
              <ModelGuide
                currentModel={settings.model}
                onSelectModel={(modelName) => updateSettings({ model: modelName })}
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
              {apiKeyStatus === "testing" ? "Testing..." : apiKeyStatus === "ok" ? "Connected" : "Test Connection"}
            </button>

            {apiKeyStatus === "error" && apiKeyError && (
              <p className="text-xs mt-1" style={{ color: "#ff453a" }}>
                {apiKeyError}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                2
              </span>
              <span className="text-sm font-medium">Microphone</span>
              {microphoneOk && <span style={{ color: "#34c759" }}>&#10003;</span>}
            </div>
            {microphoneOk ? (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                Enabled
              </div>
            ) : (
              <button
                onClick={handleEnableMicrophone}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Allow Microphone
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent)", color: "white" }}>
                3
              </span>
              <span className="text-sm font-medium">Accessibility</span>
              {accessibilityOk && <span style={{ color: "#34c759" }}>&#10003;</span>}
            </div>
            {accessibilityOk ? (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                Enabled
              </div>
            ) : (
              <button
                onClick={handleEnableAccessibility}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--accent)", color: "white" }}
              >
                Allow Accessibility
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                4
              </span>
              <span className="text-sm font-medium">Shortcut</span>
            </div>
            <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Default: {defaultHotkey}. Press once to record, again to stop, Escape to cancel.
            </p>
            <ShortcutInput shortcut={settings.shortcut} onCapture={(shortcut) => updateSettings({ shortcut })} />
          </div>
        </div>

        {settingsFeedback && (
          <p className="text-xs mt-4" style={{ color: settingsFeedback === "Settings saved." ? "#34c759" : "#ff453a" }}>
            {settingsFeedback}
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
          {savingSettings ? "Saving..." : "Get Started"}
        </button>
      </div>
    );
  }

  if (view === "settings") {
    return (
      <div className="p-4 max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">Settings</h1>
          <button
            onClick={async () => {
              const ok = await persistSettings();
              if (ok) setView("history");
            }}
            className="text-sm"
            style={{ color: "var(--accent)" }}
          >
            {savingSettings ? "Saving..." : "Done"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl p-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <label className="block text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
              Endpoint Presets
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
              API Base URL
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
              API Key
            </label>
            <input
              type="password"
              value={settings.api_key}
              onChange={(event) => updateSettings({ api_key: event.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            />
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Stored securely in the system keychain.
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
              {apiKeyStatus === "testing" ? "Testing..." : apiKeyStatus === "ok" ? "Connected" : "Test Connection"}
            </button>
            {apiKeyStatus === "error" && apiKeyError && (
              <p className="text-xs mt-1" style={{ color: "#ff453a" }}>
                {apiKeyError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              Model
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
                支持预置模型与自定义模型名。
              </p>
              <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "var(--accent)" }}>
                {showModelGuide ? "收起模型说明" : "模型说明"}
              </button>
            </div>
            {showModelGuide && (
              <ModelGuide currentModel={settings.model} onSelectModel={(modelName) => updateSettings({ model: modelName })} />
            )}
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              Language
            </label>
            <select
              value={settings.language}
              onChange={(event) => updateSettings({ language: event.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            >
              <option value="auto">Auto Detect</option>
              <option value="zh">Chinese</option>
              <option value="en">English</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                Timeout (sec)
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
                Retry Count
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
              Paste Delay (ms)
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

          <ToggleRow
            label="Auto Paste"
            description="Keep copying to clipboard, and optionally paste into the previously active app."
            value={settings.auto_paste_enabled}
            onChange={(value) => updateSettings({ auto_paste_enabled: value })}
          />

          <ToggleRow
            label="Save Audio Files"
            description="Keep local WAV files so history items can be retried later."
            value={settings.save_audio_files}
            onChange={(value) => updateSettings({ save_audio_files: value })}
          />

          <ToggleRow
            label="Trim Silence"
            description="Remove leading and trailing silence before upload to reduce delay and cost."
            value={settings.trim_silence_enabled}
            onChange={(value) => updateSettings({ trim_silence_enabled: value })}
          />

          <ToggleRow
            label="Sound Effects"
            description="Play a short sound when recording starts and ends."
            value={settings.sound_enabled}
            onChange={(value) => updateSettings({ sound_enabled: value })}
          />

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
              Shortcut
            </label>
            <p className="text-xs mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Default: {defaultHotkey}
            </p>
            <ShortcutInput shortcut={settings.shortcut} onCapture={(shortcut) => updateSettings({ shortcut })} />
            {settings.shortcut && (
              <button onClick={() => updateSettings({ shortcut: "" })} className="text-xs mt-1" style={{ color: "var(--accent)" }}>
                Reset to default
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                Microphone
              </label>
              {microphoneOk ? (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                  Enabled
                </div>
              ) : (
                <button onClick={handleEnableMicrophone} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent)", color: "white" }}>
                  Enable
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                Accessibility
              </label>
              {accessibilityOk ? (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "#34c759" }}>
                  Enabled
                </div>
              ) : (
                <button onClick={handleEnableAccessibility} className="w-full px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "var(--accent)", color: "white" }}>
                  Allow
                </button>
              )}
            </div>
          </div>

          {settingsFeedback && (
            <p className="text-xs" style={{ color: settingsFeedback === "Settings saved." ? "#34c759" : "#ff453a" }}>
              {settingsFeedback}
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
              v2.0 reliability mode
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearHistory} className="text-sm px-2 py-1 rounded-md" style={{ color: "var(--text-secondary)" }}>
            Clear
          </button>
          <button onClick={() => setView("settings")} className="text-xl px-1" style={{ color: "var(--text-secondary)" }}>
            &#9881;
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <StatCard label="Total" value={String(stats.total)} />
        <StatCard label="Failures" value={String(stats.failed)} />
        <StatCard label="Success" value={String(stats.success)} />
        <StatCard label="Audio Saved" value={String(stats.audioSaved)} />
      </div>

      <div className="px-4 pb-3 space-y-2">
        {errorMsg && (
          <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "#ff453a20", border: "1px solid #ff453a40", color: "#ff453a" }}>
            {errorMsg}
          </div>
        )}

        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search text, provider, model, or errors"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        />

        <div className="flex gap-2 flex-wrap">
          <FilterChip active={statusFilter === "all"} label="All" onClick={() => setStatusFilter("all")} />
          <FilterChip active={statusFilter === "success"} label="Success" onClick={() => setStatusFilter("success")} />
          <FilterChip active={statusFilter === "failed"} label="Failed" onClick={() => setStatusFilter("failed")} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filteredHistory.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
            {history.length === 0 ? "No transcriptions yet." : "No entries match your filter."}
            <br />
            Press {displayShortcut(settings.shortcut || "")} to start.
            <br />
            <span className="text-xs">Press again to stop. Escape to cancel.</span>
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
                        {failed ? "Failed" : "Success"}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--border)", color: "var(--text)" }}>
                        {entry.provider}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--border)", color: "var(--text)" }}>
                        {displayLanguage(entry.language)}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {formatTime(entry.timestamp)}
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
                      {canRetry ? (
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          audio saved
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          no audio
                        </span>
                      )}
                    </div>

                    <div className="flex gap-0.5">
                      {!failed && (
                        <IconButton title="Copy" onClick={() => copyText(entry.text, entry.id)} accent={copied === entry.id}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </IconButton>
                      )}
                      {canRetry && (
                        <IconButton title="Retry" onClick={() => retryEntry(entry.id)}>
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
                      <IconButton title="Delete" onClick={() => deleteEntry(entry.id)}>
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
