# Here's what Claude shipped overnight — 2026-06-24

**TL;DR** — 20 improvements shipped · 4 curator visual passes ran · build green · 0 reverts · ⚠️ backlog fully depleted (Next queue empty across all subsections)

---

## Shipped (hourly implementer · 20 commits · ~11:00 UTC Jun 23 → 10:14 UTC Jun 24)

### Accessibility (4 commits)
- **Screen-reader bars** — `role="meter"` + aria props on `.risk-track` in `RiskRow.tsx`; `role="img"` + `aria-label` on each segment and remainder span in `StackedBar.tsx` (`RiskRow.tsx`, `StackedBar.tsx`)
- **Heatmap a11y** — `role="group"` on `.heatmap-grid` with summary; `role="img"` + descriptive `aria-label` (day/hour/minutes) on each populated cell via `getDayFullLabel()`/`formatHourA11y()` helpers; empty cells and legend marked `aria-hidden` (`ActivityHeatmap.tsx`)
- **BlockCard time-error live region** — `role="alert"` `.sr-only` span announces "End time must be after start time"; new `.sr-only` utility class added to `styles.css` (`BlockCard.tsx`, `styles.css`)
- **Audit filter chips** — `aria-pressed={filter === item.id}` added to all 11 filter `<button>`s so screen-reader users hear which filter is active (`AuditLogScreen.tsx`)

### UX / Visual Polish (10 commits)
- **BlockCard display polish** — `plannedStatusLabel()` humanizes planned-status `<option>`s; `title` tooltips on project name and stakeholder group; CSS ellipsis truncation for long text (`BlockCard.tsx`, `format.ts`, `styles.css`)
- **Stacked-bar remainder labeled** — explicit `--surface-muted` remainder `<span>` with `title="Unallocated / buffer: N%"` appended in `StackedBar.tsx`; matching "Unallocated / buffer" legend row with muted dot added in `WeeklyCapacityScreen.tsx`
- **Corrections list humanized** — `humanizeCorrectionValue(field, value)` in `format.ts` routes `planned_status` through `plannedStatusLabel()` and time fields through `formatTime()`; applied to display text and `title` tooltip in `CorrectionsScreen.tsx`
- **Onboarding strike-through removed** — deleted `text-decoration: line-through` from `.onboarding-step.is-done > span:last-child`; completed steps read as settled (muted + green check) rather than deleted (`styles.css`)
- **Heatmap sparse-data guard** — when `daysWithActivity < 2`, renders muted `.heatmap-sparse-caption` ("Limited activity so far — the pattern fills in as you keep tracking") instead of broken-looking sparse grid (`ActivityHeatmap.tsx`, `styles.css`)
- **LedgerScreen search wired** — `searchQuery` state filters `visibleBlocks` by project_name/stakeholder_group/category/mode (case-insensitive); Escape clears; "No blocks match" empty state with "Clear search" CTA (`LedgerScreen.tsx`)
- **ConfidenceChip "Unscored"** — `value === 0` now renders "Unscored" (muted chip, no %) instead of "Needs review 0%"; added `.confidence.unscored` light + dark styles (`ConfidenceChip.tsx`, `styles.css`)
- **ConfidenceChip tooltip** — `title="{pct}% classification confidence"` on the `.confidence` span explains the bare percentage on hover; `pct` extracted as variable (`ConfidenceChip.tsx`)
- **Next-week button disabled label** — `aria-label` and `title` read "Cannot navigate past current week" when `isCurrentWeek` is true (`WeeklyCapacityScreen.tsx`)
- **Narrative audit badge** — `narrative_generation` pill gets indigo tint (light `#eef2ff`/`#c7d2fe`/`#3730a3`; dark `#141438`/`#252570`/`#a5b4fc`) following the per-type three-rule badge convention (`styles.css`)

### Keyboard UX (2 commits)
- **AuditLogScreen Escape** — resets both `query` and `filter` to defaults, matching the "Clear filters" button pattern (`AuditLogScreen.tsx`)
- **CorrectionsScreen Escape** — clears `query`, completing the Escape-clears-search pattern across Ledger, Audit, and Corrections screens (`CorrectionsScreen.tsx`)

### Code Quality / Refactor (4 commits)
- **Toolbar + screen router extracted** — `buildToolbarActions` pure function → `lib/toolbarActions.ts`; screen-routing JSX → `components/shell/ScreenRouter.tsx`; App.tsx: 984 → 828 lines, 27 dead imports removed (pure refactor, no behavior change)
- **Type-safety sweep** — `persistedSnapshot: any` → `PersistedAppState | null` in `App.tsx`; `addAuditEvent` param tightened from `any` to `Omit<AuditEvent,...>`; dead `importOutlookIcs` stub (console.warn) and 4 dead imports removed (`App.tsx`, `useBlocksLedger.ts`)
- **AgentScreen types** — `createTool: any` → `typeof AiToolFn`; `execute` params from `any` → `Record<string, unknown>`; explanatory comment left on `t` (Eve ctx types structurally incompatible) (`AgentScreen.tsx`)

---

## Backlog Curation (4 visual passes · 5 curator commits)

| UTC | What the curator did |
|-----|---------------------|
| 12:37 Jun 23 | Visual pass (all 6 screens × light/dark/compact-420); `## Next` depleted — replenished UI & UX Polish with 3 items (header overflow, stacked-bar remainder, screen-reader bars); added narrow-header and stacked-bar gotchas to NOTES.md |
| 18:41 Jun 23 | Visual pass (6 screens + Agent + Forecast + Corrections × light/dark/compact); `## Next` depleted — replenished with 4 items (Corrections raw enums, onboarding strike-through, heatmap a11y, sparse heatmap); extended raw-enum and intensity-grid notes in NOTES.md |
| 00:38 Jun 24 | Visual pass (24 screenshots, 6 screens × light/dark × wide/narrow); confirmed app "highly polished"; reconciled all 4 Next items (still valid), reordered by user-visible impact, added ConfidenceChip-tooltip item |
| 06:40 Jun 24 | Visual pass (19 screenshots, 6 screens × light/dark × narrow); ForecastScreen empty-state reconciled as done; DailyReview week-eyebrow item dropped (double-eyebrow); added 2 audit-derived items (colorless `narrative_generation` pill, audit filter chips missing `aria-pressed`); recorded per-type badge color convention in NOTES.md |

---

## Status

| Dimension | Count |
|-----------|-------|
| **Done** | 54 items |
| **In Progress** | 0 |
| **Next — UI & UX Polish** | 0 (empty) |
| **Next — New Features** | 0 (empty) |
| **Next — Code Quality** | 0 (empty) |
| **Skipped / reverted** | 0 |

> ⚠️ **Backlog fully depleted.** All three `## Next` subsections are empty as of 10:14 UTC Jun 24. The implementer has cleared everything the 06:40 UTC curator stocked. The next curator visual pass (~12:40 UTC) will replenish the queue — no work is in flight in the meantime.
