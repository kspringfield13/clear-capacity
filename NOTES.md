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
- **Verification gate**: `npm run build` (`tsc -b && vite build`) must pass before committing. There is no automated test suite.
- **Out of loop scope**: `apps/desktop/src-tauri/` (Rust), `.env`, and the 5173 port config are off-limits to the frontend loop. Anything needing Rust (model params, request bodies, JSON schemas, per-command model routing) is a manual follow-up — leave a clear note in STATUS.md.

## Recurring UX rough edges (watch for these)
- **Don't render raw enum/snake_case values in the UI**: domain enums like `PrivacyLevel` (`local_only`/`derived_only`/`excluded`) must pass through a humanizing helper in `lib/format.ts` (the `auditTypeLabel` pattern) before display — never `{event.privacy_level}` directly.
- **Group paired nav controls**: when chevrons/prev-next controls straddle a long headline (e.g. `.week-nav` in `WeeklyCapacityScreen`), they drift apart and the disabled one becomes invisible. Keep paired controls adjacent and give `:disabled` a visible low-opacity + `cursor: not-allowed` state.
- **Intensity-coded grids need a legend**: `data-level` heatmap cells (`ActivityHeatmap`) are meaningless without a "Less → More" key.

## Open architectural notes
- `App.tsx` is a large orchestrator (~1.5k lines) being incrementally decomposed into `components/`, `hooks/`, and `lib/`. New async operations should land as dedicated hooks, not inline in `App.tsx`.

---
_Entries below are appended by autonomous runs. Keep the file curated — prune stale notes as you add new ones._
