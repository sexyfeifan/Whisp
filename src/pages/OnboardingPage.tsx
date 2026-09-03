import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Check, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FilterChip } from "../components/FilterChip";
import { ModelGuide } from "../components/ModelGuide";
import { ShortcutInput } from "../components/ShortcutInput";
import { BrandMark } from "../components/BrandMark";
import type { AppState } from "../hooks/useApp";
import { endpointPresets, suggestedModels, defaultApiBaseUrl } from "../lib/constants";

const stepVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 200 : -200, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction < 0 ? 200 : -200, opacity: 0 }),
};

/** Confetti-like burst particles for celebration */
const confettiColors = ["#7c5bf5", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4"];
const confettiCount = 18;

function CelebrationBurst({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="flex items-center justify-center"
      >
        <span className="text-5xl">✅</span>
      </motion.div>
    );
  }

  return (
    <div className="relative w-full h-24 flex items-center justify-center overflow-visible">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
      >
        <Check size={48} style={{ color: "hsl(var(--success))" }} />
      </motion.div>
      {Array.from({ length: confettiCount }).map((_, i) => {
        const angle = (360 / confettiCount) * i;
        const distance = 60 + Math.random() * 40;
        const rad = (angle * Math.PI) / 180;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 6 + Math.random() * 4,
              height: 6 + Math.random() * 4,
              background: confettiColors[i % confettiColors.length],
            }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{
              x: Math.cos(rad) * distance,
              y: Math.sin(rad) * distance,
              scale: [0, 1.4, 0],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.05 * i }}
          />
        );
      })}
    </div>
  );
}

