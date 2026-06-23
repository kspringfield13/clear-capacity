# Here's what Claude shipped overnight — 2026-06-23

**TL;DR** — 22 improvements shipped · 4 curator visual passes ran · 5 manual commits merged · build green · 0 reverts · backlog nearly empty (1 Code Quality item remains)

---

## Shipped (Hourly Implementer — 22 commits)

### Features & Enhancements
- **Toolbar icon accessibility** (`AppToolbar.tsx`) — added `aria-label` + `aria-pressed` to sidebar-toggle, pause, and window-mode buttons
- **Blocker flag visual treatment** (`BlockCard.tsx`, `WeeklyCapacityScreen.tsx`, `styles.css`) — red "Blocker" pill badge in BlockCard; "Active blockers" count row (red fill) in Weekly risk modifiers
- **Capacity percentage ring** (`CapacityRing.tsx`, `MetricCard`, `WeeklyCapacityScreen.tsx`) — animated SVG arc on the "Reliable new work" hero card using `--info`/`--surface-muted` tokens
- **Downloadable / Markdown narrative export** (`NarrativeScreen.tsx`) — "Download .txt" button + "Copy as Markdown" (replaces "Copy Summary") with `#`/`##` structure
- **Label bare capacity percentage** (`BlockCard.tsx`, `LedgerScreen.tsx`, `styles.css`) — "of week" caption; swapped `TimerReset` → `PieChart` icon in pulse-meter
- **Inline time-range editor** (`BlockCard.tsx`, `models.ts`, `lib/format.ts`, `styles.css`) — hover-reveal clock → two `<input type="time">` fields with Save/Cancel and end-after-start validation; `start_time`/`end_time` added to `UserCorrection.field`
- **Activity heatmap** (`ActivityHeatmap.tsx`, `LedgerScreen.tsx`, `styles.css`) — 7-day × 24-hour session density grid with 5-level `color-mix` intensity and hover tooltips
- **Heatmap intensity legend** (`ActivityHeatmap.tsx`, `styles.css`) — "Less ▢▢▢▢▢ More" legend row beneath the grid; removed pre-existing TS error in `App.tsx` (spurious props on `DailyReviewScreen`)
- **Humanized audit privacy pills** (`lib/format.ts`, `AuditEventRow.tsx`, `styles.css`) — "Local only" / "Derived only" / "Excluded" labels with hover tooltips; color-coded `.audit-privacy--*` variants
- **Delivery risk modifier scale hints** (`RiskRow.tsx`, `styles.css`) — four index rows now show "/100" scale hint + hover tooltip; Active-blockers row converted to `RiskRow` component
- **Capacity-model legend hover crosslink** (`taxonomy.ts`, `StackedBar.tsx`, `WeeklyCapacityScreen.tsx`, `styles.css`) — legend rows and bar segments dim to 0.35/0.3 opacity on hover; `title` tooltip per row; `cursor: pointer` on `.allocation-row`

### Fixes
- **Dark mode token audit** (`styles.css`) — fixed 3 contrast issues: `.error-retry` invisible in light mode, dark pastel bar-track segment colors overwritten by light CSS, `.capture-error`/`.import-error` low contrast in dark
- **Dead Split Block button** (`BlockCard.tsx`) — disabled no-op button; added `title="Block splitting is coming soon"`
- **Capacity-model legend clipped** (`styles.css`) — removed `max-height`/`overflow` caps from `.allocation-grid` and `.capacity-model`; all 8 category rows now visible
- **Theme preference lost on reload** (`App.tsx`) — `themeHydrated` ref guard prevents "light" default from clobbering saved dark preference on mount
- **Ambiguous "Pause Tracking" on Settings** (`SetupScreen.tsx`, `styles.css`) — replaced duplicate source-row button with read-only "Active"/"Paused" status badge
- **Truncated category selects** (`BlockCard.tsx`, `styles.css`) — added `title` attribute to all three selects; widened category column from `1.35fr` → `1.8fr`
- **Week-nav chevrons split across headline** (`WeeklyCapacityScreen.tsx`, `styles.css`) — moved both chevrons into `.week-nav-controls` div beside eyebrow; disabled chevron gets `opacity: 0.35` + `cursor: not-allowed`
- **Summary-confidence chip floats on Weekly** (`WeeklyCapacityScreen.tsx`, `styles.css`) — moved from `header-actions` into `.headline-with-score` flex row beside `<h1>`; mobile stacks vertically
- **Purple collision in capacity-model legend** (`taxonomy.ts`) — changed "Blocked / waiting / dependency delay" color from `#9333ea` (purple) to `#be185d` (rose)
- **Cryptic "politics-to-math translator" eyebrow** (`WeeklyCapacityScreen.tsx`) — replaced with "where your hours actually went"
- **Lone Review-Copilot suggestion marooned** (`styles.css`) — switched `.copilot-inline .copilot-list` from `auto-fill` to `auto-fit`; phantom empty columns gone

### Refactor
- **Split App.tsx** — extracted all 5 AI async operations into dedicated hooks: `useClassification.ts`, `useReviewCopilot.ts`, `useForecastAgent.ts`, `useNarrativeGeneration.ts`, `useVisualContext.ts`; `App.tsx` reduced from ~1510 → ~870 lines

---

## Backlog Curation (6-Hour UX Curator — 4 visual passes)

All passes ran Playwright across all 6 screens × light/dark/compact:

| Pass | UTC | Surfaced / Replenished |
|---|---|---|
| 1 | Jun 22 12:41 | Dead Split Block button, clipped legend, toolbar a11y gaps, unrendered blocker_flag; reconciled narrative-export and App.tsx line-count items; added NOTES.md dark-mode + a11y recipes |
| 2 | Jun 22 18:38 | Reconciled standing items; replenished 4 items — bare capacity % label, theme persistence bug, triple Pause Tracking disambiguation, truncated category selects; corrected NOTES.md theme-persistence recipe |
| 3 | Jun 23 00:37 | Replenished 4 items — split week-nav chevrons, heatmap intensity legend, raw snake_case privacy pill, orphaned confidence chip; re-validated App.tsx split (still 1522 lines); added recurring-UX-rough-edges notes |
| 4 | Jun 23 06:38 | Replenished 4 items — unlabeled risk modifier magnitudes, color-only/purple-collision legend, cryptic eyebrow, marooned copilot suggestion; noted App.tsx crept back to 984 lines; added numeric-scale + color-collision entries to NOTES.md |

---

## Manual Commits (kspringfield13 — 5 commits)

- **feat(ux)**: Redesigned Today, Week, and History pages
- **feat(ux)**: Corrections given a dedicated History sub-tab
- **improve**: AI settings testing and classification feedback improvements
- **docs**: Refreshed README for current navigation and features
- **docs**: Removed stale product demo content

---

## Status

| Section | Count |
|---|---|
| Done | 43 items |
| In Progress | — |
| Next — UI & UX Polish | empty |
| Next — New Features | empty |
| Next — Code Quality | 1 item |
| Reverts | 0 |
| Skipped/Flagged | 0 |

**Remaining Code Quality task:** `App.tsx` has crept back to ~984 lines after the AI-hook extraction. Outstanding work: extract the screen-aware `toolbarActions` IIFE and `renderScreen` switch into a dedicated `lib/` or `components/shell/` module so `App.tsx` is composition + state wiring only.
