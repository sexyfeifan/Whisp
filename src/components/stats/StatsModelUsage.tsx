import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { Card } from "../ui/card";

export interface ModelBucket {
  model: string;
  count: number;
}

interface StatsModelUsageProps {
  topModels: ModelBucket[];
  total: number;
  maxModelCount: number;
  m: Record<string, string>;
}

export function StatsModelUsage({ topModels, total, maxModelCount, m }: StatsModelUsageProps) {
  return (
    <Card className="p-5 bg-[hsl(var(--canvas))]">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-[hsl(var(--primary))]" />
        <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>
          {m.statsTopModels ?? "Model Usage"}
        </h2>
      </div>
      {topModels.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-xs" style={{ color: "hsl(var(--steel))" }}>
          {m.statsNoData ?? "No data yet"}
        </div>
      ) : (
        <div className="space-y-3">
          {topModels.map((mod, i) => {
            const pct = Math.round((mod.count / total) * 100);
            const maxNameLen = 28;
            const displayName = mod.model.length > maxNameLen ? mod.model.slice(0, maxNameLen - 1) + "…" : mod.model;
            return (
              <div key={i}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-mono truncate mr-2" style={{ color: "hsl(var(--ink))" }} title={mod.model}>
                    {displayName}
                  </span>
                  <span className="text-xs font-semibold shrink-0" style={{ color: "hsl(var(--steel))" }}>
                    {mod.count} <span className="opacity-60">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(var(--hairline))" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "hsl(var(--accent-teal))" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(mod.count / maxModelCount) * 100}%` }}
                    transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
