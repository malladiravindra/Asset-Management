"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api";

type ToastVariant = "success" | "error";

type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  /** Convenience for catch blocks: turns an ApiError (or any error) into a readable toast. */
  showErrorFromException: (error: unknown, fallback?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, variant, message }]);
      if (typeof window !== "undefined") {
        window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss]
  );

  const showSuccess = useCallback((message: string) => push("success", message), [push]);
  const showError = useCallback((message: string) => push("error", message), [push]);
  const showErrorFromException = useCallback(
    (error: unknown, fallback = "Something went wrong. Please try again.") => {
      if (error instanceof ApiError) {
        push("error", error.message || fallback);
        return;
      }
      push("error", fallback);
    },
    [push]
  );

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showErrorFromException }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm font-medium shadow-xl shadow-slate-900/10 ring-1 ${
              toast.variant === "success"
                ? "bg-emerald-50 text-emerald-800 ring-emerald-600/10 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-400/20"
                : "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-950 dark:text-red-200 dark:ring-red-400/20"
            }`}
          >
            {toast.variant === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-60 transition hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
