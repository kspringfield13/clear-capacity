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

- [x] **Forecast scenario range-bar labels can overlap** (2026-06-27) — in `ForecastAgentPanel.tsx` the absolutely-positioned `.forecast-range-label-center` "Likely · X%" span (at `left: ${likelyLeft}%`) now renders only when `likelyLeft` is between 12% and 88%, so it no longer collides with the row-edge Conservative/Optimistic labels at skewed scenarios. The likely value remains visible in the summary card and the range `aria-label`, and the marker line on the track still indicates the likely position. `ForecastAgentPanel.tsx` only; passed self-review.

- [x] **Forecast screen shows 38% and 24% for the same metric without reconciling them** (2026-06-27) — added a `.forecast-baseline-note` reconciling line under the scenario summary in `ForecastAgentPanel.tsx` ("These are the AI's scenario estimates, refined from the deterministic N% reliable-capacity baseline."), using the existing `deterministicReliableCapacity` prop; new muted `.forecast-baseline-note` token-based style in `styles.css`. The AI scenario numbers and the deterministic baseline now read as distinct.
- [x] **Agent empty-conversation state floats in dead space** (2026-06-27) — verified already solved: `.agent-starters` uses `flex: 0 0 auto; justify-content: flex-start`; stale duplicate removed from Next.
- [x] **Live local capture panel starves the ledger work-block list** (2026-06-27) — verified already solved: `ActivityCapturePanel.tsx` is a `<details className="activity-capture-panel">` with a `<summary>`, closed by default, and the ledger override sets `max-height: none`; stale duplicate removed from Next.
- [x] **"Current block" can highlight the wrong block** (2026-06-27) — verified already solved: `LedgerScreen.tsx` picks the current block by latest `end_time`/`start_time` via `reduce` (no hardcoded index); stale duplicate removed from Next.

- [x] **Agent empty-conversation state floats in dead space** (2026-06-27) — changed `justify-content: center` → `justify-content: flex-start` on `.agent-starters` in `styles.css`; starter cards now anchor near the top instead of floating in the middle of the empty conversation void.
- [x] **Ledger work blocks sit below the fold under the heatmap** (2026-06-27) — converted `ActivityHeatmap.tsx` to a `<details className="activity-heatmap">` disclosure (closed by default); replaced `<p className="eyebrow">` with `<summary>`; trimmed cell rows from 7 px → 5 px in `styles.css`; ledger list now visible at first render without any scrolling.
- [x] **BlockCard relabel selects have field-name aria-labels** (2026-06-27) — verified already present in `components/ledger/BlockCard.tsx`; all three relabel `<select>`s carry static `aria-label`s ("Work category" / "Planned status" / "Work mode") alongside the value `title`.
- [x] **EmptyState descriptive aria-labels** (2026-06-27) — verified in `components/common/EmptyState.tsx`; optional `ariaLabel` prop renders `aria-label={ariaLabel ?? title}` on the `<section className="empty-state">`.
- [x] **ReviewCopilotPanel contextual aria-labels** (2026-06-27) — verified in `components/review/ReviewCopilotPanel.tsx`; the Apply/Dismiss buttons include the suggestion title in each `aria-label` (PR #58).
- [x] **AppShell / CompactWidget snapshot type** (2026-06-27) — verified `snapshot: WeeklyCapacitySnapshot` in both `components/shell/AppShell.tsx` and `components/compact/CompactWidget.tsx`, replacing `snapshot: any` (PR #59).
- [x] **Agent compact view silently hides the Outlook metric and half the starter cards** (2026-06-27) — removed `display: none` hiding rules in `@media (max-width: 600px)`; third briefing-metric now spans full-width (`grid-column: 1 / -1` + `border-top`), all four starter cards now visible via existing single-column grid. `styles.css` only.
- [x] **Forecast scenario cards are cramped two-up on narrow screens** (2026-06-27) — added `.forecast-summary` to the `grid-template-columns: 1fr` rule in the `@media (max-width: 600px)` block in `styles.css`; four cards now stack single-column at ≤600px.
- [x] **Agent empty-conversation state floats in dead space** (2026-06-27) — changed `.agent-starters` from `flex: 1 1 auto; justify-content: center` to `flex: 0 0 auto; justify-content: flex-start`; removed artificial `min-height: 210px`; cards now anchor just below briefing instead of centering in the void. `styles.css` only.

---

## Never
- `apps/desktop/src-tauri/` (Rust shell) — needs manual Tauri testing.
- `.env` or any secret.
- `vite.config.ts` port (5173) / `tauri.conf.json`.
