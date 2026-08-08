import { Switch } from "./ui/switch";

export function ToggleRow({
  label, description, value, onChange,
}: { label: string; description: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ border: "1px solid hsl(var(--hairline))" }}>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: "hsl(var(--ink))" }}>{label}</div>
        {description && (
          <div className="text-xs mt-0.5" style={{ color: "hsl(var(--steel))" }}>{description}</div>
        )}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
