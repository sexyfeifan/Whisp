import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, DollarSign, Hash, Clock, FileAudio,
  TrendingUp, Calendar,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Sidebar } from "../components/Sidebar";
import type { AppState } from "../hooks/useApp";
import { viewVariants } from "../lib/constants";
import { formatDuration } from "../lib/utils";

// Warm palette for charts — Notion-inspired
const CHART_COLORS = [
  "#E16259", // warm red
  "#F2A65A", // warm orange
  "#F4D03F", // warm yellow
  "#58D68D", // warm green
  "#5DADE2", // blue
  "#AF7AC5", // purple
  "#EC7063", // coral
  "#7FB3D8", // steel blue
];

interface DayBucket {
  label: string;
  date: Date;
  count: number;
}

function computeDailyUsage(history: AppState["history"]): DayBucket[] {
  const now = new Date();
  const buckets: DayBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    buckets.push({ label, date: d, count: 0 });
  }
  for (const entry of history) {
    const ts = entry.timestamp * 1000;
    for (const b of buckets) {
      const start = b.date.getTime();
      const end = new Date(b.date).setHours(23, 59, 59, 999);
      if (ts >= start && ts <= end) {
        b.count++;
        break;
      }
    }
  }
  return buckets;
}

interface ModelBucket {
  model: string;
  count: number;
}

