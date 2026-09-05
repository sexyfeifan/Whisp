import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  Mic,
  Activity,
  Sparkles,
  Box,
  Settings,
  Info,
  Terminal,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
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
  const {
    view,
    navItems,
    darkMode,
    setDarkMode,
    updateStatus,
    appVersion,
    checkForUpdates,
    flushAutoSave,
    setView,
    m,
  } = app;
  const [settingsGroup, setSettingsGroup] = useState<"common" | "advanced">("common");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("app");

  const tabItems = [
    { id: "app" as SettingsTab, group: "common", icon: <Settings size={14} />, label: m.appSettings },
    { id: "recording" as SettingsTab, group: "common", icon: <Mic size={14} />, label: m.recordingSettings },
    { id: "api" as SettingsTab, group: "common", icon: <Shield size={14} />, label: m.apiConfiguration },
    { id: "behavior" as SettingsTab, group: "advanced", icon: <Activity size={14} />, label: m.behaviorSettings },
    {
      id: "polish" as SettingsTab,
      group: "advanced",
      icon: <Sparkles size={14} />,
      label: (m as Record<string, string>).aiPolishSettings ?? "AI Polish",
    },
    {
      id: "models" as SettingsTab,
      group: "advanced",
      icon: <Box size={14} />,
      label: (m as Record<string, string>).modelsManagement ?? "Models",
    },
  ];

  const groupItems = [
    { id: "common" as const, icon: <SlidersHorizontal size={14} />, label: m.settingsCommon ?? "Common" },
    { id: "advanced" as const, icon: <Wrench size={14} />, label: m.settingsAdvanced ?? "Advanced" },
  ];

  const visibleTabs = tabItems.filter((tab) => tab.group === settingsGroup);

  const selectGroup = (group: "common" | "advanced") => {
    setSettingsGroup(group);
    setSettingsTab(group === "common" ? "app" : "behavior");
  };

  const embeddedApp = { ...app, embedded: true };

  const renderContent = () => {
    switch (settingsTab) {
      case "api":
        return <SettingsApiPage {...embeddedApp} />;
      case "recording":
        return <SettingsRecordingPage {...embeddedApp} />;
      case "behavior":
        return <SettingsBehaviorPage {...embeddedApp} />;
      case "polish":
        return <SettingsPolishPage {...embeddedApp} />;
      case "models":
        return <SettingsModelsPage {...embeddedApp} />;
      case "app":
        return <SettingsAppPage {...embeddedApp} />;
    }
  };

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar
        view={view}
        navItems={navItems}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        updateStatus={updateStatus}
        appVersion={appVersion}
        checkForUpdates={checkForUpdates}
        flushAutoSave={flushAutoSave}
        setView={setView}
        m={m}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Progressive settings navigation: everyday controls first, specialist controls on demand. */}
        <div className="border-b px-6 pt-4 pb-3" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1 rounded-xl p-1"
              style={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--hairline-soft))" }}
            >
              {groupItems.map((group) => (
                <button
                  key={group.id}
                  onClick={() => selectGroup(group.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors duration-200 ${
                    settingsGroup === group.id
                      ? "text-[hsl(var(--primary))]"
                      : "text-[hsl(var(--steel))] hover:text-[hsl(var(--ink))]"
                  }`}
                >
                  {settingsGroup === group.id && (
                    <motion.span
                      layoutId="settings-group-indicator"
                      className="absolute inset-0 rounded-lg"
                      style={{ background: "hsl(var(--canvas))", boxShadow: "var(--shadow-sm)" }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {group.icon}
                    {group.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="h-5 w-px" style={{ background: "hsl(var(--hairline))" }} />

            <div className="flex items-center gap-1 relative">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors duration-200 z-10 ${
                    settingsTab === tab.id
                      ? "text-[hsl(var(--primary))]"
                      : "text-[hsl(var(--steel))] hover:text-[hsl(var(--ink))]"
                  }`}
                >
                  {settingsTab === tab.id && (
                    <motion.div
                      layoutId="settings-tab-indicator"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "hsl(var(--primary) / 0.11)",
                        border: "1px solid hsl(var(--primary) / 0.12)",
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {tab.icon}
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Diagnostics and About remain available without joining the settings hierarchy. */}
            <div className="ml-auto flex items-center gap-1">
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
