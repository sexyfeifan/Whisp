import { AudioLines } from "lucide-react";

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[7px]"
      style={{
        width: size,
        height: size,
        color: "hsl(var(--brand-foreground))",
        background: "linear-gradient(135deg, hsl(var(--brand)), hsl(var(--brand-glow)))",
        border: "1px solid hsl(var(--brand-glow) / 0.35)",
        boxShadow: "0 5px 14px hsl(var(--brand) / 0.18)",
      }}
      aria-hidden="true"
    >
      <AudioLines size={Math.max(14, Math.round(size * 0.58))} strokeWidth={2} />
    </span>
  );
}
