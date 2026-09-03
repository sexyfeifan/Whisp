import type React from "react";
import { Download, Moon, Sun } from "lucide-react";
import type { View } from "../lib/constants";
import { BrandMark } from "./BrandMark";

interface NavItem {
  id: View;
  icon: React.ReactNode;
  label: string;
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
    <div className="w-[200px] shrink-0 flex flex-col border-r backdrop-blur-xl" style={{ background: "linear-gradient(180deg, hsl(var(--sidebar-bg) / 0.7) 0%, hsl(var(--sidebar-bg) / 0.6) 100%)", borderColor: "hsl(var(--sidebar-border))" }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <BrandMark size={24} />
        <span className="text-[15px] font-semibold tracking-tight" style={{ color: "hsl(var(--ink))" }}>Whisp</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              aria-current={isActive ? "page" : undefined}
              onClick={() => { flushAutoSave(); setView(item.id); }}
              className={`flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                isActive
                  ? "bg-[hsl(var(--sidebar-item-active-bg))] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.12)]"
                  : "hover:bg-[hsl(var(--sidebar-item-hover-bg))]"
              }`}
              style={{
                color: isActive ? "hsl(var(--sidebar-text-active))" : "hsl(var(--sidebar-text))",
              }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1.5">
        <div className="h-px mb-2" style={{ background: "hsl(var(--sidebar-border))" }} />
        
        {/* Dark mode toggle — icon only */}
        <div className="flex items-center justify-between px-3">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--sidebar-item-hover-bg))]"
            style={{ color: "hsl(var(--sidebar-text))" }}
            title={darkMode ? (m.lightMode ?? "Light Mode") : (m.darkMode ?? "Dark Mode")}
            aria-label={darkMode ? (m.lightMode ?? "Light Mode") : (m.darkMode ?? "Dark Mode")}
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          
          {/* Version + update */}
          <div className="flex items-center gap-2">
            {updateStatus === "available" && (
              <button
                onClick={checkForUpdates}
                className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--sidebar-item-hover-bg))] animate-pulse"
                style={{ color: "hsl(var(--success))" }}
                title={m.updateAvailable ?? "Update available"}
                aria-label={m.updateAvailable ?? "Update available"}
              >
                <Download size={15} />
              </button>
            )}
            <span className="text-[11px]" style={{ color: "hsl(var(--stone))" }}>
              {appVersion ? `v${appVersion}` : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
