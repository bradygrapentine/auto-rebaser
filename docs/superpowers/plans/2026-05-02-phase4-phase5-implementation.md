# Phase 4 + Phase 5 — Implementation Plan

_2026-05-02 · ships as v0.2.0 (Phase 4) + v0.2.1 (Phase 5)_

> Each story's WHAT lives in `docs/superpowers/BACKLOG.md` (Stories 4.1–4.6, 5.1, 5.4, 5.5, 5.6). This document is the WHEN/WHO/HOW: wave structure, parallelization with Sonnet subagents, integration checkpoints, coverage gates, rollback notes.

## Goals

- Ship Phase 4 (GitHub App + Device Flow, dual-path auth, GHES) as v0.2.0.
- Ship Phase 5 (companion automations + activity log) as v0.2.1, immediately after.
- Maintain **≥95% line coverage and ≥90% branch coverage** throughout (current baseline: 99.39% lines / 96.34% branches over 442 tests).
- All UI lives in the toolbar popup. No content scripts. No options page. No backend.

## Stories in scope

| # | Story | Spec | Phase |
|---|---|---|---|
| 4.1 | GitHub App registration & publication | `specs/2026-05-02-github-app-auth-design.md` | 4 |
| 4.2 | OAuth Device Flow sign-in | same | 4 |
| 4.3 | Token refresh + storage | same | 4 |
| 4.4 | Dual-path auth UI | same | 4 |
| 4.5 | Per-installation scoping | same | 4 |
| 4.6 | GHES base-URL config | same | 4 |
| 5.1 | Stale-PR badge + ping-reviewers | `specs/2026-05-02-phase5-companion-automations-design.md` | 5 |
| 5.4 | Smart merge-method selection | same | 5 |
| 5.5 | Keyboard shortcuts | same | 5 |
| 5.6 | Activity log | same | 5 |

## Wave structure

```
Wave 0 — manual (user)
   ↓
Wave 1 — 4 parallel Sonnet subagents (foundation)
   ↓
Wave 2 — 3 parallel Sonnet subagents (auth UI + stale-PR)
   ↓
Wave 3 — direct (GHES integration)
   ↓
Wave 4 — manual validation (RUNBOOK)
```

The default per CLAUDE.md is direct implementation; we dispatch only where ≥4 truly independent tracks exist (Wave 1) or 3 tracks with non-overlapping file ownership (Wave 2). Wave 3 is intentionally direct because GHES touches every layer.

---

## Wave 0 — GitHub App registration (manual)

**Owner:** Brady (cannot be automated). **Time:** ~1 hour.

### Steps

