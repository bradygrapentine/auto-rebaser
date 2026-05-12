# Multi-account stability pass — thread accountId explicitly through poll + device-flow

**Date:** 2026-05-12
**Base SHA:** dda5a0eb391ce25518f9651de1bb6ef3cb9ede53
**Source backlog:** n/a (bug-driven, /sprint freeform)
**PRD:** n/a
**Recommended executor:** /sprint (in progress; Gate 2 next) or /wave

## Goal

Stop relying on any form of process-global "active account override" inside the SW poll cycle. Thread the accountId explicitly through every storage read/write for the duration of one account's poll iteration. Chrome MV3 SW eviction has defeated both the module-variable (#118 era) and the `chrome.storage.session` (#147) approaches: every async boundary inside the poll can land mid-eviction, and after the worker wakes back up the override reads/writes the wrong account's namespace. Symptoms: cross-account PR leak returns after switch+poll cycles, PR list disappears in background when poll prunes the wrong namespace, add-account flow occasionally writes auth to the wrong account.

## Non-goals

- UI polish, copy fixes, runbook refresh — separate work.
- Adding per-account settings, new auth methods, or any new feature surface.
- Refactoring the storage layer beyond what threading requires — `readAccountKey` / `writeAccountKey` stay as convenience wrappers around the new explicit-id variants.
- GitLab / GHES coverage — same code paths but out of repro scope.

## Tracks

### Track 1 — Add explicit-id storage variants

Lays the foundation. T2 + T3 consume what this lands.

**FILES ALLOWED:**
- `src/core/storage/multi-account.ts` (add `readAccountKeyFor`, `writeAccountKeyFor`, `removeAccountKeyFor` exports — accept `accountId: string` first arg, do NOT consult `getActiveAccountId`)
- `tests/core/storage/multi-account.test.ts` (unit tests for the new variants)

**FILES OUT OF SCOPE — DO NOT TOUCH:**
- Any call site of `readAccountKey` / `writeAccountKey` (T2 owns the migration).
- `src/background/*` (T2 + T3 territory).
- `src/popup/*` (popup keeps the implicit-id helpers; T2 only swaps SW-side calls).
- `src/core/etag-cache.ts` (T2 migrates this one along with poll-cycle since etag reads happen mid-request).

**Branch:** `feat/multi-account-stability-pass-t1-explicit-id-helpers`

**Implementation steps:**
1. In `src/core/storage/multi-account.ts`, add three new exports beneath the existing helpers (around line 246+):
   - `readAccountKeyFor<K extends keyof AccountState>(accountId: string, key: K)` — reads `accounts.<accountId>.<key>` directly; returns undefined if missing. No legacy fallback, no override consultation.
   - `writeAccountKeyFor<K extends keyof AccountState>(accountId: string, key: K, value: AccountState[K])` — writes to `accounts.<accountId>.<key>` via `setAccountState` (which already takes an explicit id).
   - `removeAccountKeyFor<K extends keyof AccountState>(accountId: string, key: K)` — deletes the key from `accounts.<accountId>` directly.
2. Keep the existing implicit-id versions (`readAccountKey` / `writeAccountKey` / `removeAccountKey`) as one-line wrappers that resolve via `getActiveAccountId()` then delegate to the `*For` variants. No behavior change.
3. Add unit tests covering: read returns undefined when account namespace is empty, write creates the account namespace if absent, read+write are independent across two accountIds.

**Acceptance (verifiable):**
- `grep -n "readAccountKeyFor\|writeAccountKeyFor\|removeAccountKeyFor" src/core/storage/multi-account.ts` shows the three new exports.
- `npm test -- tests/core/storage/multi-account.test.ts` passes; new tests verify the cross-account isolation property.
- `npm run typecheck && npm run lint` clean.
- No diff to any file outside `src/core/storage/multi-account.ts` and its test file.

**Risk + mitigations:**
- Risk: the implicit-id wrappers regress on edge cases. Mitigation: keep them as pure delegation, no logic change.

### Track 2 — Thread accountId through poll-cycle

The structural fix for the cross-account leak and the "PRs disappear" symptom.

