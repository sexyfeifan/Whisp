import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Mic, Search, Check, Volume2, Clock, FileAudio,
  Tag,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FilterChip } from "../components/FilterChip";
import { StatCard } from "../components/StatCard";
import { Sidebar } from "../components/Sidebar";
import { FloatingRecordButton } from "../components/FloatingRecordButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { HistoryToolbar, HistoryEntryCard, HistorySummaryModal, HistoryUploadDialog } from "../components/history";
import type { SummaryModalState } from "../components/history";
import type { UploadConfirmState } from "../components/history";
import type { AppState } from "../hooks/useApp";
import type { HistoryEntry } from "../types";
import { translateShortcut, formatTemplate } from "../lib/utils";

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
  const [summaryModal, setSummaryModal] = useState<SummaryModalState | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [uploadConfirm, setUploadConfirm] = useState<UploadConfirmState | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showPolished, setShowPolished] = useState<Record<number, boolean>>({});
  const [audioPlayingEntryId, setAudioPlayingEntryId] = useState<number | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioTotalDuration, setAudioTotalDuration] = useState(0);
  const [entryTags, setEntryTags] = useState<Record<number, string[]>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [addingTagToEntry, setAddingTagToEntry] = useState<number | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadAudio = () => { fileInputRef.current?.click(); };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadConfirm({ fileName: file.name, file });
  };

  const handleUploadConfirm = async (polish: boolean) => {
    if (!uploadConfirm) return;
    const { fileName, file } = uploadConfirm;
    setUploadConfirm(null);
    setUploadStatus(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
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
    setTimeout(() => setUploadStatus(null), 5000);
  };

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
      const result = await invoke<{ title: string; summary: string; todos: string[]; keywords: string[] }>("generate_summary", { entryId });
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
        <HistoryToolbar
          selectedIds={selectedIds}
          history={history}
          m={m}
          settings={settings}
          deleteSelected={deleteSelected}
          handleUploadAudio={handleUploadAudio}
          uploadingFile={uploadingFile}
          batchExportOpen={batchExportOpen}
          setBatchExportOpen={setBatchExportOpen}
          handleBatchExport={handleBatchExport}
          setShowClearConfirm={setShowClearConfirm}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.m4a,.ogg,.flac,.webm,.aac,.wma,.opus"
          style={{ display: "none" }}
          onChange={handleFileSelected}
        />

        {uploadStatus && (
          <div className="mx-8 mb-2 px-4 py-2 rounded-lg text-sm font-medium" style={{
            background: uploadStatus.type === "success" ? "hsl(var(--success) / 0.12)" : "hsl(var(--destructive) / 0.12)",
            color: uploadStatus.type === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))",
            border: `1px solid ${uploadStatus.type === "success" ? "hsl(var(--success) / 0.28)" : "hsl(var(--destructive) / 0.28)"}`,
          }}>
            {uploadStatus.message}
          </div>
        )}

        <div className="px-8 pb-3 grid grid-cols-4 gap-4">
          <StatCard icon={<FileAudio size={18} />} label={m.statsTotal} value={String(stats.total)} tone="var(--chart-1)" />
          <StatCard icon={<Clock size={18} />} label={m.statsToday} value={String(todayCount)} tone="var(--chart-3)" accent="amber" />
          <StatCard icon={<Check size={18} />} label={m.statsSuccess} value={stats.total > 0 ? `${Math.round((stats.success / stats.total) * 100)}%` : "\u2014"} tone="var(--success)" accent="teal" />
          <StatCard icon={<Volume2 size={18} />} label={m.audioSaved} value={String(stats.audioSaved)} tone="var(--chart-2)" />
        </div>
        {(stats.totalCost > 0 || stats.totalTokens > 0) && (
          <div className="px-8 pb-3 flex gap-4 text-xs" style={{ color: "hsl(var(--steel))" }}>
            {stats.totalCost > 0 && <span>{m.totalCost}: <strong style={{ color: "hsl(var(--ink))" }}>{"\u00a5"}{stats.totalCost.toFixed(4)}</strong></span>}
            {stats.totalTokens > 0 && <span>{m.totalTokens}: <strong style={{ color: "hsl(var(--ink))" }}>{stats.totalTokens.toLocaleString()}</strong></span>}
          </div>
        )}

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
            <Input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={m.searchPlaceholder} className="pl-9" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <FilterChip active={statusFilter === "all"} label={m.filterAll} onClick={() => setStatusFilter("all")} />
            <FilterChip active={statusFilter === "success"} label={m.filterSuccess} onClick={() => setStatusFilter("success")} />
            <FilterChip active={statusFilter === "failed"} label={m.filterFailed} onClick={() => setStatusFilter("failed")} />
          </div>
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

        <div className="flex-1 overflow-y-auto px-8 pb-4">
          {displayedHistory.length === 0 ? (
            history.length === 0 ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-16 text-center">
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
            <motion.div key="history-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {groupByTime(displayedHistory, m).map((group) => (
                <div key={group.label} className="mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider px-1 mb-3" style={{ color: "hsl(var(--stone))" }}>
                    {group.label}
                    <span className="ml-2 text-[10px] font-normal" style={{ color: "hsl(var(--muted))" }}>
                      {group.entries.length}
                    </span>
                  </h3>
                  <div className="space-y-2">
                    {group.entries.map((entry) => (
                      <HistoryEntryCard
                        key={entry.id}
                        entry={entry}
                        selectedIds={selectedIds}
                        setSelectedIds={setSelectedIds}
                        expandedId={expandedId}
                        setExpandedId={setExpandedId}
                        copied={copied}
                        setCopied={setCopied}
                        showPolished={showPolished}
                        setShowPolished={setShowPolished}
                        entryTags={entryTags}
                        addingTagToEntry={addingTagToEntry}
                        setAddingTagToEntry={setAddingTagToEntry}
                        tagInputValue={tagInputValue}
                        setTagInputValue={setTagInputValue}
                        handleAddTag={handleAddTag}
                        handleRemoveTag={handleRemoveTag}
                        exportDropdown={exportDropdown}
                        setExportDropdown={setExportDropdown}
                        exporting={exporting}
                        handleExport={handleExport}
                        handleSummary={handleSummary}
                        retrying={retrying}
                        retryEntry={retryEntry}
                        deleteEntry={deleteEntry}
                        copyText={copyText}
                        audioPlayingEntryId={audioPlayingEntryId}
                        audioCurrentTime={audioCurrentTime}
                        audioTotalDuration={audioTotalDuration}
                        setAudioPlayingEntryId={setAudioPlayingEntryId}
                        setAudioCurrentTime={setAudioCurrentTime}
                        setAudioTotalDuration={setAudioTotalDuration}
                        m={m}
                        uiLanguage={uiLanguage}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {hasMore && !searchQuery && statusFilter === "all" && (
                <Button variant="secondary" className="w-full py-2 rounded-xl" onClick={() => loadHistory(false)}>
                  {m.loadMore}
                </Button>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <HistorySummaryModal summaryModal={summaryModal} setSummaryModal={setSummaryModal} m={m} />

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

      <FloatingRecordButton isRecording={false} onPress={() => {}} />

      <HistoryUploadDialog
        uploadConfirm={uploadConfirm}
        setUploadConfirm={setUploadConfirm}
        handleUploadConfirm={handleUploadConfirm}
        m={m}
      />
    </div>
  );
}
