# STATUS.md — ClearCapacity Improvement Loop

The `/improve` loop reads this file first and writes it last on every run.

**Guardrails**
- Scope: edit `apps/desktop/src/` and `packages/` only.
- Gate: `npm run build` must pass before a task is marked done.
- One task per run.

**Ordering** — the loop takes the first unchecked `- [ ]` task reading top-to-bottom
through **Next**. Sections are in priority order; within a section, tasks are
dependency-ordered, so the topmost open task is always the right pick. Tasks tagged
**[manual / Rust]** need native work outside loop scope — ship the loop-safe slice
described in the task and flag the rest as a follow-up.

---

## In Progress
_(none)_

## Next

### UI & UX Polish
- [ ] **Forecast scenario cards are cramped two-up on narrow screens** — `.forecast-summary` in `apps/desktop/src/styles.css` (line ~2839) is `repeat(auto-fit, minmax(min(170px, 100%), 1fr))`, so at ~420px the four cards (Reliable new-work capacity / Conservative / Likely / Optimistic) pack into two ~190px columns and their labels + helper text wrap to 2–3 lines. Verified on the Forecast tab at 420px. Add `.forecast-summary { grid-template-columns: 1fr; }` to the existing `@media (max-width: 600px)` block (line ~6248) so they stack into one readable column. `styles.css` only.
- [ ] **Agent empty-conversation state floats in dead space** — with no messages, `.agent-starters` (`apps/desktop/src/styles.css` line ~6652) is `flex: 1 1 auto; justify-content: center`, so the "Start with an outcome" cards are vertically centered in the entire conversation void. Verified on the Agent screen (wide and 420px): a large blank band sits between the briefing card and the starters, and again above the composer, making the screen read as half-empty. Anchor the empty state near the top instead (e.g. `justify-content: flex-start` scoped under `.agent-chat-container.is-empty`, or a fixed modest top gap) so the prompts sit just below the briefing. `styles.css` only.

