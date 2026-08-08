import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FilterChip } from "../components/FilterChip";
import { ToggleRow } from "../components/ToggleRow";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { aiPolishPresets, viewVariants } from "../lib/constants";

export function SettingsPolishPage(app: AppState) {
  const {
    settings, updateSettings, polishStatus, polishError, testPolishConnection,
    defaultPolishPrompt, persistSettings, savingSettings, settingsFeedback, setView,
    m, setPolishStatus, setPolishError, view, navItems, darkMode, setDarkMode,
    updateStatus, appVersion, checkForUpdates, flushAutoSave,
  } = app;

  if (!settings) return null;

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="settingsPolish"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-6"
        >
          <SettingsPageHeader title={m.aiPolishSettings} savingSettings={savingSettings} settingsFeedback={settingsFeedback} m={m} onDone={async () => { const ok = await persistSettings(); if (ok) setView("history"); }} />
          <div className="space-y-6">
            <SettingsSection
              icon={<Zap size={14} />}
              title={m.aiPolishSettings}
              description={m.aiPolishSettingsDesc}
            >
              <ToggleRow label={m.aiPolish} description={m.aiPolishDesc} value={settings.ai_polish_enabled} onChange={(value) => updateSettings({ ai_polish_enabled: value })} />
              {settings.ai_polish_enabled && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.aiPolishApiUrl}</label>
                    <div className="flex gap-2 flex-wrap mb-2">
                      {aiPolishPresets.map((preset) => (
                        <FilterChip key={`polish-${preset.apiUrl}-${preset.model}`} active={settings.ai_polish_api_url === preset.apiUrl && settings.ai_polish_model === preset.model} label={preset.label} onClick={() => { updateSettings({ ai_polish_api_url: preset.apiUrl, ai_polish_model: preset.model }); setPolishStatus("untested"); setPolishError(null); }} />
                      ))}
                    </div>
                    <Input type="text" value={settings.ai_polish_api_url} onChange={(event) => { updateSettings({ ai_polish_api_url: event.target.value }); setPolishStatus("untested"); setPolishError(null); }} placeholder="https://api.openai.com/v1" />
                  </div>
                  <div>
                    <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.aiPolishApiKey}</label>
                    <Input type="password" value={settings.ai_polish_api_key} onChange={(event) => { updateSettings({ ai_polish_api_key: event.target.value }); setPolishStatus("untested"); setPolishError(null); }} placeholder="sk-..." />
                  </div>
                  <div>
                    <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.aiPolishModel}</label>
                    <Input list="polish-model-options" value={settings.ai_polish_model} onChange={(event) => updateSettings({ ai_polish_model: event.target.value })} placeholder="gpt-4o-mini" />
                    <datalist id="polish-model-options">
                      <option value="gpt-4o-mini" /><option value="gpt-4o" /><option value="deepseek-chat" /><option value="deepseek-reasoner" />
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.aiPolishPrompt}</label>
                    <textarea
                      value={settings.ai_polish_prompt}
                      onChange={(event) => updateSettings({ ai_polish_prompt: event.target.value })}
                      placeholder={defaultPolishPrompt || m.aiPolishPromptPlaceholder}
                      rows={5}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                      style={{ fontFamily: "monospace", fontSize: "12px", lineHeight: "1.5" }}
                    />
                    <p className="text-[11px] mt-1" style={{ color: "hsl(var(--steel))" }}>
                      {m.aiPolishPromptDesc}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={testPolishConnection}
                    disabled={!settings.ai_polish_api_url || !settings.ai_polish_api_key || polishStatus === "testing"}
                  >
                    {polishStatus === "testing" ? m.testing : polishStatus === "ok" ? m.connected : m.testPolishConnection}
                  </Button>
                  {polishStatus === "error" && polishError && (
                    <p className="text-xs whitespace-pre-wrap" style={{ color: "hsl(var(--destructive))" }}>{polishError}</p>
                  )}
                </div>
              )}
            </SettingsSection>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
