import * as React from "react";
import { cn } from "../../lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        /* Notion: 12px radius, 1px hairline border, canvas bg */
        "rounded-[12px] border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] text-[hsl(var(--card-foreground))]",
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

/* Pastel-tinted feature cards (Notion style) */
type TintColor = "peach" | "rose" | "mint" | "teal" | "sky" | "yellow" | "cream" | "gray";

const tintMap: Record<TintColor, string> = {
  peach: "bg-[hsl(var(--tint-peach))]",
  rose: "bg-[hsl(var(--tint-rose))]",
  mint: "bg-[hsl(var(--tint-mint))]",
  teal: "bg-[hsl(var(--tint-teal))]",
  sky: "bg-[hsl(var(--tint-sky))]",
  yellow: "bg-[hsl(var(--tint-yellow))]",
  cream: "bg-[hsl(var(--tint-cream))]",
  gray: "bg-[hsl(var(--tint-gray))]",
};

interface TintCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tint: TintColor;
}

const TintCard = React.forwardRef<HTMLDivElement, TintCardProps>(
  ({ className, tint, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[12px] p-6 text-[hsl(var(--charcoal))]",
        tintMap[tint],
        className
      )}
      {...props}
    />
  )
);
TintCard.displayName = "TintCard";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, TintCard };
