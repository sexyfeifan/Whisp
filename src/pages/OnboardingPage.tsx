import { motion } from "framer-motion";
import { Check, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FilterChip } from "../components/FilterChip";
import { ModelGuide } from "../components/ModelGuide";
import { ShortcutInput } from "../components/ShortcutInput";
import type { AppState } from "../hooks/useApp";
import { endpointPresets, suggestedModels, defaultApiBaseUrl } from "../lib/constants";
import logoUrl from "../assets/logo.png";

export function OnboardingPage(app: AppState) {
  const {
    settings, updateSettings, apiKeyStatus, apiKeyError, microphoneOk, accessibilityOk,
    showModelGuide, setShowModelGuide, settingsFeedback, savingSettings, persistSettings,
    handleEnableMicrophone, handleEnableAccessibility, setView, m, uiLanguage, canProceed,
  } = app;

  if (!settings) return null;

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <div className="w-[180px] shrink-0 flex flex-col border-r" style={{ background: "hsl(var(--sidebar-bg))", borderColor: "hsl(var(--sidebar-border))" }}>
        <div className="flex items-center gap-2 px-4 py-4">
          <img src={logoUrl} alt="" width={24} height={24} />
          <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>Whisp</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="p-6"
        >
          <div className="flex flex-col items-center mb-6">
            <div className="flex items-center gap-2 mb-1">
              <img src={logoUrl} alt="" width={28} height={28} />
              <h1 className="text-xl font-semibold">{m.onboardingTitle}</h1>
            </div>
            <p className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.appSubtitle}</p>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--primary))", color: "white" }}>1</span>
                <span className="text-sm font-medium">{m.onboardingStep1}</span>
                {apiKeyStatus === "ok" && <Check size={14} style={{ color: "hsl(var(--success))" }} />}
                {apiKeyStatus === "warn" && <AlertCircle size={14} style={{ color: "hsl(var(--warning))" }} />}
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                {endpointPresets.map((preset) => (
                  <FilterChip key={preset.value} active={settings.api_base_url === preset.value} label={preset.label} onClick={() => updateSettings({ api_base_url: preset.value })} />
                ))}
              </div>
              <Input type="text" value={settings.api_base_url} onChange={(event) => updateSettings({ api_base_url: event.target.value })} placeholder={defaultApiBaseUrl} className="mb-2" />
              <Input type="password" value={settings.api_key} onChange={(event) => updateSettings({ api_key: event.target.value })} placeholder="sk-proj-..." />
              <Input list="model-options" value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="gpt-4o-transcribe" className="mt-2" />
              <datalist id="model-options">
                {suggestedModels.map((modelName) => (<option key={modelName} value={modelName} />))}
              </datalist>
              <div className="flex items-center justify-end mt-2">
                <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "hsl(var(--primary))" }}>
                  {showModelGuide ? m.collapseModelGuide : m.modelGuide}
                </button>
              </div>
              {showModelGuide && (
                <ModelGuide currentModel={settings.model} onSelectModel={(modelName) => updateSettings({ model: modelName })} uiLanguage={uiLanguage} toggleText={m.apiBaseUrl} selectedText={m.connected} chooseText={m.save} />
              )}
              <Button
                variant="primary"
                className="w-full mt-2"
                onClick={() => app.testApiKey(settings.api_key, settings.api_base_url, settings.model)}
                disabled={!settings.api_key || !settings.api_base_url || apiKeyStatus === "testing"}
              >
                {apiKeyStatus === "testing" ? m.testing : apiKeyStatus === "ok" ? m.connected : apiKeyStatus === "warn" ? m.optionalValidationHint.split("\u3002")[0] : m.testConnection}
              </Button>
              {(apiKeyStatus === "error" || apiKeyStatus === "warn") && apiKeyError && (
                <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: apiKeyStatus === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }}>{apiKeyError}</p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--primary))", color: "white" }}>2</span>
                <span className="text-sm font-medium">{m.onboardingStep2}</span>
                {microphoneOk && <Check size={14} style={{ color: "hsl(var(--success))" }} />}
              </div>
              {microphoneOk ? (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "hsl(var(--canvas))", border: "1px solid hsl(var(--hairline))", color: "hsl(var(--success))" }}>{m.enabled}</div>
              ) : (
                <Button variant="primary" className="w-full" onClick={handleEnableMicrophone}>{m.allowMicrophone}</Button>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--primary))", color: "white" }}>3</span>
                <span className="text-sm font-medium">{m.onboardingStep3}</span>
                {accessibilityOk && <Check size={14} style={{ color: "hsl(var(--success))" }} />}
              </div>
              {accessibilityOk ? (
                <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "hsl(var(--canvas))", border: "1px solid hsl(var(--hairline))", color: "hsl(var(--success))" }}>{m.enabled}</div>
              ) : (
                <Button variant="primary" className="w-full" onClick={handleEnableAccessibility}>{m.allowAccessibility}</Button>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "hsl(var(--muted))", color: "hsl(var(--steel))" }}>4</span>
                <span className="text-sm font-medium">{m.onboardingStep4}</span>
              </div>
              <ShortcutInput shortcut={settings.shortcut} onCapture={(shortcut) => updateSettings({ shortcut })} invalidModifierText={m.invalidModifier} promptText={m.pressShortcut} />
            </div>
          </div>

          {settingsFeedback && (
            <p className="text-xs mt-3" style={{ color: settingsFeedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>{settingsFeedback.message}</p>
          )}

          <Button
            variant="primary"
            className="w-full mt-6 py-2.5"
            onClick={async () => { const ok = await persistSettings(); if (ok) setView("history"); }}
            disabled={!canProceed || savingSettings}
          >
            {savingSettings ? m.saving : (apiKeyStatus === "ok" || apiKeyStatus === "warn") ? m.getStarted : m.saveAndContinue}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
