import { useMemo } from "react";
import { Card } from "../ui/card";

interface StatsSummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  large?: boolean;
  /** Weekly counts for sparkline (7 elements, oldest → newest) */
  weeklyData?: number[];
  /** Count for previous period to compute trend */
  prevCount?: number;
  /** Count for current period to compute trend */
  currentCount?: number;
}

function Sparkline({ data, color = "#0080FF" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80;
  const h = 24;
  const padding = 2;
  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (w - padding * 2);
      const y = h - padding - (v / max) * (h - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  // Fill area points (close the polygon)
  const fillPoints = `${padding},${h - padding} ${points} ${w - padding},${h - padding}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <defs>
        <linearGradient id={`sparkline-fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#sparkline-fill-${color.replace("#", "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatsSummaryCard({
  icon, label, value, sub, tone = "var(--chart-1)", large,
  weeklyData, prevCount = 0, currentCount = 0,
}: StatsSummaryCardProps) {
  const trend = useMemo(() => {
    if (prevCount <= 0 && currentCount <= 0) return null;
    if (prevCount <= 0) return { direction: "up" as const, pct: 100 };
    const diff = currentCount - prevCount;
    const pct = Math.round(Math.abs(diff / prevCount) * 100);
    return {
      direction: diff >= 0 ? ("up" as const) : ("down" as const),
      pct,
    };
  }, [prevCount, currentCount]);

  return (
    <Card
      className="p-4 bg-[hsl(var(--canvas))]"
      style={{ borderLeft: `3px solid hsl(${tone})` }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ color: `hsl(${tone})`, background: `hsl(${tone} / 0.12)` }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px]" style={{ color: "hsl(var(--steel))" }}>{label}</p>
          <div className="flex items-center gap-2">
            <p
              className={`font-bold truncate ${large ? "text-3xl" : "text-xl"}`}
              style={{ color: "hsl(var(--ink))" }}
            >
              {value}
            </p>
            {trend && trend.pct > 0 && (
              <span
                className="text-[11px] font-semibold shrink-0"
                style={{ color: trend.direction === "up" ? "hsl(var(--success))" : "#ef4444" }}
              >
                {trend.direction === "up" ? "↑" : "↓"} {trend.pct}%
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            {sub && (
              <p className="text-[10px] mt-0.5" style={{ color: "hsl(var(--steel))" }}>{sub}</p>
            )}
            {weeklyData && weeklyData.some(v => v > 0) && (
              <div className="ml-auto">
                <Sparkline data={weeklyData} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
