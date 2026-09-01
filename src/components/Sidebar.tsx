import type React from "react";
import { Download, Moon, Sun } from "lucide-react";
import type { View } from "../lib/constants";
import { BrandMark } from "./BrandMark";

interface NavItem {
  id: View;
  icon: React.ReactNode;
  label: string;
  group?: string;
}

export function Sidebar({
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
}: {
  view: View;
  navItems: NavItem[];
  darkMode: boolean;
  setDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  updateStatus: string;
  appVersion: string;
  checkForUpdates: () => void;
  flushAutoSave: () => void;
  setView: (view: View) => void;
  m: Record<string, string>;
}) {
  return (
    <div className="w-[180px] shrink-0 flex flex-col border-r" style={{ background: "hsl(var(--sidebar-bg))", borderColor: "hsl(var(--sidebar-border))" }}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <BrandMark size={22} />
        <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>Whisp</span>
      </div>

      <div className="flex-1 px-3 space-y-0.5">
        {navItems.map((item, idx) => {
          const prevGroup = idx > 0 ? navItems[idx - 1].group : null;
          const showGroupLabel = item.group !== prevGroup && (item.group === "config" || item.group === "tools");
          const isActive = view === item.id;
          return (
            <div key={item.id}>
              {showGroupLabel && (
                <div
                  className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{ color: "hsl(var(--stone))" }}
                >
                  {item.group === "config" ? (m.settings ?? "Settings") : (m.tools ?? "Tools")}
                </div>
              )}
              <button
                onClick={() => { flushAutoSave(); setView(item.id); }}
                className={`flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-[hsl(var(--sidebar-item-active-bg))] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]"
                    : "hover:bg-[hsl(var(--sidebar-item-hover-bg))]"
                }`}
                style={{
                  color: isActive ? "hsl(var(--sidebar-text-active))" : "hsl(var(--sidebar-text))",
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {item.icon}
                {item.label}
              </button>
            </div>
          );
        })}
      </div>

      <div className="px-3 pb-4 space-y-2">
        <div className="h-px" style={{ background: "hsl(var(--sidebar-border))" }} />
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-xs transition-colors"
          style={{ color: "hsl(var(--sidebar-text))" }}
          title={darkMode ? m.lightMode ?? "Light Mode" : m.darkMode ?? "Dark Mode"}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          {darkMode ? (m.lightMode ?? "Light Mode") : (m.darkMode ?? "Dark Mode")}
        </button>
        <button
          onClick={checkForUpdates}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-xs transition-colors"
          style={{ color: "hsl(var(--sidebar-text))" }}
        >
          <Download size={16} />
          {updateStatus === "checking" ? m.checkingUpdates : updateStatus === "available" ? m.updateAvailable : m.checkForUpdates}
        </button>
        <div className="px-3 flex items-center gap-2">
          <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>
            {appVersion ? `v${appVersion}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
