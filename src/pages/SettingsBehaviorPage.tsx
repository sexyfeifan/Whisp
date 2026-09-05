import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { Input } from "../components/ui/input";
import { ToggleRow } from "../components/ToggleRow";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { viewVariants } from "../lib/constants";

function SettingsBehaviorContent(app: AppState) {
  const {
    settings, updateSettings, persistSettings, savingSettings, settingsFeedback, setView, m,
  } = app;

  if (!settings) return null;

  return (
    <>
      <SettingsPageHeader title={m.behaviorSettings} savingSettings={savingSettings} settingsFeedback={settingsFeedback} m={m} onDone={async () => { const ok = await persistSettings(); if (ok) setView("history"); }} />
      <div className="space-y-6">
        <SettingsSection
          icon={<Activity size={14} />}
          title={m.behaviorSettings}
          description={m.behaviorSettingsDesc}
        >
          <ToggleRow label={m.autoPaste} description={m.autoPasteDesc} value={settings.auto_paste_enabled} onChange={(value) => updateSettings({ auto_paste_enabled: value })} />
          <div>
            <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.pasteDelay}</label>
            <Input type="number" min={50} max={2000} step={50} value={settings.paste_delay_ms} onChange={(event) => updateSettings({ paste_delay_ms: Math.max(50, Number(event.target.value) || 50) })} />
          </div>
          <ToggleRow label={m.saveAudioFiles} description={m.saveAudioFilesDesc} value={settings.save_audio_files} onChange={(value) => updateSettings({ save_audio_files: value })} />
          <ToggleRow label={m.soundEffects} description={m.soundEffectsDesc} value={settings.sound_enabled} onChange={(value) => updateSettings({ sound_enabled: value })} />
        </SettingsSection>
      </div>
    </>
  );
}

export function SettingsBehaviorPage(app: AppState) {
  const { view, navItems, darkMode, setDarkMode, flushAutoSave, setView, m, embedded } = app;

  if (embedded) {
    return (
      <motion.div key="settingsBehavior" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }} className="p-6">
        <SettingsBehaviorContent {...app} />
      </motion.div>
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div key="settingsBehavior" variants={viewVariants} initial="initial" animate="animate" exit="exit" transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }} className="p-6">
          <SettingsBehaviorContent {...app} />
        </motion.div>
      </div>
    </div>
  );
}
