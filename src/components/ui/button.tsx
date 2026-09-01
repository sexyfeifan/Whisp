import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
          /* Notion: 8px rounded rectangles, NOT pills */
          "rounded-[8px]",
          {
            /* Primary — luminous iris CTA */
            "bg-[linear-gradient(135deg,hsl(var(--primary)),hsl(var(--brand-glow)))] text-[hsl(var(--on-primary))] shadow-[0_6px_16px_hsl(var(--primary)/0.18)] hover:brightness-105": variant === "primary",
            /* Default — dark ink CTA */
            "bg-[hsl(var(--ink-deep))] text-[hsl(var(--on-primary))] hover:opacity-90": variant === "default",
            /* Secondary — outlined */
            "bg-transparent text-[hsl(var(--ink))] border border-[hsl(var(--hairline-strong))] hover:bg-[hsl(var(--surface))]": variant === "secondary",
            /* Ghost */
            "bg-transparent text-[hsl(var(--slate))] hover:bg-[hsl(var(--surface))] hover:text-[hsl(var(--ink))] rounded-[6px]": variant === "ghost",
            /* Danger */
            "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90": variant === "danger",
            /* Dark — for dark surfaces */
            "bg-[hsl(var(--on-primary))] text-[hsl(var(--ink-deep))] hover:opacity-90": variant === "dark",
          },
          {
            "h-9 px-4 py-2 text-[14px] font-medium leading-[1.30]": size === "default",
            "h-8 px-3 text-[13px] font-medium leading-[1.30]": size === "sm",
            "h-11 px-6 text-[14px] font-medium leading-[1.30]": size === "lg",
            "h-9 w-9 p-0": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
