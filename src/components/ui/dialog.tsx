import { useEffect, useCallback, createContext, useContext } from "react";
import { cn } from "../../lib/utils";
import { X } from "lucide-react";

interface DialogContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}
const DialogContext = createContext<DialogContextValue>({ open: false, setOpen: () => {} });

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <DialogContext.Provider value={{ open, setOpen: onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { open, setOpen } = useContext(DialogContext);
  
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleEscape]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className={cn(
        "relative z-10 w-full max-w-md rounded-xl p-6 shadow-xl",
        "bg-[hsl(var(--canvas))] border border-[hsl(var(--hairline))]",
        className
      )} style={{ animation: "toast-in 0.2s ease-out" }}>
        {children}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 p-1 rounded-md hover:bg-[hsl(var(--surface))] transition-colors"
          aria-label="Close"
        >
          <X size={16} style={{ color: "hsl(var(--steel))" }} />
        </button>
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-lg font-semibold", className)} style={{ color: "hsl(var(--ink))" }}>{children}</h2>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm mt-1" style={{ color: "hsl(var(--steel))" }}>{children}</p>;
}

export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex justify-end gap-2 mt-6", className)}>{children}</div>;
}
