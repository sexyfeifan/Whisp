import { Sparkles, X, Loader2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export interface SummaryResult {
  title: string;
  summary: string;
  todos: string[];
  keywords: string[];
}

export interface SummaryModalState {
  entry: { id: number; text: string };
  result?: SummaryResult;
  loading: boolean;
  error?: string;
}

interface HistorySummaryModalProps {
  summaryModal: SummaryModalState | null;
  setSummaryModal: (modal: SummaryModalState | null) => void;
  m: Record<string, string>;
}

export function HistorySummaryModal({ summaryModal, setSummaryModal, m }: HistorySummaryModalProps) {
  if (!summaryModal) return null;

  return (
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
                  const boldMatch = trimmed.match(/^\*\*(.+?)\*\*:?\s*(.*)/);
                  if (boldMatch) {
                    return <p key={i}><strong className="font-semibold">{boldMatch[1]}</strong>{boldMatch[2] ? `: ${boldMatch[2]}` : ''}</p>;
                  }
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
  );
}
