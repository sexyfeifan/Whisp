import * as React from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold leading-[1.40] transition-colors",
        {
          "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] rounded-full px-2.5 py-1 text-[12px]": variant === "default",
          "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] rounded-full px-2.5 py-1 text-[12px]": variant === "success",
          "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] rounded-full px-2.5 py-1 text-[12px]": variant === "warning",
          "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))] rounded-full px-2.5 py-1 text-[12px]": variant === "danger",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
