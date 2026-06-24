# NOTES.md — Architectural learnings for the ClearCapacity autonomous loop

Cross-run memory for the autonomous agents (hourly improver, 6-hour UX curator) and human readers.
Cloud sessions are stateless — without this file, every run relearns the codebase from scratch.

**Read this file right after STATUS.md. Append durable learnings here before you commit.**

## How to maintain this file
- Record only DURABLE, reusable insights: established patterns, conventions, gotchas, non-obvious decisions — things that save the next run time.
- Do NOT duplicate CLAUDE.md (build commands, repo layout) or STATUS.md (the task backlog). Refer to them instead.
- Keep it tight and curated (aim < ~150 lines). Update or delete entries that have gone stale; don't append forever.
- This is not a changelog — per-task "what I shipped" lines belong in CHANGELOG.md.

## Established UI patterns — reuse these, don't reinvent
- **Async op state** → use the `useAsyncStatus` hook (`apps/desktop/src/hooks/useAsyncStatus.ts`): `start()/fail()/reset()` instead of paired status+error `useState`. All five AI operations already use it.
- **Empty states** → route every screen's empty case through the shared `EmptyState` component (icon + headline + primary CTA). Don't write ad-hoc empty markup.
- **Inline error recovery** → wrap AI error text in the `.error-row` / `.error-retry` pattern with a "Try again" button wired to the existing retry callback.
- **Loading** → use the `skeleton-shimmer` animation + `.skeleton-line` / `.skeleton-block` utility classes so the layout doesn't shift when results arrive (don't show bare "Generating…" strings).
- **Per-screen toolbar action** → the primary action per screen is wired via the screen-aware `toolbarActions` logic in `App.tsx`.
- **Screen navigation** → ⌘1–⌘6 keyboard shortcuts live in `App.tsx`; respect the input/textarea focus guard when adding any new key handler.

## Conventions
- **Styling**: Vercel Geist design tokens via CSS variables in `apps/desktop/src/styles.css`. Support light AND dark. NO hardcoded hex — add a token with light/dark variants instead.
- **AI prompts**: the five prompt builders in `apps/desktop/src/services/*Prompt.ts` are version-stamped; bump the version string when you change a prompt's behavior.
- **Domain types**: shared types (`WorkBlock`, `ActivitySession`, `AIConfig`, `AuditEvent`, …) live in `packages/domain/src/models.ts`; capacity/grouping logic in `packages/inference/src/`.

