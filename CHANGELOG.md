# Changelog

## 2026-06-22

- 12:13 UTC — **improve**: Dark mode token audit — fixed `.error-retry` invisible (#fecaca) in light mode, restored dark-appropriate pastel `.bar-track` segment colors overwritten by light mode CSS, fixed `.capture-error`/`.import-error` low contrast in dark mode (`styles.css`)
- 12:41 UTC — **curator**: Visual pass ran (Playwright, all 6 screens × light/dark/compact); reprioritized ## Next around UI/UX polish — surfaced dead Split Block button, clipped capacity-model legend, toolbar icon a11y gaps, unrendered blocker_flag; reconciled narrative-export item (plain Copy Summary already exists) and App.tsx line count (1510); added headless-dark-mode + a11y notes to NOTES.md
- 13:15 UTC — **improve**: Dead "Split Block" button — added `disabled` + `title="Block splitting is coming soon"` to the no-op button in `apps/desktop/src/components/ledger/BlockCard.tsx`; passed self-review
- 14:05 UTC — **improve**: Capacity-model legend unclipped — removed `max-height`/`overflow` caps from `.allocation-grid` and `.capacity-model` in `styles.css` so all 8 category rows render fully; passed self-review
