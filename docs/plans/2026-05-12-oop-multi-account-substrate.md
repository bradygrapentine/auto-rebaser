# OOP — multi-account substrate

**Date:** 2026-05-12
**Base SHA:** 9abbf26
**Source:** /oop Phase 1+2 over the multi-account substrate (storage, auth, poll cycle).
**Plan owner:** /sprint (oop-multi-account-substrate)
**Invariant:** No external behavior change. No function output, UI, storage payload, or public API signature changes are permitted under this plan. Behavior changes go in separate PRs with explicit user approval.

## Goal

Collapse the implicit/explicit-id store fork (introduced under #149) into a single `AccountScope` class. Replace the 8 ctx* helper closures in `runPollCycleInner` with one `AccountScope` argument. Brand `AccountId` so it can't be confused with logins/owners/repo strings. Delete the dead `setPollActiveAccountIdOverride` machinery left behind after the #149 threading.

The substrate's *behavior* is already correct (just shipped — PRs #148/#149/#150, hereafter "the stability pass"). This refactor consolidates *shape* so future per-account features (a new throttle, a new badge counter, a per-account preference) hook in once instead of in pairs.

Track labels below (T1/T2/T3) refer to this plan's three tracks only — they do NOT reference the stability-pass PR sequence.

## Non-goals

- Touching the PR state machine (`PRState`, `Mergeable State`) — different domain, different /oop pass.
- Touching popup view components beyond replacing direct store imports with `AccountScope` calls.
- Renaming any function or type that's part of the public popup ↔ SW message contract.
- Removing the implicit-id `loadStore()` / `getAuth()` / etc. surface — popup code can still call them; they become 1-line wrappers that build an `AccountScope` from the Active Account internally. (Drop them in a separate later pass once we've measured zero callers.)
- AutomationSettings split (Global vs PerAccount) merge logic — flagged but deferred.

## Tracks

### Track 1 — Brand `AccountId` + introduce `AccountScope`

**Sources:** Phase 1 vocabulary (CONTEXT.md `Account Scope`, `Account Id`).

**FILES ALLOWED:**
- `src/core/storage/multi-account.ts` (add `AccountId` brand + `AccountScope` class)
- `src/core/account-scope.ts` (new — class lives here if multi-account.ts breaches its size budget; otherwise inline)
- `tests/core/storage/account-scope.test.ts` (new — unit tests for the class)

**FILES OUT OF SCOPE:**
- Any caller of `loadStore` / `getAuth` / etc. — T1 introduces only. T2 migrates callers.
- All `src/background/`, all `src/popup/`.

**Branch:** `refactor/oop-msa-t1-account-scope` off base SHA above.

**Implementation steps:**
1. Add `export type AccountId = string & { readonly __brand: 'AccountId' };` to `multi-account.ts`.
2. Add `export function asAccountId(s: string): AccountId { return s as AccountId; }` — single chokepoint for the cast. All existing `string` accountId producers (`buildAccountId`, `listAccountIds`, `getActiveAccountId`) updated to return `AccountId | string` compatibly via the same cast.
3. Add `class AccountScope { constructor(readonly id: AccountId) {} }` with methods one-by-one mirroring the existing `*For` fns: `loadStore()`, `saveStore(store)`, `upsertPRs(recs)`, `pruneStale(ids)`, `stampPollTime()`, `loadReviewerStore()`, `saveReviewerStore(store)`, `upsertReviewerPRs(recs)`, `getAuth()`, `setInstallations(insts)`, `setAuthGitHubApp(tokenSet)`, `getAutomationSettings()`, `getResolvedThreads()`, `saveResolvedThreads(map)`, `getPingedStore()`, `recordPing(id)`, `getRerequestStore()`, `recordRerequest(id)`, `appendActivity(entries)`, `recordKnownRepos(names)`, **`setActionableCount(n)`** (writes `actionable_count` via `setAccountState(this.id, 'actionable_count', n)`).
4. Each method is a 1-line delegation to the existing `*For(this.id, ...)` fn (or `setAccountState` for `setActionableCount`). No new logic.
5. **No `AccountScope.implicit()` static.** The popup keeps using the existing implicit-id helpers (`loadStore()`, `getAuth()`, etc.) — those untouched in this pass. `auth-refresh`'s in-flight Map sentinel `'__implicit__'` stays as-is. T1 does NOT migrate popup callers; rationale: keeping the popup on the implicit surface preserves the `ensureFreshToken(undefined)` contract that the in-flight Map dedup relies on. Migrating popup is a future pass after we've measured a concrete need.
<!-- forIterating factory dropped per Gate 2 should-fix: YAGNI. T2 builds scopes via `new AccountScope(asAccountId(id))` directly. -->

**Risks specific to T1:**
- *AccountId brand spread.* The brand ripples through ~15 distinct call sites (audit: `grep -rn "accountId" src/ | wc -l` shows under ~15 producers/consumers). Plan T1 isolates the brand inside `multi-account.ts` via `asAccountId`; downstream type errors should be limited. If they aren't, that's a halt-and-rescope signal.

**Acceptance (verifiable):**
- Exactly one of these two greps returns 1, the other 0: `grep -c "^export class AccountScope" src/core/storage/multi-account.ts` and `grep -c "^export class AccountScope" src/core/account-scope.ts`. (The class lives in one file; the location is an implementation decision; the acceptance pins "exactly one definition.")
- All 21 methods enumerated in step 3 exist on the class: `grep -cE "^\s+(async )?[a-zA-Z]+\(" src/core/{storage/multi-account.ts,account-scope.ts}` ≥ 21 (filter to inside the class body if needed).
- `tsc --noEmit` clean.
- `npm test` — full suite green including new `tests/core/storage/account-scope.test.ts` covering each method delegates to the matching `*For` fn (mock the `*For` fns, assert call shape).
- `git diff --stat origin/main..HEAD` shows additions only in T1's FILES ALLOWED.

**Risk + mitigations:**
- *Risk:* circular import (account-scope.ts → pr-store.ts → multi-account.ts → account-scope.ts). *Mitigation:* if it happens, keep `AccountScope` in multi-account.ts (line budget allows). Decision deferred to implementation — measure first.

### Track 2 — Migrate `runPollCycleInner` to `AccountScope`

**Sources:** Phase 2 finding — 8 ctx* helper closures in `src/background/poll-cycle.ts:148-157` all branch `accountId ? thingFor(accountId, x) : thing(x)`.

**FILES ALLOWED:**
- `src/background/poll-cycle.ts`
- `tests/background/poll-cycle.cross-account.test.ts` (update to assert AccountScope is built per iteration)

**FILES OUT OF SCOPE:**
- The `AccountScope` class itself (T1 owns).
- Popup code.
- Endpoint files in `src/github/`.

**Branch:** `refactor/oop-msa-t2-poll-cycle-scope` off T1's merged head.

**Implementation steps:**
1. Change `runPollCycleInner(accountId?: string)` → `runPollCycleInner(scope?: AccountScope)`. Callers in `runPollCycle` build `new AccountScope(asAccountId(id))` per iteration.
2. Replace each `ctxLoadStore = () => accountId ? loadStoreFor(accountId) : loadStore()` with a direct call: `scope ? scope.loadStore() : loadStore()`. The implicit-id fallback branch stays for the fresh-install (no-accounts-yet) path.
3. The `actionable_count` write at line 576 already uses explicit `accountId`; swap to `scope.setActionableCount(n)`. `setActionableCount` is enumerated in T1 step 3 — T2 only consumes it. No T2 edit to `multi-account.ts` or `account-scope.ts`.
4. `runReviewerPhase` and `runAutomationsPass` accept `scope?: AccountScope` instead of `accountId?: string`.

**Acceptance (verifiable):**
- `grep -c "ctxLoadStore\|ctxUpsertPRs\|ctxPruneStale\|ctxStampPollTime\|ctxGetAutomationSettings\|ctxRecordKnownRepos\|ctxGetAuth\|ctxSetInstallations" src/background/poll-cycle.ts` returns 0.
- `grep -nwE "loadStoreFor|upsertPRsFor|pruneStaleFor|stampPollTimeFor|getAutomationSettingsFor|recordKnownReposFor|getAuthFor|setInstallationsFor" src/background/poll-cycle.ts | grep -v "^[0-9]*:import " | grep -v "//"` returns 0 (no non-import, non-comment hit — all replaced by `scope.*` calls).
- `grep -nE "getActiveAccountId|setPollActiveAccountIdOverride" src/background/poll-cycle.ts` still returns 0 (T2 acceptance preserved).
- `npm test` green; in particular `tests/background/poll-cycle.cross-account.test.ts` still passes — that test's assertions (every `*For` call receives the iterating accountId) become "every `scope.*` call's scope.id matches the iterating accountId."
- Per-PR commit count check: each commit drops the test-suite branch count of `runPollCycleInner` (measure via `npx complexity-report` or eyeball — fall back to "obviously fewer branches" if no tooling).

**Behavior-preservation argument:**
- Each AccountScope method is a 1-line delegation to the same `*For` fn the ctx closure used to call. Test contract (cross-account isolation) is unchanged; only the call shape changes.

**Risk + mitigations:**
- *Risk:* tests inspect `*For` mock calls but the new code calls `scope.*` which routes through them — should still hit the mocks via the AccountScope methods. *Mitigation:* update test imports to mock the right surface; behavior-pinning tests stay green.

### Track 3 — Delete dead override machinery

**Sources:**
- Phase 2 finding — `setPollActiveAccountIdOverride` and `pollActiveAccountIdOverride` in `multi-account.ts:110-126` have zero callers outside the file itself (verified by `grep -rn "setPollActiveAccountIdOverride\|pollActiveAccountIdOverride" src/ tests/` — 5 hits, all in `multi-account.ts`).

**FILES ALLOWED:**
- `src/core/storage/multi-account.ts`
- `tests/core/storage/multi-account.test.ts` (drop override tests if any)

**FILES OUT OF SCOPE:**
- `auth-store.ts` `clearAuth` cleanup list — **deliberately out of scope.** Reading `clearAuth` shows it skips `pr_store`, `activity`, `notif_throttle`, `reviewerPRs`, `knownRepos`, `actionable_count` (those preserve PR cache for re-sign-in UX). Iterating `keyof AccountState` would wipe them. The skip-list is intentional product behavior, not a refactor candidate.
- `removeAccount` — **deliberately out of scope.** Reading it: it already `delete accounts[id]`s the whole namespace. There is no hand-coded per-key list to dedup; the original Phase-2 finding was wrong on reread.

**Branch:** `refactor/oop-msa-t3-cleanup` off T2's merged head.

**Implementation steps:**
1. Delete `pollActiveAccountIdOverride`, `setPollActiveAccountIdOverride`, `POLL_OVERRIDE_KEY`, the in-memory mirror, and the `chrome.storage.session` read inside `getActiveAccountId`. `getActiveAccountId` becomes a plain `chrome.storage.local.get(ACTIVE_ID_KEY)` read.
2. Update or remove `tests/core/storage/multi-account.test.ts` cases that referenced the override (if any). `npm test` green afterward.

**Acceptance (verifiable):**
- `grep -nE "pollActiveAccountIdOverride|setPollActiveAccountIdOverride|POLL_OVERRIDE_KEY" src/` returns 0.
- `grep -n "chrome.storage.session" src/core/storage/multi-account.ts` returns 0 (the only consumer was the override).
- `npm test` green; `npm run typecheck` clean; both builds succeed.

**Behavior-preservation argument:**
- Override machinery is provably dead post-T2 (grep above shows 0 callers outside `multi-account.ts`). Removing it is a pure subtraction.
- `getActiveAccountId` keeps the same return type and semantics from a caller's perspective.
- `chrome.storage.session` served two purposes historically: (a) propagating the per-poll override across SW eviction (write path); (b) acting as a fallback when `chrome.storage.local.get(ACTIVE_ID_KEY)` was racing eviction-recovery (read path). The write path is dead post-#149 (no caller writes the override). The read-path fallback is also redundant because `runPollCycleInner` no longer calls `getActiveAccountId()` — `accountId` is threaded explicitly post-#149 by passing accountId explicitly through the loop. Popup callers of `getActiveAccountId()` run after the SW has fully resumed (popup open implies SW alive), so the eviction-recovery window doesn't apply to them either.
- Pinning oracle for the eviction-recovery claim: `grep -nE "getActiveAccountId" src/background/poll-cycle.ts` returns 0 after T2 — confirmed.

**Risk + mitigations:**
- *Risk:* an external caller we missed reads `chrome.storage.session` for `POLL_OVERRIDE_KEY` directly. *Mitigation:* `grep -rn "poll_active_account_override\|POLL_OVERRIDE_KEY" .` before deleting; any hit outside `multi-account.ts` is a halt-and-investigate.

## Merge order

**T1 → T2 → T3**, strictly sequential. T2 imports `AccountScope` from T1; T3 deletes things T2 must no longer reference.

Each track waits for its predecessor to merge to `origin/main` before opening its PR.

## Execution gate

Run `/opus-on-opus docs/plans/2026-05-12-oop-multi-account-substrate.md --from-sprint` before dispatching anything. Apply must-fix findings; surface should-fix items at Gate 2.

## Post-merge verification

- `git pull && npm test && npm run typecheck && npm run build && npm run build:firefox` on integrated main.
- Manual smoke: open popup, switch accounts, force poll on each; no leak.
- Spot-check the cyclomatic complexity reduction in `runPollCycleInner` — eyeball the branch density before vs after. Not a hard gate, but if it didn't drop, the refactor failed its own success criterion.

<!-- AccountId brand cost note relocated into T1 Risks per Gate 2 nit. -->

## Open questions

None — directional questions answered at Phase 1 (AccountScope class, branded AccountId, AccountScope-only poll-cycle wrap).
