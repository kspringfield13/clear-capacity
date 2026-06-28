import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  action?: ToastAction;
}

export interface PushToastInput {
  tone?: ToastTone;
  message: string;
  action?: ToastAction;
  /** Auto-dismiss delay in ms. Pass 0 to make the toast sticky (manual close only). */
  duration?: number;
}

export type PushToast = (input: PushToastInput) => string;

const MAX_TOASTS = 4;
const DEFAULT_DURATION_MS = 5000;

/**
 * In-memory, capped queue of transient toast notifications. Each toast auto-dismisses
 * after ~5s (configurable per toast) and can be closed manually; the stack is capped so
 * a burst of events can't overflow the screen. No persistence — toasts are ephemeral
 * app-level feedback only. Mount the matching `ToastHost` once (in `AppShell`) and expose
 * `pushToast` to descendants via `ToastProvider`.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    },
    [clearTimer]
  );

  const pushToast = useCallback<PushToast>(
    (input) => {
      const id = crypto.randomUUID();
      const toast: Toast = {
        id,
        tone: input.tone ?? "info",
        message: input.message,
        action: input.action,
      };
      setToasts((current) => {
        const next = [...current, toast];
        // Cap the stack: drop the oldest toasts (and their timers) past the limit.
        if (next.length > MAX_TOASTS) {
          next.slice(0, next.length - MAX_TOASTS).forEach((dropped) => clearTimer(dropped.id));
          return next.slice(-MAX_TOASTS);
        }
        return next;
      });
      const duration = input.duration ?? DEFAULT_DURATION_MS;
      if (duration > 0) {
        const timer = window.setTimeout(() => dismissToast(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [clearTimer, dismissToast]
  );

  // Clear any pending timers on unmount so they don't fire against a dead component.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}
