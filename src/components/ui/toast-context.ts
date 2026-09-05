import { createContext, useContext } from "react";

export type ToastVariant = "default" | "success" | "error" | "info";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => void;
}

export const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}
