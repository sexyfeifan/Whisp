import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Box, Download, Trash2, RefreshCw, HardDrive, Info, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "../components/ui/button";
import { SettingsSection } from "../components/SettingsSection";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { viewVariants } from "../lib/constants";

interface ModelInfo {
  name: string;
  path: string;
  size_bytes: number;
}

interface KnownModel {
  name: string;
  url: string;
  size_bytes: number;
  description: string;
  languages: string;
  params: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function SettingsModelsPage(app: AppState) {
  const {
    m, view, navItems, darkMode, setDarkMode, updateStatus,
    appVersion, checkForUpdates, flushAutoSave, setView,
  } = app;

  const [downloadedModels, setDownloadedModels] = useState<ModelInfo[]>([]);
  const [knownModels, setKnownModels] = useState<KnownModel[]>([]);
  const [diskUsage, setDiskUsage] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: { pct: number; downloaded: number; total: number } }>({});
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const [models, known, usage] = await Promise.all([
        invoke<ModelInfo[]>("list_whisper_models"),
        invoke<KnownModel[]>("list_known_models"),
        invoke<number>("get_model_disk_usage"),
      ]);
      setDownloadedModels(models);
      setKnownModels(known);
      setDiskUsage(usage);
    } catch (error) {
      console.error("Failed to load models:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Determine which known models are not yet downloaded
  const downloadedNames = new Set(downloadedModels.map((m) => m.name));
  const notDownloaded = knownModels.filter((k) => !downloadedNames.has(k.name));

  // Build a lookup for known model metadata to annotate downloaded models
  const knownLookup = new Map(knownModels.map((k) => [k.name, k]));

  const handleDelete = async (modelName: string) => {
    setDeleting(modelName);
    try {
      await invoke("delete_model", { modelName });
      setFeedback({ tone: "success", message: m.modelDeleted });
      await loadModels(); // Refresh
    } catch (error) {
      setFeedback({ tone: "error", message: String(error) });
    } finally {
      setDeleting(null);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleDownload = async (modelName: string) => {
    setDownloading(prev => new Set(prev).add(modelName));
    setDownloadProgress(prev => ({ ...prev, [modelName]: { pct: 0, downloaded: 0, total: 0 } }));

    const unlisten = await listen<{ model_name: string; percentage: number; downloaded_bytes: number; total_bytes: number }>(
      'model-download-progress',
      (event) => {
        if (event.payload.model_name === modelName) {
          setDownloadProgress(prev => ({
            ...prev,
            [modelName]: {
              pct: Math.round(event.payload.percentage * 10) / 10,
              downloaded: event.payload.downloaded_bytes,
              total: event.payload.total_bytes,
            },
          }));
        }
      },
    );

    try {
      await invoke("download_whisper_model", { modelName });
      setFeedback({ tone: "success", message: m.modelDownloaded });
      await loadModels(); // Refresh
    } catch (error) {
      setFeedback({ tone: "error", message: String(error) });
    } finally {
      setDownloading(prev => { const s = new Set(prev); s.delete(modelName); return s; });
      setDownloadProgress(prev => { const p = { ...prev }; delete p[modelName]; return p; });
      unlisten();
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="settingsModels"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--ink))" }}>{m.modelsManagement}</h1>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>
                {m.modelsManagementDesc}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {loading && (
                <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.loading}</span>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={loadModels}
                disabled={loading}
              >
                <RefreshCw size={12} className="mr-1" />
                {m.refreshModels}
              </Button>
            </div>
          </div>

          {feedback && (
            <div className="mb-4 p-3 rounded-lg text-xs" style={{
              background: feedback.tone === "success" ? "hsl(var(--success) / 0.1)" : "hsl(var(--destructive) / 0.1)",
              color: feedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))",
            }}>
              {feedback.message}
            </div>
          )}

          <div className="space-y-6">
            {/* Offline model usage explanation */}
            <div className="rounded-lg p-4" style={{ border: "1px solid hsl(var(--hairline))" }}>
              <div className="flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0" style={{ color: "hsl(var(--steel))" }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: "hsl(var(--ink))" }}>离线语音识别模型</p>
                  <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>
                    下载的 Whisper 模型可作为离线语音识别的备用方案。当 API 转写服务不可用时，
                    系统会自动使用本地模型进行转写。您也可以在设置中开启"优先使用本地模型"。
                  </p>
                </div>
              </div>
            </div>
            {/* Total disk usage */}
            <div className="flex items-center gap-3 p-4 rounded-lg" style={{ border: "1px solid hsl(var(--hairline))" }}>
              <HardDrive size={18} style={{ color: "hsl(var(--steel))" }} />
              <div>
                <div className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.totalDiskUsage}</div>
                <div className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>
                  {formatBytes(diskUsage)}
                </div>
              </div>
            </div>

            {/* Downloaded Models */}
            <SettingsSection
              icon={<Box size={14} />}
              title={m.modelsManagement}
              description=""
            >
              {downloadedModels.length === 0 ? (
                <p className="text-sm" style={{ color: "hsl(var(--steel))" }}>{m.noModelsDownloaded}</p>
              ) : (
                <div className="space-y-2">
                  {downloadedModels.map((model) => {
                    const known = knownLookup.get(model.name);
                    return (
                    <div
                      key={model.name}
                      className="flex items-start justify-between p-3 rounded-lg"
                      style={{ background: "hsl(var(--surface))" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: "hsl(var(--ink))" }}>
                          {model.name}
                        </div>
                        {known && (
                          <div className="text-[11px] mt-0.5" style={{ color: "hsl(var(--steel))" }}>
                            {known.description}
                          </div>
                        )}
                        <div className="flex gap-3 mt-1">
                          <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                            📦 {formatBytes(model.size_bytes)}
                          </span>
                          {known && (
                            <>
                              <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                                🌐 {known.languages}
                              </span>
                              <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                                🧩 {known.params}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(model.name)}
                        disabled={deleting === model.name}
                      >
                        {deleting === model.name ? (
                          <RefreshCw size={12} className="mr-1 animate-spin" />
                        ) : (
                          <Trash2 size={12} className="mr-1" />
                        )}
                        {m.deleteModel}
                      </Button>
                    </div>
                    );
                  })}
                </div>
              )}
            </SettingsSection>

            {/* Available Models to Download */}
            {notDownloaded.length > 0 && (
              <SettingsSection
                icon={<Download size={14} />}
                title={m.availableModels}
                description=""
              >
                <div className="space-y-2">
                  {notDownloaded.map((model) => (
                    <div
                      key={model.name}
                      className="flex items-start justify-between p-3 rounded-lg"
                      style={{ background: "hsl(var(--surface))" }}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="text-sm font-medium truncate" style={{ color: "hsl(var(--ink))" }}>
                          {model.name}
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: "hsl(var(--steel))" }}>
                          {model.description}
                        </div>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                            📦 {formatBytes(model.size_bytes)}
                          </span>
                          <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                            🧩 {model.params}
                          </span>
                          <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                            🌐 {model.languages}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 w-40">
                        {downloading.has(model.name) ? (
                          downloadProgress[model.name] !== undefined ? (
                            <div className="w-full">
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "hsl(var(--hairline))" }}>
                                <div
                                  className="h-full transition-all duration-300 rounded-full"
                                  style={{ width: `${Math.max(1, downloadProgress[model.name].pct)}%`, background: "hsl(var(--primary))" }}
                                />
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[10px]" style={{ color: "hsl(var(--steel))" }}>
                                  {downloadProgress[model.name].total > 0
                                    ? `${formatBytes(downloadProgress[model.name].downloaded)} / ${formatBytes(downloadProgress[model.name].total)}`
                                    : downloadProgress[model.name].downloaded > 0
                                      ? formatBytes(downloadProgress[model.name].downloaded)
                                      : m.downloadingModel}
                                </span>
                                <span className="text-[10px] tabular-nums" style={{ color: "hsl(var(--steel))" }}>
                                  {downloadProgress[model.name].pct}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 justify-end">
                              <Loader2 size={12} className="animate-spin" style={{ color: "hsl(var(--primary))" }} />
                              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.downloadingModel}</span>
                            </div>
                          )
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleDownload(model.name)}
                            disabled={downloading.has(model.name)}
                            className="w-full"
                          >
                            <Download size={12} className="mr-1" />
                            {m.downloadModel}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </SettingsSection>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
