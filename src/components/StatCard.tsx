import type React from "react";
import { Card } from "./ui/card";

export function StatCard({
  icon,
  label,
  value,
  tone = "var(--chart-1)",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card className="p-4 bg-[hsl(var(--canvas))]">
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
