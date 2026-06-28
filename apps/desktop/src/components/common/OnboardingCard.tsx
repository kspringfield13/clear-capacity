import { Check, X } from "lucide-react";

export interface OnboardingStep {
  label: string;
  done: boolean;
  hint: string;
}

/**
 * Whether each getting-started milestone is complete. Kept as plain booleans so the
 * same step list renders identically from Settings (which has the raw state) and from
 * the first-run card on the daily/weekly screens (which only sees the prepared steps).
 */
export interface OnboardingStatus {
  trackingActive: boolean;
  calendarImported: boolean;
  aiConfigured: boolean;
  classified: boolean;
}

// Single source of truth for the onboarding checklist. Hints are written to be
// location-neutral so they read correctly whether the card is shown inside Settings
// or on an empty daily/weekly screen.
export function buildOnboardingSteps(status: OnboardingStatus): OnboardingStep[] {
  return [
    {
      label: "Tracking active",
      done: status.trackingActive,
      hint: "Resume tracking in Settings and wait for the first activity sample",
    },
    {
      label: "Calendar imported",
      done: status.calendarImported,
      hint: "Import an .ics export from Settings → Data sources",
    },
    {
      label: "AI provider configured",
      done: status.aiConfigured,
      hint: "Add a provider key in Settings → Advanced Settings",
    },
    {
      label: "First classification run",
      done: status.classified,
      hint: "Run classification from the Weekly Capacity view",
    },
  ];
}

export function OnboardingCard({
  steps,
  onDismiss,
}: {
  steps: OnboardingStep[];
  /** When provided, renders a dismiss control (used for the first-run card). */
  onDismiss?: () => void;
}) {
  const completedCount = steps.filter((step) => step.done).length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  return (
    <section className="onboarding-checklist onboarding-card" aria-label="Getting started">
      <div className="onboarding-checklist-header">
        <strong>Getting started</strong>
        <div className="onboarding-card-meta">
          <span>{completedCount}/{steps.length} complete</span>
          {onDismiss && (
            <button
              className="onboarding-dismiss"
              type="button"
              onClick={onDismiss}
              title="Dismiss getting started"
              aria-label="Dismiss getting started"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div
        className="review-progress-track onboarding-progress-track"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Getting started progress"
      >
        <div className="review-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <ol className="onboarding-steps">
        {steps.map((step) => (
          <li key={step.label} className={step.done ? "onboarding-step is-done" : "onboarding-step"}>
            <span className="onboarding-step-icon">
              {step.done ? <Check size={13} /> : null}
            </span>
            <span>
              {step.label}
              {!step.done && <span className="onboarding-step-hint">{step.hint}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
