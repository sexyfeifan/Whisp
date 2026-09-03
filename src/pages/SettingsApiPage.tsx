import { motion } from "framer-motion";
import { Shield, Plus, X, Sparkles, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FilterChip } from "../components/FilterChip";
import { ModelGuide } from "../components/ModelGuide";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { endpointPresets, summaryEndpointPresets, suggestedModels, defaultApiBaseUrl, viewVariants } from "../lib/constants";
import { displaySpeechLanguage } from "../lib/utils";

function SettingsApiContent(app: AppState) {
  const {
    settings, updateSettings, apiKeyStatus, apiKeyError, showModelGuide, setShowModelGuide,
    persistSettings, savingSettings, settingsFeedback, setView, m, uiLanguage,
  } = app;

  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [newEndpointLabel, setNewEndpointLabel] = useState("");
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSummaryApiKey, setShowSummaryApiKey] = useState(false);

  if (!settings) return null;

  const customEndpoints = settings.custom_endpoints || [];

  const addCustomEndpoint = () => {
    if (!newEndpointLabel.trim() || !newEndpointUrl.trim()) return;
    const updated = [...customEndpoints, { label: newEndpointLabel.trim(), url: newEndpointUrl.trim() }];
    updateSettings({ custom_endpoints: updated });
    setNewEndpointLabel("");
    setNewEndpointUrl("");
    setShowAddEndpoint(false);
  };

  const removeCustomEndpoint = (index: number) => {
    const updated = customEndpoints.filter((_, i) => i !== index);
    updateSettings({ custom_endpoints: updated });
  };

  return (
    <>
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
              {customEndpoints.map((ep, i) => (
                <FilterChip key={`custom-${i}`} active={settings.api_base_url === ep.url} label={ep.label} onClick={() => updateSettings({ api_base_url: ep.url })} />
              ))}
            </div>
            {/* Custom endpoints management */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[13px] font-normal" style={{ color: "hsl(var(--steel))" }}>{m.customEndpoints}</label>
                <Button variant="ghost" size="sm" onClick={() => setShowAddEndpoint(!showAddEndpoint)}>
                  <Plus size={14} className="mr-1" />{m.addEndpoint}
                </Button>
              </div>
              {showAddEndpoint && (
                <div className="flex gap-2 mb-2">
                  <Input type="text" value={newEndpointLabel} onChange={(e) => setNewEndpointLabel(e.target.value)} placeholder={m.endpointLabel} className="w-1/3" />
                  <Input type="text" value={newEndpointUrl} onChange={(e) => setNewEndpointUrl(e.target.value)} placeholder={m.endpointUrl} className="flex-1" />
                  <Button variant="primary" size="sm" onClick={addCustomEndpoint} disabled={!newEndpointLabel.trim() || !newEndpointUrl.trim()}>OK</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddEndpoint(false)}><X size={14} /></Button>
                </div>
              )}
              {customEndpoints.length > 0 ? (
                <div className="space-y-1">
                  {customEndpoints.map((ep, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: "hsl(var(--canvas))" }}>
                      <span className="font-medium" style={{ color: "hsl(var(--ink))" }}>{ep.label}</span>
                      <span className="flex-1 truncate" style={{ color: "hsl(var(--steel))" }}>{ep.url}</span>
                      <button onClick={() => removeCustomEndpoint(i)} className="p-0.5 hover:opacity-70"><X size={12} style={{ color: "hsl(var(--destructive))" }} /></button>
                    </div>
                  ))}
                </div>
              ) : !showAddEndpoint && (
                <p className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.noCustomEndpoints}</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.apiBaseUrl}</label>
            <Input type="text" value={settings.api_base_url} onChange={(event) => updateSettings({ api_base_url: event.target.value })} placeholder={defaultApiBaseUrl} />
          </div>
          <div>
            <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.apiKey}</label>
            <div className="relative">
              <Input type={showApiKey ? "text" : "password"} value={settings.api_key} onChange={(event) => updateSettings({ api_key: event.target.value })} placeholder="sk-..." className="pr-10" />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[hsl(var(--surface))] transition-colors"
                style={{ color: "hsl(var(--steel))" }}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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
            <Input list="settings-model-options" value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="gpt-4o-transcribe" />
            <datalist id="settings-model-options">
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
        <SettingsSection
          icon={<Sparkles size={14} />}
          title={m.aiSummary}
          description={m.aiSummaryConfigDesc}
        >
          <div>
            <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.endpointPresets}</label>
            <div className="flex gap-2 flex-wrap">
              {summaryEndpointPresets.map((preset) => (
                <FilterChip
                  key={preset.apiUrl}
                  active={settings.summary_api_base_url === preset.apiUrl}
                  label={preset.label}
                  onClick={() => updateSettings({ summary_api_base_url: preset.apiUrl, summary_model: preset.model })}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.summaryApiUrl}</label>
            <Input type="text" value={settings.summary_api_base_url} onChange={(event) => updateSettings({ summary_api_base_url: event.target.value })} placeholder={settings.api_base_url || "https://api.openai.com/v1"} />
          </div>
          <div>
            <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.summaryApiKey}</label>
            <div className="relative">
              <Input type={showSummaryApiKey ? "text" : "password"} value={settings.summary_api_key} onChange={(event) => updateSettings({ summary_api_key: event.target.value })} placeholder={m.summaryApiKey} className="pr-10" />
              <button
                type="button"
                onClick={() => setShowSummaryApiKey(!showSummaryApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[hsl(var(--surface))] transition-colors"
                style={{ color: "hsl(var(--steel))" }}
                aria-label={showSummaryApiKey ? "Hide summary API key" : "Show summary API key"}
              >
                {showSummaryApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.summaryModel}</label>
            <Input type="text" value={settings.summary_model} onChange={(event) => updateSettings({ summary_model: event.target.value })} placeholder="gpt-4o-mini" />
          </div>
        </SettingsSection>
      </div>
    </>
  );
}

export function SettingsApiPage(app: AppState) {
  const { view, navItems, darkMode, setDarkMode, updateStatus, appVersion, checkForUpdates, flushAutoSave, setView, m, embedded } = app;

  if (embedded) {
    return (
      <motion.div key="settingsApi" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }} className="p-6">
        <SettingsApiContent {...app} />
      </motion.div>
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div key="settingsApi" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }} className="p-6">
          <SettingsApiContent {...app} />
        </motion.div>
      </div>
    </div>
  );
}
