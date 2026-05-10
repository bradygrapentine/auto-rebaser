# Wave A-lite — Multi-Account Storage Refactor

_Drafted: 2026-05-09 · target: v2.0.0-pre · effort: 3 dev days, single PR_

> **Scope contract.** Wave A-lite is **storage shape + facade only**. No UI changes, no new automations, no new behavior — every popup view and automation should continue to work exactly as it does in v1.0.2 with a single account. The v2 multi-account UX (Wave B1/B2/B3) and 2.5 filter ride on top of this in subsequent PRs.

## Goal

Reshape `chrome.storage` so that v1's single-account state nests under a per-account key, and every `src/core/*-store.ts` reader/writer routes through a new account-scoped facade. Adds a one-shot migration that converts existing v1 data into the new shape on first v2 launch.

## Why this is the right first move

- Every other V2 deliverable (account switcher, per-account settings, account-filtered activity log, multi-select repo filter) reads or writes account-scoped state. Doing the storage shape first means those tracks become straightforward UI work.
- Migration risk is highest now and lowest later — touching it once, in a focused PR, with a backup escape hatch is safer than incrementally bolting account-awareness onto each store module.
- It's intentionally **not** a full `ProviderAdapter`. That's deferred to v3.0.0 when GitLab demand is real.

## Storage shape

### v1 (current, what we migrate FROM)

```jsonc
// chrome.storage.local
{
  "auth":               { method: 'github_app' | 'pat', ... },
  "pr_store":           { prs, lastPollAt, lastPollSummary, lastDeletedBranch, pollInProgress },
  "etags":              { [url]: { etag, data } },
  "activity":           { entries: ActivityEntry[] },
  "pingedPRs":          { [prId]: { at } },
  "resolved_threads":   { [threadId]: epochMs },
  "known_repos":        string[]
}

// chrome.storage.sync
{
  "github_token":              string,           // legacy PAT survival key, still migrated lazily by getAuth()
  "settings":                  { intervalMinutes, enterpriseHost?, enterpriseClientId? },
  "automation_settings":       { ...all automation toggles + opt-out lists },
  "migration_banner_dismissed": boolean
}
```

### v2 (target)

```jsonc
// chrome.storage.local
{
  "storage_version":     2,
  "active_account_id":   "gh_<login>",            // current focus
  "accounts": {
    "gh_<login>": {
      "auth":             { method: 'github_app' | 'pat', ... },
      "pr_store":         { prs, lastPollAt, lastPollSummary, lastDeletedBranch, pollInProgress },
      "activity":         { entries: ActivityEntry[] },
      "pingedPRs":        { [prId]: { at } },
      "resolved_threads": { [threadId]: epochMs }
    }
  },
  "known_repos":         string[],                 // global — feeds autocomplete across accounts
  "_migration_backup_v1": { ...all v1 keys, backed_up_at: epochMs }   // escape hatch
}
// `etags` deliberately dropped — regenerable on next poll cycle (one full-body
// response per endpoint per account, then back to 304s)
```

```jsonc
// chrome.storage.sync — quota-aware split
{
  "storage_version":  2,
  "global_settings":  { intervalMinutes, ignoredRepos, enableKeyboardShortcuts },
  "per_account_settings:gh_<login>": {  // separate KEY per account, NOT nested,
    ...                                  // because chrome.storage.sync's
                                         // QUOTA_BYTES_PER_ITEM = 8192
  },
  "per_account_settings_index": ["gh_<login>", ...],  // discovery
  "migration_banner_dismissed": boolean
}
```

### Account ID scheme

- **GitHub cloud**: `gh_<login>` (lowercased login).
- **GHES**: `gh_<host>_<login>` where `<host>` is `enterpriseHost` lowercased with dots replaced by underscores. Future-proofs the v3 GitLab `gl_<host>_<login>` shape without changing format.
- The active GitHub login is fetched via `GET /user` during the migration step (we already do this elsewhere).

## File-touch list

### New

