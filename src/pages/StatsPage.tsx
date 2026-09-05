import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  TrendingUp, FileAudio, Zap, CheckCircle2,
  Clock, DollarSign, Hash,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Sidebar } from "../components/Sidebar";
import {
  StatsSummaryCard,
  StatsBarChart,
  StatsModelUsage,
  StatsLanguageDistribution,
  StatsTodayOverview,
  StatsPeriodComparison,
} from "../components/stats";
import type { AppState } from "../hooks/useApp";
import { viewVariants } from "../lib/constants";
import { formatDuration } from "../lib/utils";

/* ─── Data computation (unchanged logic) ─── */

function computeDailyUsage(history: AppState["history"], m: Record<string, string>) {
  const now = new Date();
  const buckets: { label: string; date: Date; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const label = i === 0 ? (m.today ?? "Today") : i === 1 ? (m.yesterday ?? "Yesterday") : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    buckets.push({ label, date: d, count: 0 });
  }
  for (const entry of history) {
    const ts = entry.timestamp * 1000;
    for (const b of buckets) {
      const start = b.date.getTime();
      const end = new Date(b.date).setHours(23, 59, 59, 999);
      if (ts >= start && ts <= end) { b.count++; break; }
    }
  }
  return buckets;
}

function computeTopModels(history: AppState["history"]) {
  const map = new Map<string, number>();
  for (const entry of history) {
    map.set(entry.model || "unknown", (map.get(entry.model || "unknown") || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function computeLanguageDistribution(history: AppState["history"]) {
  const map = new Map<string, number>();
  for (const entry of history) {
    const lang = entry.language || "auto";
    map.set(lang, (map.get(lang) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function computePeriodStats(history: AppState["history"], startSec: number) {
  const filtered = history.filter((e) => e.timestamp >= startSec);
  const total = filtered.length;
  const success = filtered.filter((e) => e.status === "success").length;
  const cost = filtered.reduce((s, e) => s + (e.estimated_cost || 0), 0);
  const tokens = filtered.reduce((s, e) => s + (e.polish_tokens || 0), 0);
  const totalDuration = filtered.reduce((s, e) => s + (e.duration_ms || 0), 0);
  return { total, success, cost, tokens, avgDuration: total > 0 ? totalDuration / total : 0 };
}

/* ─── Main Page ─── */

export function StatsPage(app: AppState) {
  const {
    history, stats, m, view, navItems,
    darkMode, setDarkMode, flushAutoSave, setView,
    settings,
  } = app;

  const [completeHistory, setCompleteHistory] = useState<AppState["history"]>(history);

  useEffect(() => {
    let active = true;
    invoke<AppState["history"]>("get_history")
      .then((entries) => { if (active) setCompleteHistory(entries); })
      .catch(() => { if (active) setCompleteHistory(history); });
    return () => { active = false; };
  }, [history, stats.total]);

  const dailyData = useMemo(() => computeDailyUsage(completeHistory, m), [completeHistory, m]);
  const topModels = useMemo(() => computeTopModels(completeHistory), [completeHistory]);
  const langDistribution = useMemo(() => computeLanguageDistribution(completeHistory), [completeHistory]);

  const todayStats = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return computePeriodStats(completeHistory, now.getTime() / 1000);
  }, [completeHistory]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return computePeriodStats(completeHistory, startOfMonth.getTime() / 1000);
  }, [completeHistory]);

  // Weekly trend: this week vs last week
  const weeklyTrend = useMemo(() => {
    const now = new Date();
    const msPerDay = 86400000;
    // This week (0=Sun..6=Sat). We use rolling 7 days for "this week" and the 7 days before for "last week".
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const thisWeekStart = new Date(todayStart.getTime() - 6 * msPerDay);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * msPerDay);

    const thisWeekCount = completeHistory.filter(e => (e.timestamp * 1000) >= thisWeekStart.getTime()).length;
    const lastWeekCount = completeHistory.filter(e => {
      const ts = e.timestamp * 1000;
      return ts >= lastWeekStart.getTime() && ts < thisWeekStart.getTime();
    }).length;

    // Daily counts for sparkline (last 7 days, oldest → newest)
    const dailyCounts: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * msPerDay);
      const dayEnd = new Date(dayStart.getTime() + msPerDay - 1);
      const count = completeHistory.filter(e => {
        const ts = e.timestamp * 1000;
        return ts >= dayStart.getTime() && ts <= dayEnd.getTime();
      }).length;
      dailyCounts.push(count);
    }

    return { thisWeekCount, lastWeekCount, dailyCounts };
  }, [completeHistory]);

  if (!settings) return null;

  const avgDurationAll = stats.total > 0
    ? completeHistory.reduce((s, e) => s + (e.duration_ms || 0), 0) / stats.total
    : 0;

  const mStats = m as Record<string, string>;
  const title = mStats.stats ?? "Usage Statistics";
  const totalSuccessRate = stats.total > 0
    ? Math.round(((stats.total - (stats.failed ?? 0)) / stats.total) * 100)
    : 0;
  const maxModelCount = topModels.length > 0 ? topModels[0].count : 1;
  const totalLangCount = langDistribution.reduce((s, d) => s + d.count, 0);

  return (
    <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
      <Sidebar
        view={view} navItems={navItems} darkMode={darkMode}
        setDarkMode={setDarkMode}
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
          className="px-8 py-6"
        >
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--ink))" }}>{title}</h1>
          </div>

          {/* Today Overview */}
          <StatsTodayOverview todayStats={todayStats} m={mStats} />

          {/* Summary cards — Row 1 */}
          <h2 className="text-lg font-semibold mb-4" style={{ color: "hsl(var(--ink))" }}>
            {mStats.statsOverview ?? "Overview"}
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <StatsSummaryCard
              large
              icon={<FileAudio size={18} />}
              label={mStats.statsTotalTranscriptions ?? "Total Transcriptions"}
              value={String(stats.total)}
              sub={totalSuccessRate > 0 ? `${totalSuccessRate}% success` : undefined}
              tone="var(--chart-1)"
              weeklyData={weeklyTrend.dailyCounts}
              prevCount={weeklyTrend.lastWeekCount}
              currentCount={weeklyTrend.thisWeekCount}
            />
            <StatsSummaryCard
              large
              icon={<Zap size={18} />}
              label={mStats.statsTodayCount ?? "Today"}
              value={String(todayStats.total)}
              tone="var(--chart-4)"
              weeklyData={weeklyTrend.dailyCounts}
              prevCount={weeklyTrend.lastWeekCount}
              currentCount={weeklyTrend.thisWeekCount}
            />
            <StatsSummaryCard
              large
              icon={<CheckCircle2 size={18} />}
              label={mStats.statsSuccess ?? "Success Rate"}
              value={totalSuccessRate > 0 ? `${totalSuccessRate}%` : "—"}
              tone="var(--success)"
            />
          </div>

          {/* Summary cards — Row 2 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatsSummaryCard
              icon={<Clock size={18} />}
              label={mStats.statsAvgDuration ?? "Avg Duration"}
              value={avgDurationAll > 0 ? formatDuration(avgDurationAll) : "—"}
              tone="var(--chart-6)"
            />
            <StatsSummaryCard
              icon={<DollarSign size={18} />}
              label={mStats.totalCost ?? "Total Cost"}
              value={stats.totalCost > 0 ? `¥${stats.totalCost.toFixed(2)}` : "—"}
              tone="var(--chart-2)"
            />
            <StatsSummaryCard
              icon={<Hash size={18} />}
              label={mStats.totalTokens ?? "Total Tokens"}
              value={stats.totalTokens > 0 ? stats.totalTokens.toLocaleString() : "—"}
              tone="var(--chart-3)"
            />
          </div>

          {/* Daily usage chart */}
          <Card className="p-5 bg-[hsl(var(--canvas))] mb-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-[hsl(var(--primary))]" />
              <h2 className="text-lg font-semibold" style={{ color: "hsl(var(--ink))" }}>
                {mStats.statsDailyUsage ?? "Daily Usage"}{" "}
                <span className="font-normal text-[11px]" style={{ color: "hsl(var(--steel))" }}>(7d)</span>
              </h2>
            </div>
            {completeHistory.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-xs" style={{ color: "hsl(var(--steel))" }}>
                {mStats.statsNoData ?? "No data yet"}
              </div>
            ) : (
              <StatsBarChart data={dailyData} />
            )}
          </Card>

          {/* Model Usage & Language Distribution */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatsModelUsage topModels={topModels} total={stats.total} maxModelCount={maxModelCount} m={mStats} />
            <StatsLanguageDistribution langDistribution={langDistribution} totalLangCount={totalLangCount} m={mStats} />
          </div>

          {/* Today & Monthly comparison */}
          <StatsPeriodComparison todayStats={todayStats} monthlyStats={monthlyStats} m={mStats} />
        </motion.div>
      </div>
    </div>
  );
}
