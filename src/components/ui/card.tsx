import * as React from "react";
import { cn } from "../../lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[12px] border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] text-[hsl(var(--card-foreground))] shadow-[0_1px_2px_hsl(var(--ink-deep)/0.035),0_8px_24px_hsl(var(--primary)/0.025)] transition-all duration-200 hover:shadow-[0_4px_12px_hsl(var(--ink-deep)/0.06),0_12px_32px_hsl(var(--primary)/0.04)] hover:-translate-y-0.5",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6 pb-3", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        /* Notion heading-5: 18px, 600, 1.40 */
        "text-[18px] font-semibold leading-[1.40] tracking-[-0.01em] text-[hsl(var(--ink))]",
        className
      )}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn(
        /* Notion caption: 13px, 400, 1.40 */
        "text-[13px] font-normal leading-[1.40] text-[hsl(var(--steel))]",
        className
      )}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
