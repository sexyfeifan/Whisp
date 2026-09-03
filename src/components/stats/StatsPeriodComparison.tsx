import { Calendar } from "lucide-react";
import { Card } from "../ui/card";
import { formatDuration } from "../../lib/utils";

interface PeriodStats {
  total: number;
  success: number;
  cost: number;
  tokens: number;
  avgDuration: number;
}

interface StatsPeriodComparisonProps {
  todayStats: PeriodStats;
  monthlyStats: PeriodStats;
  m: Record<string, string>;
}

export function StatsPeriodComparison({ todayStats, monthlyStats, m }: StatsPeriodComparisonProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Today */}
      <Card className="p-5 bg-[hsl(var(--canvas))]">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-[hsl(var(--primary))]" />
          <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>
            {m.statsTodaySummary ?? "Today's Summary"}
          </h2>
        </div>
        {todayStats.total === 0 ? (
          <div className="text-xs" style={{ color: "hsl(var(--steel))" }}>
            {m.statsNoData ?? "No data yet"}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.statsTotalTranscriptions ?? "Transcriptions"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>{todayStats.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.statsSuccess ?? "Success Rate"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--success))" }}>
                {todayStats.total > 0 ? `${Math.round((todayStats.success / todayStats.total) * 100)}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.totalCost ?? "Cost"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                {todayStats.cost > 0 ? `¥${todayStats.cost.toFixed(4)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.statsAvgDuration ?? "Avg Duration"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                {todayStats.avgDuration > 0 ? formatDuration(todayStats.avgDuration) : "—"}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Monthly */}
      <Card className="p-5 bg-[hsl(var(--canvas))]">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-[hsl(var(--primary))]" />
          <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>
            {m.statsMonthlySummary ?? "Monthly Summary"}
          </h2>
        </div>
        {monthlyStats.total === 0 ? (
          <div className="text-xs" style={{ color: "hsl(var(--steel))" }}>
            {m.statsNoData ?? "No data yet"}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.statsTotalTranscriptions ?? "Transcriptions"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>{monthlyStats.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.statsSuccess ?? "Success Rate"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--success))" }}>
                {monthlyStats.total > 0 ? `${Math.round((monthlyStats.success / monthlyStats.total) * 100)}%` : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.totalCost ?? "Cost"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                {monthlyStats.cost > 0 ? `¥${monthlyStats.cost.toFixed(4)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{m.statsAvgDuration ?? "Avg Duration"}</span>
              <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                {monthlyStats.avgDuration > 0 ? formatDuration(monthlyStats.avgDuration) : "—"}
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
