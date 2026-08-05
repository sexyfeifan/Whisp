import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "danger" | "brand";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
          {
            "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-90": variant === "default",
            "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--accent))]": variant === "secondary",
            "hover:bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]": variant === "ghost",
            "bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90": variant === "danger",
            "bg-[hsl(var(--brand))] text-white hover:opacity-90": variant === "brand",
          },
          {
            "h-9 px-4 py-2": size === "default",
            "h-8 px-3 text-xs": size === "sm",
            "h-11 px-6": size === "lg",
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
