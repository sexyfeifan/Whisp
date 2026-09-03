import type React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Moon, Sun,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
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
  collapsed: collapsedProp,
  onCollapsedChange,
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
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  // Internal collapse state with localStorage persistence
  const [internalCollapsed, setInternalCollapsed] = useState(() => {
    try {
      return localStorage.getItem("whisp-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  const collapsed = collapsedProp ?? internalCollapsed;
  const navRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ top: 0, height: 0 });

  // Auto-collapse on narrow viewports (< 640px)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        setInternalCollapsed(true);
        onCollapsedChange?.(true);
        try { localStorage.setItem("whisp-sidebar-collapsed", "true"); } catch { /* noop */ }
      }
    };
    handleChange(mq);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [onCollapsedChange]);

  // Sync indicator position to active item
  const updateIndicator = useCallback(() => {
    if (!navRef.current) return;
    const activeBtn = navRef.current.querySelector(
      `[data-nav-id="${view}"]`
    ) as HTMLElement | null;
    if (activeBtn) {
      const navRect = navRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setIndicatorStyle({
        top: btnRect.top - navRect.top,
        height: btnRect.height,
      });
    }
  }, [view]);

  useEffect(() => {
    updateIndicator();
    // Re-calculate after layout transition settles
    const timer = setTimeout(updateIndicator, 300);
    return () => clearTimeout(timer);
  }, [view, collapsed, updateIndicator]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setInternalCollapsed(next);
    onCollapsedChange?.(next);
    try {
      localStorage.setItem("whisp-sidebar-collapsed", String(next));
    } catch {
      /* noop */
    }
  };

  const width = collapsed
    ? "var(--sidebar-width-collapsed)"
    : "var(--sidebar-width-expanded)";

  return (
    <motion.div
      animate={{ width }}
      transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.8 }}
      className="shrink-0 flex flex-col border-r overflow-hidden"
      style={{
        background: "linear-gradient(180deg, hsl(var(--sidebar-bg) / 0.7) 0%, hsl(var(--sidebar-bg) / 0.6) 100%)",
        borderColor: "hsl(var(--sidebar-border))",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
      }}
    >
      {/* Logo + Collapse toggle */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandMark size={24} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="text-[15px] font-semibold tracking-tight whitespace-nowrap"
                style={{ color: "hsl(var(--ink))" }}
              >
                Whisp
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={toggleCollapse}
          className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--sidebar-item-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          style={{ color: "hsl(var(--stone))" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav
        ref={navRef}
        className="flex-1 px-3 space-y-1 relative"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Sliding active indicator */}
        <motion.div
          className="absolute left-3 right-3 rounded-xl z-0"
          style={{
            background: "hsl(var(--sidebar-item-active-bg))",
            boxShadow: "inset 0 0 0 1px hsl(var(--primary) / 0.12)",
          }}
          animate={{
            top: indicatorStyle.top,
            height: indicatorStyle.height,
          }}
          transition={{
            type: "spring",
            stiffness: 380,
            damping: 28,
            mass: 0.7,
          }}
        />

        {navItems.map((item) => {
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              data-nav-id={item.id}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                flushAutoSave();
                setView(item.id);
              }}
              className="relative z-10 flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              style={{
                color: isActive
                  ? "hsl(var(--sidebar-text-active))"
                  : "hsl(var(--sidebar-text))",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1.5">
        <div className="h-px mb-2" style={{ background: "hsl(var(--sidebar-border))" }} />

        {/* Dark mode toggle */}
        <div
          className="flex items-center px-3"
          style={{ justifyContent: collapsed ? "center" : "space-between" }}
        >
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--sidebar-item-hover-bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            style={{ color: "hsl(var(--sidebar-text))" }}
            title={darkMode ? (m.lightMode ?? "Light Mode") : (m.darkMode ?? "Dark Mode")}
            aria-label={darkMode ? (m.lightMode ?? "Light Mode") : (m.darkMode ?? "Dark Mode")}
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Version + update (hidden when collapsed) */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                {updateStatus === "available" && (
                  <button
                    onClick={checkForUpdates}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[hsl(var(--sidebar-item-hover-bg))] animate-pulse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
