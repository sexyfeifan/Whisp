import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Mic, Search, Copy, Trash2,
  Check, Volume2, Clock, FileAudio,
  RefreshCw, Loader2,
  Download, FileText, Sparkles, X, Upload,
  Tag, Plus,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { FilterChip } from "../components/FilterChip";
import { StatCard } from "../components/StatCard";
import { IconButton } from "../components/IconButton";
import { Sidebar } from "../components/Sidebar";
import { FloatingRecordButton } from "../components/FloatingRecordButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { AudioPlayer } from "../components/AudioPlayer";
import type { AppState } from "../hooks/useApp";
import type { HistoryEntry } from "../types";
import { translateShortcut, formatTemplate, formatTime, formatDuration, displaySpeechLanguage, cn } from "../lib/utils";

function groupByTime(entries: HistoryEntry[], m: Record<string, string>): { label: string; entries: HistoryEntry[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, HistoryEntry[]> = { today: [], yesterday: [], week: [], earlier: [] };

  for (const entry of entries) {
    const date = new Date(entry.timestamp * 1000);
    if (date >= today) groups.today.push(entry);
    else if (date >= yesterday) groups.yesterday.push(entry);
    else if (date >= weekAgo) groups.week.push(entry);
    else groups.earlier.push(entry);
  }

  const todayLabel = m.today ?? "Today";
  const yesterdayLabel = m.yesterday ?? "Yesterday";
  const weekLabel = m.thisWeek ?? "This Week";
  const earlierLabel = m.earlier ?? "Earlier";

  return [
    { label: todayLabel, entries: groups.today },
    { label: yesterdayLabel, entries: groups.yesterday },
    { label: weekLabel, entries: groups.week },
    { label: earlierLabel, entries: groups.earlier },
  ].filter(g => g.entries.length > 0);
}

interface SummaryResult {
  title: string;
  summary: string;
  todos: string[];
  keywords: string[];
}

export function HistoryPage(app: AppState) {
  const {
    settings, filteredHistory, stats, todayCount, errorMsg, polishErrorMsg,
    settingsFeedback, searchQuery, setSearchQuery, statusFilter, setStatusFilter,
    selectedIds, setSelectedIds, expandedId, setExpandedId, copied, setCopied,
    retrying, hasMore, deleteEntry, deleteSelected, clearHistory,
    retryEntry, copyText, loadHistory, m, uiLanguage,
    uploadingFile, transcribeFile,
    view, navItems, darkMode, setDarkMode, updateStatus, appVersion, checkForUpdates,
    flushAutoSave, setView, history,
  } = app;

  const [exportDropdown, setExportDropdown] = useState<number | null>(null);
  const [batchExportOpen, setBatchExportOpen] = useState(false);
  const [summaryModal, setSummaryModal] = useState<{ entry: { id: number; text: string }; result?: SummaryResult; loading: boolean; error?: string } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [uploadConfirm, setUploadConfirm] = useState<{ fileName: string; file: File } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showPolished, setShowPolished] = useState<Record<number, boolean>>({});
  // Audio playback local state — driven by AudioPlayer onTimeUpdate
  const [audioPlayingEntryId, setAudioPlayingEntryId] = useState<number | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioTotalDuration, setAudioTotalDuration] = useState(0);
  // Tags state
  const [entryTags, setEntryTags] = useState<Record<number, string[]>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [addingTagToEntry, setAddingTagToEntry] = useState<number | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");

const fileInputRef = useRef<HTMLInputElement>(null);

const handleUploadAudio = () => {
  fileInputRef.current?.click();
};

const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  // Reset input so the same file can be selected again
  e.target.value = "";
  setUploadConfirm({ fileName: file.name, file });
};

const handleUploadConfirm = async (polish: boolean) => {
  if (!uploadConfirm) return;
  const { fileName, file } = uploadConfirm;
  setUploadConfirm(null);
  setUploadStatus(null);
  try {
    // Read file as base64
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data:audio/xxx;base64, prefix
        const base64Data = result.split(",")[1] || result;
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await transcribeFile(base64, fileName, polish);
    setUploadStatus({ type: "success", message: `✓ "${fileName}" ${polish ? m.uploadTranscribedWithPolish : m.uploadTranscribed}` });
  } catch (e) {
    console.error("Transcription failed:", e);
    setUploadStatus({ type: "error", message: `✕ "${fileName}" ${m.uploadFailed}: ${String(e).slice(0, 100)}` });
  }
  // Auto-clear status after 5 seconds
  setTimeout(() => setUploadStatus(null), 5000);
};

