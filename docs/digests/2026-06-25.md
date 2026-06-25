# Here's what Claude shipped overnight — 2026-06-25

**TL;DR** — 6 improvements shipped (10 commits, some multi-iteration) · 3 curator visual passes · build green · 0 reverts · Kyle merged PRs #22–#29

---

## Shipped (hourly implementer · ~11:07 UTC Jun 24 → ~09:08 UTC Jun 25)

### UX / Visual Polish (2 features)
- **Onboarding checklist hints** — contextual `hint` field added to each step in `SetupScreen.tsx`; hints render as `.onboarding-step-hint` below the label only for incomplete steps (11px, `--text-subtle`); `.onboarding-step` changed to `align-items: flex-start` (`SetupScreen.tsx`, `styles.css`)
- **Risk bar severity tinting** — `data-severity="low|mid|high"` added to `.risk-track > span` in `RiskRow.tsx`; CSS threshold rules for light + dark: low <34 slate, mid 34–66 amber, high ≥67 orange; `dangerActive` red row untouched; `aria-valuetext` now announces severity level (`RiskRow.tsx`, `styles.css`)

### Bug Fixes (3 items, several multi-pass)
- **ActivityCapturePanel React key** *(3 iterations: 14:04 → 15:04 → 16:04 UTC Jun 24)* — converged on stable `${session.app_name}-${index}` composite key; eliminates duplicate-key React warnings when the same app recurs in the session list (`ActivityCapturePanel.tsx`)
- **Category select column width** *(2 iterations: 19:07 → 20:04 UTC Jun 24)* — `.review-screen .tag-grid` first column widened from `minmax(0, 1.5fr)` → `minmax(0, 2.4fr)`; "Documentation / Requirements" renders unclipped at ~55% row width; ledger and mobile rules untouched (`styles.css`)
- **Marooned single-suggestion copilot panel** — `max-width: 760px` caps `.copilot-inline`; grid changed to `repeat(auto-fit, minmax(280px, 1fr))` so a lone card fills its container instead of floating at 360px in an 880px panel (`styles.css`)

### Accessibility (1 item, 2 iterations)
- **SetupScreen provider-status ARIA live region** *(2 iterations: 18:16 → 21:06 UTC Jun 24)* — `ai-provider-status` class always applied (conditional removed); CSS collapses element to `height:0/padding:0/border-width:0/overflow:hidden` when no modifier is active, keeping it in the DOM + AT for live-region registration without `display:none` (`SetupScreen.tsx`, `styles.css`)

---

## Backlog Curation (3 visual passes · 3 curator commits)

| UTC | What the curator did |
|-----|---------------------|
| 18:38 Jun 24 | Visual pass (20 screenshots, 6 screens × light/dark wide+narrow); verified all 7 Next items still valid against code; reordered UI & UX Polish by user-visible impact (category-select truncation now top, React-key last); added audit-grounded onboarding dead-ends item; marked RiskRow Active-blockers unit-mismatch RESOLVED in NOTES |
| 00:40 Jun 25 | Visual pass (24 screenshots, 9 screens incl. forecast/corrections/agent × light/dark + 4 compact); moved ActivityCapturePanel React-key item to Done (already fixed); replenished UI & UX Polish with 2 items (audit-log raw enum leak in App.tsx:514; marooned copilot suggestion); reordered by user-visible impact |
| 06:38 Jun 25 | Visual pass (20 screenshots, 6 screens × light/dark wide+narrow + narrative/corrections close-ups); verified all 6 Next items valid and accurately code-referenced; reordered UI & UX Polish (marooned panel now top); added severity-tinting item for risk bars; noted tinting gap as distinct from the solved count-vs-index split in NOTES |

---

## Status

| Dimension | Count |
|-----------|-------|
| **Done** | 8 items |
| **In Progress** | 0 |
| **Next — UI & UX Polish** | 2 |
| **Next — Accessibility** | 2 |
| **Next — Code Quality** | 1 |
| **Next — Intelligence Engine** | 4 (strategic) |
| **Next — Integrations** | 3 (strategic) |
| **Next — Trust & Verification UX** | 4 (strategic) |
| **Skipped / reverted** | 0 |

> **Tactical backlog:** 5 items remain (2 UI/UX Polish, 2 Accessibility, 1 Code Quality). The queue is healthy — not depleted.
>
> **Strategic backlog:** 11 items across three tracks (Intelligence Engine, Integrations, Trust & Verification). These are larger multi-step bets; the tactical polish queue will clear first.
>
> **Multi-iteration note:** Two fixes this cycle required multiple passes — ActivityCapturePanel React key (3 iterations) and category select width (2 iterations). No regressions reported; both landed cleanly.

(email delivered as draft — Gmail connector exposes create_draft only, no direct send API available in this run; draft ID r4261511126484178343)
