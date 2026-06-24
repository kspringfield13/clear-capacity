# STATUS.md — ClearCapacity Improvement Loop

The loop reads this file first and writes it last.
Never touch `src-tauri/` (Rust), `.env`, or push to remote.
Verification gate: `npm run build` must pass before marking done.

---

## Done
_(none)_

## In Progress
_(none)_

## Next

### UI & UX Polish
- [ ] **Add Focus Management to BlockCard Time Editor** — time range editor pops up without focusing the first input or providing Escape-key dismiss; add `autoFocus` to first time input, `onKeyDown` Escape handler, and `aria-label="Time range editor"` to the container.
- [ ] **ConfidenceChip level casing is inconsistent** — level comparison uses mixed case (`"Needs review"` vs lowercase logic); normalize to consistent lowercase throughout.
- [ ] **SetupScreen provider status not announced to screen readers** — `ai-provider-status` is conditionally rendered with `role="status"`, but ARIA live regions must be in the DOM before content arrives to announce. Render the container persistently (empty when no status) with `aria-live="polite"` and `aria-atomic="true"` so the connection test result is reliably announced.
- [ ] **ForecastList uses item text as React key** — `key={item}` in `ForecastList.tsx` (line 7) causes React key warnings and DOM thrashing when the AI returns duplicate bullet items. Change to `key={`${index}-${item.slice(0,20)}`}` using the map index.
- [ ] **ActivityCapturePanel uses app_name as React key** — `key={session.app_name}` (~line 97) duplicates when the same app appears more than once in `latestSessionSummaries`. Change to `key={`${session.app_name}-${index}`}`.

### Accessibility
- [ ] **Heatmap legend cells lack aria-labels** — `ActivityHeatmap` legend cells use `data-level` but have no `aria-label`; add `aria-label="Intensity level N of 5"` to each.
- [ ] **EmptyState sections lack descriptive aria-labels** — `<section className="empty-state">` has no `aria-label`; add optional `ariaLabel` prop defaulting to `title`, and pass meaningful labels at each call site.

### Code Quality
- [ ] **AppShell `snapshot: any` type fix** — replace `snapshot: any` with the proper `WeeklyCapacitySnapshot` type in `AppShell.tsx` and `CompactWidget.tsx`.
- [ ] **ReviewCopilotPanel contextual aria-labels** — add suggestion title to Apply/Dismiss button `aria-label`s so screen readers announce which suggestion is being acted on.

---

## Never
- Do not touch `apps/desktop/src-tauri/` (Rust shell) — Tauri changes need manual testing outside the loop.
- Do not modify `.env` or commit secrets.
- Do not change `vite.config.ts` port (5173) or `tauri.conf.json` in tandem without flagging it.
