# CLAUDE.md — auto-rebaser

This file is read on every Claude Code session opened in this repo.
The universal context at ~/.claude/CLAUDE.md applies first; this file
overrides for project-specific things.

## What this project is

Chrome / Firefox extension that polls your authored GitHub PRs, auto-rebases the ones that fall behind, and runs a small set of opt-in cleanup automations (auto-delete merged branches, auto-enable auto-merge with smart method selection, direct-merge clean PRs, resolve obsolete review threads, stale-PR badge + reviewer ping). Local-first, no backend; runs in the extension service worker against the GitHub API. Multi-account on v2; GitHub Enterprise Server supported.

## Stack

- TypeScript 5.5 + React 18 (popup only)
- Vite 6 (build), Vitest 3.2 (~1020 unit tests), Playwright 1.59 (e2e)
- MV3 Chrome extension; parallel Firefox build via `TARGET=firefox vite build`
- Auth: OAuth Device Flow against a GitHub App; PAT legacy path
- Storage: `chrome.storage.local` (auth tokens, settings, ETag cache, activity log)
- No backend, no DOM in `src/core` or `src/github`, no React in `src/background`

## Links

- **Repo** — https://github.com/bradygrapentine/auto-rebaser
- **Chrome Web Store** — https://chromewebstore.google.com/detail/auto-rebaser/fcbanfgcfcjmhnoanachedlpbopiodpi
- **Firefox Add-ons** — listed (v2.0.0 live per recent backlog)
- **Deployment** — none (client-side extension)
- **Sentry** — none
- **PostHog** — none
- **tmux session** — `cc-auto-rebaser`

## Layout

- `src/core/` — storage primitives, shared types. No DOM, no React.
- `src/github/` — REST + GraphQL clients, endpoint wrappers. No DOM.
- `src/background/` — service worker, alarm, poll cycle, state machine, automations orchestrator. No React.
- `src/popup/` — React popup (views, components, hooks). Terminal-inspired theme (JetBrains Mono, Tokyo Night).
- `tests/` — Vitest unit tests mirroring `src/` layout (`tests/{core,github,background,popup}`).
- `e2e/` — Playwright E2E tests against built extension.
- `manifest.json` / `manifest.firefox.json` — MV3 manifests per target.
- `dist/` / `dist-firefox/` — build outputs.
- `docs/` — committed knowledge: decisions, runbooks, retros, plans, security, release-notes, superpowers, BACKLOG.md.
- `BACKLOG.md` lives at `docs/superpowers/BACKLOG.md` (canonical work tracker).
- `.claude/sessions/` and `.claude/scratch/` — gitignored session/scratch.
- `.mcp.json` — project-scoped RAG MCP over `docs/`.

## Project conventions

- **Branch protection on `main`**: PRs only. Squash-merge via `gh pr merge --auto --squash`. No direct pushes.
- **Tests required local-green before `gh pr ready`** (universal rule; enforced by hook). Run `npm test && npm run typecheck` before flipping to ready.
- **E2E coverage** lives in `e2e/`; runs via `npm run e2e` (builds first).
- **Multi-account**: every signed-in account polls independently. Per-account vs global setting split matters — see `docs/runbooks/multi-account-migration.md`.
- **Security gate**: OWASP review 2026-05-14 (`docs/security/2026-05-14-owasp-review.md`); SEC-1/2/3/4/6/8 shipped 2026-05-14, SEC-9/SEC-10 via #198. OSV Scanner + Dependency review now **hard-gate** (`continue-on-error` removed in #198). OSV is currently RED on main from two dev-only advisories (vite 5→6, esbuild 0.21→0.25) tracked as OPS-2 — held off the branch-protection required-checks list until OPS-2 clears.
- **Workflow-file changes (`.github/workflows/**`)** should NOT be dispatched to subagents — they stall waiting on CI to validate their own YAML. Do directly.
- **CI runners**: `test` + Security jobs run on the self-hosted mac (`Bradys-MacBook-Air-auto-rebaser`); `e2e` is pinned to `ubuntu-latest` (#209 — the MV3 popup e2e deadlocks on the Mac under load, green on ubuntu). For an **intermittent CI failure you can't reproduce locally, read the trace/artifact BEFORE fixing**; if it isn't captured (a job-timeout/cancel skips `if: failure()` uploads), fix the capture first (`if: always()`, per #205). #204 and #209 shipped two wrong fixes from log-signature guessing before the trace gave the real cause (a popup `POLL_NOW` re-poll storm — see BACKLOG `PERF-1`).
- **Backlog**: edit `docs/superpowers/BACKLOG.md` directly; `/backlog-sync` reconciles against git log.
- **Release notes** land in `docs/release-notes/vX.Y.Z.md`.
- **Settings-read unhandled rejections in component tests**: when a component newly reads global settings (a hook → `getGlobalSetting`) and that surfaces unhandled rejections in PRRow/PRListView/etc. tests, fix the **prod accessor's `?? {}` guard** (e.g. `getGlobalSetting`/`setGlobalSetting` in `storage/multi-account.ts`), NOT the shared `tests/setup.ts` chrome-mock default. Changing the mock's default `storage.get` return (undefined → `{}`) alters storage-error execution paths suite-wide and silently regresses function coverage. Re-run `npm run test:coverage` (exit 0) after either change. Past incident 2026-06-01 (TRIAGE-2 #258): the mock-default fix dropped funcs ~0.4%; the accessor guard had zero coverage side-effect.
- **Shared-helper extraction must wire BOTH paths, not just the new consumer.** When you extract a helper specifically to enforce a "preview and execute feed `decide*` the same adapted objects" (or any "both paths use the same X") invariant — e.g. `buildEligiblePRs`/`buildMergedPRInputs` in `orchestrator.ts`, or the `decide*` predicates behind both `run*` and the preview branch — re-point the OLD path to call it in the SAME change. Wiring only the new consumer leaves a byte-equivalent duplicate on the execute path that can silently drift; the characterization wall passing only proves they match *now*, not that they're unified. If the old path can't be safely re-pointed in that PR, say so and file the rewire as an explicit follow-up — don't imply the paths are unified. Past incident 2026-06-01 (PREVIEW-1 T2, gate-cluster oop should-fix → PREVIEW-7): `buildEligiblePRs`/`buildMergedPRInputs` were extracted for the preview branch but execute kept its inline build.

## Current focus

- **v2.0.0 live** on Chrome + Firefox stores. CONFLICT-1 shipped (#195).
- **CI hardening (2026-05-28/29)**: migrated to self-hosted mac runner (#202); `e2e` pinned to ubuntu after a popup-teardown deadlock (#204/#205/#209); authored + reviewer PR-state stale-chip fixes (#206/#207). See BACKLOG §7.
- **§1 Ready**: OPS-1 (manual branch-protection required-checks config — UI step), OPS-2 (staged vite 5→6 + vitest 1→3 upgrade to clear the OSV advisories).
- **§5 candidates**: PERF-1 (popup `POLL_NOW` re-poll loop for zero-PR accounts — needs SW-side confirmation), SEC-5/SEC-7, DOC-1 (parked).
- **AMO listing copy** still v1-era — autorebaser@gmail.com restored 2026-05-15; needs Edit Product Page refresh (per memory `project_v2_pending_approval.md`).
