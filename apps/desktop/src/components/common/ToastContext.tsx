import { createContext, useContext } from "react";
import type { PushToast } from "../../hooks/useToasts";

// `pushToast` is provided once near the app root (App.tsx) and consumed by descendant
// screens (review confirm-all, narrative/agent copy) without prop drilling.
const ToastContext = createContext<PushToast | null>(null);

export const ToastProvider = ToastContext.Provider;

/**
 * Returns the app-level `pushToast`. Falls back to a no-op when rendered outside a
 * provider (e.g. isolated tests/storybook), so consumers never need to null-check.
 */
export function useToast(): PushToast {
  return useContext(ToastContext) ?? (() => "");
}