## Gotchas
- **Render for visual checks**: the React UI runs in a plain browser via `npm run dev` (Vite, 127.0.0.1:5173); append `?demo=1&screen=<daily|weekly|narrative|ledger|audit|setup>` for synthetic data. Tauri APIs are absent in the browser — demo mode is how you render screens headless.
- **Headless dark mode**: the app does NOT honor `prefers-color-scheme`. Theme is `document.documentElement.dataset.theme`. Setting `localStorage["clear-capacity:theme"]` via `addInitScript` is NOT enough — `App.tsx` inits `theme` state to `"light"` and its mount effect overwrites both `dataset.theme` and the stored key back to light (see theme-persistence bug below). The reliable Playwright recipe: `goto` + wait, then `page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; })` AFTER the app has mounted, then screenshot. (`colorScheme: 'dark'` alone does nothing.)
- **Theme flash on first paint (cosmetic)**: `main.tsx` sets `dataset.theme = "light"` synchronously then async-patches it; `App.tsx`'s mount effect briefly resets to "light" before hydration resolves. Cosmetic only — preference is now correctly persisted (see fix below).
- **Playwright in the sandbox**: the chromium CDN download is blocked, but a usable browser ships at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` — pass it as `executablePath`. Install the `playwright` npm module under /tmp, never in the repo.
- **Icon-only button a11y convention**: chrome/icon buttons should carry both `title` and `aria-label` (plus `aria-pressed` for toggles). The theme toggle in `AppToolbar.tsx` is the reference; match it when adding icon controls.
- **Screen-reader live regions**: use `role="alert"` on a conditionally-rendered element (or a persistently-rendered element whose content changes) to announce validation errors to screen readers. The `.sr-only` utility class in `styles.css` (1×1px, clipped, absolute, `border: 0`) hides the element visually without removing it from the accessibility tree — use it for any visually-hidden but SR-meaningful text.
- **Verification gate**: `npm run build` (`tsc -b && vite build`) must pass before committing. There is no automated test suite.
- **Out of loop scope**: `apps/desktop/src-tauri/` (Rust), `.env`, and the 5173 port config are off-limits to the frontend loop. Anything needing Rust (model params, request bodies, JSON schemas, per-command model routing) is a manual follow-up — leave a clear note in STATUS.md.

## Recurring UX rough edges (watch for these)
- **Don't render raw enum/snake_case values in the UI**: domain enums like `PrivacyLevel` (`local_only`/`derived_only`/`excluded`) and `PlannedStatus` (`planned`/`unplanned`/…) must pass through a humanizing helper in `lib/format.ts` (`auditTypeLabel`/`plannedStatusLabel`/`privacyLevelLabel`) before display — never `{event.privacy_level}` directly. Note `WorkCategory`/`WorkMode` are stored as already-human strings in `taxonomy.ts`, but `CorrectionsScreen` renders `old_value`/`new_value` blind across ALL field types, so planned-status edits leak lowercase and time edits leak raw ISO strings — humanize by `correction.field`.
- **Group paired nav controls**: when chevrons/prev-next controls straddle a long headline (e.g. `.week-nav` in `WeeklyCapacityScreen`), they drift apart and the disabled one becomes invisible. Keep paired controls adjacent and give `:disabled` a visible low-opacity + `cursor: not-allowed` state.
- **Intensity-coded grids need a legend AND non-visual semantics**: `data-level` heatmap cells (`ActivityHeatmap`) need a "Less → More" key (done) plus per-cell `role="img"`+`aria-label` and a grid summary — hover `title` alone is invisible to keyboard/SR. They also look broken when sparse: the full 7×24 grid renders whenever there is ≥1 session, so a single active day reads as an empty box — add a low-data caption.
- **Numeric metric rows need scale + consistent units**: bare numbers like the `RiskRow` magnitudes ("33/90/10/46") read as ambiguous without a "/100" hint or a `title` tooltip; never mix a raw count (Active blockers) into a list of 0–100 indices with identical bar styling — distinguish the unit visually. Same rule for chips: `ConfidenceChip`'s "Medium 76%" is on every BlockCard topline but never says it's *classification confidence* — a labeled percentage still needs a hover tooltip stating what it measures, and a 0 value should read "Unscored" not "Needs review 0%".
- **Color-only legend keys need hover crosslinks**: prefer bidirectional hover-highlight between legend rows and bar segments (dim non-hovered peers to ~0.3–0.35 opacity with a 0.12s transition) over relying on color alone. `categoryColors` palette now has no near-duplicate hues — keep it that way when adding categories.
- **Narrow-layout header actions must opt into the full-width media query**: the `@media (max-width: 600px)` block in `styles.css` only full-widths `.primary-action`/`.secondary-action`/`.header-actions`/`.summary-score`/`.search-box`. Any NEW header-action wrapper class (e.g. `.review-header-actions`) is an orphan — its buttons each take `width: 100%` in a non-wrapping flex row and the trailing one overflows off-screen. When adding a per-screen header action group, add its class to that rule and stack it (`flex-direction: column`).
- **Stacked-bar segments need a remainder + per-segment a11y label**: `StackedBar` only renders the colored category segments; when they sum to <100% the container background shows as an unexplained gray tail. Render an explicit "Unallocated / buffer" remainder span and give every segment an `aria-label` (hover `title` alone is invisible to keyboard/SR users). Same applies to `RiskRow` magnitude bars — use `role="meter"` + `aria-valuetext`.
- **Audit-type pills are keyed by a per-type CSS class**: `AuditEventRow` sets `className={`audit-badge ${event.type}`}`, so EVERY `AuditEventType` needs a matching `.audit-badge.<type>` rule in `styles.css` with a *tinted* background + colored text (light AND dark). The convention is one distinct hue per type (sky/violet/teal/amber/blue/green/red…); a colorless `var(--text)`-on-transparent rule (as `narrative_generation` currently has) reads as un-styled and breaks the set. When a new audit type is added, add its tinted badge rule the same way.

## Open architectural notes
- `App.tsx` is a state-wiring orchestrator (~828 lines). Decomposition complete: AI ops in `hooks/use*.ts`, toolbar actions in `lib/toolbarActions.ts` (`buildToolbarActions`), screen routing in `components/shell/ScreenRouter.tsx`. Future growth should land in new hooks or components, not App.tsx.

---
_Entries below are appended by autonomous runs. Keep the file curated — prune stale notes as you add new ones._
