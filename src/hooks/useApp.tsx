import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { check as checkUpdaterUpdate } from "@tauri-apps/plugin-updater";
import type { AppSettings, HistoryEntry, LogEntry } from "../types";
import { messages } from "../i18n";
import type { View, StatusFilter, UiLanguage } from "../lib/constants";
import { isMac } from "../lib/constants";
import { History, Settings, Mic, Shield, Activity, BarChart3, Terminal, Box } from "lucide-react";

export interface UpdateInfo {
  latestVersion: string; releaseUrl: string; releaseNotes: string;
  publishedAt: string; assets: { name: string; url: string; size: number }[];
}

export interface AppState {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  history: HistoryEntry[];
  settings: AppSettings | null;
  expandedId: number | null;
  setExpandedId: React.Dispatch<React.SetStateAction<number | null>>;
  copied: number | null;
  setCopied: React.Dispatch<React.SetStateAction<number | null>>;
  retrying: number | null;
  microphoneOk: boolean;
  accessibilityOk: boolean;
  errorMsg: string | null;
  apiKeyStatus: "untested" | "testing" | "ok" | "error" | "warn";
  apiKeyError: string | null;
  showModelGuide: boolean;
  setShowModelGuide: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  statusFilter: StatusFilter;
  setStatusFilter: React.Dispatch<React.SetStateAction<StatusFilter>>;
  savingSettings: boolean;
  settingsFeedback: { tone: "success" | "error"; message: string } | null;
  setSettingsFeedback: React.Dispatch<React.SetStateAction<{ tone: "success" | "error"; message: string } | null>>;
  confirmingClear: boolean;
  appVersion: string;
  selectedIds: Set<number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  hasMore: boolean;
  shortcutConflictMsg: string | null;
  updateStatus: "idle" | "checking" | "available" | "latest" | "error";
  downloading: boolean;
  downloadMsg: string | null;
  updateInfo: UpdateInfo | null;
  polishErrorMsg: string | null;
  playingAudioId: number | null;
  audioUrls: Record<number, string>;
  stopAudio: () => void;
  logs: LogEntry[];
  logsAutoScroll: boolean;
  setLogsAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  logContainerRef: React.RefObject<HTMLDivElement | null>;
  defaultPolishPrompt: string;
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  uiLanguage: UiLanguage;
  m: Record<string, string>;
  filteredHistory: HistoryEntry[];
  stats: { total: number; success: number; failed: number; audioSaved: number; totalCost: number; totalTokens: number };
  todayCount: number;
  hasApiConfig: boolean;
  canProceed: boolean;
  navItems: Array<{ id: View; icon: React.ReactNode; label: string; group?: string }>;
  updateSettings: (patch: Partial<AppSettings>) => void;
  persistSettings: () => Promise<boolean>;
  testApiKey: (apiKey: string, apiBaseUrl: string, model: string) => Promise<void>;
  copyText: (text: string, id: number) => Promise<void>;
  playAudio: (path: string, id: number) => Promise<void>;
  loadLogs: () => Promise<void>;
  clearLogs: () => Promise<void>;
  copyAllLogs: () => Promise<void>;
  flushAutoSave: () => void;
  deleteEntry: (id: number) => Promise<void>;
  deleteSelected: () => Promise<void>;
  clearHistory: () => Promise<void>;
  retryEntry: (id: number) => Promise<void>;
  loadHistory: (reset?: boolean) => Promise<void>;
  loadSettings: () => Promise<void>;
  searchHistory: (query: string) => Promise<void>;
  handleEnableMicrophone: () => Promise<void>;
  handleEnableAccessibility: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: (url?: string, filename?: string) => Promise<void>;
}

const HISTORY_PAGE_SIZE = 50;

