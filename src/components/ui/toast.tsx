import { useCallback, useState, createContext, useContext } from "react";
import { X, Check, AlertCircle, Info } from "lucide-react";

type ToastVariant = "default" | "success" | "error" | "info";
interface Toast { id: string; message: string; variant: ToastVariant; }
interface ToastContextValue { toast: (opts: { message: string; variant?: ToastVariant }) => void; }

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(({ message, variant = "default" }: { message: string; variant?: ToastVariant }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons: Record<ToastVariant, React.ReactNode> = {
    success: <Check size={14} />,
    error: <AlertCircle size={14} />,
    info: <Info size={14} />,
    default: null,
  };

  const bgColors: Record<ToastVariant, string> = {
    success: "hsl(var(--success))",
    error: "hsl(var(--destructive))",
    info: "hsl(var(--primary))",
    default: "hsl(var(--toast-bg))",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col-reverse gap-2 items-center" role="status" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg text-white"
            role={t.variant === "error" ? "alert" : "status"}
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            style={{
              background: bgColors[t.variant],
              animation: "toast-in 0.25s ease-out",
              minWidth: "200px",
              maxWidth: "400px",
            }}
          >
            {icons[t.variant]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="p-0.5 rounded hover:bg-white/20 transition-colors" aria-label="Dismiss">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
