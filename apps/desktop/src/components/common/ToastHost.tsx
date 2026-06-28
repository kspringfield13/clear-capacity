import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import type { Toast, ToastTone } from "../../hooks/useToasts";

const TONE_ICON: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

/**
 * Renders the live toast stack. A single polite live region announces new toasts to
 * screen readers; each toast carries a manual close and an optional action button
 * (e.g. "Retry"). Mount once, near the app root. Slide-in is auto-disabled under the
 * global `prefers-reduced-motion` reset in styles.css.
 */
export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-host" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = TONE_ICON[toast.tone];
        return (
          <div className="toast" data-tone={toast.tone} key={toast.id}>
            <Icon className="toast-icon" size={16} aria-hidden="true" />
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button
                className="toast-action"
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              className="toast-close"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss(toast.id)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
