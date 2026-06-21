---
name: improve
description: One improvement iteration for ClearCapacity. Reads STATUS.md, picks the top Next task, implements it, verifies with npm run build, and updates STATUS.md. Safe scope: apps/desktop/src/ and packages/ only.
---

You are running one iteration of the ClearCapacity improvement loop.

## Step 1 — Read state
Read `/Users/kyle/dev/clear-capacity/STATUS.md`.
- If "In Progress" has a task, resume it (don't start something new).
- Otherwise pick the top unchecked task from "Next".

## Step 2 — Understand before touching
Read only the files relevant to your chosen task. Do not read the entire codebase speculatively. Key entry points:
- `apps/desktop/src/App.tsx` — root component, all screens and state live here
- `apps/desktop/src/components/<section>/` — per-screen UI components
- `apps/desktop/src/hooks/` — custom hooks
- `apps/desktop/src/lib/` — pure utilities (date, format, blocks, audit, types, ui, constants)
- `apps/desktop/src/services/` — prompt builders and local store
- `packages/domain/src/models.ts` — shared TypeScript types
- `packages/inference/src/` — capacity calculation logic

## Step 3 — Implement
Edit files in `apps/desktop/src/` or `packages/` only.

Rules:
- No changes to `apps/desktop/src-tauri/` (Rust — needs manual Tauri testing).
- No changes to `.env`, `vite.config.ts` port, or `tauri.conf.json`.
- No new `npm` packages without a strong reason — prefer extending what's already installed.
- Use the Vercel Geist design tokens already defined in `apps/desktop/src/styles.css` — never hardcode colors.
- Match the existing code style: no comments unless the WHY is non-obvious, no trailing summaries.
- Keep changes focused on the single task. Don't fix adjacent things.

## Step 4 — Verify
Run: `npm run build`

If it fails:
- Read the error output carefully.
- Fix the type errors or bundle issues.
- Re-run `npm run build`.
- Do not mark the task done until the build is green.

If the build remains broken after two fix attempts, revert your changes with `git checkout -- .`, move the task to "In Progress" with a note explaining the blocker, and stop.

## Step 5 — Commit and push a PR branch
Once the build is green:

1. Create a branch named `improve/<slug>` where `<slug>` is a 2-4 word kebab-case summary of the task (e.g. `improve/toolbar-actions-slot`).
   ```
   git checkout -b improve/<slug>
   ```
2. Stage only the files you changed (never `git add -A`):
   ```
   git add <file1> <file2> ...
   ```
3. Commit with a clear message:
   ```
   git commit -m "<imperative summary under 72 chars>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
   ```
4. Push the branch:
   ```
   git push -u origin improve/<slug>
   ```
5. Open a PR using `gh pr create`. Write the body yourself — do not use a template placeholder. The body must include:
   - **What changed**: which files and what specifically was added/modified
   - **Why**: which STATUS.md task this addresses and the user benefit
   - **How to verify**: the exact manual steps to see the change working in the app (e.g. "run `npm run dev`, navigate to X screen, confirm Y behavior")
   - **Build**: confirm `npm run build` passed

   Example:
   ```
   gh pr create \
     --title "<imperative title>" \
     --body "$(cat <<'EOF'
   ## What changed
   ...

   ## Why
   ...

   ## How to verify
   1. `npm run dev`
   2. ...

   ## Build
   `npm run build` — green ✓

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```
6. Output the PR URL so the user can review it.

After pushing, return to the `codex/product-demo-video` branch (or whatever branch was active before you started):
```
git checkout <original-branch>
```

## Step 6 — Update STATUS.md
Move the completed task from "Next" to "Done" with a one-line note on what you changed and the PR link.
If the task is blocked, leave it in "In Progress" with a note. Clear "In Progress" once done.

Format for done entry:
```
- [x] **Task name** — what you did, files changed, PR link (YYYY-MM-DD)
```

## Stop condition
One task completed + build green + PR open + STATUS.md updated = done. Do not start a second task in the same run.
