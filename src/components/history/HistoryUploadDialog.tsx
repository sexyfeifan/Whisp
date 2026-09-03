import { useEffect, useCallback } from "react";
import { Upload, Sparkles } from "lucide-react";
import { Button } from "../ui/button";

export interface UploadConfirmState {
  fileName: string;
  file: File;
}

interface HistoryUploadDialogProps {
  uploadConfirm: UploadConfirmState | null;
  setUploadConfirm: (confirm: UploadConfirmState | null) => void;
  handleUploadConfirm: (polish: boolean) => Promise<void>;
  m: Record<string, string>;
}

export function HistoryUploadDialog({ uploadConfirm, setUploadConfirm, handleUploadConfirm, m }: HistoryUploadDialogProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setUploadConfirm(null);
  }, [setUploadConfirm]);

  useEffect(() => {
    if (uploadConfirm) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [uploadConfirm, handleEscape]);

  if (!uploadConfirm) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={m.selectAudioFile ?? "Audio File Selected"} style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setUploadConfirm(null)}>
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
  );
}
