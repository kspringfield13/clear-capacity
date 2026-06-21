---
name: validate
description: Run the full pre-PR validation checklist for ClearCapacity. Use before opening a PR or after significant changes.
disable-model-invocation: true
---

Run the following three checks in sequence and report the result of each:

1. **TypeScript + bundle**: `npm run build`
2. **Dependency audit**: `npm audit --audit-level=moderate`
3. **Rust compilation**: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`

For each check, report whether it passed or failed. If it failed, show the relevant error output. At the end, summarize: "X/3 checks passed" and list any action items needed before the PR is ready.
