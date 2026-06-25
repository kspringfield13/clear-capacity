# STATUS.md — ClearCapacity Improvement Loop

The loop reads this file first and writes it last.
Never touch `src-tauri/` (Rust), `.env`, or push to remote.
Verification gate: `npm run build` must pass before marking done.

---

## Done
- [x] **SetupScreen provider status not announced to screen readers** — always apply `ai-provider-status` base class; add CSS that collapses element (height:0/padding:0/border-width:0/overflow:hidden) when no modifier class is active, keeping it in the DOM + AT for live-region init without `display:none`. `SetupScreen.tsx` + `styles.css`. 2026-06-24
- [x] **ConfidenceChip level casing** — verified already normalized in `ConfidenceChip.tsx` (className lowercases via `level.toLowerCase()`, "Needs review" → `low`; emitted classes are consistent — no action needed). 2026-06-24
- [x] **Heatmap legend cells aria-labels** — verified handled in `ActivityHeatmap.tsx`: the `.heatmap-legend` is `aria-hidden="true"` (decorative, with visible "Less → More" text) and each populated data cell already carries `role="img"` + `aria-label`. 2026-06-24
- [x] **ForecastList uses item text as React key** — changed `key={item}` to `key={`${index}-${item.slice(0,20)}`}` in `ForecastList.tsx` (line 6); eliminates duplicate-key React warnings when AI returns identical bullet items. 2026-06-24
- [x] **BlockCard category select clips its current label** — widened `.review-screen .tag-grid` first column from `minmax(0, 1.5fr)` to `minmax(0, 2.4fr)` in `styles.css` (line 2019); category column now ~55% of row width, enough to show "Documentation / Requirements" unclipped. Ledger and mobile rules untouched. 2026-06-24
- [x] **Onboarding checklist incomplete steps are dead-ends** — added `hint` field to each step in `SetupScreen.tsx`; hints render as a `.onboarding-step-hint` block span below the label only for incomplete steps; `.onboarding-step` changed to `align-items: flex-start` and `.onboarding-step-hint` rule added to `styles.css` (`var(--text-subtle)`, 11px). 2026-06-24
- [x] **ActivityCapturePanel uses app_name as React key** — verified already fixed in `ActivityCapturePanel.tsx` (line 97 now uses `key={`${session.app_name}-${index}`}`); no duplicate-key risk when the same app recurs. 2026-06-25
- [x] **Audit log shows raw enum/ISO correction values while Corrections screen humanizes them** — added `humanizeCorrectionValue` to import in `App.tsx`; audit summary at line 514 now calls `humanizeCorrectionValue(field, old_value) → humanizeCorrectionValue(field, new_value)` matching the Corrections screen display (e.g. "Planned → Unplanned", "9:00 AM → 10:00 AM"). 2026-06-25

## In Progress
_(none)_

## Next

### UI & UX Polish
- [ ] **DailyReview progress track lacks progressbar semantics** — the `.review-progress-track` / `.review-progress-fill` bar in `DailyReviewScreen.tsx` (lines 97–99) is visual-only; only the wrapping `.review-progress` div carries `role="status"`. Add `role="progressbar"`, `aria-valuenow={progressPct}`, `aria-valuemin={0}`, `aria-valuemax={100}`, and `aria-label="Review progress"` to the `.review-progress-track` div so assistive tech exposes the completion percentage, not just the "N of M" string.
- [ ] **Single AI suggestion looks marooned in the Daily "Suggested cleanup" panel** — `.copilot-inline .copilot-list` uses `grid-template-columns: repeat(auto-fit, minmax(280px, 360px))` (`styles.css` line ~2140), so when the copilot returns one suggestion the 360px card sits alone against ~880px of empty panel (clearly visible on the Daily screen, light + dark). Constrain the emptiness — e.g. give `.copilot-inline` (or the list) a `max-width` so the single card reads as intentional rather than broken. `ReviewCopilotPanel.tsx` / `styles.css`.

### Accessibility
- [ ] **EmptyState sections lack descriptive aria-labels** — `<section className="empty-state">` in `components/common/EmptyState.tsx` (line 15) has no `aria-label`; add an optional `ariaLabel` prop defaulting to `title`, and pass meaningful labels at each call site.
- [ ] **ReviewCopilotPanel contextual aria-labels** — the Apply/Dismiss buttons in `ReviewCopilotPanel.tsx` (lines 62–63) read identically to every suggestion ("Apply Suggestion" / "Dismiss Suggestion"). Add the suggestion title to each `aria-label` (e.g. `aria-label={`Apply suggestion: ${suggestion.title}`}`) so screen readers announce which suggestion is being acted on.

### Code Quality
- [ ] **AppShell / CompactWidget `snapshot: any` type fix** — replace `snapshot: any` with the proper `WeeklyCapacitySnapshot` type (from `packages/domain/src/models.ts`, line 206) in `components/shell/AppShell.tsx` (line 32) and `components/compact/CompactWidget.tsx` (line 22).

