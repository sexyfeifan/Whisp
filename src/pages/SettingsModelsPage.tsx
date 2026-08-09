import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Box, Download, Trash2, RefreshCw, HardDrive } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
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
  const [downloading, setDownloading] = useState<string | null>(null);
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
    setDownloading(modelName);
    try {
      await invoke("download_whisper_model", { modelName });
      setFeedback({ tone: "success", message: m.modelDownloaded });
      await loadModels(); // Refresh
    } catch (error) {
      setFeedback({ tone: "error", message: String(error) });
    } finally {
      setDownloading(null);
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
                  {downloadedModels.map((model) => (
                    <div
                      key={model.name}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ background: "hsl(var(--surface))" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: "hsl(var(--ink))" }}>
                          {model.name}
                        </div>
                        <div className="text-xs" style={{ color: "hsl(var(--steel))" }}>
                          {formatBytes(model.size_bytes)}
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
                  ))}
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
                            🌐 {model.languages}
                          </span>
                          <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                            📦 {model.params}
                          </span>
                          <span className="text-[10px]" style={{ color: "hsl(var(--muted))" }}>
                            {formatBytes(model.size_bytes)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleDownload(model.name)}
                        disabled={downloading === model.name}
                        className="shrink-0"
                      >
                        {downloading === model.name ? (
                          <RefreshCw size={12} className="mr-1 animate-spin" />
                        ) : (
                          <Download size={12} className="mr-1" />
                        )}
                        {downloading === model.name ? m.downloadingModel : m.downloadModel}
                      </Button>
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
