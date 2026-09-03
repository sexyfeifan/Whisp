import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Reusable empty state — Minimalism & Swiss Style:
 * One focal point, generous whitespace, restrained colour.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col items-center justify-center py-16 text-center ${className}`}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "hsl(var(--surface))" }}
      >
        <Icon size={28} style={{ color: "hsl(var(--steel))" }} />
      </div>
      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: "hsl(var(--ink))" }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-sm max-w-xs mb-4"
          style={{ color: "hsl(var(--steel))" }}
        >
          {description}
        </p>
      )}
      {action}
    </motion.div>
  );
}
