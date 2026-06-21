# STATUS.md — ClearCapacity Improvement Loop

The loop reads this file first and writes it last.
Never touch `src-tauri/` (Rust), `.env`, or push to remote.
Verification gate: `npm run build` must pass before marking done.

---

## Done
- [x] **Toolbar actions slot** — replaced empty `toolbarActions: []` with screen-aware IIFE in `App.tsx`; Classify/Review Copilot/Forecast/Regenerate now appear in the toolbar as primary actions with correct disabled states. [PR #2](https://github.com/kspringfield13/clear-capacity/pull/2) (2026-06-21)

## In Progress
- [ ] **Async status hook** — BLOCKED: committed `App.tsx` is incompatible with the async `localStore.ts` and `AIConfig`-extended `models.ts` that are uncommitted in the working tree. The hook was written (`useAsyncStatus.ts`) and all call sites mapped, but `npm run build` fails with pre-existing type errors before my changes are even reached. Unblock by committing the full in-progress refactor on this branch first, then retry.

## Next

### UI & UX Polish
- [ ] **Async status hook** — see In Progress above; retry after base-branch refactor is committed.
- [ ] **Retry buttons on error states** — Classification, review copilot, forecast, narrative, and visual context errors surface messages but offer no retry CTA inline. Add a "Try again" button wherever an error state is shown.
- [ ] **Keyboard navigation between screens** — Add `⌘1`–`⌘6` shortcuts mapped to the six main screens (setup, ledger, daily, weekly, narrative, audit). Hook into the existing `window.addEventListener` pattern in App.tsx.
- [ ] **Audit log search/filter** — The AuditLogScreen shows a flat list of up to 1000 events. Add a text filter input that narrows by title/summary, and a type-filter dropdown using the existing `AuditEventType` union.
- [ ] **Week selector on WeeklyCapacityScreen** — Currently locked to current week. Add previous/next week chevrons so users can review prior weeks' capacity without losing state.
- [ ] **Onboarding progress indicator** — SetupScreen exists but there's no visual progress guide for new users. Add a checklist showing: tracking on → calendar imported → AI configured → first classification run.
- [ ] **Skeleton loading states** — AI operations (classify, review copilot, forecast, narrative) show status strings. Replace with subtle skeleton placeholders so the layout doesn't shift when results arrive.
- [ ] **Empty state polish** — Each screen has a different empty state quality. Audit and harmonize: consistent illustration/icon, headline, and primary CTA per screen.
- [ ] **CompactWidget quick-confirm** — The compact mode widget shows blocks but confirm/exclude requires switching to large mode. Add inline confirm/exclude swipe or button directly in `CompactWidget`.
- [ ] **Dark mode token audit** — Run through every screen in dark mode and fix any hardcoded colors or contrast issues that slip past the CSS variable system.
- [ ] **Capacity percentage ring or gauge** — The WeeklyCapacityScreen shows percentage as text. Add a small visual arc/ring component next to the number for immediate at-a-glance reading.

### New Features
- [ ] **Export capacity report** — Add a "Copy as Markdown" and "Download .txt" option on the NarrativeScreen that formats the manager-ready narrative with the week date header for easy pasting into email/Slack.
- [ ] **Block duration edit** — Users can relabel blocks but not adjust their start/end time. Add a time-range editor inline on BlockCard so the duration can be corrected without excluding and re-classifying.
- [ ] **Blocker flag visual treatment** — `blocker_flag: true` exists in the domain model but it's unclear how prominently it surfaces in the UI. Add a red badge or banner on BlockCard and in the WeeklyCapacityScreen risk summary.
- [ ] **"Mark all confirmed" bulk action** — On DailyReviewScreen, add a "Confirm all" button for when the user trusts all AI-classified blocks and just wants to stamp them verified in one tap.
- [ ] **Activity heatmap** — On the ledger screen or as a new panel, show a 7-day heatmap of active-window session density by hour so users can spot focus vs. fragmented time visually.

### Code Quality
- [ ] **Split App.tsx** — At 1487 lines, App.tsx is a god component. Move each async operation (classifyActiveWindowSessions, generateReviewCopilotSuggestions, generateForecastAgent, regenerateNarrative, captureVisualContext) into a dedicated custom hook. Keep App.tsx as a thin orchestrator.

---

## Never
- Do not touch `apps/desktop/src-tauri/` (Rust shell) — Tauri changes need manual testing outside the loop.
- Do not modify `.env` or commit secrets.
- Each task gets its own `improve/<slug>` branch and PR — human reviews and merges.
- Do not change `vite.config.ts` port (5173) or `tauri.conf.json` in tandem without flagging it.