### Intelligence Engine
_Reference pattern: persisted `forecastHistory` + `scoreForecastAccuracy` (PR #19) — mirror it for retained-history work._
- [ ] **Multi-week snapshot history store** *(foundation — do first)* — today `computeWeeklyCapacitySnapshot` runs over a single `week_id` and nothing is retained across weeks, so trends/baselines are impossible. Add a persisted `snapshotHistory: { week_id, snapshot, computed_at }[]` (cap ~24) written when the ISO week rolls over, mirroring `forecastHistory`. Storage + wiring: `services/localStore.ts` (field + parse guard), `hooks/usePersistence.ts`, `hooks/useDerived.ts` / `App.tsx`. Unlocks everything below.
- [ ] **Personal baselines + trend deltas** *(depends on snapshot history)* — add a pure `computeCapacityBaselines(history)` in `packages/inference/src/capacity.ts` returning rolling medians (4–6 wk) for `reactive_pct`, `meeting_pct`, `context_switch_score`, and `reliable_new_work_capacity_pct`; render "vs your 6-wk median +N/−N" chips on `WeeklyCapacityScreen.tsx` so each number reads against the user's own norm.
- [ ] **Correction-driven bias signal** — `corrections` are collected but never fed back. Add a pure `analyzeCorrections(corrections)` in inference that surfaces systematic mislabels (category X → Y corrected ≥3×, or planned→unplanned drift) and render an explainable "Model bias" note on the Forecast/Capacity screen. No retraining — just close the visible loop.
- [ ] **Evidence-based forecast confidence** *(builds on PR #19)* — aggregate past `forecastHistory` scores into a rolling mean-absolute-error and show "Forecasts have averaged ±N pts over the last K weeks" beneath the accuracy banner in `ForecastAgentPanel.tsx`. Pure helper alongside `scoreForecastAccuracy`.

### Integrations
- [ ] **Importable `RawEvent` schema** *(decouple sources — do first)* — `SourceType` reserves `slack`/`git`/`browser`/`task` but only `window`+`calendar` are wired. Define a documented JSON import shape mapping onto `RawEvent`→`WorkBlock` plus an `importRawEvents()` entry point in `packages/integrations/`, so new sources need data, not code. Frontend + packages only.
- [ ] **Git activity as a planned-work signal** *(depends on import schema)* — parse a committed/exported git log (commits, PR metadata) into deep-work `WorkBlock`s keyed by repo→project. Build the pure TS parser in `packages/integrations/src/git/` against a fixture (mirror `calendar/outlookIcs.ts`). The live fetch/watch is **[manual / Rust]** — flag the `src-tauri/` half as a follow-up.
- [ ] **Automated calendar sync** **[manual / Rust]** — replace the manual `.ics` export (the biggest onboarding wall) with Google / Microsoft Graph sync. OAuth + network live in Tauri. Loop-safe slice: a provider-agnostic `CalendarSource` interface in `packages/integrations/` plus a disabled "Connect calendar" stub in `SetupScreen.tsx`; document the Rust follow-up here.

### Trust & Verification UX
- [ ] **"Why this block?" evidence drill-down** — `WorkBlock.evidence[]` renders via the `<details className="evidence">` disclosure in `components/ledger/BlockCard.tsx` (lines ~153–160), but `WorkBlock.derived_from[]` (the inference path) is never shown. Extend that `<details>` with a labeled "Derived from" sub-list of `block.derived_from`. Frontend + `styles.css` only.
- [ ] **Sensitive-content review queue** — `VisualContextInsight.sensitive_content_detected` is recorded but there's nowhere to review or purge flagged captures. Add a filtered view under History listing flagged insights with a per-item "Discard" action that writes a `visual_context` audit event. Frontend only.
- [ ] **Data export & retention controls** — (a) export the work ledger + audit trail to JSON/CSV from `SetupScreen.tsx`; (b) add a user-set retention window that auto-expires `activeWindowSamples` older than N days. Both loop-safe; reinforce the local-first positioning.
- [ ] **Forecast track-record panel** *(builds on PR #19)* — add a "Forecast track record" list to `ForecastScreen.tsx` showing predicted-vs-actual per past week with On target / Close / Off chips, so the model can be audited over time. Reads the existing `forecastHistory`.

---

## Done
_Prior entries live in git history and merged PRs._

- [x] **BlockCard relabel selects have field-name aria-labels** (2026-06-27) — verified already present in `components/ledger/BlockCard.tsx`; all three relabel `<select>`s carry static `aria-label`s ("Work category" / "Planned status" / "Work mode") alongside the value `title`.
- [x] **EmptyState descriptive aria-labels** (2026-06-27) — verified in `components/common/EmptyState.tsx`; optional `ariaLabel` prop renders `aria-label={ariaLabel ?? title}` on the `<section className="empty-state">`.
- [x] **ReviewCopilotPanel contextual aria-labels** (2026-06-27) — verified in `components/review/ReviewCopilotPanel.tsx`; the Apply/Dismiss buttons include the suggestion title in each `aria-label` (PR #58).
- [x] **AppShell / CompactWidget snapshot type** (2026-06-27) — verified `snapshot: WeeklyCapacitySnapshot` in both `components/shell/AppShell.tsx` and `components/compact/CompactWidget.tsx`, replacing `snapshot: any` (PR #59).
- [x] **Agent compact view silently hides the Outlook metric and half the starter cards** (2026-06-27) — removed `display: none` hiding rules in `@media (max-width: 600px)`; third briefing-metric now spans full-width (`grid-column: 1 / -1` + `border-top`), all four starter cards now visible via existing single-column grid. `styles.css` only.

---

## Never
- `apps/desktop/src-tauri/` (Rust shell) — needs manual Tauri testing.
- `.env` or any secret.
- `vite.config.ts` port (5173) / `tauri.conf.json`.