> **Strategic enhancements (intelligence engine · integrations · trust & verification UX)** — the three tracks below are larger, multi-step bets than the tactical polish above, but they live under `## Next` on purpose so the improvement routine picks them up in order once the polish items clear. Each bullet is sized to land in one loop pass; sequence within a track top-to-bottom (later items depend on earlier ones). Items tagged **[manual / Rust]** need `src-tauri/` or network/OAuth work that is out of loop scope — build the loop-safe slice noted in the bullet and leave the native half as a flagged follow-up. The forecast-accuracy feature (persisted `forecastHistory` + `scoreForecastAccuracy`) shipped in PR #19 and is the reference pattern for retained-history work.

### Intelligence Engine
- [ ] **Multi-week snapshot history store** *(foundation — do first)* — today `computeWeeklyCapacitySnapshot` runs over all blocks for a single `week_id` and nothing is retained across weeks, so trends/baselines are impossible. Add a persisted `snapshotHistory: { week_id, snapshot, computed_at }[]` (cap ~24) written when the ISO week rolls over, mirroring the `forecastHistory` pattern from PR #19. Pure storage + wiring: `services/localStore.ts` (field + parse guard), `hooks/usePersistence.ts`, `hooks/useDerived.ts` / `App.tsx`. Unlocks every item below.
- [ ] **Personal baselines + trend deltas** *(depends on snapshot history)* — add a pure `computeCapacityBaselines(history)` in `packages/inference/src/capacity.ts` returning rolling medians (4–6 wk) for `reactive_pct`, `meeting_pct`, `context_switch_score`, and `reliable_new_work_capacity_pct`; render small "vs your 6-wk median +N/−N" chips on `WeeklyCapacityScreen.tsx` metrics so a number reads against the user's own norm, not a static 100 baseline.
- [ ] **Correction-driven bias signal** — `corrections` are collected but never fed back into the model. Add a pure `analyzeCorrections(corrections)` in inference that surfaces systematic mislabels (e.g. category X → Y corrected ≥3×, or planned→unplanned drift) and render an explainable "Model bias" note on the Forecast/Capacity screen. No retraining — just close the visible loop between review effort and model behavior.
- [ ] **Evidence-based forecast confidence** *(builds on PR #19)* — aggregate past `forecastHistory` scores into a rolling mean-absolute-error and show "Forecasts have averaged ±N pts over the last K weeks" beneath the accuracy banner in `ForecastAgentPanel.tsx`, so displayed confidence is grounded in track record rather than the model's self-reported number. Pure helper alongside `scoreForecastAccuracy`.

### Integrations
- [ ] **Importable `RawEvent` schema (decouple sources — do first)** — `SourceType` already reserves `slack`/`git`/`browser`/`task` but only `window`+`calendar` are wired. Define a documented JSON import shape that maps onto `RawEvent`→`WorkBlock` and an `importRawEvents()` entry point in `packages/integrations/`, so new signal sources need data, not new code. Frontend + packages only; lays the groundwork for the two items below.
- [ ] **Git activity as a planned-work signal** *(depends on import schema)* — parse a committed/exported git log (commits, PR metadata) into deep-work `WorkBlock`s keyed by repo→project. Build the **pure TS parser** in `packages/integrations/src/git/` against a fixture now (mirror `calendar/outlookIcs.ts`, fully loop-testable). The live fetch/watch is **[manual / Rust]** — flag the `src-tauri/` half as a follow-up.
- [ ] **Automated calendar sync** **[manual / Rust]** — replace the manual `.ics` export (the biggest onboarding wall) with Google / Microsoft Graph sync. OAuth + network live in the Tauri layer and are out of loop scope. Loop-safe slice: a provider-agnostic `CalendarSource` interface in `packages/integrations/` plus a disabled "Connect calendar" stub in `SetupScreen.tsx` that the native layer can later fulfill; document the Rust follow-up here.

### Trust & Verification UX
- [ ] **"Why this block?" evidence drill-down — surface the inference path** — `WorkBlock.evidence[]` already renders via the native `<details className="evidence">` "Why this estimate?" disclosure in `components/ledger/BlockCard.tsx` (lines 152–159), but `WorkBlock.derived_from[]` (the inference path that produced the block) is never shown. Extend that same `<details>` with a labeled "Derived from" sub-list of `block.derived_from`, reinforcing the explainability differentiator. Frontend + `styles.css` only.
- [ ] **Sensitive-content review queue** — `VisualContextInsight.sensitive_content_detected` is recorded but there is nowhere to review or purge flagged captures. Add a filtered view under History listing flagged insights with a per-item "Discard" action that writes a `visual_context` audit event. Frontend only; fits the privacy model.
- [ ] **Data export & retention controls** — (a) export the work ledger + audit trail to JSON/CSV from `SetupScreen.tsx` (pure, frontend); (b) add a user-set retention window that auto-expires `activeWindowSamples` older than N days. Both loop-safe and reinforce the local-first / user-controlled-data positioning.
- [ ] **Forecast track-record panel** *(builds on PR #19)* — add a "Forecast track record" list to `ForecastScreen.tsx` showing predicted-vs-actual per past week with the On target / Close / Off rating chips, so the model can be audited over time rather than only for the current week. Reads the existing `forecastHistory`.

---

## Never
- Do not touch `apps/desktop/src-tauri/` (Rust shell) — Tauri changes need manual testing outside the loop.
- Do not modify `.env` or commit secrets.
- Do not change `vite.config.ts` port (5173) or `tauri.conf.json` in tandem without flagging it.
