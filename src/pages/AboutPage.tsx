import { motion } from "framer-motion";
import { ExternalLink, Download, Check, RefreshCw } from "lucide-react";
import { openPath } from "@tauri-apps/plugin-opener";
import { BrandMark } from "../components/BrandMark";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { viewVariants } from "../lib/constants";

export function AboutPage(app: AppState) {
  const {
    appVersion, updateStatus, updateInfo, checkForUpdates,
    downloading, downloadMsg, downloadAndInstall,
    darkMode, setDarkMode, view, navItems, setView, flushAutoSave, m,
  } = app;

  const handleVersionClick = () => {
    if (updateStatus === "idle" || updateStatus === "latest" || updateStatus === "error") {
      checkForUpdates();
    }
  };

  const handleDownload = async () => {
    if (updateInfo?.assets && updateInfo.assets.length > 0) {
      // Find the appropriate installer for the current platform
      const isMac = navigator.userAgent.includes("Mac");
      const isWindows = navigator.userAgent.includes("Windows");
      
      let asset = updateInfo.assets[0]; // default to first asset
      if (isMac) {
        asset = updateInfo.assets.find(a => a.name.endsWith(".dmg")) || asset;
      } else if (isWindows) {
        asset = updateInfo.assets.find(a => a.name.endsWith(".exe") || a.name.endsWith(".msi")) || asset;
      }
      
      await downloadAndInstall(asset.url, asset.name);
    }
  };

  const openLink = async (url: string) => {
    try {
      await openPath(url);
    } catch {
      window.open(url, "_blank");
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
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="about"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
          className="flex flex-col items-center justify-center h-full p-6"
        >
          <div className="flex flex-col items-center space-y-6 max-w-md w-full">
            {/* App Icon */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <BrandMark size={80} />
            </motion.div>

            {/* App Name */}
            <motion.h1
              className="text-3xl font-bold"
              style={{ color: "hsl(var(--ink))" }}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              Whisp
            </motion.h1>

            {/* Tagline */}
            <motion.p
              className="text-lg"
              style={{ color: "hsl(var(--steel))", fontStyle: "italic" }}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              {m.appSubtitle}
            </motion.p>

            {/* Version with Update Check */}
            <motion.div
              className="flex flex-col items-center space-y-3"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <button
                onClick={handleVersionClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105"
                style={{
                  background: "hsl(var(--muted))",
                  color: "hsl(var(--steel))",
                }}
                disabled={updateStatus === "checking"}
              >
                {updateStatus === "checking" ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span className="text-sm">{m.checkingUpdates}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">
                      {m.versionLabel.replace("{version}", appVersion)}
                    </span>
                    <RefreshCw size={14} />
                  </>
                )}
              </button>

              {/* Update Status */}
              {updateStatus === "available" && updateInfo && (
                <motion.div
                  className="flex flex-col items-center space-y-2"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-2" style={{ color: "hsl(var(--success))" }}>
                    <Check size={14} />
                    <span className="text-sm">
                      {m.updateAvailable}: v{updateInfo.latestVersion}
                    </span>
                  </div>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50"
                    style={{
                      background: "hsl(var(--primary))",
                      color: "hsl(var(--primary-foreground))",
                    }}
                  >
                    {downloading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>{downloadMsg || m.downloading}</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>{m.clickToDownload}</span>
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {updateStatus === "latest" && (
                <motion.div
                  className="flex items-center gap-2"
                  style={{ color: "hsl(var(--success))" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Check size={14} />
                  <span className="text-sm">{m.latestVersion}</span>
                </motion.div>
              )}
            </motion.div>

            {/* Social Links */}
            <motion.div
              className="flex items-center gap-4 pt-4"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              <button
                onClick={() => openLink("https://github.com/sexyfeifan/Whisp")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 hover:scale-105"
                style={{
                  color: "hsl(var(--primary))",
                  background: "hsl(var(--muted))",
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span>GitHub</span>
                <ExternalLink size={12} />
              </button>

              <button
                onClick={() => openLink("https://t.me/sexyfeifan")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 hover:scale-105"
                style={{
                  color: "hsl(var(--primary))",
                  background: "hsl(var(--muted))",
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span>Telegram</span>
                <ExternalLink size={12} />
              </button>
            </motion.div>

            {/* Copyright */}
            <motion.div
              className="pt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <p className="text-xs" style={{ color: "hsl(var(--stone))" }}>
                {m.copyright}
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
