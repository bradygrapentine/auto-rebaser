# Auto-Rebaser — Implementation Plan v2 (Modular)

> **Supersedes** `2026-05-02-auto-rebaser.md`. v1 stays in git history for reference but should not be executed. v2 splits the monolithic `github-client.ts` and `service-worker.ts` into single-responsibility modules, adds coverage tooling, fixes plan gaps, and introduces a multi-agent execution model.

**Goal:** Build a Chrome MV3 extension that polls GitHub for all open authored PRs and automatically rebases any that are behind their base branch. Target ~95% test coverage.

**Architecture:** Three layers with strict dependency direction — `core` (storage, types, auth) → `github` (HTTP + endpoints) → `background` (orchestration) and `popup` (UI). No layer imports from a layer above it.

**Tech Stack:** TypeScript, React 18, Vite 5, Vitest 1 + `@vitest/coverage-v8`, `@testing-library/react`, `@types/chrome`

---

## Modular File Map

```
auto-rebaser/
  manifest.json
  package.json
  tsconfig.json
  vite.config.ts
  .env.example
  .gitignore
  README.md
  src/
    core/                                ← shared, pure-ish, no DOM, no React
      types.ts                           ← PRRecord, PRState, Settings, PRStore, etc.
      constants.ts                       ← STORAGE_KEYS, ALARM_NAME, DEFAULTS
      auth-store.ts                      ← getToken / setToken / clearToken (sync)
      etag-cache.ts                      ← getETag / setETag / wrap-with-etag
      pr-store.ts                        ← loadStore / saveStore / upsertPRs / pruneStale
      settings-store.ts                  ← loadSettings / saveSettings (sync)
      auth.ts                            ← OAuth signIn / signOut — usable from popup or SW
    github/                              ← GitHub REST adapter
      http.ts                            ← request() with auth + ETag + error mapping
      endpoints.ts                       ← searchAuthoredPRs / getPR / updateBranch / getAuthenticatedUser
    background/                          ← service-worker-only
      state-machine.ts                   ← pure: deriveStateFromPR, mapUpdateBranchError
      badge.ts                           ← setBadgeCount / clearBadge
      alarm.ts                           ← setupAlarm / clearAlarm
      poll-cycle.ts                      ← runPollCycle() — orchestrates
      messages.ts                        ← handleMessage + registerMessageListener
      service-worker.ts                  ← entry: registers listeners, calls setupAlarm
    popup/
      main.tsx                           ← React root mount
      App.tsx                            ← top-level view router
      views/
        SignInView.tsx                   ← unauthenticated state
        PRListView.tsx                   ← list of PRs + Poll now
        SettingsView.tsx                 ← interval picker + sign out
      components/
        StatusBadge.tsx                  ← color-coded badge per PRState
        PRRow.tsx                        ← single PR list row
        Header.tsx                       ← title + signed-in username
      hooks/
        useAuth.ts                       ← signed-in state + signIn/signOut wrappers
        usePRStore.ts                    ← live-updating PRStore
        useSettings.ts                   ← settings + saveSettings
  tests/
    setup.ts                             ← chrome global mock + env stubs
    core/
      auth-store.test.ts
      etag-cache.test.ts
      pr-store.test.ts
      settings-store.test.ts
      auth.test.ts
    github/
      http.test.ts
      endpoints.test.ts
    background/
      state-machine.test.ts
      badge.test.ts
      alarm.test.ts
      poll-cycle.test.ts
      messages.test.ts
    popup/
      hooks/useAuth.test.tsx
      hooks/usePRStore.test.tsx
      hooks/useSettings.test.tsx
      components/StatusBadge.test.tsx
      components/PRRow.test.tsx
      components/Header.test.tsx
      views/PRListView.test.tsx
      views/SettingsView.test.tsx
      views/SignInView.test.tsx
      App.test.tsx
  docs/superpowers/
    ROADMAP.md
    BACKLOG.md
    RUNBOOK.md
    specs/2026-05-02-auto-rebaser-design.md
    plans/2026-05-02-auto-rebaser.md           (v1 — superseded)
    plans/2026-05-02-auto-rebaser-v2.md        (this file)
```

---

## Coverage Strategy

