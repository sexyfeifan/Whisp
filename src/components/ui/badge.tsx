import * as React from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "purple" | "pink" | "orange" | "green" | "tag-purple" | "tag-orange" | "tag-green" | "success" | "warning" | "danger";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold leading-[1.40] transition-colors",
        {
          /* Notion badge: pill shape, bold caption */
          "bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] rounded-full px-2.5 py-1 text-[13px]": variant === "purple",
          "bg-[hsl(340_80%_60%)] text-white rounded-full px-2.5 py-1 text-[13px]": variant === "pink",
          "bg-[hsl(24_90%_50%)] text-white rounded-full px-2.5 py-1 text-[13px]": variant === "orange",
          "bg-[hsl(142_60%_36%)] text-white rounded-full px-2.5 py-1 text-[13px]": variant === "green",
          /* Notion tag chips: soft bg, small rounded */
          "bg-[hsl(var(--tint-teal))] text-[hsl(175_40%_28%)] rounded-[6px] px-2 py-0.5 text-[12px]": variant === "tag-purple",
          "bg-[hsl(var(--tint-peach))] text-[hsl(24_60%_30%)] rounded-[6px] px-2 py-0.5 text-[12px]": variant === "tag-orange",
          "bg-[hsl(var(--tint-mint))] text-[hsl(142_40%_25%)] rounded-[6px] px-2 py-0.5 text-[12px]": variant === "tag-green",
          /* Default / semantic */
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