// Load tags for all visible entries and all distinct tags
const loadTags = async () => {
  try {
    const ids = history.map((e: { id: number }) => e.id);
    if (ids.length === 0) { setEntryTags({}); setAllTags([]); return; }
    const [tagsMap, tags] = await Promise.all([
      invoke<Record<number, string[]>>("get_tags_batch", { ids }),
      invoke<string[]>("get_all_tags"),
    ]);
    setEntryTags(tagsMap ?? {});
    setAllTags(tags ?? []);
  } catch (e) { console.error("Failed to load tags:", e); }
};

// Load tags when history changes
useEffect(() => { loadTags(); }, [history.length]);

const handleAddTag = async (entryId: number, tag: string) => {
  if (!tag.trim()) return;
  try {
    await invoke("add_tag", { entryId, tag: tag.trim() });
    setTagInputValue("");
    setAddingTagToEntry(null);
    await loadTags();
  } catch (e) { console.error("Failed to add tag:", e); }
};

const handleRemoveTag = async (entryId: number, tag: string) => {
  try {
    await invoke("remove_tag", { entryId, tag });
    await loadTags();
  } catch (e) { console.error("Failed to remove tag:", e); }
};

const handleBatchExport = async (fmt: string) => {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  try {
    const content = await invoke<string>("export_entries_batch", { ids, format: fmt });
    const ext = fmt === "json" ? "json" : fmt === "csv" ? "csv" : fmt === "srt" ? "srt" : fmt === "md" || fmt === "markdown" ? "md" : "txt";
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `whisp_export_${ts}.${ext}`;
    const path = await invoke<string>("save_export_to_file", { content, filename });
    await openPath(path);
  } catch (e) { console.error("Batch export failed:", e); }
};

  if (!settings) return null;

  // Apply tag filter on top of existing filters
  const displayedHistory = tagFilter
    ? filteredHistory.filter((entry) => entryTags[entry.id]?.includes(tagFilter))
    : filteredHistory;

  const handleExport = async (entryId: number, fmt: string) => {
    setExporting(`${entryId}-${fmt}`);
    setExportDropdown(null);
    try {
      const content = await invoke<string>("export_transcription", { entryId, format: fmt });
      const ext = fmt === "srt" ? "srt" : fmt === "vtt" ? "vtt" : fmt === "csv" ? "csv" : fmt === "markdown" ? "md" : "txt";
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `whisp_${ts}.${ext}`;
      const path = await invoke<string>("save_export_to_file", { content, filename });
      await openPath(path);
    } catch (e) { console.error("Export failed:", e); }
    finally { setExporting(null); }
  };

  const handleSummary = async (entryId: number, text: string) => {
    setSummaryModal({ entry: { id: entryId, text }, loading: true });
    try {
      const result = await invoke<SummaryResult>("generate_summary", { entryId });
      setSummaryModal({ entry: { id: entryId, text }, result, loading: false });
    } catch (e: unknown) {
      const raw = String(e);
      const enhanced = raw.includes("404") || raw.includes("Not Found") || raw.includes("model")
        ? `${raw}\n\nHint: Your API provider may not support chat completions. The AI Summary feature requires a chat/completions endpoint (not just Whisper). Please verify your API settings include a compatible model.`
        : raw;
      setSummaryModal({ entry: { id: entryId, text }, loading: false, error: enhanced });
    }
  };

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-5">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--ink))" }}>{m.history}</h1>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>
              {formatTemplate(m.startHint, { shortcut: translateShortcut(settings.shortcut || "") })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button variant="danger" size="sm" onClick={deleteSelected}>
                  {m.deleteSelected} ({selectedIds.size})
                </Button>
                <div className="relative">
                  <Button variant="secondary" size="sm" onClick={() => setBatchExportOpen(!batchExportOpen)}>
                    <Download size={14} className="mr-1" />
                    {m.exportHistory ?? "Export"} ({selectedIds.size})
                  </Button>
                  {batchExportOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[160px]" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--hairline))" }}>
                      {(["srt", "markdown", "csv", "json", "txt"] as const).map((fmt) => (
                        <button
                          key={fmt}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-[hsl(var(--surface))] transition-colors flex items-center gap-2"
                          style={{ color: "hsl(var(--ink))" }}
                          onClick={() => { handleBatchExport(fmt); setBatchExportOpen(false); }}
                        >
                          <FileText size={12} />
                          {fmt === "srt" ? m.exportSrt : fmt === "markdown" ? m.exportMarkdown : fmt === "csv" ? "CSV" : fmt === "json" ? "JSON" : m.exportTxt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (history.length === 0) return;
                setShowClearConfirm(true);
              }}
            >
              {m.clear}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUploadAudio}
              disabled={uploadingFile}
            >
              {uploadingFile ? <Loader2 size={14} className="animate-spin mr-1" /> : <Upload size={14} className="mr-1" />}
              {m.uploadAudio ?? "Upload"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  const csv = await invoke<string>("export_history");
                  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                  const filename = `whisp_history_${ts}.csv`;
                  const path = await invoke<string>("save_export_to_file", { content: csv, filename });
                  await openPath(path);
                }
                catch (error) { console.error("Export failed:", error); }
              }}
            >
              {m.exportHistory}
            </Button>
          </div>
        </div>

        {/* Hidden file input for audio upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.m4a,.ogg,.flac,.webm,.aac,.wma,.opus"
          style={{ display: "none" }}
          onChange={handleFileSelected}
        />

        {/* Upload status feedback */}
        {uploadStatus && (
          <div className="mx-8 mb-2 px-4 py-2 rounded-lg text-sm font-medium" style={{
            background: uploadStatus.type === "success" ? "hsl(var(--success) / 0.12)" : "hsl(var(--destructive) / 0.12)",
            color: uploadStatus.type === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))",
            border: `1px solid ${uploadStatus.type === "success" ? "hsl(var(--success) / 0.28)" : "hsl(var(--destructive) / 0.28)"}`,
          }}>
            {uploadStatus.message}
          </div>
        )}

        {/* Stat cards */}
        <div className="px-8 pb-3 grid grid-cols-4 gap-4">
          <StatCard
            icon={<FileAudio size={18} />}
            label={m.statsTotal}
            value={String(stats.total)}
            tone="var(--chart-1)"
          />
          <StatCard
            icon={<Clock size={18} />}
            label={m.statsToday}
            value={String(todayCount)}
            tone="var(--chart-3)"
            accent="amber"
          />
          <StatCard
            icon={<Check size={18} />}
            label={m.statsSuccess}
            value={stats.total > 0 ? `${Math.round((stats.success / stats.total) * 100)}%` : "\u2014"}
            tone="var(--success)"
            accent="teal"
          />
          <StatCard
            icon={<Volume2 size={18} />}
            label={m.audioSaved}
            value={String(stats.audioSaved)}
            tone="var(--chart-2)"
          />
        </div>
        {(stats.totalCost > 0 || stats.totalTokens > 0) && (
          <div className="px-8 pb-3 flex gap-4 text-xs" style={{ color: "hsl(var(--steel))" }}>
            {stats.totalCost > 0 && <span>{m.totalCost}: <strong style={{ color: "hsl(var(--ink))" }}>{"\u00a5"}{stats.totalCost.toFixed(4)}</strong></span>}
            {stats.totalTokens > 0 && <span>{m.totalTokens}: <strong style={{ color: "hsl(var(--ink))" }}>{stats.totalTokens.toLocaleString()}</strong></span>}
          </div>
        )}

        {/* Search and filters */}
        <div className="px-8 pb-3 space-y-2">
          {errorMsg && (
            <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: "hsl(var(--destructive) / 0.1)", border: "1px solid hsl(var(--destructive) / 0.2)", color: "hsl(var(--destructive))" }}>
              {errorMsg}
            </div>
          )}
          {polishErrorMsg && (
            <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: "hsl(var(--warning) / 0.1)", border: "1px solid hsl(var(--warning) / 0.2)", color: "hsl(var(--warning))" }}>
              {polishErrorMsg}
            </div>
          )}
          {settingsFeedback && (
            <div className="px-3 py-2 rounded-lg text-xs" style={{ background: settingsFeedback.tone === "success" ? "hsl(var(--success) / 0.1)" : "hsl(var(--destructive) / 0.1)", border: `1px solid ${settingsFeedback.tone === "success" ? "hsl(var(--success) / 0.2)" : "hsl(var(--destructive) / 0.2)"}`, color: settingsFeedback.tone === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))" }}>
              {settingsFeedback.message}
            </div>
          )}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--steel))" }}>
              <Search size={14} />
            </span>
            <Input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={m.searchPlaceholder}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <FilterChip active={statusFilter === "all"} label={m.filterAll} onClick={() => setStatusFilter("all")} />
            <FilterChip active={statusFilter === "success"} label={m.filterSuccess} onClick={() => setStatusFilter("success")} />
            <FilterChip active={statusFilter === "failed"} label={m.filterFailed} onClick={() => setStatusFilter("failed")} />
          </div>
          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <Tag size={12} style={{ color: "hsl(var(--steel))" }} />
              <FilterChip active={tagFilter === null} label={m.all ?? "All"} onClick={() => setTagFilter(null)} />
              {allTags.map((tag) => (
                <FilterChip key={tag} active={tagFilter === tag} label={tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)} />
              ))}
            </div>
          )}
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto px-8 pb-4">
          {displayedHistory.length === 0 ? (
            history.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-[hsl(var(--surface))] flex items-center justify-center mb-4">
                  <Mic size={28} className="text-[hsl(var(--steel))]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{m.noHistory}</h3>
                <p className="text-sm text-[hsl(var(--steel))] max-w-xs">
                  {formatTemplate(m.startHint, { shortcut: translateShortcut(settings.shortcut || "") })}
                </p>
              </motion.div>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm" style={{ color: "hsl(var(--steel))" }}>{m.noResults}</p>
              </div>
            )
          ) : (
            <motion.div
              key="history-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {groupByTime(displayedHistory, m).map((group) => (
                <div key={group.label} className="mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider px-1 mb-3" style={{ color: "hsl(var(--stone))" }}>
                    {group.label}
                    <span className="ml-2 text-[10px] font-normal" style={{ color: "hsl(var(--muted))" }}>
                      {group.entries.length}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {group.entries.map((entry) => {
                const failed = entry.status === "failed";
                const canRetry = Boolean(entry.audio_path);
                return (
                  <Card key={entry.id} className="p-4 border-[hsl(var(--hairline))]" style={{
                    borderColor: failed ? "hsl(var(--destructive) / 0.3)" : undefined,
                  }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(entry.id); else next.delete(entry.id);
                              return next;
                            });
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant={failed ? "danger" : "success"}>
                            {failed ? m.statusFailed : m.statusSuccess}
                          </Badge>
                          <Badge>{entry.provider}</Badge>
                          <Badge>{displaySpeechLanguage(entry.language, uiLanguage)}</Badge>
                        </div>
                      </div>
                      <div className="text-xs shrink-0" style={{ color: "hsl(var(--steel))" }}>{formatTime(entry.timestamp, uiLanguage)}</div>
                    </div>

                    <div className="mt-2">
                      {failed ? (
                        <div className="rounded-md border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-2 relative">
                          <button
                            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded hover:bg-[hsl(var(--destructive)/0.15)] transition-colors"
                            title={m.deleteRecord}
                            aria-label={m.deleteRecord}
                            onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                          >
                            <X size={12} style={{ color: "hsl(var(--destructive))" }} />
                          </button>
                          <div
                            className="text-sm pr-6 cursor-text"
                            style={{ color: "hsl(var(--destructive))", userSelect: "text", WebkitUserSelect: "text" }}
                          >{entry.error_message ?? entry.text}</div>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-1 h-6 text-[11px]"
                            onClick={async () => { await writeText(entry.error_message ?? entry.text); setCopied(entry.id); window.setTimeout(() => setCopied(null), 1500); }}
                          >
                            {copied === entry.id ? m.copied : m.copyError}
                          </Button>
                        </div>
                      ) : (
                        <>
                          {entry.polished_text && entry.polished_text.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowPolished(prev => ({...prev, [entry.id]: true})); }}
                                className={cn('text-xs px-2 py-0.5 rounded transition-colors',
                                  showPolished[entry.id] !== false ? 'bg-[hsl(var(--primary))] text-white' : 'text-[hsl(var(--steel))] hover:bg-[hsl(var(--surface))]')}
                              >{m.aiPolish}</button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowPolished(prev => ({...prev, [entry.id]: false})); }}
                                className={cn('text-xs px-2 py-0.5 rounded transition-colors',
                                  showPolished[entry.id] === false ? 'bg-[hsl(var(--primary))] text-white' : 'text-[hsl(var(--steel))] hover:bg-[hsl(var(--surface))]')}
                              >{m.originalText}</button>
                            </div>
                          )}
                          <div
                            className="text-sm cursor-pointer relative"
                            onClick={() => {
                              setExpandedId(expandedId === entry.id ? null : entry.id);
                            }}
                            style={{ userSelect: "text", color: "hsl(var(--ink))" }}
                          >
                            {(() => {
                              const activeText = showPolished[entry.id] !== false && entry.polished_text ? entry.polished_text : entry.text;
                              // Highlight text in sync with audio playback position
                              if (audioPlayingEntryId === entry.id && audioTotalDuration > 0 && audioCurrentTime > 0) {
                                const progressRatio = Math.min(1, audioCurrentTime / audioTotalDuration);
                                const fullText = activeText;
                                // Snap highlight boundary to nearest word/space for natural reading
                                let rawIdx = Math.floor(fullText.length * progressRatio);
                                // Find nearest word boundary (space, punctuation) to avoid mid-word splits
                                if (rawIdx > 0 && rawIdx < fullText.length) {
                                  const searchRange = fullText.slice(Math.max(0, rawIdx - 8), rawIdx + 8);
                                  // Search forward first, then backward for nearest space/punct
                                  let bestIdx = rawIdx;
                                  let bestDist = 999;
                                  for (let i = 0; i < searchRange.length; i++) {
                                    const ch = searchRange[i];
                                    if (ch === ' ' || ch === '，' || ch === '。' || ch === ',' || ch === '.' || ch === '、' || ch === '！' || ch === '？' || ch === '；' || ch === '：') {
                                      const absIdx = Math.max(0, rawIdx - 8) + i;
                                      const dist = Math.abs(absIdx - rawIdx);
                                      if (dist < bestDist) { bestDist = dist; bestIdx = absIdx + 1; }
                                    }
                                  }
                                  rawIdx = bestIdx;
                                }
                                const displayText = expandedId === entry.id || fullText.length <= 120 ? fullText : `${fullText.slice(0, 120)}...`;
                                const highlightRatio = Math.min(1, rawIdx / fullText.length);
                                const highlightPct = highlightRatio * 100;
                                return (
                                  <span style={{ position: "relative" }}>
                                    <span style={{
                                      background: `linear-gradient(to right, hsl(var(--primary) / 0.18) ${highlightPct}%, transparent ${highlightPct}%)`,
                                      color: "hsl(var(--ink))",
                                      borderRadius: 3,
                                      transition: "background 0.08s linear",
                                    }}>
                                      {displayText}
                                    </span>
                                  </span>
                                );
                              }
                              return expandedId === entry.id || activeText.length <= 120 ? activeText : `${activeText.slice(0, 120)}...`;
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3 gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{entry.model}</span>
                        {entry.duration_ms ? (
                          <Badge>{formatDuration(entry.duration_ms)}</Badge>
                        ) : null}
                        {entry.estimated_cost && entry.estimated_cost > 0 && (
                          <Badge variant="warning">
                            {"\u00a5"}{entry.estimated_cost.toFixed(4)}
                          </Badge>
                        )}
                        {entry.polish_tokens && entry.polish_tokens > 0 && (
                          <Badge variant="default">
                            {entry.polish_tokens} tokens
                          </Badge>
                        )}
                        <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{canRetry ? m.audioSavedLabel : m.noAudio}</span>
                      </div>
                      <div className="flex gap-0.5">
                        {!failed && (
                          <IconButton title={m.copy} onClick={() => copyText(entry.text, entry.id)} accent={copied === entry.id}>
                            <Copy size={14} />
                          </IconButton>
                        )}
                        {/* Export dropdown */}
                        {!failed && (
                          <div className="relative">
                            <IconButton title={m.exportFormat} onClick={() => setExportDropdown(exportDropdown === entry.id ? null : entry.id)}>
                              <Download size={14} />
                            </IconButton>
                            {exportDropdown === entry.id && (
                              <div className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[160px]" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--hairline))" }}>
                                {(["srt", "markdown", "csv", "json", "txt"] as const).map((fmt) => (
                                  <button
                                    key={fmt}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[hsl(var(--surface))] transition-colors flex items-center gap-2"
                                    style={{ color: "hsl(var(--ink))" }}
                                    onClick={() => handleExport(entry.id, fmt)}
                                  >
                                    <FileText size={12} />
                                    {fmt === "srt" ? m.exportSrt : fmt === "markdown" ? m.exportMarkdown : fmt === "csv" ? "CSV" : fmt === "json" ? "JSON" : m.exportTxt}
                                    {exporting === `${entry.id}-${fmt}` && <Loader2 size={12} className="animate-spin ml-auto" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {/* AI Summary */}
                        {!failed && (
                          <IconButton title={m.aiSummary} onClick={() => handleSummary(entry.id, entry.text)}>
                            <Sparkles size={14} />
                          </IconButton>
                        )}
                        {canRetry && (
                          <IconButton title={m.retry} onClick={() => retryEntry(entry.id)}>
                            {retrying === entry.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </IconButton>
                        )}
                        <IconButton title={m.delete} onClick={() => deleteEntry(entry.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>

                    {/* Tags display and management */}
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      {(entryTags[entry.id] ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: "hsl(var(--primary) / 0.1)",
                            color: "hsl(var(--primary))",
                            border: "1px solid hsl(var(--primary) / 0.2)",
                          }}
                        >
                          <Tag size={8} />
                          {tag}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveTag(entry.id, tag); }}
                            className="hover:opacity-70 transition-opacity"
                            style={{ color: "hsl(var(--primary))" }}
                          >
                            <X size={8} />
                          </button>
                        </span>
                      ))}
                      {addingTagToEntry === entry.id ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); handleAddTag(entry.id, tagInputValue); }}
                          className="inline-flex items-center"
                        >
                          <input
                            type="text"
                            value={tagInputValue}
                            onChange={(e) => setTagInputValue(e.target.value)}
                            onBlur={() => { if (!tagInputValue.trim()) setAddingTagToEntry(null); }}
                            autoFocus
                            placeholder="tag name"
                            className="text-[10px] px-1.5 py-0.5 rounded border w-16"
                            style={{
                              background: "hsl(var(--surface))",
                              borderColor: "hsl(var(--hairline))",
                              color: "hsl(var(--ink))",
                              outline: "none",
                            }}
                          />
                        </form>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddingTagToEntry(entry.id); setTagInputValue(""); }}
                          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full hover:bg-[hsl(var(--surface))] transition-colors"
                          style={{ color: "hsl(var(--steel))" }}
                        >
                          <Plus size={8} />
                          tag
                        </button>
                      )}
                    </div>

                    {/* Audio player with waveform, progress bar, and controls */}
                    {entry.audio_path && (
                      <div className="mt-2">
                        <AudioPlayer
                          audioPath={entry.audio_path}
                          durationMs={entry.duration_ms ?? null}
                          onTimeUpdate={(currentTime, duration) => {
                            setAudioPlayingEntryId(entry.id);
                            setAudioCurrentTime(currentTime);
                            setAudioTotalDuration(duration);
                          }}
                        />
                      </div>
                    )}
                  </Card>
                );
              })}
                  </div>
                </div>
              ))}
              {hasMore && !searchQuery && statusFilter === "all" && (
                <Button
                  variant="secondary"
                  className="w-full py-2 rounded-xl"
                  onClick={() => loadHistory(false)}
                >
                  {m.loadMore}
                </Button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Summary Modal */}
      {summaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setSummaryModal(null)}>
          <div className="max-w-lg w-full mx-4 rounded-xl shadow-2xl border p-6 max-h-[80vh] overflow-y-auto" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--hairline))" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: "hsl(var(--primary))" }} />
                <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>{m.aiSummary}</h2>
              </div>
              <button onClick={() => setSummaryModal(null)} aria-label={m.close ?? "Close"} className="p-1 rounded-lg hover:bg-[hsl(var(--surface))] transition-colors" style={{ color: "hsl(var(--steel))" }}>
                <X size={18} />
              </button>
            </div>
            {summaryModal.loading && (
              <div className="flex items-center justify-center py-8 gap-2" style={{ color: "hsl(var(--steel))" }}>
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">{m.generating}</span>
              </div>
            )}
            {summaryModal.error && (
              <div className="px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: "hsl(var(--destructive) / 0.1)", border: "1px solid hsl(var(--destructive) / 0.2)", color: "hsl(var(--destructive))" }}>
                {summaryModal.error}
              </div>
            )}
            {summaryModal.result && (
              <div className="space-y-4">
                {summaryModal.result.title && (
                  <div>
                    <h3 className="text-base font-semibold mb-1" style={{ color: "hsl(var(--ink))" }}>{summaryModal.result.title}</h3>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium mb-1" style={{ color: "hsl(var(--steel))" }}>{m.summaryOverview}</h3>
                  <div className="text-sm space-y-1.5 leading-relaxed" style={{ color: "hsl(var(--ink))" }}>
                    {summaryModal.result.summary.split('\n').map((line, i) => {
                      const trimmed = line.trim();
                      if (!trimmed) return <div key={i} className="h-1.5" />;
                      // Bold headers: **text** or **text**: content
                      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*:?\s*(.*)/);
                      if (boldMatch) {
                        return <p key={i}><strong className="font-semibold">{boldMatch[1]}</strong>{boldMatch[2] ? `: ${boldMatch[2]}` : ''}</p>;
                      }
                      // List items: - or • or * prefix
                      if (/^[-•*]\s/.test(trimmed)) {
                        return <p key={i} className="flex gap-2 pl-1"><span className="shrink-0" style={{ color: "hsl(var(--primary))" }}>•</span><span>{trimmed.replace(/^[-•*]\s*/, '')}</span></p>;
                      }
                      return <p key={i}>{trimmed}</p>;
                    })}
                  </div>
                </div>
                {summaryModal.result.keywords.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-1" style={{ color: "hsl(var(--steel))" }}>{m.keywords || "Keywords"}</h3>
                    <div className="flex flex-wrap gap-1">
                      {summaryModal.result.keywords.map((kw, i) => (
                        <Badge key={i}>{kw}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {summaryModal.result.todos.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-1" style={{ color: "hsl(var(--steel))" }}>{m.actionItems}</h3>
                    <ul className="space-y-1">
                      {summaryModal.result.todos.map((item, i) => (
                        <li key={i} className="text-sm flex gap-2" style={{ color: "hsl(var(--ink))" }}>
                          <span style={{ color: "hsl(var(--warning))" }}>☐</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
                  <Button variant="secondary" size="sm" onClick={async () => {
                    if (summaryModal.result) {
                      const text = `# ${summaryModal.result.title || m.summaryOverview}\n${summaryModal.result.summary}\n\n## ${m.keywords || "Keywords"}\n${summaryModal.result.keywords.map(k => `- ${k}`).join("\n")}\n\n## ${m.actionItems}\n${summaryModal.result.todos.map(a => `- [ ] ${a}`).join("\n")}`;
                      await writeText(text);
                    }
                  }}>{m.copy}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.clearConfirmTitle ?? "Clear All History?"}</DialogTitle>
            <DialogDescription>{m.clearConfirmDesc ?? "This will permanently delete all transcription records. This action cannot be undone."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowClearConfirm(false)}>
              {m.cancel ?? "Cancel"}
            </Button>
            <Button variant="danger" size="sm" onClick={async () => { await clearHistory(); setShowClearConfirm(false); }}>
              {m.clearConfirm ?? "Confirm Clear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Record Button */}
      <FloatingRecordButton isRecording={false} onPress={() => {}} />

      {/* Upload Audio Confirm Dialog */}
      {uploadConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setUploadConfirm(null)}>
          <div className="max-w-sm w-full mx-4 rounded-xl shadow-2xl border p-6" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--hairline))" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Upload size={18} style={{ color: "hsl(var(--primary))" }} />
              <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>{m.selectAudioFile ?? "Audio File Selected"}</h2>
            </div>
            <p className="text-sm mb-4" style={{ color: "hsl(var(--steel))" }}>
              {uploadConfirm.fileName}
            </p>
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => handleUploadConfirm(false)}
              >
                {m.transcribeDirect ?? "Transcribe"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => handleUploadConfirm(true)}
              >
                <Sparkles size={14} className="mr-1" />
                {m.transcribeAndPolish ?? "Transcribe & Polish"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setUploadConfirm(null)}
              >
                {m.cancel ?? "Cancel"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