Configured in `vite.config.ts` via `@vitest/coverage-v8`:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html'],
  thresholds: { lines: 95, functions: 95, branches: 88, statements: 95 },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: [
    'src/popup/main.tsx',                  // entry point — render only
    'src/background/service-worker.ts',     // entry point — listener registration
    'src/core/constants.ts',                // pure constants
    '**/*.d.ts',
  ],
}
```

Excluding two entry-point files is the standard pattern — they're glue code that wires modules at runtime and don't contain testable logic. Every other file must hit the thresholds.

---

## Plan Gap Fixes (vs v1)

| Gap | Fix |
|---|---|
| `mergeable_state` only handled `behind`/`dirty` | `state-machine.ts` maps all values: `behind`/`dirty` → action; `unknown` → keep prior state (compute pending); everything else → `current` |
| Closed/merged PRs accumulated forever | `pr-store.pruneStale(activeIds)` removes PRs not in latest search results |
| `update-branch` returns 202 (async) — no verification | `updating` state set optimistically; next poll re-checks `mergeable_state` to confirm |
| No popup auth UI | `SignInView` + `useAuth` hook + `Header` shows signed-in user |
| No coverage tooling | `@vitest/coverage-v8` with thresholds enforced in CI script |
| Manifest required `host_permissions` for fetch | Added in scaffold |
| Test env vars for `import.meta.env.VITE_*` | `tests/setup.ts` calls `vi.stubEnv()` |
| No runbook | `docs/superpowers/RUNBOOK.md` covers OAuth setup, install, manual tests, troubleshooting |

---

## Multi-Agent Execution

| Phase | Owner | Branch | Files |
|---|---|---|---|
| 1 — Foundation | Me (direct) | `main` | scaffold, `src/core/types.ts`, `src/core/constants.ts`, `tests/setup.ts`, plan v2 |
| 2 — Core + GitHub adapter | **Dev-A (Sonnet)** | `feat/core` | `src/core/{auth-store,etag-cache,pr-store,settings-store,auth}.ts`, `src/github/{http,endpoints}.ts`, all tests in `tests/core/`, `tests/github/` |
| 3 — Review | **QA-A (Sonnet)** | review-only | Coverage check, security audit on auth + storage |
| 3.1 — Merge | Me (direct) | `main` | merge `feat/core` |
| 4a — Background orchestration | **Dev-B (Sonnet)** | `feat/background` | `src/background/**`, `tests/background/**` |
| 4b — Popup UI (parallel with 4a) | **Dev-C (Sonnet)** | `feat/popup` | `src/popup/**`, `tests/popup/**` |
| 5 — Review (parallel) | **QA-BC (Sonnet)** | review-only | Both branches |
| 5.1 — Merge | Me (direct) | `main` | merge `feat/background` then `feat/popup`, resolve any conflicts in `src/popup/index.html` if both touched |
| 6 — Runbook + integration verification | Me (direct) | `main` | `docs/superpowers/RUNBOOK.md`, full coverage run, build verification |

**File-touch boundaries are enforced**: each track's brief lists exactly which files it owns. Tracks B and C are non-overlapping, so they can run in parallel safely.

**Heartbeat:** Each agent appends a timestamped line to `.claude/agent-status/<id>.log` every ~5 min. Orchestrator (me) treats 30+ min silence as stalled.

---

## Per-Track Acceptance Criteria

### Track A (Dev-A)
- [ ] All listed files created with TypeScript types (no `any` except where chrome API requires)
- [ ] Tests cover: 401/403 handling, 429 handling, 422/409 from update-branch, ETag 304 path, token round-trip, settings round-trip, store upsert, store prune
- [ ] `npm test -- tests/core tests/github` all pass
- [ ] `npm run typecheck` clean
- [ ] Per-file coverage ≥ 95% lines (verify with `npm run test:coverage`)

### Track B (Dev-B)
- [ ] State machine has pure functions with table-driven tests for every `mergeable_state` value
- [ ] Poll cycle tested end-to-end with mocked github + storage layers
- [ ] Alarm setup tested for default + custom intervals
- [ ] Badge tested for set/clear paths
- [ ] Message handlers tested for `POLL_NOW`, `SET_INTERVAL`, unknown messages
- [ ] `service-worker.ts` is thin glue only (no logic) — excluded from coverage
- [ ] Stale PRs pruned from store on each cycle

### Track C (Dev-C)
- [ ] Three views (SignIn, PRList, Settings) each render correctly per auth/data state
- [ ] All hooks tested with chrome.storage mock
- [ ] StatusBadge tested for all 7 PRStates
- [ ] Manual click tests: Poll now → sendMessage; Sign in → signIn(); Sign out → signOut(); interval change → saveSettings + sendMessage
- [ ] App.tsx routes correctly between views

### QA Review Checklist
- [ ] Token never logged
- [ ] OAuth state param verified on redirect (CSRF)
- [ ] Redirect URI uses `chrome.identity.getRedirectURL()` (not hardcoded)
- [ ] No tokens written to `chrome.storage.local` (only `sync`)
- [ ] No PII in error messages stored to disk
- [ ] Spec coverage matrix: every Story 1.x acceptance criterion maps to at least one test
- [ ] Coverage thresholds met
- [ ] No TODO / FIXME / placeholder comments left
- [ ] All public functions have explicit return types

---

## Runbook

`docs/superpowers/RUNBOOK.md` covers:
1. GitHub OAuth App registration (callback URL pattern)
2. `.env` setup
3. `npm install && npm run build`
4. Loading the unpacked extension in Chrome
5. Pinning the extension ID via `key` field for stable redirect URI
6. End-to-end manual test scenarios (auth, list, rebase, conflict, poll-now, settings)
7. Troubleshooting (rate limits, auth failures, badge stuck)

---

## Out of Scope (still)

- GitHub Enterprise
- Webhooks / real-time
- Desktop notifications
- PR review or merge actions
- Backend / multi-user
