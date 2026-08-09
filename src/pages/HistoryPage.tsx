import { useState } from "react";
import { motion } from "framer-motion";
import {
  Mic, Search, Copy, Trash2,
  Play, Pause, Check, Volume2, Clock, FileAudio,
  RefreshCw, Loader2,
  Download, FileText, ChevronDown, Sparkles, X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { FilterChip } from "../components/FilterChip";
import { StatCard } from "../components/StatCard";
import { IconButton } from "../components/IconButton";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { translateShortcut, formatTemplate, formatTime, formatDuration, displaySpeechLanguage } from "../lib/utils";

export function HistoryPage(app: AppState) {
  const {
    settings, filteredHistory, stats, todayCount, errorMsg, polishErrorMsg,
    settingsFeedback, searchQuery, setSearchQuery, statusFilter, setStatusFilter,
    selectedIds, setSelectedIds, expandedId, setExpandedId, copied, setCopied,
    retrying, hasMore, deleteEntry, deleteSelected, clearHistory, confirmingClear,
    retryEntry, copyText, playAudio, playingAudioId, audioUrls, loadHistory, m, uiLanguage,
    view, navItems, darkMode, setDarkMode, updateStatus, appVersion, checkForUpdates,
    flushAutoSave, setView, history,
  } = app;

  if (!settings) return null;

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar view={view} navItems={navItems} darkMode={darkMode} setDarkMode={setDarkMode} updateStatus={updateStatus} appVersion={appVersion} checkForUpdates={checkForUpdates} flushAutoSave={flushAutoSave} setView={setView} m={m} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--ink))" }}>{m.history}</h1>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>
              {formatTemplate(m.startHint, { shortcut: translateShortcut(settings.shortcut || "") })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button variant="danger" size="sm" onClick={deleteSelected}>
                {m.deleteSelected} ({selectedIds.size})
              </Button>
            )}
            <Button
              variant={confirmingClear ? "danger" : "secondary"}
              size="sm"
              onClick={clearHistory}
            >
              {confirmingClear ? m.clearConfirm : m.clear}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try { const csv = await invoke<string>("export_history"); await writeText(csv); }
                catch (error) { console.error("Export failed:", error); }
              }}
            >
              {m.exportHistory}
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="px-6 pb-3 grid grid-cols-4 gap-3">
          <StatCard
            icon={<FileAudio size={18} className="text-[hsl(var(--primary))]" />}
            label={m.statsTotal}
            value={String(stats.total)}
          />
          <StatCard
            icon={<Clock size={18} className="text-[hsl(var(--primary))]" />}
            label={m.statsToday}
            value={String(todayCount)}
          />
          <StatCard
            icon={<Check size={18} className="text-[hsl(var(--primary))]" />}
            label={m.statsSuccess}
            value={stats.total > 0 ? `${Math.round((stats.success / stats.total) * 100)}%` : "\u2014"}
          />
          <StatCard
            icon={<Volume2 size={18} className="text-[hsl(var(--primary))]" />}
            label={m.audioSaved}
            value={String(stats.audioSaved)}
          />
        </div>
        {(stats.totalCost > 0 || stats.totalTokens > 0) && (
          <div className="px-6 pb-3 flex gap-4 text-xs" style={{ color: "hsl(var(--steel))" }}>
            {stats.totalCost > 0 && <span>{m.totalCost}: <strong style={{ color: "hsl(var(--ink))" }}>{"\u00a5"}{stats.totalCost.toFixed(4)}</strong></span>}
            {stats.totalTokens > 0 && <span>{m.totalTokens}: <strong style={{ color: "hsl(var(--ink))" }}>{stats.totalTokens.toLocaleString()}</strong></span>}
          </div>
        )}

        {/* Search and filters */}
        <div className="px-6 pb-3 space-y-2">
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
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {filteredHistory.length === 0 ? (
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
              className="space-y-2"
            >
              {filteredHistory.map((entry) => {
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
                        <div>
                          <div className="text-sm" style={{ color: "hsl(var(--destructive))" }}>{entry.error_message ?? entry.text}</div>
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
                        <div className="text-sm cursor-pointer" onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} style={{ userSelect: "text", color: "hsl(var(--ink))" }}>
                          {expandedId === entry.id || entry.text.length <= 120 ? `${entry.text}` : `${entry.text.slice(0, 120)}...`}
                        </div>
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
                        {canRetry && (
                          <IconButton title={m.retry} onClick={() => retryEntry(entry.id)}>
                            {retrying === entry.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </IconButton>
                        )}
                        {!failed && (
                          <div className="relative">
                            <IconButton title={m.exportFormat} onClick={() => setExportDropdown(exportDropdown === entry.id ? null : entry.id)}>
                              <Download size={14} />
                            </IconButton>
                            {exportDropdown === entry.id && (
                              <div className="absolute right-0 top-full mt-1 z-50 rounded-lg shadow-lg border py-1 min-w-[160px]" style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--hairline))" }}>
                                {(["srt", "vtt", "markdown", "txt"] as const).map((fmt) => (
                                  <button
                                    key={fmt}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[hsl(var(--surface))] transition-colors flex items-center gap-2"
                                    style={{ color: "hsl(var(--ink))" }}
                                    onClick={async () => {
                                      setExporting(`${entry.id}-${fmt}`);
                                      setExportDropdown(null);
                                      try {
                                        const result = await invoke<{ content: string; format: string; filename: string }>("export_transcription", { entryId: entry.id, format: fmt });
                                        const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = result.filename;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      } catch (e) { console.error("Export failed:", e); }
                                      finally { setExporting(null); }
                                    }}
                                  >
                                    <FileText size={12} />
                                    {fmt === "srt" ? m.exportSrt : fmt === "vtt" ? m.exportVtt : fmt === "markdown" ? m.exportMarkdown : m.exportTxt}
                                    {exporting === `${entry.id}-${fmt}` && <Loader2 size={12} className="animate-spin ml-auto" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {!failed && (
                          <IconButton
                            title={m.aiSummary}
                            onClick={async () => {
                              setSummaryModal({ entry: { id: entry.id, text: entry.text }, loading: true });
                              try {
                                const result = await invoke<{ summary: string; key_points: string[]; action_items: string[] }>("generate_summary", { entryId: entry.id });
                                setSummaryModal({ entry: { id: entry.id, text: entry.text }, result, loading: false });
                              } catch (e: any) {
                                setSummaryModal({ entry: { id: entry.id, text: entry.text }, loading: false, error: String(e) });
                              }
                            }}
                          >
                            <Sparkles size={14} />
                          </IconButton>
                        )}
                        <IconButton title={m.delete} onClick={() => deleteEntry(entry.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>

                    {/* Audio player */}
                    {entry.audio_path && !audioUrls[entry.id] && (
                      <div className="mt-2">
                        <button
                          onClick={() => playAudio(entry.audio_path!, entry.id)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border-none cursor-pointer text-xs transition-colors"
                          style={{
                            background: "hsl(var(--surface))",
                            color: playingAudioId === entry.id ? "hsl(var(--primary))" : "hsl(var(--steel))",
                          }}
                        >
                          {playingAudioId === entry.id ? <Pause size={14} /> : <Play size={14} />}
                          {playingAudioId === entry.id ? m.pauseAudio : m.playAudio}
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })}
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
    </div>
  );
}
  const [exportDropdown, setExportDropdown] = useState<number | null>(null);
  const [summaryModal, setSummaryModal] = useState<{ entry: { id: number; text: string }; result?: { summary: string; key_points: string[]; action_items: string[] }; loading: boolean; error?: string } | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
