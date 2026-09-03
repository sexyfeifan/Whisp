import { Zap } from "lucide-react";
import { Card } from "../ui/card";

interface TodayStats {
  total: number;
  success: number;
}

interface StatsTodayOverviewProps {
  todayStats: TodayStats;
  m: Record<string, string>;
}

export function StatsTodayOverview({ todayStats, m }: StatsTodayOverviewProps) {
  const todaySuccessRate = todayStats.total > 0
    ? Math.round((todayStats.success / todayStats.total) * 100)
    : 0;

  return (
    <Card
      className="mb-6 p-5"
      style={{
        background: "linear-gradient(135deg, hsl(var(--primary) / 0.06) 0%, transparent 70%)",
        borderColor: "hsl(var(--primary) / 0.15)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} className="text-[hsl(var(--primary))]" />
        <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>
          {m.statsTodayOverview ?? "Today Overview"}
        </h2>
      </div>
      {todayStats.total === 0 ? (
        <p className="text-xs" style={{ color: "hsl(var(--steel))" }}>
          {m.statsNoData ?? "No transcriptions yet today"}
        </p>
      ) : (
        <div className="flex items-center gap-12">
          <div>
            <p className="text-3xl font-bold" style={{ color: "hsl(var(--ink))" }}>
              {todayStats.total}
            </p>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>
              {m.statsTotalTranscriptions ?? "Transcriptions"}
            </p>
          </div>
          <div className="w-px h-12" style={{ background: "hsl(var(--hairline))" }} />
          <div>
            <p className="text-3xl font-bold" style={{ color: "hsl(var(--success))" }}>
              {todaySuccessRate}%
            </p>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>
              {m.statsSuccess ?? "Success Rate"}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
