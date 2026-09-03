import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { Card } from "../ui/card";

export interface LangBucket {
  language: string;
  count: number;
}

interface StatsLanguageDistributionProps {
  langDistribution: LangBucket[];
  totalLangCount: number;
  m: Record<string, string>;
}

export function StatsLanguageDistribution({ langDistribution, totalLangCount, m }: StatsLanguageDistributionProps) {
  return (
    <Card className="p-5 bg-[hsl(var(--canvas))]">
      <div className="flex items-center gap-2 mb-4">
        <Globe size={16} className="text-[hsl(var(--primary))]" />
        <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>
          {m.statsLanguageDistribution ?? "Language Distribution"}
        </h2>
      </div>
      {langDistribution.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-xs" style={{ color: "hsl(var(--steel))" }}>
          {m.statsNoData ?? "No data yet"}
        </div>
      ) : (
        <div className="space-y-3">
          {langDistribution.map((l, i) => {
            const pct = totalLangCount > 0 ? Math.round((l.count / totalLangCount) * 100) : 0;
            const maxLangCount = langDistribution[0]?.count ?? 1;
            return (
              <div key={i}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium" style={{ color: "hsl(var(--ink))" }}>
                    {l.language.toUpperCase()}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "hsl(var(--steel))" }}>
                    {l.count} <span className="opacity-60">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(var(--hairline))" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "hsl(var(--accent-amber))" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(l.count / maxLangCount) * 100}%` }}
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