- `src/core/storage/multi-account.ts` — facade. Exports:
  - `getActiveAccountId(): Promise<string | null>`
  - `setActiveAccountId(id: string): Promise<void>`
  - `listAccountIds(): Promise<string[]>`
  - `getAccountState<K extends keyof AccountState>(id, key): Promise<AccountState[K] | undefined>`
  - `setAccountState<K extends keyof AccountState>(id, key, value): Promise<void>`
  - `removeAccount(id): Promise<void>`  *(used by sign-out current account; full cleanup of local + sync per-account-settings)*
  - `getGlobalSetting<K extends keyof GlobalSettings>(key): Promise<GlobalSettings[K]>`
  - `setGlobalSetting<K extends keyof GlobalSettings>(key, value): Promise<void>`
  - `getPerAccountSetting<K extends keyof PerAccountSettings>(id, key): Promise<...>`
  - `setPerAccountSetting<K extends keyof PerAccountSettings>(id, key, value): Promise<...>`

  Reads cache the full `accounts` object per call but don't memoize across calls — `chrome.storage.local.get` is already cheap and we avoid stale-cache footguns.

- `src/core/storage/migration.ts` — one-shot migration. Exports:
  - `runMigrationIfNeeded(): Promise<void>` — idempotent; reads `storage_version`, runs migration if absent, sets `storage_version: 2` on success.
  - Internal: `migrateLocalV1ToV2`, `migrateSyncV1ToV2`, `backupV1`, `restoreV1Backup` (last is debug-only, not wired into UI).

- `tests/core/storage/multi-account.test.ts`
- `tests/core/storage/migration.test.ts`

### Modified

| File | Change |
|---|---|
| `src/core/constants.ts` | Add new key constants under `STORAGE_KEYS_V2`. Keep v1 names for migration source. |
| `src/core/auth-store.ts` | Becomes account-scoped. `getAuth() → getAuth(accountId)`. Existing 0-arg form deprecated; for source compat, route 0-arg through `getActiveAccountId()`. |
| `src/core/pr-store.ts` | Same pattern: `getPRStore(accountId)`, `upsertPRs(accountId, prs, ...)`. |
| `src/core/activity-log.ts` | Same pattern. |
| `src/core/ping-throttle.ts` | Same pattern. Resolved-threads helper too. |
| `src/core/automations-store.ts` | Splits into global vs per-account. `intervalMinutes`/`ignoredRepos`/`enableKeyboardShortcuts` route to global; everything else routes to per-account. |
| `src/core/settings-store.ts` | Same split as automations-store. |
| `src/core/etag-cache.ts` | Becomes per-account in-memory only. Drop the `chrome.storage.local` persistence entirely. |
| `src/core/migration-banner.ts` | Add new banner key `multi_account_migration_dismissed` for the v2-onboarding banner (separate from the existing PAT-migration banner — those are different flows). Banner UI ships in Wave B, but we add the persistence key here so Wave B doesn't have to touch storage shape. |
| `src/core/known-repos-store.ts` | Stays global — known repos feeds autocomplete and is shared across accounts. No accountId param. |
| `src/background/service-worker.ts` | Calls `runMigrationIfNeeded()` once on startup before any other init. |
| `src/background/poll-cycle.ts` | Reads `getActiveAccountId()` at the start of the cycle; passes accountId to every store call. **Polls only the active account in Wave A-lite** — multi-account polling is Wave B1's job, not ours. |
| `src/background/automations/orchestrator.ts` | Accepts `accountId` parameter; threads it through to each adapter. |
| `src/background/automations/{delete-merged-branch,enable-auto-merge,resolve-obsolete-threads,adapters}.ts` | Accept `accountId` where they currently call store helpers. |
| `src/popup/hooks/usePRStore.ts`, `useActivityLog.ts`, `usePingedStore.ts` | Read via the facade with the active account id. |
| `src/popup/hooks/useSettings.ts`, `useAutomationSettings.ts` | Split reads/writes into global vs per-account. |

### Test files updated (mocks change shape)

