import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FilterChip } from "../components/FilterChip";
import { ModelGuide } from "../components/ModelGuide";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { endpointPresets, suggestedModels, defaultApiBaseUrl, viewVariants } from "../lib/constants";
import { displaySpeechLanguage } from "../lib/utils";

export function SettingsApiPage(app: AppState) {
  const {
    settings, updateSettings, apiKeyStatus, apiKeyError, showModelGuide, setShowModelGuide,
    persistSettings, savingSettings, settingsFeedback, setView, m, uiLanguage,
    view, navItems, darkMode, setDarkMode, updateStatus, appVersion,
    checkForUpdates, flushAutoSave,
  } = app;

  if (!settings) return null;

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="settingsApi"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-6"
        >
          <SettingsPageHeader title={m.apiConfiguration} savingSettings={savingSettings} settingsFeedback={settingsFeedback} m={m} onDone={async () => { const ok = await persistSettings(); if (ok) setView("history"); }} />
          <div className="space-y-6">
            <SettingsSection
              icon={<Shield size={14} />}
              title={m.apiConfiguration}
              description={m.apiConfigurationDesc}
            >
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.endpointPresets}</label>
                <div className="flex gap-2 flex-wrap">
                  {endpointPresets.map((preset) => (
                    <FilterChip key={preset.value} active={settings.api_base_url === preset.value} label={preset.label} onClick={() => updateSettings({ api_base_url: preset.value })} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.apiBaseUrl}</label>
                <Input type="text" value={settings.api_base_url} onChange={(event) => updateSettings({ api_base_url: event.target.value })} placeholder={defaultApiBaseUrl} />
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.apiKey}</label>
                <Input type="password" value={settings.api_key} onChange={(event) => updateSettings({ api_key: event.target.value })} placeholder="sk-..." />
                <Button
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={() => app.testApiKey(settings.api_key, settings.api_base_url, settings.model)}
                  disabled={!settings.api_key || !settings.api_base_url || apiKeyStatus === "testing"}
                >
                  {apiKeyStatus === "testing" ? m.testing : apiKeyStatus === "ok" ? m.connected : m.testConnection}
                </Button>
                {(apiKeyStatus === "error" || apiKeyStatus === "warn") && apiKeyError && (
                  <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: apiKeyStatus === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }}>{apiKeyError}</p>
                )}
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.model}</label>
                <Input list="model-options" value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="gpt-4o-transcribe" />
                <datalist id="model-options">
                  {suggestedModels.map((modelName) => (<option key={modelName} value={modelName} />))}
                </datalist>
                <div className="flex items-center justify-end mt-1">
                  <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "hsl(var(--primary))" }}>
                    {showModelGuide ? m.collapseModelGuide : m.modelGuide}
                  </button>
                </div>
                {showModelGuide && (
                  <ModelGuide currentModel={settings.model} onSelectModel={(modelName) => updateSettings({ model: modelName })} uiLanguage={uiLanguage} toggleText={m.apiBaseUrl} selectedText={m.connected} chooseText={m.save} />
                )}
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.language}</label>
                <select value={settings.language} onChange={(event) => updateSettings({ language: event.target.value })} className="w-full px-3 py-2 rounded-lg text-sm outline-none">
                  {["auto", "zh", "en", "ja", "ko", "es", "fr", "de"].map((language) => (
                    <option key={language} value={language}>{displaySpeechLanguage(language, uiLanguage)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.timeout}</label>
                  <Input type="number" min={10} max={300} value={settings.request_timeout_sec} onChange={(event) => updateSettings({ request_timeout_sec: Math.max(10, Number(event.target.value) || 10) })} />
                </div>
                <div>
                  <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.retryCount}</label>
                  <select value={settings.retry_count} onChange={(event) => updateSettings({ retry_count: Number(event.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm outline-none">
                    <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                  </select>
                </div>
              </div>
            </SettingsSection>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
