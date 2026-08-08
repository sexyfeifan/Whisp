import type React from "react";
import { Card } from "./ui/card";

export function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4 bg-[hsl(var(--surface))]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[hsl(var(--primary)/0.1)] flex items-center justify-center">
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