**FILES ALLOWED:**
- `src/background/poll-cycle.ts` (primary)
- `src/core/pr-store.ts` (add `*For` overloads / per-account variants that the poll calls)
- `src/core/activity-log.ts` (same)
- `src/core/known-repos-store.ts` (same)
- `src/core/automations-store.ts` (same — for `getAutomationSettings` / `getResolvedThreads` etc. that poll-cycle reads)
- `src/core/etag-cache.ts` (migrate to take an explicit accountId; the poll passes the iteration's id)
- `src/github/http.ts` (accept optional `accountId` in `RequestOptions`; pass it down to `etag-cache` reads/writes; the `request()` helper already reads auth via `ensureFreshToken()`, which T2 also updates to optionally accept an explicit id — see step 5)
- `src/core/auth-refresh.ts` (`ensureFreshToken(now, accountId?)` — when an id is passed, read auth via `readAccountKeyFor(id, 'auth')`; otherwise fall back to existing behavior)
- `src/core/auth-store.ts` (add a `getAuthFor(id)` variant used by `ensureFreshToken` when an explicit id is given)
- Tests for poll-cycle's cross-account isolation: at minimum one new test that runs `runPollCycle` with two accounts mocked, simulates an SW-eviction-equivalent (`setPollActiveAccountIdOverride(null)` mid-await) and asserts each account's namespace receives only its own PRs.

**FILES OUT OF SCOPE — DO NOT TOUCH:**
- `src/core/storage/multi-account.ts` (T1 owns; T2 only imports its exports).
- `src/popup/*` (popup reads via implicit-id wrappers — keep working as before).
- `src/background/auth-device-flow-runner.ts` (T3 owns).
- The existing `setPollActiveAccountIdOverride` / `chrome.storage.session` plumbing — leave it as a fallback for any callers still on the implicit path; T2 just stops *poll-cycle* depending on it.
- Manifest, build config, package.json.

**Branch:** `feat/multi-account-stability-pass-t2-thread-accountid`

**Implementation steps:**
1. Add an `id: string` parameter to `runPollCycleInner(id: string)`. Update the call site in `runPollCycle` to pass the iteration's `id` directly (no more relying on the override flowing through `getActiveAccountId`).
2. Inside `runPollCycleInner`, replace every implicit storage call:
   - `loadStore()` → new `loadStoreFor(id)` in `pr-store.ts`
   - `saveStore(...)`, `upsertPRs(...)`, `pruneStale(...)`, `stampPollTime(...)` → `*For(id, ...)` variants in `pr-store.ts`
   - `getAutomationSettings()` / `getResolvedThreads()` → `*For(id)` variants in `automations-store.ts`
   - `appendActivity(...)` → `appendActivityFor(id, ...)` in `activity-log.ts`
   - `recordPing(...)` / `recordRerequest(...)` → `*For(id, ...)` (small per-throttle modules)
3. In `etag-cache.ts`, change `getEntry` / `setEntry` signatures to accept `accountId: string` as the first arg; remove the in-function `getActiveAccountId()` call.
4. In `http.ts`, add `accountId?: string` to `RequestOptions`. When present, pass it to `getEntry` / `setEntry`. When absent (popup-side calls), preserve existing implicit behavior by calling a thin wrapper that resolves the active id.
5. In `auth-refresh.ts`, add an optional second arg to `ensureFreshToken(now?, accountId?)`. When `accountId` is provided, read auth via the new `getAuthFor(id)` in `auth-store.ts`; refreshing writes back via `writeAccountKeyFor(id, 'auth', ...)`. Existing implicit-id callers (popup) unaffected. **Critically:** the module-level `inFlight` slot is a single shared Promise (`let inFlight: Promise<string> | null = null`); this defeats multi-account threading because account A's in-flight refresh would resolve to A's token but B's `ensureFreshToken('gh_b')` would return that same Promise. Convert `inFlight` to `Map<string, Promise<string>>` keyed by **`accountId`** (not refresh token — GitHub rotates refresh tokens on each successful refresh, so a refresh-token key has a stale-window hole; account id is stable and is the correct dedup granularity since "same account → safe to share the in-flight refresh"). Use the sentinel `'__implicit__'` for the no-id path so the existing single-account behavior is preserved. Each `doRefresh` invocation sets the entry on entry and clears it on settle (success or error).
6. The poll cycle threads `id` into every `request()` call inside `searchAuthoredPRs` / `getPR` / `updateBranch` / installations fetch by passing `{ accountId: id }` via `RequestOptions`. Add a single wrapper `requestFor(id, path, opts?)` in `http.ts` that injects `accountId` into the options before delegating to `request`. Endpoint modules either accept an optional `id` parameter or get a `*For(id, ...)` overload; pick the overload pattern (less invasive than threading `id` through every existing endpoint signature).
7. Replace the `getActiveAccountId()` call at `src/background/poll-cycle.ts:554` (actionable_count update) with the explicit `id` from `runPollCycleInner`'s new parameter. Use `setAccountState(id, 'actionable_count', actionable)` directly. This site is inside the same per-account iteration the rest of T2 threads, so it must be threaded too — leaving it on the override re-introduces the exact race T2 closes.
8. Remove `setPollActiveAccountIdOverride(id)` / `setPollActiveAccountIdOverride(null)` from `runPollCycle`. The function may stay defined for back-compat but the poll cycle itself no longer touches it.
9. Add a vitest that:
   - Mocks `listAccountIds()` to return `['gh_a', 'gh_b']`.
   - Mocks the search/getPR responses per-account (different PR IDs).
   - Mid-cycle, calls `setPollActiveAccountIdOverride(null)` (simulates SW eviction wiping the override) and `chrome.storage.local.set({ activeAccountId: 'gh_a' })` (simulates the user being on A in the popup).
   - Runs `runPollCycle()`.
   - Asserts: `accounts.gh_a.pr_store.prs` contains only A's PRs; `accounts.gh_b.pr_store.prs` contains only B's; the two sets are disjoint.

**Acceptance (verifiable):**
- `grep -nE "getActiveAccountId|setPollActiveAccountIdOverride" src/background/poll-cycle.ts` returns 0 hits. The override pattern is removed from the poll module entirely.
- **Belt-and-suspenders pair (must run BOTH):**
  1. `grep -n "from.*multi-account" src/background/poll-cycle.ts` returns at least one match AND the matched line(s) do NOT include `getActiveAccountId` or `setPollActiveAccountIdOverride`.
  2. `grep -nE "getActiveAccountId|setPollActiveAccountIdOverride" src/background/poll-cycle.ts` returns 0 hits (already listed above).
  Both must pass — (1) alone silently misses an entirely-deleted import block; (2) alone misses a stale type-only re-export.
- `grep -nE "(^|[^a-zA-Z])(loadStore|saveStore|upsertPRs|pruneStale|appendActivity|recordPing|recordRerequest|getAutomationSettings|getResolvedThreads)\b" src/background/poll-cycle.ts` shows every call qualified with the `For`-suffix variant (e.g. `loadStoreFor`, `saveStoreFor`). Bare implicit-id calls are 0.
- `grep -n "getAuthFor\b" src/core/auth-store.ts` returns the new export (parallel to T1's `readAccountKeyFor` export check).
- New cross-account isolation test in `tests/background/poll-cycle.cross-account.test.ts` covers two probative assertions:
  1. After `runPollCycle()` with accounts `[gh_a, gh_b]`, `accounts.gh_a.pr_store.prs` contains only A's PRs and `accounts.gh_b.pr_store.prs` contains only B's; the two sets are disjoint.
  2. Test fixture: `chrome.storage.local.activeAccountId === 'gh_b'` (the popup is "on B"); the test explicitly clears the override (`setPollActiveAccountIdOverride(null)`) immediately before the `loadStoreFor` calls (simulates the SW being evicted between poll iterations). Then `loadStoreFor('gh_a')` MUST return A's data and `loadStoreFor('gh_b')` MUST return B's. This proves the `*For` variants do not fall back to the active-id pathway and that the override's value is irrelevant to them.
- `auth-refresh.ts` concurrent-refresh test, written against the accountId-keyed `inFlight` Map (not the old refresh-token keying): two concurrent `ensureFreshToken(now, 'gh_a')` calls share **one** `/access_token` network roundtrip (both resolve to the same access token, fetch mock invoked once for A); a concurrent `ensureFreshToken(now, 'gh_b')` issues a **separate** roundtrip (fetch mock invoked once for B). Assert on the fetch mock's call count per account, and assert the resolved access tokens correspond to each account's namespace.
- Full suite (`npm test`) passes; typecheck + lint clean; both builds (`npm run build`, `npm run build:firefox`) green.

**Risk + mitigations:**
- Risk: subtle behavioral drift in popup-side callers that used the implicit-id versions. Mitigation: T2 only adds variants and migrates poll-cycle's calls — popup paths keep their existing imports.
- Risk: `ensureFreshToken` accidentally cross-resolves between accounts under concurrent refresh. **Fixed** by step 5: `inFlight` becomes `Map<refreshToken, Promise<string>>`. Without this, two accounts with valid-but-near-expiry tokens could share a single in-flight Promise and the loser of the race gets the wrong access token.
- Risk: missed call site inside poll-cycle silently still uses the active-account default. Mitigation: the regex acceptance above enumerates every bare implicit-id helper; CI greps must show zero matches.

**Pre-granted commands** (for the wave brief): `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:firefox`, `grep`, `gh pr create`, `gh pr merge`, `gh pr view`, `git push`, `git fetch`, `git rebase`.

### Track 3 — Add-account flow + integration tests

Hardens the device-flow runner against SW eviction in the parts #147 didn't reach, plus an integration test that exercises the end-to-end add-second-account path.

**FILES ALLOWED:**
- `src/background/auth-device-flow-runner.ts` (capture remaining module state — `addingAccount`, `lastTokenSet`, abort signal — into closure variables at flow start; the success-handler reads from closures, never from `state.*` for path decisions or token data)
- `tests/background/auth-device-flow-runner.test.ts` (existing — extend) or a new `auth-device-flow-runner.add-account.test.ts` for the add-account scenarios
- A new integration test under `tests/background/multi-account-flow.test.ts` that:
  - Seeds account A with auth + a populated `pr_store`.
  - Invokes `beginDeviceFlowAddAccount()`.
  - Drives the flow to success (mocked `/user`, `/installations`).
  - Asserts: `accounts.<A>.auth` is unchanged, `accounts.<newId>.auth` populated, `activeAccountId === newId`.

**FILES OUT OF SCOPE — DO NOT TOUCH:**
- Anything T1 or T2 owns.
- `src/popup/*`.
- Manifest / build config.

**Branch:** `feat/multi-account-stability-pass-t3-add-account-hardening`

**Implementation steps:**
1. In `auth-device-flow-runner.ts`, capture *all* module state read after the await into `const` locals at flow start: `addAccount` (already done in #147), plus `abortSignal` (the `AbortController.signal` reference, not `state.abort`), plus any other path-affecting flags. The success-handler must not read `state.*` for decisions — only write to it for status updates.
2. Document the rule with a one-line comment: "Reads from `state.*` after this `await` are unsafe — SW eviction resets module state."
3. Add the add-account integration test described in FILES ALLOWED.
4. Add a regression test that simulates SW eviction in the middle of the device-flow `.then` (most realistic version: stub `setAccountState` to throw on first call, retry succeeds) and asserts auth lands in the correct namespace.

**Acceptance (verifiable):**
- `grep -nE "state\.(addingAccount|abort|lastTokenSet)" src/background/auth-device-flow-runner.ts` shows only WRITE sites in the `.then` / `resetStatus`, no READ inside the success-handler decision flow.
- `npm test -- tests/background/multi-account-flow.test.ts` passes (the new integration test).
- `npm test` overall passes; typecheck + lint clean.

**Risk + mitigations:**
- Risk: the new integration test is slow / flaky against the fake-fetch. Mitigation: use the same vitest patterns already in the existing `auth-device-flow-runner.test.ts`.

## Merge order

**T1 → T2 → T3**, with each track waiting for its predecessor to merge to `origin/main` before opening its PR.

- T1 lands the `*For` exports T2 needs.
- T2 lands the structural poll-cycle change that's the core leak fix.
- T3 rebases on merged T2 (NOT on the plan-doc spec) before authoring — T3's regression test at step 4 exercises the auth-write path T2 just rewrote (`writeAccountKeyFor` via the updated `setAccountState` semantics), so the test must run against T2's actual code.

If T2 must rebase after T1 merges, run the full test suite locally before pushing.

## Execution gate

Run `/opus-on-opus docs/plans/2026-05-12-multi-account-stability-pass.md` before dispatching any track. Apply must-fix findings; should-fix items go to user at Gate 2.

## Post-merge verification

After all three PRs land:

1. `git pull && npm test && npm run typecheck && npm run lint && npm run build && npm run build:firefox` — full local verify.
2. Manual repro of the reported flow: sign in to two accounts, switch back and forth, poll several times each, confirm each account's PR list contains only its own PRs.
3. Run **Settings → reset cached data** once on each account to flush pre-fix pollution. Then re-test the repro.
4. Confirm the popup doesn't lose the PR list after closing/reopening across an alarm-driven background poll.

## Open questions

- Should the popup-side implicit-id helpers also get phased out (longer term), or do we keep them indefinitely as the popup-context convenience layer? Default in this plan: keep them; popup callers never iterate accounts so the implicit-id reads are correct there. Annotate them `@deprecated for SW-side use — use *For variants` so future audits flag accidental SW imports.