1. Commit `src/core/auth-constants.ts` immediately with a stub: `GITHUB_APP_CLIENT_ID = '__dev__'`. This unblocks Wave 1 code work — unit tests mock `fetch` and don't need a real value.
2. Walk `docs/runbooks/github-app-setup.md` §1–§3 in parallel with Wave 1.
3. Capture in writing: App `client_id`, App slug, Marketplace listing URL.
4. **Replace** the stub in `src/core/auth-constants.ts` with `GITHUB_APP_CLIENT_ID = 'Iv1.<hex>'`. **No client_secret** — Device Flow doesn't need one.
5. Submit Marketplace listing for review (1–2 day async wait; doesn't block code work).

### Exit (split into two gates)

**Wave-0-stub** (gates Wave 1 code work):
- [ ] `src/core/auth-constants.ts` committed with `GITHUB_APP_CLIENT_ID = '__dev__'`

**Wave-0-real** (gates manual Wave 4 validation against real GitHub; can land any time during Wave 2 or 3):
- [ ] `src/core/auth-constants.ts` updated with real `Iv1.<hex>` client_id
- [ ] Marketplace submission queued

### Why two gates

Unit tests in Track 1A mock `fetch` and don't depend on a real client_id. The stub unblocks code work immediately. The real client_id is only needed for Wave 4's live device-flow validation. Splitting the gate prevents Marketplace review delays from idling all code work.

---

## Wave 1 — Foundation (4 parallel Sonnet subagents)

**Dispatch reason:** 4 truly independent tracks, disjoint file ownership, no interdependencies. Direct implementation here would serialize ~17 hours of work that can run in ~6 hours wall-clock.

### Pre-dispatch checklist

Run these before opening any subagent:

```bash
git fetch origin
git rev-parse origin/main          # capture base SHA
git rev-parse main                  # must match origin/main
npm test                            # baseline: 442 passing
npm run typecheck                   # baseline: clean
```

If any fails, STOP and reconcile. Print the base SHA every subagent will branch from.

### Track 1A — Device Flow + Token Refresh (Stories 4.2 + 4.3)

**Why merged into one track:** 4.3 directly consumes the `TokenSet` shape that 4.2 produces. Splitting forces a contract-only PR first; merging avoids the round-trip.

**Owned files (exclusive):**
```
src/core/auth-device-flow.ts      (new)
src/core/auth-refresh.ts          (new)
src/core/auth-store.ts            (extend: add github_app branch to Auth union)
src/background/messages.ts        (extend: AUTH_BEGIN_DEVICE_FLOW, AUTH_STATUS, AUTH_OK)
src/github/http.ts                (modify: 401 → refresh → retry)
tests/core/auth-device-flow.test.ts        (new)
tests/core/auth-refresh.test.ts            (new)
tests/core/auth-store.test.ts              (extend)
tests/github/http.test.ts                  (extend with refresh path)
```

**Subagent brief** (paste verbatim into the dispatch):
> You are implementing Stories 4.2 (OAuth Device Flow) and 4.3 (Token refresh) for the auto-rebaser browser extension. Read `docs/superpowers/specs/2026-05-02-github-app-auth-design.md` end-to-end before writing code. Read `docs/superpowers/BACKLOG.md` Stories 4.2 and 4.3.
>
> Owned files (you may modify nothing else): [list above]. If you find yourself wanting to touch another file, STOP and report the dependency.
>
> Hard requirements:
> - All code paths covered by tests. ≥95% line, ≥90% branch coverage on each new file.
> - `client_secret` must NOT appear anywhere in your changes (verify via `grep -ri client_secret src/`).
> - **Storage-key resolution (CRITICAL — read carefully):** The existing PAT auth path uses `chrome.storage.sync` under key `auth`. **Do NOT migrate the PAT path.** Add the GitHub App branch to the `Auth` discriminated union as a NEW path stored under `chrome.storage.local` key `auth`. Resulting state: PAT users keep `.sync.auth`; GitHub App users get `.local.auth`. Both never coexist for one user (sign-out clears either before sign-in). Add an explicit test asserting GitHub App tokens never appear in `chrome.storage.sync`. PAT-to-`.local` migration is out of scope for this story.
> - Single in-flight refresh promise; concurrent fetches must share one refresh request. Add a test for this race using `Promise.all([...5 concurrent calls])` and assert `fetch` was called exactly once for the refresh endpoint.
> - `TokenSet` type exported from `auth-device-flow.ts`; `auth-refresh.ts` imports it.
> - Cover all Device Flow polling responses in tests: `authorization_pending`, `slow_down` (interval doubles), `expired_token`, `access_denied`, success.
> - **If `GITHUB_APP_CLIENT_ID === '__dev__'`** (the stub from Wave 0), unit tests must still pass — they mock `fetch` and don't depend on a real client_id. Integration tests against real GitHub may be marked `.skip` and unblocked once the real client_id lands.
>
> Heartbeat: append a one-line timestamp to `.claude/agent-status/track-1A.log` every 5 minutes per the `subagent-heartbeat` skill. If you are stuck for >15 minutes, write the diagnosis and return.
>
> Branch: `wave-p4p5-1A`. Base: `origin/main` at SHA `<paste>`.
>
> Verify before completion:
>   `npx vitest run tests/core/auth-device-flow.test.ts tests/core/auth-refresh.test.ts tests/core/auth-store.test.ts tests/github/http.test.ts`
>   `npx vitest run --coverage` and confirm overall numbers haven't regressed.
>   `npm run typecheck` clean.
>
> Estimated effort: ~10 hours. ~25 new tests.

### Track 1B — Activity log (Story 5.6)

**Owned files (exclusive):**
```
src/core/activity-log.ts          (new — types, helpers)
src/core/activity-log-types.ts    (new — ActivityEntry, ActivityAction)
src/popup/views/ActivityLogView.tsx     (new)
src/popup/hooks/useActivityLog.ts       (new)
src/popup/components/PollSummaryFooter.tsx  (modify: clickable counter, navigate to log)
src/background/poll-cycle.ts      (modify: orchestrator translates results to ActivityEntry[], single write at end of cycle)
src/popup/App.tsx                 (modify: route 'activity-log' view)
tests/core/activity-log.test.ts            (new)
tests/popup/views/ActivityLogView.test.tsx (new)
tests/popup/hooks/useActivityLog.test.tsx  (new)
tests/popup/components/PollSummaryFooter.test.tsx  (extend)
tests/background/poll-cycle.test.ts        (extend with activity-log assertions)
```

**Subagent brief:**
> You are implementing Story 5.6 (Activity log) for the auto-rebaser browser extension. Read `docs/superpowers/specs/2026-05-02-phase5-companion-automations-design.md` §5.6 and `docs/superpowers/BACKLOG.md` Story 5.6.
>
> Owned files (you may modify nothing else): [list above]. Existing automation adapters MUST NOT be touched — the orchestrator translates their existing return values. If you find yourself wanting to modify an adapter, STOP and report.
>
> Hard requirements:
> - One `chrome.storage.local.set({ activity })` call per poll cycle, not per action. Test must assert this by mocking storage and counting calls during a multi-action cycle.
> - Trim function preserves last 200 entries AND drops entries older than 30 days. Test both bounds.
> - Storage write failure is non-fatal; automations continue. Test by stubbing `set` to throw.
> - Empty-state test: log view with no entries renders the empty-state copy.
> - Filter tests: action filter and repo filter both narrow client-side without re-reading storage.
> - Footer counter clickable: clicking it routes to ActivityLogView with today's date filter applied.
>
> Heartbeat: `.claude/agent-status/track-1B.log` every 5 min.
>
> Branch: `wave-p4p5-1B`. Base: `origin/main` at SHA `<paste>`.
>
> Verify before completion:
>   `npx vitest run tests/core/activity-log.test.ts tests/popup/views/ActivityLogView.test.tsx tests/popup/hooks/useActivityLog.test.tsx tests/popup/components/PollSummaryFooter.test.tsx tests/background/poll-cycle.test.ts`
>   `npx vitest run --coverage` no regression.
>   `npm run typecheck` clean.
>
> Estimated effort: ~7 hours. ~15 new tests.

### Track 1C — Smart merge-method selection (Story 5.4)

**Owned files (exclusive):**
```
src/core/automations-types.ts     (modify: replace autoMergeMethod with mergeMethodPreference; migration shim)
src/core/automations-store.ts     (modify: migration on load)
src/background/automations/enable-auto-merge.ts  (modify: resolveMergeMethod helper)
src/github/endpoints/repos.ts     (modify: include allow_squash_merge / allow_merge_commit / allow_rebase_merge in cached fields)
src/popup/components/AutomationsSettings.tsx     (modify: replace dropdown with reorderable preference list)
tests/core/automations-store.test.ts             (extend with migration test)
tests/background/automations/enable-auto-merge.test.ts  (extend)
tests/popup/components/AutomationsSettings.test.tsx     (extend with reorder UI tests)
```

**Subagent brief:**
> You are implementing Story 5.4 (Smart merge-method selection). Read `docs/superpowers/specs/2026-05-02-phase5-companion-automations-design.md` §5.4 and `docs/superpowers/BACKLOG.md` Story 5.4.
>
> Owned files (you may modify nothing else): [list above].
>
> Hard requirements:
> - Migration shim: existing setting `autoMergeMethod: 'SQUASH'` (or whatever the user chose) maps to `mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE']` (chosen value first, others appended in default order). Test with each of the three possible existing values.
> - `resolveMergeMethod(preference, repo)` returns null when no method matches; auto-merge in that case writes a `failed` activity entry (don't crash). Coordinate with Track 1B's `ActivityEntry` shape — wait for Track 1B's PR to land before integrating, or stub the type.
> - Reorder UI: drag handles preferred. If you choose up/down arrows for simplicity, that's acceptable.
>
> Heartbeat: `.claude/agent-status/track-1C.log` every 5 min.
>
> Branch: `wave-p4p5-1C`. Base: `origin/main` at SHA `<paste>`.
>
> Verify: `npx vitest run` for owned tests; coverage no regression; `npm run typecheck`.
>
> Estimated effort: ~3 hours. ~6 new tests.

### Track 1D — Keyboard shortcuts (Story 5.5)

**Owned files (exclusive):**
```
src/popup/hooks/useKeyboardShortcuts.ts          (new)
src/popup/views/HelpView.tsx                     (new)
src/popup/views/PRListView.tsx                   (modify: focus state, focused-row attribute)
src/popup/components/PRRow.tsx                   (modify: data-focused attribute)
src/popup/App.tsx                                (modify: route 'help' view; mount keyboard hook)
src/popup/popup.css                              (modify: focus-ring style)
tests/popup/hooks/useKeyboardShortcuts.test.tsx  (new)
tests/popup/views/HelpView.test.tsx              (new)
tests/popup/views/PRListView.test.tsx            (extend with focus + j/k tests)
```

**Note on overlap with Track 1B:** Track 1B touches `App.tsx` to route `activity-log`; Track 1D touches `App.tsx` to route `help` and mount the keyboard hook. Coordinate via merge order: Track 1B integrates first; Track 1D rebases on top. Document this in the merge plan below.

**Subagent brief:**
> You are implementing Story 5.5 (Keyboard shortcuts) for the auto-rebaser popup. Read `docs/superpowers/specs/2026-05-02-phase5-companion-automations-design.md` §5.5 and `docs/superpowers/BACKLOG.md` Story 5.5.
>
> Owned files: [list above]. Note `App.tsx` is shared with Track 1B — your branch will need to rebase onto 1B before merge. Make App.tsx changes minimal and obvious.
>
> Hard requirements:
> - `keydown` listener at popup root. Skip when `event.target` matches `input, textarea, select, [contenteditable="true"]`.
> - Test for the skip: render with a focused input, press `r`, assert the poll handler did NOT fire.
> - `j`/`k` skip rows in collapsed repo groups.
> - Focus-ring CSS visible in screenshot test (snapshot or pixel-diff acceptable).
>
> Heartbeat: `.claude/agent-status/track-1D.log` every 5 min.
>
> Branch: `wave-p4p5-1D`. Base: `origin/main` at SHA `<paste>`.
>
> Verify: usual test + typecheck.
>
> Estimated effort: ~4 hours. ~8 new tests.

### Wave 1 merge order

1. **Track 1B (Activity log) lands first** — 1A and 1C depend on its `ActivityEntry` type; 1D depends on its `App.tsx` routing pattern.
2. **Track 1A (Device Flow + refresh) second** — auth foundation for Wave 2.
3. **Track 1C (Smart merge) third** — rebases onto 1B for activity-entry type.
4. **Track 1D (Keyboard shortcuts) last** — rebases onto 1B for App.tsx changes.

After each merge, run on main:
```bash
npm run build:all
npm test
npm run typecheck
npx vitest run --coverage
```

If overall coverage drops below 95% lines or 90% branches, BLOCK the next merge until the gap is closed.

---

## Wave 2 — Auth UI + Stale-PR (3 parallel Sonnet subagents)

**Dispatch reason:** 3 independent tracks, disjoint file ownership. Right at the threshold for subagent dispatch — borderline but the file ownership is clean. Direct would take ~13 hours; parallel ~5 hours wall-clock.

### Pre-dispatch checklist

Same as Wave 1 plus:
- Wave 1 fully merged into main.
- Coverage on main ≥95% lines / ≥90% branches.

### Track 2A — Dual-path auth UI (Story 4.4)

**Owned files (exclusive):**
```
src/popup/views/SignInView.tsx                   (modify: method picker, GitHub App option)
src/popup/views/DeviceFlowView.tsx               (new)
src/popup/views/MigrationBannerView.tsx          (new)
src/popup/hooks/useAuth.ts                       (modify: support both methods)
src/popup/components/Header.tsx                  (modify: "via GitHub App" / "via PAT" indicator)
tests/popup/views/SignInView.test.tsx            (extend)
tests/popup/views/DeviceFlowView.test.tsx        (new)
tests/popup/views/MigrationBannerView.test.tsx   (new)
tests/popup/hooks/useAuth.test.tsx               (extend)
tests/popup/components/Header.test.tsx           (extend)
```

### Track 2B — Per-installation scoping (Story 4.5)

**Owned files (exclusive):**
```
src/github/endpoints/installations.ts            (new)
src/popup/components/InstallationsList.tsx       (new — appears in PR list footer or below user info)
src/popup/components/PRRow.tsx                   (modify: "App not installed" badge)
src/background/poll-cycle.ts                     (modify: cross-reference installations against PR repos)
tests/github/endpoints/installations.test.ts     (new)
tests/popup/components/InstallationsList.test.tsx  (new)
tests/popup/components/PRRow.test.tsx            (extend)
tests/background/poll-cycle.test.ts              (extend)
```

**Coordination flag (PRRow.tsx):** both 2B and 2C touch `src/popup/components/PRRow.tsx`. Tracks must declare *which lines/sections* they own:
- 2B owns the "App not installed" / "Suspended" badge logic.
- 2C owns the "stale" badge + ping link.
The badges are independent UI elements; merge will be a textual concat with no semantic conflict. Verify in the merge step.

**Coordination flag (poll-cycle.test.ts):** both 2B and 2C add tests to `tests/background/poll-cycle.test.ts`:
- 2B adds tests for installation cross-reference (PRs in uninstalled-org repos get the right badge).
- 2C adds tests for `idleDays` computation against `updated_at`.
Tests use disjoint `describe` blocks. 2C rebases onto 2B; the 2C subagent is explicitly instructed to leave 2B's existing test additions alone and add a new `describe` block at the bottom of the file.

### Track 2C — Stale-PR badge + ping-reviewers (Story 5.1)

**Owned files (mostly exclusive):**
```
src/core/types.ts                                 (extend: add staleness field to PRRecord)
src/background/poll-cycle.ts                      (modify: compute idleDays per PR)
src/github/endpoints/issues.ts                    (new — POST comment)
src/popup/components/PRRow.tsx                    (modify: stale badge + ping link)  [shared with 2B — see flag]
src/popup/views/PingConfirmView.tsx               (new)
src/popup/components/AutomationsSettings.tsx      (extend: stale settings block)
src/core/automations-types.ts                     (extend: stale-related settings)
src/core/automations-store.ts                     (extend: defaults for new settings)
tests/background/poll-cycle.test.ts               (extend)
tests/github/endpoints/issues.test.ts             (new)
tests/popup/components/PRRow.test.tsx             (extend) [shared with 2B]
tests/popup/views/PingConfirmView.test.tsx        (new)
tests/popup/components/AutomationsSettings.test.tsx  (extend)
```

**Subagent brief — Track 2A (Dual-path auth UI):**
> You are implementing Story 4.4 (Dual-path auth UI) for the auto-rebaser browser extension. Read `docs/superpowers/specs/2026-05-02-github-app-auth-design.md` (full) and `docs/superpowers/BACKLOG.md` Story 4.4.
>
> Owned files (you may modify nothing else): src/popup/views/SignInView.tsx, src/popup/views/DeviceFlowView.tsx (new), src/popup/views/MigrationBannerView.tsx (new), src/popup/hooks/useAuth.ts, src/popup/components/Header.tsx, plus the corresponding test files.
>
> Hard requirements:
> - Sign-in view shows two options: "GitHub App (recommended)" pre-selected, "Personal Access Token (legacy)" expandable. Test both paths render correctly.
> - Existing PAT users (auth.method === 'pat' in chrome.storage.sync) keep working with no UI regression. Test by stubbing storage to existing PAT shape and asserting popup transitions to PR list, not sign-in.
> - Migration banner: appears for PAT users ONCE (per-device); dismissal persists in `chrome.storage.sync` under `migration_banner_dismissed: true`.
> - Header shows "via GitHub App" / "via PAT" indicator based on `auth.method`.
> - Device-flow view shows the user_code in large monospaced text with a Copy button. Polling state surface ("Waiting for you to authorize...") visible.
>
> Heartbeat: append a one-line ISO timestamp to `.claude/agent-status/track-2A.log` every 5 minutes.
>
> Branch: `wave-p4p5-2A`. Base: `origin/main` at SHA `<paste current main SHA at dispatch time>`.
>
> Verify before completion: `npx vitest run` for owned tests; `npx vitest run --coverage` (no overall regression); `npm run typecheck`.
>
> Estimated effort: ~5 hours. ~12 new tests.

**Subagent brief — Track 2B (Per-installation scoping):**
> You are implementing Story 4.5 (Per-installation scoping) for the auto-rebaser browser extension. Read `docs/superpowers/specs/2026-05-02-github-app-auth-design.md` and `docs/superpowers/BACKLOG.md` Story 4.5.
>
> Owned files (you may modify nothing else): src/github/endpoints/installations.ts (new), src/popup/components/InstallationsList.tsx (new), src/popup/components/PRRow.tsx (ONLY the "App not installed" / "Suspended" badge logic — see Coordination flag below), src/background/poll-cycle.ts (cross-reference installations against PR repos), plus corresponding test files.
>
> **Coordination flag — PRRow.tsx:** Track 2C also touches PRRow.tsx (for the stale badge). You own the "App not installed" / "Suspended" badge UI element. Add it as a self-contained `<span>` with a clear surrounding comment marker (`{/* 2B: app-install badge */}`). Track 2C will add its badge with a separate marker. No semantic conflict expected.
>
> **Coordination flag — poll-cycle.test.ts:** Track 2C also adds tests to this file. Add your installation-cross-reference tests in a new `describe('poll-cycle: installation scoping', ...)` block at the bottom of the file. Do not modify existing test blocks. Track 2C will rebase onto your branch and add another `describe` block.
>
> Hard requirements:
> - `GET /user/installations` endpoint module with `searchParams` for pagination if needed; cached in `auth.installations` after sign-in.
> - PRs whose repo `owner` is not in any installation render with the badge.
> - Suspended installations (`installation.suspended_at != null`) cause PRs in that org to skip all automations during the cycle (already-merged PR records still display, just no new actions).
> - "Request access" link routes to `https://github.com/apps/auto-rebaser/installations/new`.
>
> Heartbeat: `.claude/agent-status/track-2B.log` every 5 min.
>
> Branch: `wave-p4p5-2B`. Base: depends on Wave 2A merge order (rebases onto 2A if 2A modifies any of your owned files). Use `origin/main` at dispatch time after 2A is merged.
>
> Verify: usual test + typecheck + coverage.
>
> Estimated effort: ~4 hours. ~10 new tests.

**Subagent brief — Track 2C (Stale-PR badge + ping-reviewers):**
> You are implementing Story 5.1 (Stale-PR badge + ping-reviewers) for the auto-rebaser browser extension. Read `docs/superpowers/specs/2026-05-02-phase5-companion-automations-design.md` §5.1 and `docs/superpowers/BACKLOG.md` Story 5.1.
>
> Owned files (you may modify nothing else): src/core/types.ts (extend: add `staleness?: { idleDays: number; lastActivityAt: number }` to PRRecord), src/background/poll-cycle.ts (compute idleDays per PR after fetching detail), src/github/endpoints/issues.ts (new — POST comment), src/popup/components/PRRow.tsx (ONLY the stale badge + ping link — see Coordination flag), src/popup/views/PingConfirmView.tsx (new), src/popup/components/AutomationsSettings.tsx (extend: stale settings block), src/core/automations-types.ts (extend: stale-related settings), src/core/automations-store.ts (extend: defaults for new settings), plus corresponding test files.
>
> **Coordination flag — PRRow.tsx:** Track 2B owns the "App not installed" / "Suspended" badge in this file. You own the "stale" badge + ping link. Add yours with a comment marker `{/* 2C: stale-pr badge */}`. Do not modify Track 2B's badge.
>
> **Coordination flag — poll-cycle.test.ts:** Track 2B added a `describe('poll-cycle: installation scoping', ...)` block. Add your stale-pr tests in a NEW `describe('poll-cycle: stale-pr detection', ...)` block at the bottom of the file. Do not modify Track 2B's block.
>
> **Base branch:** Track 2C rebases onto Track 2B's merged branch. Base SHA: `origin/main` after 2B has merged (capture at dispatch time).
>
> Hard requirements:
> - `idleDays` computed from `(Date.now() - new Date(detail.updated_at).getTime()) / 86400_000`, floored.
> - Threshold resolution: `staleThresholdOverrides[fullName] ?? staleThresholdDays`. Default `staleThresholdDays: 14`.
> - Badge format degrades: 14d → "14d", 21d → "3w", 60d → "2mo". Test all three thresholds.
> - `staleCountsAsAttention` (default false) controls whether stale triggers `hasAttention` on the repo group dot. Test both states.
> - Ping confirmation is a full-popup view (not a modal). Cancel returns; Confirm POSTs `/issues/{n}/comments` and updates `lastPingedAt`. 24h throttle on the ping link.
> - **Activity log integration:** when ping POST succeeds or fails, the orchestrator (already wired by Track 1B) translates the result into an `ActivityEntry` with `action: 'reviewer_pinged'` and `reviewers: [...]`. Your code only needs to ensure the ping result is included in the orchestrator's `result.prUpdates` or equivalent return path. Verify by integration test that runs a poll with a ping and asserts the activity entry is written.
>
> Heartbeat: `.claude/agent-status/track-2C.log` every 5 min.
>
> Branch: `wave-p4p5-2C`. Base: `wave-p4p5-2B` after 2B merges to main.
>
> Verify: usual test + typecheck + coverage.
>
> Estimated effort: ~6 hours. ~10 new tests.

### Wave 2 merge order

1. **Track 2A (Dual-path UI) first** — stands alone; provides the auth UI shell.
2. **Track 2B (Installations) second** — adds badge UI to PRRow.
3. **Track 2C (Stale + ping) third** — rebases onto 2B for PRRow merge.

Same coverage gate after each merge.

---

## Wave 3 — GHES base-URL config (Story 4.6) — direct implementation

**Why direct:** GHES touches every layer (settings, OAuth URLs, API URLs, GraphQL URL, optional permissions). No clean way to split into parallel tracks without massive coordination overhead.

**Files modified:**
```
src/core/settings-store.ts        (add enterpriseHost field)
src/core/auth-constants.ts        (default origins; helper exports)
src/github/http.ts                (origin selection)
src/github/graphql.ts             (origin selection)
src/core/auth-device-flow.ts      (origin selection)
src/core/auth-refresh.ts          (origin selection)
src/popup/views/SettingsView.tsx  (enterpriseHost input + permission request flow)
manifest.json                     (optional_host_permissions)
manifest.firefox.json             (optional_permissions)
... + corresponding tests for each
```

**Steps (sequential, ~6 hours):**

1. Define `ghOrigin(host?)` and `ghApiOrigin(host?)` helpers in `auth-constants.ts`. Add unit tests.
2. Plumb the helpers through every URL-construction site. One commit per file. Each commit must keep tests green.
3. Add `enterpriseHost` to settings store with validation (no protocol, no path). Tests.
4. Wire `chrome.permissions.request` flow in SettingsView when host changes. Tests with mocked permissions API.
5. Manifest changes for optional host permissions. Verify both builds clean.
6. Update `RUNBOOK` validation for GHES path (deferred to Wave 4 manual section).

**Coverage gate:** same. After Wave 3 lands on main, full suite runs with coverage; threshold check.

---

## Wave 4 — Validation (manual)

Walk `docs/runbooks/full-app-validation.md` (this plan's companion runbook). Two passes:

1. **Chrome pass** — fresh install, sign in via PAT (regression), sign out, sign in via GitHub App, walk every Phase 1/2/4/5 scenario, capture validation table entry.
2. **Firefox pass** — same, against `dist-firefox/`.

Either pass red blocks the v0.2.0 / v0.2.1 release. Document deviations in `docs/runbooks/phase2-validation.md` per existing convention.

---

## Coverage strategy

### Continuous

Every PR runs `npx vitest run --coverage` in CI. Threshold (already configured in `vite.config.ts`):
- Lines ≥ 95%
- Functions ≥ 95%
- Branches ≥ 88%
- Statements ≥ 95%

A PR that drops any of these below the threshold fails CI. This is the gate, not aspiration.

### Per-story coverage targets

The implementation plan deliberately exceeds the minimum:

| Story | New tests (est.) | Target line coverage on new files |
|---|---|---|
| 4.2 + 4.3 | 25 | 100% (auth is critical) |
| 4.4 | 12 | 100% |
| 4.5 | 10 | 100% |
| 4.6 | 8 | 95% |
| 5.1 | 10 | 100% |
| 5.4 | 6 | 100% |
| 5.5 | 8 | 95% (focus-mgmt edges acceptable) |
| 5.6 | 15 | 100% (audit infra warrants full coverage) |

**Total new tests: ~94.** Target final test count: ~536 (from 442 baseline).

### Branch coverage acceptance

Some files retain branch dips (already known: `poll-cycle.ts` at 85.1%). Acceptable to leave at the per-file ceiling as long as overall branch coverage stays ≥90%. Do NOT artificially inflate by adding meaningless edge-case tests.

### Pre-merge verification (every track)

```bash
npx vitest run --coverage
npm run typecheck
npm run build:all                  # both Chrome and Firefox bundles clean
git diff --stat origin/main...HEAD # surface any out-of-scope changes
```

---

## Risk register & rollback notes

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GitHub App Marketplace review delays | medium | low | App is usable for installs without listing approval; just no Marketplace discovery |
| Firefox CSP blocks `github.com/login/device/code` | low | high (auth broken) | Capture in Wave 4 Firefox pass; if blocked, add explicit CSP override in `manifest.firefox.json` |
| Token-refresh race condition causes double-refresh | medium | low (just wastes one refresh) | Single-in-flight-promise test in 1A; integration test with 5 concurrent fetches |
| Migration of existing PAT users breaks them | medium | high (existing users locked out) | Test in 4.4 — rerender with PAT auth state, assert no sign-out, no UI regression |
| Activity log storage bloat | low | low | Cap enforced by every write; test asserts the trim invariant |
| Per-PR ping abuse (user spamming reviewers) | low | medium (rep cost) | 24h throttle per PR; confirmation modal shows exact comment text |
| Smart-merge method picks wrong method, PR fails to merge | medium | low | Failure surfaces as inline badge; user can disable auto-merge per repo |
| GHES optional permission denied | low | medium | Setting reverts; clear UI message |

### Rollback

Each wave's PR set is squash-mergeable in reverse order if a regression surfaces:
- Wave 3 reverts to remove GHES.
- Wave 2 reverts to remove auth-UI / installations / stale-PR (Phase 4 still functional via PAT path; Phase 5 stale-PR removed).
- Wave 1 reverts to baseline (drops auth + activity log + smart-merge + shortcuts).

Auth-related rollbacks must include a one-shot `chrome.storage.local.remove(['auth'])` migration on next install, since users on the rolled-back code path will have GitHub App tokens they can't use.

---

## Subagent dispatch — operational notes

### Heartbeat protocol

Every subagent must implement the `subagent-heartbeat` skill: append a one-line `<ISO-timestamp> <status>` entry to `.claude/agent-status/<track>.log` every 5 minutes. Orchestrator polls every 10 minutes and treats any track with no update for 30 minutes as stalled — capture last status, kill, redispatch fresh.

### Base-SHA contract

Every subagent in Wave 1 (and Wave 2) branches from the same base SHA: `git rev-parse origin/main` at dispatch time. Print this in each subagent's brief. Mismatch = halt and reconcile before any code is written.

### File ownership enforcement

The `wave-lock-guard.sh` PreToolUse hook (already installed per memory) prevents concurrent commits on a locked branch. Each subagent's branch is locked when it runs `git checkout -b wave-p4p5-<id>`.

### What to do when a subagent reports back

1. Verify on the orchestrator side: `gh pr list` shows their PR; `gh pr checks` is green; `gh pr diff` matches owned-files declaration.
2. Run the merge sequence per wave plan above.
3. Pull latest main, re-run full suite, verify coverage.
4. If green, dispatch the next wave (or unblock dependent track).
5. If red, fix locally OR redispatch the same subagent with a delta-only brief.

### Anti-patterns

- ❌ Re-dispatching all 4 tracks because one finished early and got bored
- ❌ Letting two tracks both modify the same file because "they shouldn't conflict"
- ❌ Approving a track whose tests pass but coverage dropped — block on the gate
- ❌ Running Wave 2 before all of Wave 1 is on main (skips the integration check)

---

## Final delivery

After Wave 4 validation:

- v0.2.0 tag (Phase 4 stories merged): `git tag v0.2.0`
- v0.2.1 tag (Phase 5 stories merged): `git tag v0.2.1`
- Resubmit packaged extension to Chrome Web Store and AMO with updated changelog and `PRIVACY.md` (5.6 row added).
- Update `docs/LAUNCH_PLAN.md` "Launch history" with both tags.

## Summary table

| Phase | Effort | Critical-path |
|---|---|---|
| Wave 0 (manual App reg) | 1h | gates Wave 1 |
| Wave 1 (4 parallel subagents) | ~6h wall-clock (~24h serial) | gates Wave 2 |
| Wave 2 (3 parallel subagents) | ~5h wall-clock (~13h serial) | gates Wave 3 |
| Wave 3 (direct, GHES) | 6h | gates Wave 4 |
| Wave 4 (manual validation) | 4h (2 browsers × 2h) | gates release |
| **Total wall-clock** | **~22h** | |
| Total serial-equivalent | ~50h | |

Subagent parallelization saves ~28 hours of wall-clock time over a fully-serial approach.
