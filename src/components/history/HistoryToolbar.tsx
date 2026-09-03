import { Download, FileText, Upload, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "../ui/button";
import { translateShortcut, formatTemplate } from "../../lib/utils";
import type { AppSettings } from "../../types";

interface HistoryToolbarProps {
  selectedIds: Set<number>;
  history: unknown[];
  m: Record<string, string>;
  settings: AppSettings;
  deleteSelected: () => Promise<void>;
  handleUploadAudio: () => void;
  uploadingFile: boolean;
  batchExportOpen: boolean;
  setBatchExportOpen: (open: boolean) => void;
  handleBatchExport: (fmt: string) => Promise<void>;
  setShowClearConfirm: (show: boolean) => void;
}

export function HistoryToolbar({
  selectedIds, history, m, settings,
  deleteSelected, handleUploadAudio, uploadingFile,
  batchExportOpen, setBatchExportOpen, handleBatchExport,
  setShowClearConfirm,
}: HistoryToolbarProps) {
  return (
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
  );
}
