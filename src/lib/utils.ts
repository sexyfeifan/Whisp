import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isMac, modKey, defaultHotkey, localeMap } from "./constants";
import type { UiLanguage } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function translateShortcut(shortcut: string): string {
  if (!shortcut) return defaultHotkey;
  return shortcut
    .replace("CmdOrCtrl", modKey)
    .replace("Cmd", "\u2318")
    .replace("Ctrl", "Ctrl")
    .replace("Shift", "\u21e7")
    .replace("Alt", isMac ? "\u2325" : "Alt")
    .replace(/\+/g, " ");
}

export function codeToTauriKey(code: string): string | null {
  if (code.startsWith("Key") && code.length === 4) return code.charAt(3);
  if (code.startsWith("Digit") && code.length === 6) return code.charAt(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const map: Record<string, string> = {
    Space: "Space", Tab: "Tab", Enter: "Enter", Escape: "Escape",
    Backspace: "Backspace", Delete: "Delete", ArrowUp: "Up", ArrowDown: "Down",
    ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End",
    PageUp: "PageUp", PageDown: "PageDown", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";",
    Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  };
  return map[code] ?? null;
}

export function formatTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(value),
    template,
  );
}

export function formatTime(timestamp: number, uiLanguage: UiLanguage): string {
  const locale = localeMap[uiLanguage];
  const date = new Date(timestamp * 1000);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  return `${date.toLocaleDateString(locale, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(locale, {
    hour: "2-digit", minute: "2-digit",
  })}`;
}

export function formatPlaybackTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}m${secs}s`;
}

export function formatDuration(durationMs: number | null): string {
  if (!durationMs) return "";
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m${seconds}s`;
}

export function displaySpeechLanguage(language: string, uiLanguage: UiLanguage): string {
  const labelMap: Record<string, Record<UiLanguage, string>> = {
    auto: { "zh-CN": "\u81ea\u52a8\u8bc6\u522b", en: "Auto", ja: "\u81ea\u52d5" },
    zh: { "zh-CN": "\u4e2d\u6587", en: "Chinese", ja: "\u4e2d\u56fd\u8a9e" },
    en: { "zh-CN": "\u82f1\u8bed", en: "English", ja: "\u82f1\u8a9e" },
    ja: { "zh-CN": "\u65e5\u8bed", en: "Japanese", ja: "\u65e5\u672c\u8a9e" },
    ko: { "zh-CN": "\u97e9\u8bed", en: "Korean", ja: "\u97d3\u56fd\u8a9e" },
    es: { "zh-CN": "\u897f\u73ed\u7259\u8bed", en: "Spanish", ja: "\u30b9\u30da\u30a4\u30f3\u8a9e" },
    fr: { "zh-CN": "\u6cd5\u8bed", en: "French", ja: "\u30d5\u30e9\u30f3\u30b9\u8a9e" },
    de: { "zh-CN": "\u5fb7\u8bed", en: "German", ja: "\u30c9\u30a4\u30c4\u8a9e" },
  };
  return labelMap[language]?.[uiLanguage] ?? language.toUpperCase();
}
