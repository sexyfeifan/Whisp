import type React from "react";
import { motion } from "framer-motion";
import { BarChart3, Mic, Clock, Settings as SettingsIcon } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "../components/ui/button";
import { SettingsSection } from "../components/SettingsSection";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { viewVariants } from "../lib/constants";

export function DiagnosticsPage(app: AppState) {
  const {
    settings, history, microphoneOk, accessibilityOk, appVersion, logs, logsAutoScroll,
    setLogsAutoScroll, logContainerRef, clearLogs, copyAllLogs, m, view, navItems,
    darkMode, setDarkMode, updateStatus, checkForUpdates, flushAutoSave, setView,
  } = app;

  if (!settings) return null;

  const lastEntry = history.length > 0 ? history[0] : null;
  const audioFileCount = history.filter((entry) => Boolean(entry.audio_path)).length;

  const StatusDot = ({ ok }: { ok: boolean }) => (
    <div className="w-2.5 h-2.5 rounded-full" style={{ background: ok ? "hsl(var(--success))" : "hsl(var(--destructive))" }} />
  );

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="diagnostics"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-6"
        >
          <div className="mb-6">
            <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--ink))" }}>{m.diagnostics}</h1>
          </div>

          <div className="space-y-6">
            <SettingsSection
              icon={<BarChart3 size={14} />}
              title={m.connectionStatus}
              description=""
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.apiBaseUrl}</span>
                  <span className="text-xs font-mono" style={{ color: "hsl(var(--steel))" }}>{settings.api_base_url || "\u2014"}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.apiKey}</span>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={Boolean(settings.api_key.trim())} />
                    <span className="text-xs" style={{ color: settings.api_key.trim() ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                      {settings.api_key.trim() ? m.apiConfigured : m.apiNotConfigured}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.model}</span>
                  <span className="text-xs font-mono" style={{ color: "hsl(var(--steel))" }}>{settings.model || "\u2014"}</span>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              icon={<Mic size={14} />}
              title={m.permissionsStatus}
              description=""
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.microphone}</span>
                  <div className="flex items-center gap-2">
                    <StatusDot ok={microphoneOk} />
                    <span className="text-xs" style={{ color: microphoneOk ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                      {microphoneOk ? m.enabled : m.allowMicrophone}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.accessibility}</span>
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
              icon={<Clock size={14} />}
              title={m.lastTranscription}
              description=""
            >
              {lastEntry ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.model}</span>
                    <span className="text-xs font-mono" style={{ color: "hsl(var(--steel))" }}>{lastEntry.model}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.providerLabel}</span>
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{lastEntry.provider}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                    <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.total}</span>
                    <span className="text-xs" style={{ color: lastEntry.status === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
                      {lastEntry.status === "success" ? m.statusSuccess : m.statusFailed}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "hsl(var(--steel))" }}>{m.noHistory}</p>
              )}
            </SettingsSection>

            <SettingsSection
              icon={<SettingsIcon size={14} />}
              title={m.appSettings}
              description=""
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.versionLabel.split(" ")[0]}</span>
                  <span className="text-xs font-mono" style={{ color: "hsl(var(--steel))" }}>{appVersion ? `v${appVersion}` : "\u2014"}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.dataDirectory}</span>
                  <span className="text-xs font-mono" style={{ color: "hsl(var(--steel))" }}>~/.nanowhisper</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg" style={{ background: "hsl(var(--surface))" }}>
                  <span className="text-sm" style={{ color: "hsl(var(--ink))" }}>{m.audioFilesCount}</span>
                  <span className="text-xs font-mono" style={{ color: "hsl(var(--steel))" }}>{audioFileCount}</span>
                </div>
              </div>
            </SettingsSection>

            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>{m.runLogs}</h2>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={copyAllLogs}>{m.copyAll}</Button>
                  <Button variant="secondary" size="sm" onClick={clearLogs}>{m.clearLogs}</Button>
                  <Button variant={logsAutoScroll ? "primary" : "secondary"} size="sm" onClick={() => setLogsAutoScroll(!logsAutoScroll)}>
                    {logsAutoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
                  </Button>
                </div>
              </div>
              <div
                ref={logContainerRef as React.RefObject<HTMLDivElement>}
                className="rounded-lg border overflow-y-auto font-mono text-xs leading-relaxed"
                style={{
                  background: "hsl(var(--canvas))",
                  borderColor: "hsl(var(--hairline))",
                  height: "320px",
                  userSelect: "text",
                  WebkitUserSelect: "text",
                }}
              >
                {logs.length === 0 ? (
                  <div className="p-4 text-center" style={{ color: "hsl(var(--steel))" }}>{"\u6682\u65e0\u65e5\u5fd7"}</div>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {logs.map((entry, idx) => (
                      <div key={idx} className="flex gap-2 px-2 py-0.5 rounded hover:bg-black/5 group">
                        <span className="shrink-0" style={{ color: "hsl(var(--steel))" }}>{entry.timestamp}</span>
                        <span className="shrink-0 font-semibold" style={{
                          color: entry.level === "ERROR" ? "hsl(var(--destructive))" : entry.level === "WARN" ? "hsl(var(--warning))" : "hsl(var(--primary))"
                        }}>[{entry.level}]</span>
                        <span className="shrink-0" style={{ color: "hsl(var(--steel))" }}>{entry.target}:</span>
                        <span className="flex-1 break-all" style={{ color: "hsl(var(--ink))", userSelect: "text", WebkitUserSelect: "text" }}>{entry.message}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 opacity-0 group-hover:opacity-100 h-5 px-1 text-[10px]"
                          onClick={async () => { await writeText(`[${entry.timestamp}] [${entry.level}] ${entry.target}: ${entry.message}`); }}
                        >copy</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
