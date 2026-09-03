import type React from "react";
import { Card } from "./ui/card";

const accentMap: Record<string, { bg: string; border: string }> = {
  amber: { bg: "hsl(var(--accent-amber-light))", border: "hsl(var(--accent-amber) / 0.25)" },
  teal:  { bg: "hsl(var(--accent-teal-light))",  border: "hsl(var(--accent-teal) / 0.25)" },
};

export function StatCard({
  icon,
  label,
  value,
  tone = "var(--chart-1)",
  accent = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
  accent?: "default" | "amber" | "teal";
}) {
  const accentStyle = accent !== "default" ? accentMap[accent] : undefined;
  return (
    <Card
      className="p-4"
      style={{
        background: accentStyle ? accentStyle.bg : "hsl(var(--canvas))",
        borderColor: accentStyle ? accentStyle.border : undefined,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ color: `hsl(${tone})`, background: `hsl(${tone} / 0.12)` }}
        >
          {icon}
        </div>
        <div>
          <p className="text-[11px]" style={{ color: "hsl(var(--steel))" }}>{label}</p>
          <p className="text-xl font-bold" style={{ color: "hsl(var(--ink))" }}>{value}</p>
        </div>
      </div>
    </Card>
  );
}
