import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { Input } from "../components/ui/input";
import { ToggleRow } from "../components/ToggleRow";
import { SettingsSection } from "../components/SettingsSection";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { viewVariants } from "../lib/constants";

export function SettingsRecordingPage(app: AppState) {
  const {
    settings, updateSettings, persistSettings, savingSettings, settingsFeedback, setView,
    m, view, navItems, darkMode, setDarkMode, updateStatus, appVersion, checkForUpdates, flushAutoSave,
  } = app;

  if (!settings) return null;

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="settingsRecording"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-6"
        >
          <SettingsPageHeader title={m.recordingSettings} savingSettings={savingSettings} settingsFeedback={settingsFeedback} m={m} onDone={async () => { const ok = await persistSettings(); if (ok) setView("history"); }} />
          <div className="space-y-6">
            <SettingsSection
              icon={<Mic size={14} />}
              title={m.recordingSettings}
              description={m.recordingSettingsDesc}
            >
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.silenceTimeout}</label>
                <Input type="number" min={0} max={3600} step={10} value={settings.silence_timeout_sec} onChange={(event) => updateSettings({ silence_timeout_sec: Math.max(0, Number(event.target.value) || 0) })} />
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.silenceThreshold}</label>
                <Input type="number" min={0} max={1} step={0.005} value={settings.silence_threshold} onChange={(event) => updateSettings({ silence_threshold: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })} />
              </div>
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.whisperPrompt}</label>
                <textarea value={settings.whisper_prompt} onChange={(event) => updateSettings({ whisper_prompt: event.target.value })} placeholder={m.whisperPromptPlaceholder} rows={3} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" />
              </div>
              <ToggleRow label={m.trimSilence} description={m.trimSilenceDesc} value={settings.trim_silence_enabled} onChange={(value) => updateSettings({ trim_silence_enabled: value })} />
              <ToggleRow
                label={m.streamingEnabled ?? "Real-time Streaming"}
                description={m.streamingEnabledDesc ?? "Show partial transcription in real-time as you speak (experimental)."}
                value={settings.streaming_enabled}
                onChange={(value) => updateSettings({ streaming_enabled: value })}
              />
              {settings.streaming_enabled && (
                <>
                  <div>
                    <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>
                      {m.streamingChunkDuration ?? "Chunk Duration (seconds)"}
                    </label>
                    <Input type="number" min={1} max={30} step={1} value={settings.streaming_chunk_duration_secs} onChange={(event) => updateSettings({ streaming_chunk_duration_secs: Math.min(30, Math.max(1, Number(event.target.value) || 2)) })} />
                  </div>
                  <div>
                    <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>
                      {m.streamingSource ?? "Streaming Source"}
                    </label>
                    <p className="text-[11px] mb-2" style={{ color: "hsl(var(--steel))" }}>{m.streamingSourceDesc ?? "Choose cloud API or local Whisper model for real-time subtitles."}</p>
                    <select
                      value={settings.streaming_use_local_model ? "local" : "cloud"}
                      onChange={(e) => updateSettings({ streaming_use_local_model: e.target.value === "local" })}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))", border: "1px solid hsl(var(--hairline))" }}
                    >
                      <option value="cloud">{m.streamingSourceCloud ?? "Cloud API"}</option>
                      <option value="local">{m.streamingSourceLocal ?? "Local Model"}</option>
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: "hsl(var(--steel))" }}>
                  {m.audioRetentionLimit}
                </label>
                <p className="text-[11px] mb-1" style={{ color: "hsl(var(--steel))" }}>{m.audioRetentionLimitDesc}</p>
                <Input
                  type="number"
                  min={10}
                  max={1000}
                  step={10}
                  value={settings.audio_retention_limit}
                  onChange={(event) => updateSettings({ audio_retention_limit: Math.max(10, Number(event.target.value) || 10) })}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              icon={<span style={{ fontSize: 14 }}>🎬</span>}
              title={m.overlaySubtitleStyle ?? "Overlay Subtitle Style"}
              description={m.overlaySubtitleStyleDesc ?? "Choose the color style for real-time transcription text in the overlay."}
            >
              <div>
                <label className="block text-[13px] font-normal mb-1.5" style={{ color: "hsl(var(--steel))" }}>{m.overlaySubtitleStyle ?? "Overlay Subtitle Style"}</label>
                <select
                  value={settings.overlay_subtitle_style}
                  onChange={(e) => updateSettings({ overlay_subtitle_style: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))", border: "1px solid hsl(var(--hairline))" }}
                >
                  <option value="white-black">{m.subtitleWhiteBlack ?? "White text, black border"}</option>
                  <option value="yellow-black">{m.subtitleYellowBlack ?? "Yellow text, black border"}</option>
                  <option value="white-darkbg">{m.subtitleWhiteDarkbg ?? "White text, dark background"}</option>
                  <option value="green-black">{m.subtitleGreenBlack ?? "Green text, black border"}</option>
                </select>
              </div>
            </SettingsSection>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
