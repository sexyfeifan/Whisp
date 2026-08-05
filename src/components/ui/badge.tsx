import * as React from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "danger" | "brand";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
        {
          "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]": variant === "default",
          "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]": variant === "secondary",
          "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]": variant === "success",
          "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]": variant === "warning",
          "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]": variant === "danger",
          "bg-[hsl(var(--brand)/0.15)] text-[hsl(var(--brand))]": variant === "brand",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