function computeTopModels(history: AppState["history"]): ModelBucket[] {
  const map = new Map<string, number>();
  for (const entry of history) {
    const m = entry.model || "unknown";
    map.set(m, (map.get(m) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function computeTodayStats(history: AppState["history"]) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = now.getTime() / 1000;
  const today = history.filter((e) => e.timestamp >= start);
  const total = today.length;
  const success = today.filter((e) => e.status === "success").length;
  const cost = today.reduce((s, e) => s + (e.estimated_cost || 0), 0);
  const tokens = today.reduce((s, e) => s + (e.polish_tokens || 0), 0);
  const totalDuration = today.reduce((s, e) => s + (e.duration_ms || 0), 0);
  const avgDuration = total > 0 ? totalDuration / total : 0;
  return { total, success, cost, tokens, avgDuration };
}

function computeMonthlyStats(history: AppState["history"]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = startOfMonth.getTime() / 1000;
  const month = history.filter((e) => e.timestamp >= start);
  const total = month.length;
  const success = month.filter((e) => e.status === "success").length;
  const cost = month.reduce((s, e) => s + (e.estimated_cost || 0), 0);
  const tokens = month.reduce((s, e) => s + (e.polish_tokens || 0), 0);
  const totalDuration = month.reduce((s, e) => s + (e.duration_ms || 0), 0);
  const avgDuration = total > 0 ? totalDuration / total : 0;
  return { total, success, cost, tokens, avgDuration };
}

function BarChart({ data }: { data: DayBucket[] }) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const w = 460;
  const h = 160;
  const padLeft = 4;
  const padRight = 4;
  const padTop = 12;
  const padBottom = 24;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;
  const barW = Math.min(36, (plotW / data.length) * 0.6);
  const gap = plotW / data.length;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padTop + plotH * (1 - frac);
        return (
          <g key={frac}>
            <line
              x1={padLeft} y1={y} x2={w - padRight} y2={y}
              stroke="hsl(var(--hairline))" strokeWidth="0.5" strokeDasharray="3 3"
            />
            {frac > 0 && (
              <text
                x={padLeft - 2} y={y + 3}
                textAnchor="end" fontSize="9" fill="hsl(var(--steel))"
              >
                {Math.round(maxVal * frac)}
              </text>
            )}
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH = maxVal > 0 ? (d.count / maxVal) * plotH : 0;
        const x = padLeft + gap * i + (gap - barW) / 2;
        const y = padTop + plotH - barH;
        const color = d.count > 0 ? CHART_COLORS[i % CHART_COLORS.length] : "hsl(var(--hairline))";
        const today = i === data.length - 1;
        return (
          <g key={i}>
            {/* Bar */}
            <rect
              x={x} y={y} width={barW} height={Math.max(barH, 0)}
              rx="4" ry="4"
              fill={color}
              opacity={today ? 1 : 0.75}
            />
            {/* Value label */}
            {d.count > 0 && (
              <text
                x={x + barW / 2} y={y - 5}
                textAnchor="middle" fontSize="10" fontWeight="600"
                fill="hsl(var(--ink))"
              >
                {d.count}
              </text>
            )}
            {/* Day label */}
            <text
              x={x + barW / 2} y={h - 6}
              textAnchor="middle" fontSize="9"
              fill={today ? "hsl(var(--primary))" : "hsl(var(--steel))"}
              fontWeight={today ? 600 : 400}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChart({ data }: { data: ModelBucket[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;
  const r = 70;
  const cx = 90;
  const cy = 90;
  const w = 300;
  const h = 190;

  let cumulativeAngle = 0;
  const slices = data.map((d) => {
    const fraction = d.count / total;
    const angle = fraction * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    const endAngle = cumulativeAngle;
    // SVG arc path
    const x1 = cx + r * Math.sin(startAngle);
    const y1 = cy - r * Math.cos(startAngle);
    const x2 = cx + r * Math.sin(endAngle);
    const y2 = cy - r * Math.cos(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const dPath = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...d, fraction, dPath, startAngle, endAngle };
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img">
      {slices.map((s, i) => (
        <path key={i} d={s.dPath} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="hsl(var(--background))" strokeWidth="1.5" />
      ))}
      {/* Center text */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="hsl(var(--ink))">
        {total}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="hsl(var(--steel))">
        total
      </text>

      {/* Legend */}
      {slices.map((s, i) => {
        const ly = 16 + i * 20;
        return (
          <g key={i}>
            <rect x={175} y={ly - 6} width={10} height={10} rx="2" fill={CHART_COLORS[i % CHART_COLORS.length]} />
            <text x={190} y={ly + 3} fontSize="10" fill="hsl(var(--ink))" style={{ fontFamily: "monospace" }}>
              {s.model.length > 14 ? s.model.slice(0, 13) + "…" : s.model}
            </text>
            <text x={280} y={ly + 3} textAnchor="end" fontSize="10" fill="hsl(var(--steel))">
              {Math.round(s.fraction * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SummaryCard({ icon, label, value, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="p-4 bg-[hsl(var(--surface))]">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px]" style={{ color: "hsl(var(--steel))" }}>{label}</p>
          <p className="text-xl font-bold truncate" style={{ color: "hsl(var(--ink))" }}>{value}</p>
          {sub && (
            <p className="text-[10px] mt-0.5" style={{ color: "hsl(var(--steel))" }}>{sub}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function StatsPage(app: AppState) {
  const {
    history, stats, m, view, navItems,
    darkMode, setDarkMode, updateStatus, appVersion,
    checkForUpdates, flushAutoSave, setView,
    settings,
  } = app;

  const dailyData = useMemo(() => computeDailyUsage(history), [history]);
  const topModels = useMemo(() => computeTopModels(history), [history]);
  const todayStats = useMemo(() => computeTodayStats(history), [history]);
  const monthlyStats = useMemo(() => computeMonthlyStats(history), [history]);

  if (!settings) return null;

  const avgDurationAll = stats.total > 0
    ? history.reduce((s, e) => s + (e.duration_ms || 0), 0) / stats.total
    : 0;

  const mStats = (m as Record<string, string>);
  const title = mStats.stats ?? "Usage Statistics";

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar
        view={view} navItems={navItems} darkMode={darkMode}
        setDarkMode={setDarkMode} updateStatus={updateStatus}
        appVersion={appVersion} checkForUpdates={checkForUpdates}
        flushAutoSave={flushAutoSave} setView={setView} m={m}
      />
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key="stats"
          variants={viewVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-6"
        >
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--ink))" }}>{title}</h1>
          </div>

          {/* Summary cards row */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <SummaryCard
              icon={<FileAudio size={18} className="text-[hsl(var(--primary))]" />}
              label={mStats.statsTotalTranscriptions ?? "Total Transcriptions"}
              value={String(stats.total)}
            />
            <SummaryCard
              icon={<DollarSign size={18} className="text-[hsl(var(--primary))]" />}
              label={mStats.totalCost ?? "Total Cost"}
              value={stats.totalCost > 0 ? `¥${stats.totalCost.toFixed(2)}` : "—"}
            />
            <SummaryCard
              icon={<Hash size={18} className="text-[hsl(var(--primary))]" />}
              label={mStats.totalTokens ?? "Total Tokens"}
              value={stats.totalTokens > 0 ? stats.totalTokens.toLocaleString() : "—"}
            />
            <SummaryCard
              icon={<Clock size={18} className="text-[hsl(var(--primary))]" />}
              label={mStats.statsAvgDuration ?? "Avg Duration"}
              value={avgDurationAll > 0 ? formatDuration(avgDurationAll) : "—"}
            />
          </div>

          {/* Two-column layout: daily chart + pie chart */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Daily usage chart */}
            <Card className="p-5 bg-[hsl(var(--surface))]">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                  {mStats.statsDailyUsage ?? "Daily Usage"} <span className="font-normal text-[11px]" style={{ color: "hsl(var(--steel))" }}>(7d)</span>
                </h2>
              </div>
              {history.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-xs" style={{ color: "hsl(var(--steel))" }}>
                  {mStats.statsNoData ?? "No data yet"}
                </div>
              ) : (
                <BarChart data={dailyData} />
              )}
            </Card>

            {/* Top models pie chart */}
            <Card className="p-5 bg-[hsl(var(--surface))]">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={16} className="text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                  {mStats.statsTopModels ?? "Top Models"}
                </h2>
              </div>
              {topModels.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-xs" style={{ color: "hsl(var(--steel))" }}>
                  {mStats.statsNoData ?? "No data yet"}
                </div>
              ) : (
                <PieChart data={topModels} />
              )}
            </Card>
          </div>

          {/* Today & Monthly comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Today */}
            <Card className="p-5 bg-[hsl(var(--surface))]">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={16} className="text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                  {mStats.statsTodaySummary ?? "Today's Summary"}
                </h2>
              </div>
              {todayStats.total === 0 ? (
                <div className="text-xs" style={{ color: "hsl(var(--steel))" }}>
                  {mStats.statsNoData ?? "No data yet"}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.statsTotalTranscriptions ?? "Transcriptions"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>{todayStats.total}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.statsSuccess ?? "Success Rate"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--success))" }}>
                      {todayStats.total > 0 ? `${Math.round((todayStats.success / todayStats.total) * 100)}%` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.totalCost ?? "Cost"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                      {todayStats.cost > 0 ? `¥${todayStats.cost.toFixed(4)}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.statsAvgDuration ?? "Avg Duration"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                      {todayStats.avgDuration > 0 ? formatDuration(todayStats.avgDuration) : "—"}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            {/* Monthly */}
            <Card className="p-5 bg-[hsl(var(--surface))]">
              <div className="flex items-center gap-2 mb-4">
                <Calendar size={16} className="text-[hsl(var(--primary))]" />
                <h2 className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                  {mStats.statsMonthlySummary ?? "Monthly Summary"}
                </h2>
              </div>
              {monthlyStats.total === 0 ? (
                <div className="text-xs" style={{ color: "hsl(var(--steel))" }}>
                  {mStats.statsNoData ?? "No data yet"}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.statsTotalTranscriptions ?? "Transcriptions"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>{monthlyStats.total}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.statsSuccess ?? "Success Rate"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--success))" }}>
                      {monthlyStats.total > 0 ? `${Math.round((monthlyStats.success / monthlyStats.total) * 100)}%` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.totalCost ?? "Cost"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                      {monthlyStats.cost > 0 ? `¥${monthlyStats.cost.toFixed(4)}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "hsl(var(--steel))" }}>{mStats.statsAvgDuration ?? "Avg Duration"}</span>
                    <span className="text-sm font-semibold" style={{ color: "hsl(var(--ink))" }}>
                      {monthlyStats.avgDuration > 0 ? formatDuration(monthlyStats.avgDuration) : "—"}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
