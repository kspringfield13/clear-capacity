# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

ClearCapacity is a local-first macOS workload intelligence app. It analyzes calendar events and foreground-app activity to estimate analyst capacity. Built as a Tauri 2 desktop app (Rust shell + React 18 frontend) with shared TypeScript packages.

**Monorepo layout:**
- `apps/desktop/src/` — React UI (components, services, hooks, lib)
- `apps/desktop/src-tauri/src/lib.rs` — Tauri commands (Rust); handles window management, OS integration, AI credential pass-through
- `packages/domain/src/models.ts` — shared TypeScript types (`WorkBlock`, `ActivitySession`, `AIConfig`, etc.)
- `packages/inference/src/` — capacity calculation and session grouping logic
- `packages/integrations/src/calendar/` — Outlook `.ics` parser

## Build & dev commands

```bash
# Web UI only (Vite on 127.0.0.1:5173)
npm run dev

# Full desktop app (Tauri + Vite) — use this for most feature work
npm run desktop:dev

# Production build (tsc type-check + Vite bundle)
npm run build

# Demo mode (synthetic data, doesn't touch user state)
npm run demo

# Desktop production build (can constrain with CARGO_BUILD_JOBS=2)
npm run desktop:build
```

## Pre-PR validation checklist

Run all three before opening a PR:

```bash
npm run build                                                    # type errors + bundle
npm audit --audit-level=moderate                                  # dependency vulnerabilities
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml   # Rust compilation
```

## Environment setup

```bash
npm install
cp .env.example .env   # add OPENAI_API_KEY to enable AI features
```

Optional env vars (in `.env`):
- `OPENAI_API_KEY` — enables AI features; loaded by Tauri at startup, never exposed to the Vite bundle
- `OPENAI_MODEL` / `OPENAI_VISION_MODEL` — override default model names

## Gotchas

- **`DEVELOPER_DIR`** — Desktop scripts set this to `/Library/Developer/CommandLineTools` automatically to avoid requiring full Xcode. Override by exporting it before running.
- **Port 5173** — Hardcoded in both `vite.config.ts` and `tauri.conf.json`. Don't change one without the other.
- **No test suite** — Testing is manual. Use `npm run dev` or `npm run desktop:dev` to validate changes.
- **Demo mode** — `npm run demo` opens with `?demo=1&screen=weekly`. Synthetic data only; "Reset Prototype Data" in demo mode is safe.
- **LocalStorage** — Prototype data stored unencrypted in Tauri webview storage. Users reset via the UI button.
- **Outlook calendar** — Requires manual `.ics` export; no automated sync. Parsed locally, no network call.

## Design system

Uses Vercel Geist design tokens (colors, spacing, typography). See `design.md` for the token reference and `apps/desktop/src/styles.css` for the full token definitions. The UI supports light and dark themes via CSS variables.

## Privacy constraints

Raw activity data (window titles, app names) stays local. Window titles are treated as sensitive — don't log them or include them in any network call without explicit user review. The audit trail in `packages/domain/src/models.ts` (`AuditEvent`) records all user-visible actions for explainability.

## AI integration

Multi-provider abstraction (`AIConfigRequest` in `lib.rs`) supports Anthropic and OpenAI. Provider selection, api_key, base_url, and model flow from the UI through Tauri IPC to the Rust layer — credentials never touch the frontend bundle.
