# STATUS.md — ClearCapacity Improvement Loop

The loop reads this file first and writes it last.
Never touch `src-tauri/` (Rust), `.env`, or push to remote.
Verification gate: `npm run build` must pass before marking done.

---

## Done
- [x] **ConfidenceChip level casing** — verified already normalized in `ConfidenceChip.tsx` (className lowercases via `level.toLowerCase()`, "Needs review" → `low`; emitted classes are consistent — no action needed). 2026-06-24
- [x] **Heatmap legend cells aria-labels** — verified handled in `ActivityHeatmap.tsx`: the `.heatmap-legend` is `aria-hidden="true"` (decorative, with visible "Less → More" text) and each populated data cell already carries `role="img"` + `aria-label`. 2026-06-24

## In Progress
_(none)_

## Next

### UI & UX Polish
- [ ] **ForecastList uses item text as React key** — `key={item}` in `ForecastList.tsx` (line 7) causes React key warnings and DOM thrashing when the AI returns duplicate bullet items. Change to `key={`${index}-${item.slice(0,20)}`}` using the map index.
- [ ] **ActivityCapturePanel uses app_name as React key** — `key={session.app_name}` in `ActivityCapturePanel.tsx` (line 97) duplicates when the same app appears more than once in `latestSessionSummaries`. Change to `key={`${session.app_name}-${index}`}` using the map index.
- [ ] **SetupScreen provider status not announced to screen readers** — `.ai-provider-status` in `SetupScreen.tsx` (line 384) is conditionally rendered with `role="status"`, but an ARIA live region must already be in the DOM before its content arrives to reliably announce. Render the container persistently (empty when `providerStatus` is null) with `aria-live="polite"` and `aria-atomic="true"` so the Test Connection / Save result is announced.
- [ ] **BlockCard category select clips its current label** — on the Daily review `.tag-grid` the category `<select>` truncates the longest `WorkCategory` (seen: "Documentation / requirement cla…"). It has a hover `title` but the visible truncation reads as unpolished and is invisible to keyboard/touch. In `styles.css`, give `.tag-grid` a `grid-template-columns` that lets the first (category) column flex wider than the planned-status/mode columns so the active value is readable at rest. `BlockCard.tsx` lines 135–151.
- [ ] **DailyReview progress track lacks progressbar semantics** — the `.review-progress-track` / `.review-progress-fill` bar in `DailyReviewScreen.tsx` (lines 95–99) is visual-only; only the wrapping text carries `role="status"`. Add `role="progressbar"`, `aria-valuenow={progressPct}`, `aria-valuemin={0}`, `aria-valuemax={100}`, and `aria-label="Review progress"` to the `.review-progress-track` div so assistive tech exposes the completion percentage, not just the "N of M" string.

### Accessibility
- [ ] **EmptyState sections lack descriptive aria-labels** — `<section className="empty-state">` in `EmptyState.tsx` (line 15) has no `aria-label`; add an optional `ariaLabel` prop defaulting to `title`, and pass meaningful labels at each call site.
- [ ] **ReviewCopilotPanel contextual aria-labels** — the Apply/Dismiss buttons in `ReviewCopilotPanel.tsx` (lines 62–63) read identically to every suggestion ("Apply Suggestion" / "Dismiss Suggestion"). Add the suggestion title to each `aria-label` (e.g. `aria-label={`Apply suggestion: ${suggestion.title}`}`) so screen readers announce which suggestion is being acted on.

### Code Quality
- [ ] **AppShell / CompactWidget `snapshot: any` type fix** — replace `snapshot: any` with the proper `WeeklyCapacitySnapshot` type (from `packages/domain/src/models.ts`) in `AppShell.tsx` (line 32) and `CompactWidget.tsx` (line 22).

---

## Never
- Do not touch `apps/desktop/src-tauri/` (Rust shell) — Tauri changes need manual testing outside the loop.
- Do not modify `.env` or commit secrets.
- Do not change `vite.config.ts` port (5173) or `tauri.conf.json` in tandem without flagging it.
