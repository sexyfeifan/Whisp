import { useState, useEffect, useRef } from "react";
import type React from "react";
import { invoke } from "@tauri-apps/api/core";
import { codeToTauriKey, translateShortcut } from "../lib/utils";

export function ShortcutInput({
  shortcut, onCapture, invalidModifierText, promptText,
}: {
  shortcut: string; onCapture: (shortcut: string) => void;
  invalidModifierText: string; promptText: string;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pausedRef.current) { void invoke("resume_shortcut"); pausedRef.current = false; }
    };
  }, []);

  const handleClick = async () => {
    if (recording) return;
    if (!pausedRef.current) { pausedRef.current = true; await invoke("pause_shortcut"); }
    setRecording(true); setError(null);
  };

  const handleBlur = async () => {
    setRecording(false);
    if (pausedRef.current) { pausedRef.current = false; await invoke("resume_shortcut"); }
  };

  const handleKeyDown = async (event: React.KeyboardEvent) => {
    if (!recording) return;
    event.preventDefault(); event.stopPropagation();
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    if (!event.metaKey && !event.ctrlKey && !event.altKey) { setError(invalidModifierText); return; }
    const mainKey = codeToTauriKey(event.code);
    if (!mainKey) return;
    const parts: string[] = [];
    if (event.metaKey || event.ctrlKey) parts.push("CmdOrCtrl");
    if (event.shiftKey) parts.push("Shift");
    if (event.altKey) parts.push("Alt");
    parts.push(mainKey);
    setError(null); setRecording(false); onCapture(parts.join("+"));
    if (pausedRef.current) { pausedRef.current = false; await invoke("resume_shortcut"); }
  };

  return (
    <div>
      <div
        tabIndex={0}
        role="button"
        aria-label={recording ? promptText : translateShortcut(shortcut)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center cursor-pointer"
        style={{
          background: "hsl(var(--canvas))",
          border: recording ? "1px solid hsl(var(--primary))" : error ? "1px solid hsl(var(--destructive))" : "1px solid hsl(var(--hairline))",
          color: "hsl(var(--ink))",
        }}
        onClick={handleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {recording ? <span style={{ color: "hsl(var(--primary))" }}>{promptText}</span> : translateShortcut(shortcut)}
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: "hsl(var(--destructive))" }}>{error}</p>
      )}
    </div>
  );
}
