import { motion } from "framer-motion";
import { Zap, RotateCcw } from "lucide-react";
import { useRef, useCallback } from "react";
import { Input } from "../components/ui/input";
import { FilterChip } from "../components/FilterChip";
import { ToggleRow } from "../components/ToggleRow";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { aiPolishPresets, viewVariants } from "../lib/constants";

function SettingsPolishContent(app: AppState) {
  const {
    settings, updateSettings, defaultPolishPrompt, persistSettings, savingSettings,
    settingsFeedback, setView, m,
  } = app;

  const promptRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = useCallback((variable: string) => {
    const textarea = promptRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = settings?.ai_polish_prompt || "";
    const updated = current.slice(0, start) + variable + current.slice(end);
    updateSettings({ ai_polish_prompt: updated });
    // Restore cursor position after the inserted variable
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    });
  }, [settings?.ai_polish_prompt, updateSettings]);

  if (!settings) return null;

  return (
    <>
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
                    <FilterChip key={`polish-${preset.apiUrl}-${preset.model}`} active={settings.ai_polish_api_url === preset.apiUrl && settings.ai_polish_model === preset.model} label={preset.label} onClick={() => { updateSettings({ ai_polish_api_url: preset.apiUrl, ai_polish_model: preset.model }); }} />
                  ))}
                </div>
                <Input type="text" value={settings.ai_polish_api_url} onChange={(event) => { updateSettings({ ai_polish_api_url: event.target.value }); }} placeholder="https://api.openai.com/v1" />
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.aiPolishApiKey}</label>
                <Input type="password" value={settings.ai_polish_api_key} onChange={(event) => { updateSettings({ ai_polish_api_key: event.target.value }); }} placeholder="sk-..." />
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.aiPolishModel}</label>
                <Input list="polish-model-options" value={settings.ai_polish_model} onChange={(event) => updateSettings({ ai_polish_model: event.target.value })} placeholder="gpt-4o-mini" />
                <datalist id="polish-model-options">
                  <option value="gpt-4o-mini" /><option value="gpt-4o" /><option value="deepseek-chat" /><option value="deepseek-reasoner" />
                </datalist>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[13px] font-normal" style={{ color: "hsl(var(--steel))" }}>{m.aiPolishPrompt}</label>
                  <button
                    type="button"
                    onClick={() => updateSettings({ ai_polish_prompt: defaultPolishPrompt || "" })}
                    className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded hover:bg-[hsl(var(--surface))] transition-colors"
                    style={{ color: "hsl(var(--steel))" }}
                  >
                    <RotateCcw size={11} />
                    {m.restoreDefault || "Restore default"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {["{text}", "{language}", "{model}"].map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      onClick={() => insertVariable(variable)}
                      className="px-2 py-0.5 rounded text-[11px] font-mono transition-colors hover:opacity-80"
                      style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
                    >
                      {variable}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={promptRef}
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
            </div>
          )}
        </SettingsSection>
      </div>
    </>
  );
}

export function SettingsPolishPage(app: AppState) {
  const { view, navItems, darkMode, setDarkMode, flushAutoSave, setView, m, embedded } = app;

  if (embedded) {
    return (
      <motion.div key="settingsPolish" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }} className="p-6">
        <SettingsPolishContent {...app} />
      </motion.div>
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div key="settingsPolish" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }} className="p-6">
          <SettingsPolishContent {...app} />
        </motion.div>
      </div>
    </div>
  );
}
