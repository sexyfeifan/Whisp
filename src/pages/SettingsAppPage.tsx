import { motion } from "framer-motion";
import { Keyboard, Settings as SettingsIcon, Download, Check, ExternalLink, X, FileText } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { ToggleRow } from "../components/ToggleRow";
import { ShortcutInput } from "../components/ShortcutInput";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { uiLanguageOptions, viewVariants } from "../lib/constants";
import type { UiLanguage } from "../lib/constants";

export function SettingsAppPage(app: AppState) {
  const {
    settings, updateSettings, microphoneOk, accessibilityOk, handleEnableMicrophone,
    handleEnableAccessibility, persistSettings, savingSettings, settingsFeedback,
    setSettingsFeedback, loadSettings, setView, updateStatus, updateInfo, appVersion,
    checkForUpdates, downloading, downloadMsg, downloadAndInstall, shortcutConflictMsg,
    m, uiLanguage, view, navItems, darkMode, setDarkMode, flushAutoSave,
  } = app;

  if (!settings) return null;

  const StatusIcon = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{ background: ok ? "hsl(var(--success))" : "hsl(var(--destructive))" }} />
      <span className="text-sm" style={{ color: ok ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
        {ok ? m.enabled : label}
      </span>
    </div>
  );

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="settingsApp"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-6"
        >
          <SettingsPageHeader title={m.appSettings} savingSettings={savingSettings} settingsFeedback={settingsFeedback} m={m} onDone={async () => { const ok = await persistSettings(); if (ok) setView("history"); }} />
          <div className="space-y-6">
            <SettingsSection
              icon={<Keyboard size={14} />}
              title={m.shortcutsPermissions}
              description={m.shortcutsPermissionsDesc}
            >
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.uiLanguage}</label>
                <select value={settings.ui_language} onChange={(event) => updateSettings({ ui_language: event.target.value as UiLanguage })} className="w-full px-3 py-2 rounded-lg text-sm outline-none">
                  {uiLanguageOptions.map((option) => (<option key={option.value} value={option.value}>{option.label[uiLanguage]}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.shortcut}</label>
                <ShortcutInput shortcut={settings.shortcut} onCapture={(shortcut) => updateSettings({ shortcut })} invalidModifierText={m.invalidModifier} promptText={m.pressShortcut} />
                {settings.shortcut && (
                  <button onClick={() => updateSettings({ shortcut: "" })} className="text-xs mt-1" style={{ color: "hsl(var(--primary))" }}>{m.resetToDefault}</button>
                )}
                {shortcutConflictMsg && (
                  <p className="text-xs mt-1" style={{ color: "hsl(var(--destructive))" }}>{m.shortcutConflict}: {shortcutConflictMsg}</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.microphone}</label>
                  {microphoneOk ? (
                    <StatusIcon ok={true} label={m.enabled} />
                  ) : (
                    <Button variant="primary" className="w-full" onClick={handleEnableMicrophone}>{m.allowMicrophone}</Button>
                  )}
                </div>
                <div>
                  <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.accessibility}</label>
                  {accessibilityOk ? (
                    <StatusIcon ok={true} label={m.enabled} />
                  ) : (
                    <Button variant="primary" className="w-full" onClick={handleEnableAccessibility}>{m.allowAccessibility}</Button>
                  )}
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              icon={<SettingsIcon size={14} />}
              title={m.appSettings}
              description={m.appSettingsDesc}
            >
              <ToggleRow label={m.launchAtStartup} description={m.launchAtStartupDesc} value={settings.launch_at_startup} onChange={(value) => updateSettings({ launch_at_startup: value })} />
              <div className="flex items-center justify-between p-3 rounded-lg" style={{ border: "1px solid hsl(var(--hairline))" }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "hsl(var(--ink))" }}>{m.checkForUpdates}</div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(var(--steel))" }}>{appVersion ? `v${appVersion}` : ""}</div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={checkForUpdates}
                  disabled={updateStatus === "checking"}
                >
                  {updateStatus === "checking" ? m.checkingUpdates : m.checkForUpdates}
                </Button>
              </div>
              {updateStatus === "latest" && (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "hsl(var(--success))" }}>
                  <Check size={14} /> {m.upToDate}
                </div>
              )}
              {updateStatus === "error" && (
                <div className="text-xs" style={{ color: "hsl(var(--destructive))" }}>{m.updateError}</div>
              )}
              {updateStatus === "available" && updateInfo && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: "hsl(var(--primary))" }}>v{updateInfo.latestVersion}</span>
                  </div>
                  {updateInfo.publishedAt && (
                    <div className="text-[11px]" style={{ color: "hsl(var(--steel))" }}>{m.publishedAt}: {new Date(updateInfo.publishedAt).toLocaleDateString()}</div>
                  )}
                  {updateInfo.releaseNotes && (
                    <details className="group">
                      <summary className="text-xs cursor-pointer" style={{ color: "hsl(var(--primary))" }}>{m.releaseNotes}</summary>
                      <div className="mt-1.5 text-xs whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto rounded-lg p-2.5" style={{ background: "hsl(var(--muted))", color: "hsl(var(--steel))" }}>{updateInfo.releaseNotes}</div>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => downloadAndInstall()}
                      disabled={downloading}
                    >
                      {downloading ? (downloadMsg || m.checkingUpdates) : `${m.downloadUpdate} v${updateInfo.latestVersion}`}
                    </Button>
                    {downloadMsg && !downloading && (
                      <div className="w-full text-xs mt-1 p-2 rounded-lg" style={{ background: downloadMsg.startsWith("Update failed") || downloadMsg.startsWith("Download failed") ? "hsl(var(--destructive) / 0.1)" : "hsl(var(--success) / 0.1)", color: downloadMsg.startsWith("Update failed") || downloadMsg.startsWith("Download failed") ? "hsl(var(--destructive))" : "hsl(var(--success))" }}>
                        {downloadMsg}
                      </div>
                    )}
                    {updateInfo.releaseUrl && (
                      <Button variant="secondary" size="sm" onClick={() => window.open(updateInfo.releaseUrl)}>
                        <ExternalLink size={12} className="mr-1" />
                        {m.viewOnGitHub}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </SettingsSection>

            <SettingsSection
              icon={<Download size={14} />}
              title={m.exportImportSettings}
              description={m.exportImportSettingsDesc}
            >
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const json = await invoke<string>("export_settings_json");
                      await writeText(json);
                      setSettingsFeedback({ tone: "success", message: m.settingsExported });
                      setTimeout(() => setSettingsFeedback(null), 3000);
                    } catch (error) {
                      setSettingsFeedback({ tone: "error", message: String(error) });
                    }
                  }}
                >
                  {m.exportSettings}
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (!text.trim().startsWith("{")) {
                        setSettingsFeedback({ tone: "error", message: m.importSettingsError });
                        return;
                      }
                      const result = await invoke<string>("import_settings_json", { json: text });
                      await loadSettings();
                      setSettingsFeedback({ tone: "success", message: result });
                      setTimeout(() => setSettingsFeedback(null), 3000);
                    } catch (error) {
                      setSettingsFeedback({ tone: "error", message: String(error) });
                    }
                  }}
                >
                  {m.importSettings}
                </Button>
              </div>
            </SettingsSection>

            <SettingsSection icon={<FileText size={18} className="text-[hsl(var(--primary))]" />} title={m.vocabulary} description={m.vocabularyDesc}>
              <div className="space-y-3">
                <ToggleRow
                  label={m.vocabularyEnabled}
                  description={m.vocabularyEnabledDesc}
                  value={settings.vocabulary_enabled}
                  onChange={(v) => updateSettings({ vocabulary_enabled: v })}
                />
                {settings.vocabulary_enabled && (
                  <>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder={m.vocabularyPlaceholder}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && e.currentTarget.value.trim()) {
                            const term = e.currentTarget.value.trim();
                            if (!settings.vocabulary.includes(term)) {
                              updateSettings({ vocabulary: [...settings.vocabulary, term] });
                            }
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {settings.vocabulary.length === 0 ? (
                        <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>—</span>
                      ) : (
                        settings.vocabulary.map((term, i) => (
                          <Badge key={i} variant="default" className="flex items-center gap-1 pr-1">
                            {term}
                            <button
                              className="ml-1 p-0.5 rounded hover:bg-[hsl(var(--destructive) / 0.2)] transition-colors"
                              onClick={() => updateSettings({ vocabulary: settings.vocabulary.filter((_, idx) => idx !== i) })}
                            >
                              <X size={10} />
                            </button>
                          </Badge>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </SettingsSection>
            {settingsFeedback && (
              <p className="text-xs" style={{ color: settingsFeedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>{settingsFeedback.message}</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
