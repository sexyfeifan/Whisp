import { motion } from "framer-motion";
import {
  Copy, Trash2, RefreshCw, Loader2, Download, FileText,
  Sparkles, X, Tag, Plus,
} from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { IconButton } from "../IconButton";
import { AudioPlayer } from "../AudioPlayer";
import { formatTime, formatDuration, displaySpeechLanguage, cn } from "../../lib/utils";
import type { UiLanguage } from "../../lib/constants";
import type { HistoryEntry } from "../../types";

interface HistoryEntryCardProps {
  entry: HistoryEntry;
  selectedIds: Set<number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  expandedId: number | null;
  setExpandedId: React.Dispatch<React.SetStateAction<number | null>>;
  copied: number | null;
  setCopied: React.Dispatch<React.SetStateAction<number | null>>;
  showPolished: Record<number, boolean>;
  setShowPolished: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  entryTags: Record<number, string[]>;
  addingTagToEntry: number | null;
  setAddingTagToEntry: (id: number | null) => void;
  tagInputValue: string;
  setTagInputValue: (val: string) => void;
  handleAddTag: (entryId: number, tag: string) => Promise<void>;
  handleRemoveTag: (entryId: number, tag: string) => Promise<void>;
  exportDropdown: number | null;
  setExportDropdown: (id: number | null) => void;
  exporting: string | null;
  handleExport: (entryId: number, fmt: string) => Promise<void>;
  handleSummary: (entryId: number, text: string) => Promise<void>;
  retrying: number | null;
  retryEntry: (id: number) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  copyText: (text: string, id: number) => Promise<void>;
  audioPlayingEntryId: number | null;
  audioCurrentTime: number;
  audioTotalDuration: number;
  setAudioPlayingEntryId: (id: number | null) => void;
  setAudioCurrentTime: (t: number) => void;
  setAudioTotalDuration: (d: number) => void;
  m: Record<string, string>;
  uiLanguage: UiLanguage;
}

export function HistoryEntryCard({
  entry, selectedIds, setSelectedIds, expandedId, setExpandedId,
  copied, setCopied, showPolished, setShowPolished,
  entryTags, addingTagToEntry, setAddingTagToEntry,
  tagInputValue, setTagInputValue, handleAddTag, handleRemoveTag,
  exportDropdown, setExportDropdown, exporting, handleExport,
  handleSummary, retrying, retryEntry, deleteEntry, copyText,
  audioPlayingEntryId, audioCurrentTime, audioTotalDuration,
  setAudioPlayingEntryId, setAudioCurrentTime, setAudioTotalDuration,
  m, uiLanguage,
}: HistoryEntryCardProps) {
  const failed = entry.status === "failed";
  const canRetry = Boolean(entry.audio_path);

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: "0 4px 12px hsl(0 0% 0% / 0.08)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card
        className="p-4 border-[hsl(var(--hairline))]"
        style={{
          borderColor: failed ? "hsl(var(--destructive) / 0.3)" : undefined,
        }}
      >
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
                  if (audioPlayingEntryId === entry.id && audioTotalDuration > 0 && audioCurrentTime > 0) {
                    const progressRatio = Math.min(1, audioCurrentTime / audioTotalDuration);
                    const fullText = activeText;
                    let rawIdx = Math.floor(fullText.length * progressRatio);
                    if (rawIdx > 0 && rawIdx < fullText.length) {
                      const searchRange = fullText.slice(Math.max(0, rawIdx - 8), rawIdx + 8);
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

        {/* Tags */}
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

        {/* Audio player */}
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
    </motion.div>
  );
}
