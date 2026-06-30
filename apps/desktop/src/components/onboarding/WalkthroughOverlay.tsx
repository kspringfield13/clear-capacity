import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

/**
 * A single stop on the first-run tour. When `target` is set, the overlay
 * spotlights that element (matched by CSS selector against the live DOM) and
 * anchors the explanation card beside it; when it's omitted the step renders as
 * a centered welcome/finish card over a plain dimmed backdrop.
 */
export interface WalkthroughStep {
  target?: string;
  title: string;
  body: string;
}

// The tour walks the primary navigation in reading order. Selectors point at the
// `data-tour` hooks on the sidebar buttons in AppShell, so the highlight tracks
// whatever the nav actually renders (and silently falls back to a centered card
// if a target is ever missing, e.g. on a narrow viewport).
export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    title: "Welcome to ClearCapacity",
    body: "A quick tour of where things live. ClearCapacity turns your calendar and app activity into reviewable work blocks, then an explainable estimate of your weekly capacity — all on this Mac.",
  },
  {
    target: '[data-tour="today"]',
    title: "Today",
    body: "Your daily review queue. Confirm, relabel, or exclude the work blocks ClearCapacity inferred. Nothing counts toward your capacity until you've reviewed it here.",
  },
  {
    target: '[data-tour="week"]',
    title: "Week",
    body: "The weekly picture: your capacity model, a forecast of next week's reliable headroom, multi-week trends, and an editable summary you can share with a manager.",
  },
  {
    target: '[data-tour="agent"]',
    title: "Agent",
    body: "Ask questions about your workload in plain language — \"how booked am I next week?\" — and understand how the capacity model reached its numbers.",
  },
  {
    target: '[data-tour="history"]',
    title: "History",
    body: "Your activity ledger, the log of every correction you've made, and a full audit trail. Every inference cites its evidence, so nothing is a black box.",
  },
  {
    target: '[data-tour="setup"]',
    title: "Settings",
    body: "Connect a calendar, configure optional AI features, set how long data is kept, and pause tracking anytime. You can replay this tour from here too.",
  },
  {
    title: "You're all set",
    body: "Resume tracking and import a calendar export from Settings to start building your first capacity picture. Everything stays local and reviewable.",
  },
];

const CARD_WIDTH = 320;
const SPOTLIGHT_PADDING = 8;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function WalkthroughOverlay({
  onComplete,
  onSkip,
}: {
  /** Called when the user finishes the last step. */
  onComplete: () => void;
  /** Called when the user dismisses the tour early. */
  onSkip: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = WALKTHROUGH_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === WALKTHROUGH_STEPS.length - 1;

  // Track the highlighted element's position. Recomputed on step change and on
  // resize so the spotlight stays glued to the nav button as the window moves.
  useLayoutEffect(() => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const update = () => setRect(readRect(step.target as string));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step.target]);

  const goNext = useCallback(() => {
    if (isLast) onComplete();
    else setStepIndex((i) => i + 1);
  }, [isLast, onComplete]);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // Keyboard control: arrows/Enter advance, Escape skips. Mirrors the buttons so
  // the tour is fully keyboard-navigable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goBack, onSkip]);

  const spotlightStyle = rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : undefined;

  // Anchor the card to the right of the spotlight (the nav is a left sidebar);
  // flip to the left if it would run off-screen, and clamp vertically so the
  // whole card stays visible.
  let cardStyle: CSSProperties | undefined;
  if (rect) {
    let left = rect.left + rect.width + 16;
    if (left + CARD_WIDTH > window.innerWidth - 16) {
      left = Math.max(16, rect.left - CARD_WIDTH - 16);
    }
    const top = Math.min(Math.max(16, rect.top), window.innerHeight - 240);
    cardStyle = { top, left, width: CARD_WIDTH };
  }

  return (
    <div className="walkthrough" role="dialog" aria-modal="true" aria-label="App walkthrough">
      {rect ? (
        <div className="walkthrough-spotlight" style={spotlightStyle} aria-hidden="true" />
      ) : (
        <div className="walkthrough-backdrop" aria-hidden="true" />
      )}
      <div className={rect ? "walkthrough-card" : "walkthrough-card is-centered"} style={cardStyle}>
        <button
          className="walkthrough-close"
          type="button"
          onClick={onSkip}
          title="Skip tour"
          aria-label="Skip tour"
        >
          <X size={15} />
        </button>
        <strong className="walkthrough-title">{step.title}</strong>
        <p className="walkthrough-body">{step.body}</p>
        <div className="walkthrough-progress" aria-hidden="true">
          {WALKTHROUGH_STEPS.map((_, i) => (
            <span key={i} className={i === stepIndex ? "walkthrough-dot is-active" : "walkthrough-dot"} />
          ))}
        </div>
        <div className="walkthrough-actions">
          <button className="walkthrough-skip" type="button" onClick={onSkip}>
            Skip
          </button>
          <div className="walkthrough-nav">
            {!isFirst && (
              <button className="walkthrough-btn" type="button" onClick={goBack}>
                <ArrowLeft size={14} /> Back
              </button>
            )}
            <button className="walkthrough-btn is-primary" type="button" onClick={goNext}>
              {isLast ? "Done" : "Next"}
              {!isLast && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
