import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          /* Notion text-input: canvas bg, ink text, hairline-strong border, 8px radius, 44px height */
          "flex h-[40px] w-full rounded-[8px] border border-[hsl(var(--hairline-strong))] bg-[hsl(var(--canvas))] px-3 py-2 text-[14px] text-[hsl(var(--ink))] transition-colors placeholder:text-[hsl(var(--muted))] focus-visible:border-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.12)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
