import { cn } from "../../lib/utils";

export function Tooltip({ children, content, side = "top", className }: {
  children: React.ReactNode;
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className="relative inline-flex group">
      {children}
      <div
        className={cn(
          "absolute pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          "px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap z-[9999]",
          "bg-[hsl(var(--charcoal))] text-white shadow-md",
          positions[side],
          className
        )}
        role="tooltip"
      >
        {content}
      </div>
    </div>
  );
}
