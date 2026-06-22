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
- [x] **Empty state polish** — replaced all bespoke empty-state divs with the shared `EmptyState` component; audit log distinguishes "no events yet" vs. "filter returned nothing" with a "Clear filters" CTA; LedgerScreen adds an actionable "Classify N sessions" CTA when unclassified sessions exist; ForecastAgentPanel and ReviewCopilotPanel include primary CTA buttons; harmonized copy across all screens. (2026-06-22)

## In Progress
_(none)_

## Next

### UI & UX Polish
- [ ] **CompactWidget quick-confirm** — The compact mode widget shows blocks but confirm/exclude requires switching to large mode. Add inline confirm/exclude swipe or button directly in `CompactWidget`.
- [ ] **Dark mode token audit** — Run through every screen in dark mode and fix any hardcoded colors or contrast issues that slip past the CSS variable system.
- [ ] **Capacity percentage ring or gauge** — The WeeklyCapacityScreen shows percentage as text. Add a small visual arc/ring component next to the number for immediate at-a-glance reading.

### New Features
- [ ] **Export capacity report** — Add a "Copy as Markdown" and "Download .txt" option on the NarrativeScreen that formats the manager-ready narrative with the week date header for easy pasting into email/Slack.
- [ ] **Block duration edit** — Users can relabel blocks but not adjust their start/end time. Add a time-range editor inline on BlockCard so the duration can be corrected without excluding and re-classifying.
- [ ] **Blocker flag visual treatment** — `blocker_flag: true` exists in the domain model but it's unclear how prominently it surfaces in the UI. Add a red badge or banner on BlockCard and in the WeeklyCapacityScreen risk summary.
- [ ] **Activity heatmap** — On the ledger screen or as a new panel, show a 7-day heatmap of active-window session density by hour so users can spot focus vs. fragmented time visually.

### Code Quality
- [ ] **Split App.tsx** — At 1487 lines, App.tsx is a god component. Move each async operation (classifyActiveWindowSessions, generateReviewCopilotSuggestions, generateForecastAgent, regenerateNarrative, captureVisualContext) into a dedicated custom hook. Keep App.tsx as a thin orchestrator.

---

## Never
- Do not touch `apps/desktop/src-tauri/` (Rust shell) — Tauri changes need manual testing outside the loop.
- Do not modify `.env` or commit secrets.
- Each task gets its own `improve/<slug>` branch and PR — human reviews and merges.
- Do not change `vite.config.ts` port (5173) or `tauri.conf.json` in tandem without flagging it.