export function OnboardingPage(app: AppState) {
  const {
    settings, updateSettings, apiKeyStatus, apiKeyError, microphoneOk, accessibilityOk,
    showModelGuide, setShowModelGuide, settingsFeedback, savingSettings, persistSettings,
    handleEnableMicrophone, handleEnableAccessibility, setView, m, uiLanguage, canProceed,
  } = app;

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const reducedMotion = useReducedMotion();

  if (!settings) return null;

  const steps = [
    { id: "api", title: m.onboardingStep1, done: apiKeyStatus === "ok" || apiKeyStatus === "warn" },
    { id: "mic", title: m.onboardingStep2, done: microphoneOk },
    { id: "access", title: m.onboardingStep3, done: accessibilityOk },
    { id: "shortcut", title: m.onboardingStep4, done: false },
  ];

  const goToStep = (index: number) => {
    setDirection(index > currentStep ? 1 : -1);
    setCurrentStep(index);
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) goToStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  const handleFinish = async () => {
    const ok = await persistSettings();
    if (ok) {
      setCelebrating(true);
      setTimeout(() => {
        setCelebrating(false);
        setView("history");
      }, reducedMotion ? 600 : 1200);
    }
  };

  const handleSkip = () => {
    setView("history");
  };

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      {/* Sidebar — glass morphism matching main Sidebar */}
      <motion.div
        className="w-[180px] shrink-0 flex flex-col border-r overflow-hidden"
        style={{
          background: "linear-gradient(180deg, hsl(var(--sidebar-bg) / 0.7) 0%, hsl(var(--sidebar-bg) / 0.6) 100%)",
          borderColor: "hsl(var(--sidebar-border))",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
        }}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <BrandMark size={24} />
          <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>Whisp</span>
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto relative">
        {/* Skip button — top right */}
        <div className="absolute top-4 right-4 z-20">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            {m.skipSetup ?? "Skip"}
          </Button>
        </div>

        {/* Linear progress bar at top */}
        <div className="w-full h-[3px]" style={{ background: "hsl(var(--hairline))" }}>
          <motion.div
            className="h-full rounded-r-full"
            style={{ background: "hsl(var(--primary))" }}
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
          className="p-6"
        >
          {/* Logo + Title */}
          <motion.div
            className="flex flex-col items-center mb-6"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
          >
            <motion.div
              className="mb-3"
              initial={{ rotate: -10, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
            >
              <BrandMark size={48} />
            </motion.div>
            <h1 className="text-xl font-semibold">{m.onboardingTitle}</h1>
            <p className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.appSubtitle}</p>
          </motion.div>

          {/* Step progress indicators + step count */}
          <div className="flex items-center gap-1 mb-2">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                className="flex-1 flex items-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index, type: "spring", stiffness: 300, damping: 25 }}
              >
                <button
                  onClick={() => goToStep(index)}
                  className="flex items-center gap-2 w-full group"
                >
                  <motion.div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors"
                    style={{
                      background: step.done ? "hsl(var(--success))" : index === currentStep ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      color: step.done || index === currentStep ? "white" : "hsl(var(--steel))",
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    animate={index === currentStep ? { boxShadow: "0 0 0 3px hsla(var(--primary), 0.2)" } : {}}
                  >
                    {step.done ? <Check size={14} /> : index + 1}
                  </motion.div>
                  <span
                    className="text-xs font-medium hidden sm:inline transition-colors"
                    style={{ color: index === currentStep ? "hsl(var(--ink))" : "hsl(var(--steel))" }}
                  >
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <div className="flex-1 h-px mx-2" style={{ background: step.done ? "hsl(var(--success))" : "hsl(var(--hairline))" }} />
                  )}
                </button>
              </motion.div>
            ))}
          </div>

          {/* Step count text */}
          <p className="text-xs mb-6" style={{ color: "hsl(var(--stone))" }}>
            {`Step ${currentStep + 1} of ${steps.length}`}
          </p>

          {/* Step content with spring animation */}
          <div className="relative min-h-[400px]">
            {/* Celebration overlay */}
            <AnimatePresence>
              {celebrating && (
                <motion.div
                  className="absolute inset-0 z-30 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <CelebrationBurst reduced={!!reducedMotion} />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait" custom={direction}>
              {currentStep === 0 && (
                <motion.div
                  key="step-api"
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <motion.div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: "hsl(var(--primary))", color: "white" }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", bounce: 0.5 }}
                    >
                      1
                    </motion.div>
                    <span className="text-sm font-medium">{m.onboardingStep1}</span>
                    {apiKeyStatus === "ok" && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={14} style={{ color: "hsl(var(--success))" }} /></motion.div>}
                    {apiKeyStatus === "warn" && <AlertCircle size={14} style={{ color: "hsl(var(--warning))" }} />}
                  </div>
                  <motion.div
                    className="flex gap-2 flex-wrap"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {endpointPresets.map((preset, i) => (
                      <motion.div key={preset.value} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 * i }}>
                        <FilterChip active={settings.api_base_url === preset.value} label={preset.label} onClick={() => updateSettings({ api_base_url: preset.value })} />
                      </motion.div>
                    ))}
                  </motion.div>
                  <Input type="text" value={settings.api_base_url} onChange={(event) => updateSettings({ api_base_url: event.target.value })} placeholder={defaultApiBaseUrl} />
                  <Input type="password" value={settings.api_key} onChange={(event) => updateSettings({ api_key: event.target.value })} placeholder="sk-proj-..." />
                  <Input list="onboarding-model-options" value={settings.model} onChange={(event) => updateSettings({ model: event.target.value })} placeholder="gpt-4o-transcribe" />
                  <datalist id="onboarding-model-options">
                    {suggestedModels.map((modelName) => (<option key={modelName} value={modelName} />))}
                  </datalist>
                  <div className="flex items-center justify-end">
                    <button onClick={() => setShowModelGuide((value) => !value)} className="text-xs" style={{ color: "hsl(var(--primary))" }}>
                      {showModelGuide ? m.collapseModelGuide : m.modelGuide}
                    </button>
                  </div>
                  {showModelGuide && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}>
                      <ModelGuide currentModel={settings.model} onSelectModel={(modelName) => updateSettings({ model: modelName })} uiLanguage={uiLanguage} toggleText={m.apiBaseUrl} selectedText={m.connected} chooseText={m.save} />
                    </motion.div>
                  )}
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => app.testApiKey(settings.api_key, settings.api_base_url, settings.model)}
                    disabled={!settings.api_key || !settings.api_base_url || apiKeyStatus === "testing"}
                  >
                    {apiKeyStatus === "testing" ? m.testing : apiKeyStatus === "ok" ? m.connected : apiKeyStatus === "warn" ? (m.optionalValidationHint || m.testConnection).split("\u3002")[0] : m.testConnection}
                  </Button>
                  {(apiKeyStatus === "error" || apiKeyStatus === "warn") && apiKeyError && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs whitespace-pre-wrap" style={{ color: apiKeyStatus === "warn" ? "hsl(var(--warning))" : "hsl(var(--destructive))" }}>{apiKeyError}</motion.p>
                  )}
                </motion.div>
              )}

              {currentStep === 1 && (
                <motion.div
                  key="step-mic"
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <motion.div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--primary))", color: "white" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>2</motion.div>
                    <span className="text-sm font-medium">{m.onboardingStep2}</span>
                    {microphoneOk && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={14} style={{ color: "hsl(var(--success))" }} /></motion.div>}
                  </div>
                  {microphoneOk ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="px-3 py-2 rounded-lg text-sm" style={{ background: "hsl(var(--canvas))", border: "1px solid hsl(var(--hairline))", color: "hsl(var(--success))" }}>{m.enabled}</motion.div>
                  ) : (
                    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                      <Button variant="primary" className="w-full" onClick={handleEnableMicrophone}>{m.allowMicrophone}</Button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="step-access"
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <motion.div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--primary))", color: "white" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>3</motion.div>
                    <span className="text-sm font-medium">{m.onboardingStep3}</span>
                    {accessibilityOk && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={14} style={{ color: "hsl(var(--success))" }} /></motion.div>}
                  </div>
                  {accessibilityOk ? (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="px-3 py-2 rounded-lg text-sm" style={{ background: "hsl(var(--canvas))", border: "1px solid hsl(var(--hairline))", color: "hsl(var(--success))" }}>{m.enabled}</motion.div>
                  ) : (
                    <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                      <Button variant="primary" className="w-full" onClick={handleEnableAccessibility}>{m.allowAccessibility}</Button>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {currentStep === 3 && (
                <motion.div
                  key="step-shortcut"
                  custom={direction}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <motion.div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--muted))", color: "hsl(var(--steel))" }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>4</motion.div>
                    <span className="text-sm font-medium">{m.onboardingStep4}</span>
                  </div>
                  <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
                    <ShortcutInput shortcut={settings.shortcut} onCapture={(shortcut) => updateSettings({ shortcut })} invalidModifierText={m.invalidModifier} promptText={m.pressShortcut} />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-6">
            <Button variant="ghost" onClick={prevStep} disabled={currentStep === 0}>
              <ChevronLeft size={16} className="mr-1" />
              {currentStep > 0 ? steps[currentStep - 1].title : ""}
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button variant="primary" onClick={nextStep}>
                {steps[currentStep + 1].title}
                <ChevronRight size={16} className="ml-1" />
              </Button>
            ) : (
              <Button
                variant="primary"
                className="py-2.5"
                onClick={handleFinish}
                disabled={!canProceed || savingSettings || celebrating}
              >
                {savingSettings ? m.saving : celebrating ? "✓" : (apiKeyStatus === "ok" || apiKeyStatus === "warn") ? m.getStarted : m.saveAndContinue}
              </Button>
            )}
          </div>

          {settingsFeedback && (
            <motion.p
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs mt-3 text-center"
              style={{ color: settingsFeedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}
            >
              {settingsFeedback.message}
            </motion.p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