export function useApp(): AppState {
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
  const [ftsResults, setFtsResults] = useState<HistoryEntry[] | null>(null);
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
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [polishErrorMsg, setPolishErrorMsg] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [defaultPolishPrompt, setDefaultPolishPrompt] = useState("");
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("whisp-theme") === "dark" ||
        (!localStorage.getItem("whisp-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });

  // Apply dark mode
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("whisp-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const checkForUpdates = useCallback(async () => {
    setUpdateStatus("checking");
    try {
      const update = await checkUpdaterUpdate();
      if (update) {
        setUpdateStatus("available");
        setUpdateInfo({
          latestVersion: update.version,
          releaseUrl: `https://github.com/sexyfeifan/Whisp/releases/tag/v${update.version}`,
          releaseNotes: update.body || "",
          publishedAt: update.date || "",
          assets: [],
        });
      } else {
        setUpdateStatus("latest");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      }
    } catch (error) {
      console.warn(`Updater check failed: ${error}, falling back to GitHub API`);
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
  }, []);

  const downloadAndInstall = useCallback(async (url?: string, filename?: string) => {
    setDownloading(true);
    setDownloadMsg(null);
    try {
      if (!url || !filename) {
        const platform = navigator.platform.toLowerCase();
        const isMacPlatform = platform.includes("mac");
        const isWin = platform.includes("win");
        const isArm = navigator.userAgent.includes("aarch64") || navigator.userAgent.includes("arm64");

        const assets = updateInfo?.assets || [];
        const asset = assets.find((a) => {
          if (isMacPlatform && isArm) return a.name.includes("aarch64") && a.name.endsWith(".dmg");
          if (isMacPlatform) return a.name.includes("x64") && a.name.endsWith(".dmg");
          if (isWin) return a.name.endsWith("-setup.exe") || a.name.endsWith(".msi");
          return a.name.endsWith(".AppImage") || a.name.endsWith(".deb");
        }) || assets[0];

        if (asset) {
          url = asset.url;
          filename = asset.name;
        }
      }

      if (!url || !filename) {
        setDownloadMsg("No downloadable asset found.");
        setDownloading(false);
        return;
      }

      setDownloadMsg(`Downloading ${filename}...`);
      const msg = await invoke<string>("download_and_install_update", { url, filename });
      setDownloadMsg(msg);
    } catch (error) {
      setDownloadMsg(`Download failed: ${error}`);
    } finally {
      setDownloading(false);
    }
  }, [updateInfo]);

  useEffect(() => { getVersion().then(setAppVersion); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { checkForUpdates(); }, 3000);
    return () => window.clearTimeout(timer);
  }, [checkForUpdates]);

  const loadHistory = useCallback(async (reset = true) => {
    const offset = reset ? 0 : historyOffsetRef.current;
    const entries = await invoke<HistoryEntry[]>("get_history_page", { limit: HISTORY_PAGE_SIZE, offset });
    if (reset) { setHistory(entries); historyOffsetRef.current = entries.length; setSelectedIds(new Set()); }
    else { setHistory((prev) => [...prev, ...entries]); historyOffsetRef.current += entries.length; }
    setHasMore(entries.length === HISTORY_PAGE_SIZE);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const nextSettings = await invoke<AppSettings>("get_settings");
      setSettings(nextSettings);
      if (!nextSettings.api_key) { setView("onboarding"); }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }, [setView]);

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
    try {
      void loadHistory();
      void loadSettings();
      void checkPermissions();
    } catch (error) {
      console.error("Initialization error:", error);
    }
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

  const uiLanguage: UiLanguage = settings?.ui_language ?? "zh-CN";
  const m = messages[uiLanguage] as Record<string, string>;

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if ("api_key" in patch || "api_base_url" in patch || "model" in patch) {
        setApiKeyStatus("untested"); setApiKeyError(null);
      }
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = window.setTimeout(() => {
        invoke("save_settings", { settings: next }).catch(() => {});
      }, 800);
      return next;
    });
  }, []);

  const persistSettings = useCallback(async () => {
    if (!settings) return false;
    setSavingSettings(true); setSettingsFeedback(null);
    try {
      await invoke("save_settings", { settings });
      setSettingsFeedback({ tone: "success", message: (messages[settings.ui_language] as Record<string, string>).settingsSaved });
      window.setTimeout(() => setSettingsFeedback(null), 2200);
      return true;
    } catch (error) {
      setSettingsFeedback({ tone: "error", message: String(error) });
      return false;
    } finally { setSavingSettings(false); }
  }, [settings]);

  const testApiKey = useCallback(async (apiKey: string, apiBaseUrl: string, model: string) => {
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
  }, [m.optionalValidationHint]);

  const copyText = useCallback(async (text: string, id: number) => {
    await writeText(text); setCopied(id);
    window.setTimeout(() => setCopied(null), 1500);
  }, []);

  const playAudio = useCallback(async (path: string, id: number) => {
    if (playingAudioId === id) {
      // Already playing this entry — stop it
      setPlayingAudioId(null);
      return;
    }
    // Load URL if not already cached
    if (!audioUrls[id]) {
      try {
        const base64 = await invoke<string>("read_audio_file", { path });
        const url = `data:audio/wav;base64,${base64}`;
        setAudioUrls((prev) => ({ ...prev, [id]: url }));
      } catch (error) {
        console.error("Failed to load audio:", error);
        return;
      }
    }
    // Set this as the active player (AudioPlayer component handles play)
    setPlayingAudioId(id);
  }, [playingAudioId, audioUrls]);

  const stopAudio = useCallback(() => {
    setPlayingAudioId(null);
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const entries = await invoke<LogEntry[]>("get_logs");
      setLogs(entries);
    } catch { /* ignore */ }
  }, []);

  const clearLogs = useCallback(async () => {
    await invoke("clear_logs");
    setLogs([]);
  }, []);

  const copyAllLogs = useCallback(async () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.target}: ${l.message}`).join('\n');
    await writeText(text);
  }, [logs]);

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

  const deleteEntry = useCallback(async (id: number) => {
    // Stop playback if deleting the currently-playing entry
    if (playingAudioId === id) setPlayingAudioId(null);
    await invoke("delete_history_entry", { id });
    setHistory((items) => items.filter((item) => item.id !== id));
    setAudioUrls((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }, [playingAudioId]);

  const deleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Stop playback if any selected entry is currently playing
    if (playingAudioId !== null && selectedIds.has(playingAudioId)) setPlayingAudioId(null);
    await invoke("delete_history_entries", { ids });
    setHistory((items) => items.filter((item) => !selectedIds.has(item.id)));
    setAudioUrls((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setSelectedIds(new Set());
  }, [selectedIds, playingAudioId]);

  const clearHistory = useCallback(async () => {
    if (history.length === 0) {
      setSettingsFeedback({ tone: "error", message: m.clearEmpty });
      window.setTimeout(() => setSettingsFeedback(null), 2200); return;
    }
    if (clearTimerRef.current) { window.clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
    try {
      await invoke("clear_history"); setHistory([]); setConfirmingClear(false);
      setPlayingAudioId(null); setAudioUrls({});
      setSettingsFeedback({ tone: "success", message: m.clearSuccess });
      window.setTimeout(() => setSettingsFeedback(null), 2200);
    } catch (error) { setConfirmingClear(false); setErrorMsg(`${m.clearFailed} ${String(error)}`); }
  }, [history, m]);

  const retryEntry = useCallback(async (id: number) => {
    setRetrying(id);
    try { await invoke("retry_transcription", { id }); await loadHistory(); }
    catch (error) { setErrorMsg(String(error)); }
    finally { setRetrying(null); }
  }, [loadHistory]);

  const searchHistory = useCallback(async (query: string) => {
    if (!query.trim()) {
      setFtsResults(null);
      return;
    }
    try {
      const results = await invoke<HistoryEntry[]>("search_history", { query });
      setFtsResults(results);
    } catch {
      setFtsResults(null);
    }
  }, []);

  // Debounced FTS5 backend search: triggers when searchQuery changes
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setFtsResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      searchHistory(trimmed);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchHistory]);

  const filteredHistory = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    // Use backend FTS5 results if available, otherwise fall back to frontend filter
    const source = ftsResults ?? history;
    return source.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (!needle || ftsResults !== null) return true; // backend already filtered by query
      const haystack = [entry.text, entry.error_message ?? "", entry.model, entry.provider, entry.language].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [history, searchQuery, statusFilter, ftsResults]);

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

  const hasApiConfig = settings ? Boolean(settings.api_key.trim() && settings.api_base_url.trim()) : false;
  const canProceed = hasApiConfig && microphoneOk && (isMac ? accessibilityOk : true);

  const navItems: Array<{ id: View; icon: React.ReactNode; label: string; group?: string }> = useMemo(() => [
    { id: "stats", icon: <BarChart3 size={16} />, label: (m as Record<string, string>).stats ?? "Stats", group: "main" },
    { id: "history", icon: <History size={16} />, label: m.history, group: "main" },
    { id: "settingsApi", icon: <Shield size={16} />, label: m.apiConfiguration, group: "config" },
    { id: "settingsRecording", icon: <Mic size={16} />, label: m.recordingSettings, group: "config" },
    { id: "settingsBehavior", icon: <Activity size={16} />, label: m.behaviorSettings, group: "config" },
    { id: "settingsApp", icon: <Settings size={16} />, label: m.appSettings, group: "config" },
    { id: "settingsModels", icon: <Box size={16} />, label: (m as Record<string, string>).modelsManagement ?? "Models", group: "config" },
    { id: "diagnostics", icon: <Terminal size={16} />, label: m.diagnostics, group: "footer" },
  ], [m]);

  return {
    view, setView, history, settings, expandedId, setExpandedId, copied, setCopied,
    retrying, microphoneOk, accessibilityOk, errorMsg, apiKeyStatus, apiKeyError,
    showModelGuide, setShowModelGuide, searchQuery, setSearchQuery, statusFilter,
    setStatusFilter, savingSettings, settingsFeedback, setSettingsFeedback,
    confirmingClear, appVersion, selectedIds, setSelectedIds, hasMore,
    shortcutConflictMsg, updateStatus, downloading, downloadMsg, updateInfo,
    polishErrorMsg, playingAudioId, audioUrls,
    stopAudio, logs, logsAutoScroll,
    setLogsAutoScroll, logContainerRef, defaultPolishPrompt, darkMode, setDarkMode,
    uiLanguage, m, filteredHistory, stats, todayCount, hasApiConfig, canProceed,
    navItems, updateSettings, persistSettings, testApiKey,
    copyText, playAudio, loadLogs, clearLogs, copyAllLogs, flushAutoSave,
    deleteEntry, deleteSelected, clearHistory, retryEntry, loadHistory, loadSettings,
    searchHistory,
    handleEnableMicrophone, handleEnableAccessibility, checkForUpdates, downloadAndInstall,
  };
}