Most tests mock `chrome.storage.local.get` directly. They get a mass update to write the new shape under the active account, OR (preferred) update to mock the facade module instead. Pattern: in `tests/setup.ts` (or each test's `vi.mock`), default to a single migrated account `gh_testuser` with all v1 sub-keys present.

Estimated 30–40 test files touched, mostly mechanical.

## Migration logic

### Trigger

In `service-worker.ts` on startup, before alarm setup or any poll:

```ts
import { runMigrationIfNeeded } from './core/storage/migration';
await runMigrationIfNeeded();
```

`runMigrationIfNeeded` is idempotent — checks `storage_version`, returns immediately if already 2.

### Steps

1. Read all v1 keys from `chrome.storage.local` AND `chrome.storage.sync` in parallel.
2. If `auth` is missing → fresh install, no v1 data. Just set `storage_version: 2` and exit.
3. Determine the account id:
   - `gh_app`: hit `GET /user` with the existing access token to get login (we already do this elsewhere; reuse the helper). Fallback to `gh_unknown` if the call fails — surfaced to user via banner.
   - `pat`: same `GET /user`.
4. Write `_migration_backup_v1` with all original v1 keys + `backed_up_at: Date.now()`.
5. Build the v2 `accounts.<id>` payload from `auth`, `pr_store`, `activity`, `pingedPRs`, `resolved_threads`. Drop `etags`.
6. Build sync payload: split `automation_settings` into global (3 keys) + per-account (everything else). Migrate `settings` into global.
7. Write the new shape.
8. Set `storage_version: 2`.
9. Remove old top-level keys from `chrome.storage.local` (auth, pr_store, etags, activity, pingedPRs, resolved_threads). Keep `known_repos` in place.
10. Remove old top-level keys from `chrome.storage.sync` (`automation_settings`, `settings`).
11. Set `multi_account_migration_dismissed: false` so the Wave B banner shows on first launch after migration.

### Rollback

If steps 4–7 fail mid-flight (rare; storage write is atomic per call but we have multiple calls), the `_migration_backup_v1` exists and `storage_version` is still absent. Next launch retries from step 1. The backup is kept around forever in v2.0.0 (~few KB) and only purged in v2.1.0+ once we have install-base confidence.

### Keys explicitly dropped

- `etags` — regenerable (one full-body response per endpoint per account on first poll, then back to 304s; users see no functional difference).

### Keys kept global (not migrated under `accounts.<id>`)

- `known_repos` — autocomplete suggestions are a single shared pool by design.

## Test cases

### Unit — `multi-account.test.ts`

- `getActiveAccountId` returns null on fresh install.
- `setActiveAccountId` persists and `getActiveAccountId` reads it back.
- `setAccountState`/`getAccountState` round-trip for each AccountState key (auth, pr_store, activity, pingedPRs, resolved_threads).
- Setting state for a new accountId creates the `accounts.<id>` namespace without touching siblings.
- `removeAccount` drops the local namespace AND the corresponding `per_account_settings:<id>` sync key AND removes the entry from `per_account_settings_index`.
- `getPerAccountSetting` returns the sync per-key object (not nested).
- `setPerAccountSetting` writes only the per-account key, leaves sibling accounts untouched. Updates `per_account_settings_index`.
- Quota assertion: stringified per-account settings for a fixture account with 50 opt-out repos × 4 lists fits in 8 KB. (Fails noisily in test if shape regresses.)

### Unit — `migration.test.ts`

- Fresh install (no v1 keys present) → sets `storage_version: 2`, no accounts written.
- Full v1 fixture (every v1 key present) → migrates into the new shape, all sub-keys preserved.
- `_migration_backup_v1` contains every v1 key including `etags` (we backup but don't restore it).
- `etags` does NOT appear under `accounts.<id>`.
- `known_repos` stays at the top level.
- `automation_settings` splits correctly: `intervalMinutes` / `ignoredRepos` / `enableKeyboardShortcuts` → global; everything else → `per_account_settings:<id>`.
- `migration_banner_dismissed` (PAT-migration banner) is preserved; the new `multi_account_migration_dismissed` is initialized to false.
- Idempotent — running twice is a no-op (second call reads `storage_version: 2` and exits).
- Failure mid-write (mock `chrome.storage.local.set` to throw on the first new-shape write): `storage_version` stays absent, `_migration_backup_v1` exists, original keys still present. Next call succeeds and produces the right shape.
- `gh_app` account-id derivation: mocked `GET /user` returning `{ login: 'octocat' }` → accountId `gh_octocat`.
- `pat` account-id derivation: same.
- `GET /user` failure → accountId `gh_unknown` (logged to console; user sees banner on next launch).

### Integration — poll cycle

- `poll-cycle.test.ts` updated: every test sets up the active account via the facade. A new test asserts that with `active_account_id` unset, the cycle is a no-op (covers the "migration somehow didn't run" defensive case).
- `orchestrator.test.ts` updated: each adapter receives `accountId` and uses it to scope reads/writes.

### Manual smoke

- Install v1.0.2 in a fresh Chrome profile, sign in, accumulate ~5 PRs and at least one merged + branch-deleted PR (so the activity log has content).
- Replace with the v2.0.0-pre build → reload extension → open popup.
- **Expected:** popup shows the same PRs, activity log, settings. Console logs `migration: v1 → v2 complete`. `chrome.storage.local` contains `accounts.gh_<login>.*` and `_migration_backup_v1`. `etags` is gone.
- Repeat with PAT-only auth path.
- Repeat on Firefox (`dist-firefox`).

## Risks and unknowns

| Risk | Mitigation |
|---|---|
| `chrome.storage.local.set` partial failure mid-migration | `_migration_backup_v1` written first; missing `storage_version` triggers retry next launch. |
| Fetch to `GET /user` fails during migration (offline first launch after upgrade) | Fall back to `gh_unknown` accountId; banner prompts user to re-authenticate, which on success re-runs migration with the correct id. |
| `automation_settings` for some users actually exceeds 8 KB right now (lots of opt-out repos) | Migration writes the per-key split; if the original `automation_settings` is already past 8 KB, the v1 → v2 read step still works (we read `automation_settings` whole, split it into smaller per-account keys before writing). Sync write succeeds. |
| Test churn (~30–40 files) discovers a hidden coupling | Build incrementally: facade + migration + tests first commit; per-store-module updates as separate commits within the PR; integration sweeps last. Run typecheck after every commit. |
| Popup mounts before migration completes | `service-worker.ts` `await`s `runMigrationIfNeeded()` synchronously at startup. Popup's `chrome.runtime.sendMessage('POLL_NOW')` and storage reads will see post-migration shape because the SW is the writer for storage and the popup is read-only on hot paths. |
| User's GitHub login differs by case across sessions | Lowercase + trim before forming the accountId. Recorded as a constant. |

## Acceptance (single-PR done-when)

- [ ] All v1 stores (auth, pr_store, activity, pingedPRs, resolved_threads, automations) accept an `accountId` parameter and route through the facade.
- [ ] On a fresh install, `storage_version: 2` is set and no v1 keys exist after first SW startup.
- [ ] On an upgrade from v1.0.2 (manually loaded fixture or local upgrade), all data is preserved under `accounts.gh_<login>` and `per_account_settings:gh_<login>`. `_migration_backup_v1` exists.
- [ ] `etags` is dropped on migration; first poll cycle after upgrade hits the API once per endpoint and stores fresh ETags in the v2 in-memory cache.
- [ ] All existing tests pass after mock-shape updates.
- [ ] New tests cover: facade round-trips, migration happy path, migration idempotency, mid-write failure recovery, account-id derivation (gh_app + pat), per-key sync split, quota-fit assertion.
- [ ] No UI regressions in popup smoke (manual on Chrome + Firefox).
- [ ] Coverage ≥ pre-PR baseline (lines 97.48%, functions 95%, branches 91.28%, statements 97.48%).
- [ ] Bundle size delta < 5%.

## Out of scope (for later waves, do NOT include)

- Multi-account UI (account switcher, settings split, activity filter chip) → Wave B1/B2/B3.
- Polling more than one account per cycle → Wave B1.
- 2.5 repo/org filter → its own track.
- Provider abstraction (`ProviderAdapter` interface) → v3.
- Removing `_migration_backup_v1` → defer to v2.1.0.

## Estimated effort breakdown

- Day 1: facade + migration module + their tests.
- Day 2: store-module updates (auth-store, pr-store, activity-log, ping-throttle, settings-store, automations-store, etag-cache).
- Day 3: poll-cycle / orchestrator / adapter / popup-hook updates, mock-shape sweep across existing tests, manual smoke.
