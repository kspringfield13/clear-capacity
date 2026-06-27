---
name: improve
description: One improvement iteration for ClearCapacity. Syncs main, reads STATUS.md, takes the first unchecked task from the top of the Next backlog, implements it (loop-safe slice only for [manual / Rust] items), verifies (npm run build, plus /verify for UI tasks), then commits and pushes directly to main and records the change. Safe scope: apps/desktop/src/ and packages/ only. Run as a single sequential session — never fan out parallel runs.
---

You are running one iteration of the ClearCapacity improvement loop.

This loop commits **directly to `main`** — there are no feature branches and no PRs.
That trades away the PR review gate, so two rules are load-bearing:
- **Never commit a red build.** The build (and `/verify` for UI) is the only gate.
- **One task = one atomic commit**, so any bad change is a clean `git revert <sha>` away.

Run this loop as **one sequential session** (task → commit → push → next). Do not run
multiple improve sessions concurrently: they would pick the same top-of-backlog task
(producing duplicate work) and race on pushing to `main`.

## Step 0 — Sync main
Make sure you're on `main` and up to date before picking anything:
```
git checkout main
git pull --rebase origin main
```
If the rebase hits a conflict, stop and report it — don't guess.

## Step 1 — Pick the task
Read `STATUS.md` at the repo root.
- If **In Progress** has a task, resume it — don't start a new one.
- Otherwise take the **first unchecked `- [ ]` task reading top-to-bottom through `## Next`**.

`## Next` sections are in priority order and tasks within a section are
dependency-ordered, so "first from the top" is always the correct pick — don't skip
ahead to a later or easier one. Only `- [ ]` lines are tasks; section headings and
italic notes are not. Two things to honor:
- **Ordering tags** like *(do first)* / *(depends on …)* mean exactly that — never
  start a dependent task before its prerequisite has landed in Done.
- **`[manual / Rust]` tasks** need `src-tauri/`, network, or OAuth work that is out
  of scope. Don't skip them — implement only the **loop-safe slice** the task
  describes (frontend + `packages/` only, e.g. an interface + a disabled stub), keep
  the build green, and record the native half as a flagged follow-up in the Done note
  and CHANGELOG. Never touch `src-tauri/`.

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
- Do not proceed until the build is green.

If the build remains broken after two fix attempts, revert your changes with
`git checkout -- .`, move the task to "In Progress" in STATUS.md with a note explaining
the blocker, and stop. Nothing gets committed.

**For UI-affecting tasks** (anything touching a component's render output or `styles.css`),
the build passing is not enough — it won't catch a layout regression. Run `/verify` to
launch the app and confirm the change looks right and nothing adjacent broke. If `/verify`
surfaces a regression, fix it (or revert and move the task to In Progress) before committing.

## Step 5 — Commit and push to main
Only once the build is green (and `/verify` is clean for UI tasks):

1. Stage only the files you changed (never `git add -A`):
   ```
   git add <file1> <file2> ...
   ```
2. Commit with a clear message — imperative summary under 72 chars, then a short body
   explaining what changed and why (which STATUS.md task it addresses):
   ```
   git commit -m "<imperative summary>

   <1-3 lines: what changed and which STATUS task it closes>

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```
3. Push directly to main, syncing first so the push is always a fast-forward:
   ```
   git pull --rebase origin main && git push origin main
   ```
   - If the push is **rejected** because something landed in the meantime, re-run
     `git pull --rebase origin main` and push again.
   - If the rebase hits a **conflict**, do not force anything — abort
     (`git rebase --abort`), leave the task in "In Progress" with a note, and stop.
   - On transient network errors, retry up to 4 times with exponential backoff
     (2s, 4s, 8s, 16s).
4. Capture the commit SHA (`git rev-parse --short HEAD`) for the records below.

## Step 6 — Record and notify
1. **STATUS.md** — move the completed task from "Next" to "Done" with a one-line note on
   what you changed and the commit SHA. If blocked, leave it in "In Progress" with a note.
   Clear "In Progress" once done.

   Format for a done entry:
   ```
   - [x] **Task name** — what you did, files changed, `<short-sha>` (YYYY-MM-DD)
   ```
   Keep "Done" lean: it's a rolling log, not an archive. Add your entry at the top and,
   if "Done" exceeds ~15 entries, drop the oldest — full history lives in git.

2. **CHANGELOG.md** — append a dated one-line entry summarizing the change (and, for a
   `[manual / Rust]` task, the flagged native follow-up).

   Commit these bookkeeping updates (they can ride in the same commit as the change if you
   update them before Step 5, or as a small follow-up commit — either is fine, but don't
   leave them uncommitted).

3. **Notify** — end the run with a concise one-line summary suitable as a notification, so
   the change is reviewable at a glance and revertable if unwanted:
   ```
   ✅ <task name> — <short-sha> (<n> file(s)). Revert with: git revert <short-sha>
   ```

## Stop condition
One task completed + build green (+ /verify clean for UI) + commit pushed to main +
STATUS.md and CHANGELOG.md updated + summary emitted = done. Do not start a second task in
the same run.
