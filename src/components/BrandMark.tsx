import { motion, useReducedMotion } from "framer-motion";
import { AudioLines } from "lucide-react";

/**
 * BrandMark — animated brand icon.
 * Wave-like idle pulse via Framer Motion; respects prefers-reduced-motion.
 * Future-proof: accepts `recording` prop for faster pulse.
 */
export function BrandMark({ size = 24, recording = false }: { size?: number; recording?: boolean }) {
  const reducedMotion = useReducedMotion();

  const iconSize = Math.max(14, Math.round(size * 0.58));

  /* Idle: gentle scale pulse; Recording: faster, wider pulse */
  const shouldAnimate = !reducedMotion;

  return (
    <motion.span
      className="inline-flex shrink-0 items-center justify-center rounded-[7px]"
      style={{
        width: size,
        height: size,
        color: "hsl(var(--brand-foreground))",
        background: "linear-gradient(135deg, hsl(var(--brand)), hsl(var(--brand-glow)))",
        border: "1px solid hsl(var(--brand-glow) / 0.35)",
        boxShadow: "0 5px 14px hsl(var(--brand) / 0.18)",
      }}
      animate={
        shouldAnimate
          ? {
              scale: [1, recording ? 1.06 : 1.03, 1],
              opacity: [1, recording ? 0.85 : 0.92, 1],
            }
          : undefined
      }
      transition={
        shouldAnimate
          ? {
              duration: recording ? 0.8 : 2.4,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : undefined
      }
      aria-hidden="true"
    >
      <AudioLines size={iconSize} strokeWidth={2} />
    </motion.span>
  );
}
