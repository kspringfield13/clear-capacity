export const MAX_VISUAL_CONTEXT_CAPTURES_PER_DAY = 8;
export const MIN_VISUAL_CONTEXT_SESSION_MINUTES = 10;
export const MIN_VISUAL_CONTEXT_GAP_MS = 45 * 60 * 1000;

// Proactive alert throttling. Mirrors the visual-context caps above: a hard daily
// ceiling plus a minimum quiet period between interruptive OS notifications so the
// menu-bar app stays calm even when a guardrail condition lingers.
export const MAX_PROACTIVE_ALERTS_PER_DAY = 4;
export const MIN_PROACTIVE_ALERT_GAP_MS = 90 * 60 * 1000;
