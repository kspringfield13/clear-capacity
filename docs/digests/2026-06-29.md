# Here's what Claude shipped overnight — 2026-06-29

**TL;DR** — 26 improvements shipped · 4 visual passes ran (all clear) · backlog cleared to 0 open tasks · build green · 0 reverts

---

## Shipped (hourly implementer)

A high-velocity overnight run covering trust/onboarding UX, a new proactive alert engine, the multi-week Trends screen, a full Workplace Chat signal pipeline, and a final polish pass that swept all three visual-pass items within hours of them being filed. All commits went directly to main.

### Trust & Onboarding UX

- **Guard destructive reset with confirm dialog + export nudge** (#100) — new reusable `ConfirmDialog` (`role="alertdialog"`, Tab trap, Esc cancel, focus restore); "Reset data" button names exactly what is deleted and offers an "Export my data first" escape hatch wired to `serializeWorkLedger`/`serializeAuditTrail` + `downloadTextFile` (`ConfirmDialog.tsx`, `CorrectionsScreen.tsx`, `styles.css`)

### Navigation & Proactive Alerts

- **Settings reachable on narrow viewports** (#102) — narrow-only fifth `.nav-item-settings` entry in `AppShell.tsx`; hidden at desktop, revealed inside the ≤760px block where the bottom `.settings-button` is hidden — exactly one Settings control at every width; balanced agent-mode narrow grid to 3+2 (`AppShell.tsx`, `styles.css`)
- **Proactive menu-bar alert engine with capacity guardrail** (#103) — evaluates six rules (overloaded, high-reactive, high-meeting, high-context-switch, high WIP, low reliable capacity); fires a macOS tray notification when the weekly snapshot crosses a threshold (`lib.rs`, `App.tsx`, hooks)
- **Four more proactive rules + dynamic tray tooltip** (#104) — added "high interruption load," "low deep-work," "high unplanned ratio," and "approaching retention limit" rules; tray tooltip now dynamically surfaces the current week's top metric (`App.tsx`, `lib.rs`)
- **Dedicated Notifications settings section; rename tray Preferences → Settings** (#105) — configurable per-rule notification toggles in SetupScreen; tray menu item renamed for consistency (`SetupScreen.tsx`, `lib.rs`, `styles.css`)

### Multi-Week Trends Screen

- **Multi-week capacity Trends screen** (#107) — new `TrendsScreen.tsx` under the Week section; four-series SVG line chart (allocated, deep-work, reactive, reliable) over the full `snapshotHistory`; per-dot `<title>` + `role="img"` a11y; legend, axis labels, and a subtitle showing rolling forecast accuracy (`TrendsScreen.tsx`, `lib/ui.ts`, `styles.css`)
- **Append "weeks" unit to Trends forecast-accuracy subtitle** (#114) — subtitle now renders "…over the last 3 weeks." (with singular guard for `week_count === 1`) instead of the truncated "…over the last 3." (`TrendsScreen.tsx`)
- **Consolidate forecast track-record onto Trends tab** (#115) — removed the duplicated `<ForecastTrackRecord>` panel from `ForecastScreen`; predicted-vs-actual audit list now lives on Trends only; Forecast keeps its accuracy banner + trend line (`ForecastScreen.tsx`, `ScreenRouter.tsx`)
- **Trends legend↔line hover crosslink** (#123) — `hoveredSeries` state dims the three non-hovered series + legend rows to 0.3 opacity on hover; mirrors the `WeeklyCapacityScreen`/`StackedBar` `hoveredCategory` pattern; inline-style opacity (global reduced-motion reset applies) (`TrendsScreen.tsx`)

### AI & Feedback UX

- **Toast notification layer for async success/error feedback** (#108) — new `hooks/useToasts.ts` (in-memory queue, 5s auto-dismiss, stack capped at 4, timers cleared on unmount) + `ToastHost.tsx` (`role="status"`/`aria-live="polite"`, tone icon, optional action, slide-in); calendar-import success, confirm-all, clipboard copy, and previously-swallowed AI errors now surface toasts (`useToasts.ts`, `ToastHost.tsx`, `App.tsx`, `styles.css`)
- **Consistent inline retry on AI error states** (#109) — new `InlineError.tsx` (`role="alert"`, `AlertTriangle` icon, optional Retry button); replaces four distinct plain-text/boxed error rows across `ReviewCopilotPanel`, `ForecastAgentPanel`, both `NarrativeScreen` branches, and `ActivityCapturePanel`; removed dead `.copilot-error`/`.forecast-error`/`.narrative-error` CSS rules (`InlineError.tsx`, `styles.css`, 4 components)
- **Feed correction biases into the classifier; "learned from your edits" note** (#110) — correction-bias analysis now seeded into AI classification calls so the model receives the user's observed mislabel patterns; a muted "Learned from your edits" note surfaces when ≥1 bias is passed (`useClassification.ts`, `classify prompt`, `ForecastScreen.tsx`)
- **Guided AI-provider config in Settings** (#111) — `AIProviderPreset` extended with `baseUrlNote`/`visionNote`/`modelSuggestions`/`docsUrl`; helper `<small>` text under Base URL and Vision Model; click-to-fill `aria-pressed` model chip row; external docs link per provider (`aiProviders.ts`, `SetupScreen.tsx`, `styles.css`)

### Agent UX

- **Agent chat: stop-generation, stream recovery, follow-up prompts** (#116) — (a) `AbortController` threaded into `streamText`; Stop button replaces Send while streaming; aborted partial text kept, no error shown. (b) Retry replays history sliced before the failed turn; genuine errors mark `interrupted: true` and no longer fall back to a second Rust reply. (c) Snapshot-derived `followUpSuggestions` (capped at 3) render as chips below the latest settled reply (`AgentScreen.tsx`, `lib/types.ts`, `styles.css`)

### Workplace Chat Signal Pipeline

- **Chat-export parser → reactive-work signal** (#117) — new `packages/integrations/src/chat/chatExport.ts` (+ `fixture.ts`); `parseChatExport` → `chatMessagesToImport` → `importChatExport` pipeline; generalized `slack` `SourceType` to generic `chat` (vendor rides on per-message `provider` field); privacy: no text/body field exists so message content never reaches `RawEvent` or `WorkBlock.evidence` (`chatExport.ts`, `models.ts`, `rawEvents.ts`)
- **Provider-agnostic `ChatSource` contract + descriptor registry** (#118) — `CHAT_PROVIDERS` registry (slack=`file_import`+`loopSafe`, teams/webex=`oauth`+`!loopSafe`); `createChatExportSource()` + `createOAuthChatSource(descriptor, fetcher)` factories; empty-input hardening in `parseChatExport`; **[manual / Rust]** OAuth follow-up documented in module header (`chatSource.ts`)
- **SetupScreen "Workplace chat" data-source rows** (#119) — Slack file-import control + disabled Teams/Webex connect buttons; `.chat-connect-options` wrapper (mirrors `.calendar-connect-options`); full `chat_import` `AuditEventType` (4-file recipe: `models.ts`, `format.ts`, `AuditLogScreen.tsx`, `styles.css`); `importWorkplaceChat` handler in `App.tsx` upserts reactive blocks by stable `imported-<hash>` id + emits audit event + toast (`SetupScreen.tsx`, `App.tsx`, `audit.ts`)
- **Chat interruption / context-switch signal** (#124) — new `analyzeInterruptionLoad(chatEvents, workBlocks)` + `InterruptionLoadAnalysis` in `capacity.ts`; reports burst frequency, messages-per-active-hour density, `@`-mentions, and `interrupted_deep_work_pct`; scoped to current ISO week; persisted `chatEvents` store via retained-history recipe; surfaced as `.interruption-note` panel on `WeeklyCapacityScreen` (`capacity.ts`, `App.tsx`, `useDerived.ts`, `WeeklyCapacityScreen.tsx`)
- **Stakeholder collaboration map from chat metadata** (#125) — new `summarizeChatStakeholders(chatEvents, {limit})` + types in `capacity.ts`; ranks stakeholder groups by reactive message volume (multi-channel bursts split evenly); returns `null` on zero volume; "Who your reactive time served" chip row on Weekly; shared `weekChatEvents` memo in `useDerived.ts` feeds both interruption and stakeholder signals (`capacity.ts`, `useDerived.ts`, `WeeklyCapacityScreen.tsx`, `styles.css`)
- **Dedup Teams/Webex chat calls against calendar meetings** (#126) — `chatExport.ts` adds `call`/`huddle` `ChatSurface`s; `chatMessagesToImport` groups bursts by provider+kind, emitting `Meetings` blocks for calls and keeping reactive defaults for text; new pure `dedupeChatCallsAgainstCalendar` + `spansOverlap` in `chat/callDedup.ts`; wired into both import paths in `App.tsx` (order-independent); call events excluded from `chatEvents` store; always audited with dedup count in toast (`callDedup.ts`, `chatExport.ts`, `App.tsx`)

### Label & UX Clarity

- **Relabel Forecast Agent hero card to "AI reliable estimate"** (#121) — the AI's `reliable_new_work_capacity_pct` card now reads "AI reliable estimate" instead of reusing "Reliable new-work capacity," eliminating the collision with the deterministic metric shown ~200px away (`ForecastAgentPanel.tsx`)
- **Demote Agent composer paperclip to a status indicator** (#122) — no-op `<button>` (pointer cursor, focus ring, tab stop) changed to `<span role="img">`; removed dead `.agent-attach:hover` rule; tab order and a11y name preserved (`AgentScreen.tsx`, `styles.css`)

### Final Visual-Pass Polish (all 3 from morning curator pass, cleared same session)

- **Scroll-shadow affordance on internally-scrolling content screens** (#128) — `.capacity-screen`, `.forecast-screen`, `.settings-screen` now carry the proven `.ledger-list` `background-attachment: local`/`scroll` scroll-shadow (24px/40px bands); reveals "more below" cue without layout regression (`styles.css`)
- **BlockCard relabel selects have visible field labels** (#129) — each `.tag-grid` `<select>` wrapped in `<label className="tag-field">` with a micro-label span (`.tag-field-label`; 11px, `var(--text-subtle)`, uppercase); click-to-focus association; `.ledger-screen` density override keeps Activity cards compact (`BlockCard.tsx`, `styles.css`)
- **Chat interruption-load tiles get consistent non-hover-only explanations** (#130) — all four `.interruption-stat` tiles now carry `title` + `.sr-only` explanation spans (matching `ConfidenceChip`/`.block-capacity` convention); sr-only content is explanation-only (not a restatement of the visible value) to avoid screen-reader double-announcement (`WeeklyCapacityScreen.tsx`)
- **Prune persisted `chatEvents` by `retentionDays`** (#131) — the retained chat `RawEvent` store now pruned by the same retention-expiry `useEffect` as `activeWindowSamples`, using `event.timestamp_end` as the age point; same-reference guard prevents render loops; current-week signals provably safe (min retention = 7 days) (`App.tsx`)

---

## Backlog curation (6-hour curator)

The curator ran **4 visual passes** during the 24-hour window, each covering 24–40 Playwright screenshots (all screens × light/dark × wide + 420px narrow in demo mode):

1. **~12:45 UTC June 28** (#101) — Reconciled 2 a11y items to Done (color-only signaling + data-viz legends both already solved in code); promoted the confirmed "Settings unreachable on narrow" gap to #1 Next; merged the two polish subsections; visual pass ran.

2. **~18:41 UTC June 28** (#113) — Reconciled Trends backlog items post-feature work; added 2 source-verified Trends polish items (subtitle missing "weeks" unit + forecast track-record duplicated on two tabs); visual pass ran. Both items shipped within 2 hours.

3. **~00:47 UTC June 29** (#120) — Post-Workplace-Chat pass (33 screenshots, 11 screens × 3 widths); Workplace Chat family confirmed complete; replenished `### Interaction & Visual Polish` with 3 source-verified items (hero card label collision, dead paperclip button, Trends crosslink gap); visual pass ran. All 3 items shipped within 3 hours.

4. **~06:52 UTC June 29** (#127) — 6-hour visual pass (24 base + targeted screenshots); confirmed zero element-level clipping on any of 11 screens; Workplace Chat family marked fully shipped and subsection removed from Next; replenished with 3 clarity items (scroll-shadow gap, BlockCard field labels, interruption-tile tooltips) plus the chatEvents retention privacy gap. All 4 items shipped by 10:09 UTC the same morning — clearing the backlog entirely.

**Also shipped:** `docs(prompt-tuning): weekly proposal 2026-06-29` — weekly prompt-tuning configuration update (no source code change).

---

## Status

| | |
|---|---|
| Done | 10 (capped per housekeeping rule; full history in git) |
| In Progress | 0 |
| Next — Interaction & Visual Polish | 0 (section header present, no open tasks) |
| Next — Intelligence Engine | 0 (reference pattern only; no active tasks) |
| Next — Trust & Verification UX | 0 (reference pattern only; no active tasks) |
| **Total remaining** | **0** |

Nothing is In Progress. No tasks were skipped or reverted. The three `## Next` subsections carry only their description/reference text — the implementer cleared every task the morning curator filed before the next digest window opened. The Workplace Chat & Collaboration Signals subsection was removed by the curator after all 6 tasks shipped.

---

(email delivery: Gmail connector available but send tool absent — draft created in kspringfield13@gmail.com inbox as best-effort delivery)
