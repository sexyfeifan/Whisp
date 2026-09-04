import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Mic, Activity, Sparkles, Box, Settings, Info, Terminal } from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import type { SettingsTab } from "../lib/constants";
import { viewVariants } from "../lib/constants";

import { SettingsApiPage } from "./SettingsApiPage";
import { SettingsRecordingPage } from "./SettingsRecordingPage";
import { SettingsBehaviorPage } from "./SettingsBehaviorPage";
import { SettingsPolishPage } from "./SettingsPolishPage";
import { SettingsModelsPage } from "./SettingsModelsPage";
import { SettingsAppPage } from "./SettingsAppPage";

export function SettingsPage(app: AppState) {
  const { view, navItems, darkMode, setDarkMode, updateStatus, appVersion, checkForUpdates, flushAutoSave, setView, m } = app;
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("api");

  const tabItems = [
    { id: "api" as SettingsTab, icon: <Shield size={14} />, label: m.apiConfiguration },
    { id: "recording" as SettingsTab, icon: <Mic size={14} />, label: m.recordingSettings },
    { id: "behavior" as SettingsTab, icon: <Activity size={14} />, label: m.behaviorSettings },
    { id: "polish" as SettingsTab, icon: <Sparkles size={14} />, label: (m as Record<string, string>).aiPolishSettings ?? "AI Polish" },
    { id: "models" as SettingsTab, icon: <Box size={14} />, label: (m as Record<string, string>).modelsManagement ?? "Models" },
    { id: "app" as SettingsTab, icon: <Settings size={14} />, label: m.appSettings },
  ];

  const embeddedApp = { ...app, embedded: true };

  const renderContent = () => {
    switch (settingsTab) {
      case "api": return <SettingsApiPage {...embeddedApp} />;
      case "recording": return <SettingsRecordingPage {...embeddedApp} />;
      case "behavior": return <SettingsBehaviorPage {...embeddedApp} />;
      case "polish": return <SettingsPolishPage {...embeddedApp} />;
      case "models": return <SettingsModelsPage {...embeddedApp} />;
      case "app": return <SettingsAppPage {...embeddedApp} />;
    }
  };

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="border-b px-6 pt-4" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="flex items-center gap-1 relative">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSettingsTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-lg transition-colors duration-200 z-10 ${
                  settingsTab === tab.id
                    ? "text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--steel))] hover:text-[hsl(var(--ink))]"
                }`}
              >
                {settingsTab === tab.id && (
                  <motion.div
                    layoutId="settings-tab-indicator"
                    className="absolute inset-0 rounded-lg"
                    style={{ background: "hsl(var(--primary) / 0.1)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
            {/* Diagnostics and About as small links */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setView("diagnostics")}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] rounded transition-colors hover:bg-[hsl(var(--surface))]"
                style={{ color: "hsl(var(--stone))" }}
              >
                <Terminal size={12} />
                {m.diagnostics}
              </button>
              <button
                onClick={() => setView("about")}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] rounded transition-colors hover:bg-[hsl(var(--surface))]"
                style={{ color: "hsl(var(--stone))" }}
              >
                <Info size={12} />
                {(m as Record<string, string>).about ?? "About"}
              </button>
            </div>
          </div>
        </div>
        {/* Content */}
        <motion.div
          key={`settings-${settingsTab}`}
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
          className="flex-1 overflow-y-auto"
        >
          {renderContent()}
        </motion.div>
      </div>
    </div>
  );
}
