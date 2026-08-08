export function FilterChip({
  active, label, onClick,
}: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs transition-colors"
      style={{
        background: active ? "hsl(var(--primary))" : "hsl(var(--surface))",
        color: active ? "hsl(var(--on-primary))" : "hsl(var(--ink))",
        border: active ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--hairline))",
      }}
    >
      {label}
    </button>
  );
}
