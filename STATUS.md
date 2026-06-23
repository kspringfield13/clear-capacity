# STATUS.md — ClearCapacity Improvement Loop

The loop reads this file first and writes it last.
Never touch `src-tauri/` (Rust), `.env`, or push to remote.
Verification gate: `npm run build` must pass before marking done.

---

## Done
- [x] **Toolbar actions slot** — replaced empty `toolbarActions: []` with screen-aware IIFE in `App.tsx`; Classify/Review Copilot/Forecast/Regenerate now appear in the toolbar as primary actions with correct disabled states. [PR #2](https://github.com/kspringfield13/clear-capacity/pull/2) (2026-06-21)
- [x] **Async status hook** — extracted `useAsyncStatus` hook, removed 10 duplicate state declarations from App.tsx. [PR #4](https://github.com/kspringfield13/clear-capacity/pull/4) (2026-06-21)
- [x] **Retry buttons on error states** — added inline "Try again" buttons to all AI error states (classify, review copilot, forecast, narrative, visual context). [PR #5](https://github.com/kspringfield13/clear-capacity/pull/5) (2026-06-21)
- [x] **Keyboard navigation between screens** — added `⌘1`–`⌘6` shortcuts mapped to the six main screens. [PR #6](https://github.com/kspringfield13/clear-capacity/pull/6) (2026-06-21)
- [x] **Audit log search/filter** — text filter input + type-filter button strip already present since PR #3 extraction.
- [x] **Week selector on WeeklyCapacityScreen** — added previous/next week chevrons. [PR #7](https://github.com/kspringfield13/clear-capacity/pull/7) (2026-06-21)
- [x] **Onboarding progress indicator** — added checklist on SetupScreen showing tracking/calendar/AI/classification status. [PR #8](https://github.com/kspringfield13/clear-capacity/pull/8) (2026-06-21)
- [x] **Mark all confirmed bulk action** — "Confirm Visible Blocks" button already present in DailyReviewScreen since PR #3 extraction.
- [x] **Skeleton loading states** — added shimmer skeleton placeholders for ReviewCopilotPanel, ForecastAgentPanel, and NarrativeScreen so layout does not shift when AI results arrive. (2026-06-22)
- [x] **Empty state polish** — replaced custom `audit-empty` HTML with `EmptyState` + `ScrollText` icon; added "Classify N sessions" CTA to LedgerScreen; added "Generate Narrative" CTA inside NarrativeScreen empty state; added "Clear filters" CTA for filtered-out audit log. (2026-06-22)
- [x] **CompactWidget quick-confirm** — added inline Confirm + Exclude buttons to the `quick-review` section so users can act on the next unverified block without switching to large mode. (2026-06-22)
- [x] **Dark mode token audit** — fixed `.error-retry` invisible in light mode, restored dark-appropriate pastel bar-track segment colors, fixed `.capture-error`/`.import-error` low contrast in dark mode. (2026-06-22)
- [x] **Dead "Split Block" button** — disabled the no-op Split Block button in `BlockCard.tsx` and added `title="Block splitting is coming soon"` so it reads as not-yet-available. (2026-06-22)
- [x] **Capacity-model legend is clipped** — removed `max-height: 68px; overflow-y: auto` from `.allocation-grid` and `max-height: 165px; overflow: hidden` from `.capacity-model` in `styles.css` so all 8 categories render fully. (2026-06-22)
- [x] **Toolbar icon-button accessibility** — added `aria-label` + `aria-pressed` to sidebar-toggle, pause, and window-mode chrome buttons in `AppToolbar.tsx`, matching the existing theme-toggle reference. (2026-06-22)
- [x] **Blocker flag visual treatment** — added red "Blocker" pill badge in `BlockCard.tsx` `.block-topline` next to `ConfidenceChip` (via `.block-chips` wrapper); surfaced "Active blockers" count row (red fill bar, red count) in WeeklyCapacityScreen "Delivery risk modifiers" section; added `.blocker-badge` + `.risk-blocker-count` token-based styles (light + dark) in `styles.css`. (2026-06-22)
- [x] **Capacity percentage ring or gauge** — added `CapacityRing` SVG arc component; `MetricCard` gained optional `showRing` prop; "Reliable new work" hero card now shows an animated arc ring next to the percentage using `--info`/`--surface-muted` tokens for light+dark. (2026-06-22)
- [x] **Downloadable / markdown narrative export** — added "Download .txt" button (saves manager-ready text with week-label header) and replaced "Copy Summary" with "Copy as Markdown" (`# / ##` Markdown respecting user edits) in `NarrativeScreen.tsx`. (2026-06-22)
- [x] **Label the bare capacity percentage** — wrapped `<strong>` in `.block-capacity` with `<span class="capacity-caption">of week</span>` in `BlockCard.tsx`; swapped `TimerReset` → `PieChart` icon and added same caption in `LedgerScreen.tsx` pulse-meter; added `.block-capacity`, `.pulse-meter-val`, `.capacity-caption` CSS rules using `var(--text-subtle)` token; fixed `.pulse-meter` to `align-items: flex-start` for correct icon-to-number alignment; added `flex-shrink: 0` to `.block-capacity`. (2026-06-22)
- [x] **Theme preference is lost on reload** — added `themeHydrated` ref guard in `App.tsx`; hydration `useEffect` reads `readThemePreference()` on mount and sets the ref before calling `setTheme`; write-back effect skips `writeThemePreference` until the ref is true, preventing the default "light" from clobbering a saved dark preference. (2026-06-22)
- [x] **Ambiguous "Pause Tracking" buttons on Settings** — replaced the duplicate "Pause Tracking" button on the "Active window activity" source row with a read-only status badge ("Active" / "Paused") in `SetupScreen.tsx`; global pause action remains only in the screen header. Added `.source-status` styles (light + dark) in `styles.css`. (2026-06-22)
- [x] **Long category labels truncate silently in selects** — added `title` attribute to all three selects in `BlockCard.tsx` (category, planned_status, mode) showing the current value as a hover tooltip; widened category column in `.tag-grid` from `1.35fr` to `1.8fr` in `styles.css`. (2026-06-22)
- [x] **Block duration edit** — added inline time-range editor (hover-reveal clock icon → two `<input type="time">` with Save/Cancel) to `BlockCard.tsx`; validates end > start; wires through `onRelabel` for `start_time`/`end_time`; added `"start_time" | "end_time"` to `UserCorrection.field` in `models.ts` and their labels in `format.ts`; added `.block-time`, `.time-edit-btn`, `.time-range-editor` styles in `styles.css`. (2026-06-22)
- [x] **Activity heatmap** — added `ActivityHeatmap` component to LedgerScreen showing a 7-day × 24-hour grid of session density; cells use 5-level `color-mix` intensity from `--info` token; hover tooltips show day/hour/minutes; renders `null` when no sessions. (2026-06-23)

## In Progress
_(none)_

## Next

### UI & UX Polish
- [ ] **Week-nav chevrons are split across the wide headline** — In `WeeklyCapacityScreen.tsx` the `.week-nav` wraps the prev `ChevronLeft` + a ~700px-wide `<h1>` + the next `ChevronRight`, so the "Next week" chevron floats orphaned at the far-right edge and its disabled state (current week) is nearly invisible. Group both chevrons into one paired control (e.g. render them together beside the "Weekly capacity view" eyebrow, before the headline) so week navigation is discoverable; give `.week-nav-chevron:disabled` a clear low-opacity + `cursor: not-allowed` treatment in `styles.css`.
- [ ] **Activity heatmap has no intensity legend** — `ActivityHeatmap.tsx` renders 5-level `data-level` cells but no key, so users can't tell that more-saturated = more activity (the grid reads as a faint gray block in light mode). Add a small "Less ▢▢▢▢▢ More" legend row reusing the same `data-level` cell styles beneath the grid, plus `.heatmap-legend` styles (light + dark) in `styles.css`.
- [ ] **Audit privacy pill shows raw snake_case** — `AuditEventRow.tsx` renders `event.privacy_level` verbatim, so users see "local_only" / "derived_only" / "excluded". Add a `privacyLevelLabel()` helper in `lib/format.ts` (→ "Local only" / "Derived only" / "Excluded") and a `title` tooltip explaining each scope; optionally color-code the `.audit-privacy` pill per level via tokens in `styles.css`.
- [ ] **Summary-confidence chip floats disconnected on Weekly** — In `WeeklyCapacityScreen.tsx` the `.header-actions .summary-score` box sits orphaned at the far top-right, vertically misaligned against the two-line hero headline (both themes). Tighten alignment with the headline (align to top, match card styling) so it reads as a related stat, not a stray box. (`styles.css` `.summary-score` / `.header-actions`.)

### New Features

### Code Quality
- [ ] **Split App.tsx** — At 1510 lines, App.tsx is a god component. Move each async operation (classifyActiveWindowSessions, generateReviewCopilotSuggestions, generateForecastAgent, regenerateNarrative, captureVisualContext) into a dedicated custom hook (following the `useAsyncStatus` pattern). Keep App.tsx as a thin orchestrator.

---

## Never
- Do not touch `apps/desktop/src-tauri/` (Rust shell) — Tauri changes need manual testing outside the loop.
- Do not modify `.env` or commit secrets.
- Each task gets its own `improve/<slug>` branch and PR — human reviews and merges.
- Do not change `vite.config.ts` port (5173) or `tauri.conf.json` in tandem without flagging it.
