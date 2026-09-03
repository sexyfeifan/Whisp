import { useState } from "react";
import { motion } from "framer-motion";

const CHART_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6))",
  "hsl(var(--chart-7))", "hsl(var(--chart-8))",
];

export interface DayBucket {
  label: string;
  date: Date;
  count: number;
}

export function StatsBarChart({ data }: { data: DayBucket[] }) {
  const [hoveredBar, setHoveredBar] = useState<{ index: number; x: number; y: number } | null>(null);
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
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Daily usage bar chart">
        <defs>
          <linearGradient id="today-bar-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
          </linearGradient>
        </defs>

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
                <text x={padLeft - 2} y={y + 3} textAnchor="end" fontSize="9" fill="hsl(var(--steel))">
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
          const isToday = i === data.length - 1;
          const hasData = d.count > 0;
          const color = isToday ? "url(#today-bar-gradient)" : hasData ? CHART_COLORS[i % CHART_COLORS.length] : "hsl(var(--hairline))";

          return (
            <g key={i}>
              <motion.rect
                x={x}
                width={barW}
                rx="4" ry="4"
                fill={color}
                opacity={isToday ? 1 : hasData ? 0.75 : 0.3}
                initial={{ y: padTop + plotH, height: 0 }}
                animate={{ y, height: Math.max(barH, 0) }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  const parentRect = (e.target as SVGRectElement).closest(".relative")?.getBoundingClientRect();
                  if (parentRect) {
                    setHoveredBar({
                      index: i,
                      x: rect.left - parentRect.left + rect.width / 2,
                      y: rect.top - parentRect.top - 8,
                    });
                  }
                }}
                onMouseLeave={() => setHoveredBar(null)}
                style={{ cursor: hasData ? "pointer" : "default" }}
              />
              {/* Day label */}
              <text
                x={x + barW / 2} y={h - 6}
                textAnchor="middle" fontSize="9"
                fill={isToday ? "hsl(var(--primary))" : "hsl(var(--steel))"}
                fontWeight={isToday ? 600 : 400}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredBar && data[hoveredBar.index]?.count > 0 && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-md text-xs font-semibold shadow-lg"
          style={{
            left: hoveredBar.x,
            top: hoveredBar.y,
            transform: "translate(-50%, -100%)",
            background: "hsl(var(--ink))",
            color: "hsl(var(--canvas))",
          }}
        >
          {data[hoveredBar.index].count} {data[hoveredBar.index].count === 1 ? "transcription" : "transcriptions"}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: -4,
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "4px solid hsl(var(--ink))",
            }}
          />
        </div>
      )}
    </div>
  );
}
