# Runbook — V1 → V2 Storage Migration

_Companion to: Wave B of the V2 plan._

V1 stores all auth/PR cache/activity log under a single, unscoped key set in `chrome.storage.local`. V2 nests everything under `accounts.<id>.<key>`. This migration runs once per install on first V2 launch.

## Storage shapes

### V1 (current — verified against `src/core/constants.ts` + `src/core/automations-constants.ts`)

```jsonc
chrome.storage.local: {
  auth: { method: 'github_app', token: '...', refreshToken: '...', user: {...} },
  pr_store: { prs: [...], lastPollAt: 1746604800000 },
  activity: { entries: [...] },
  pingedPRs: { '123': 1746604800000 },
  resolved_threads: { '<threadId>': 1746604800000 },  // Story 2.8 — auto-resolve dedup
  etags: { '<url>': '"<etag>"' }                       // Story 1.9 — ETag cache
}
chrome.storage.sync: {
  settings: { intervalMinutes: 5, enterpriseHost?: '...', enterpriseClientId?: '...' },
  automation_settings: { enableStaleBadge: true, ... },
  github_token?: '...'  // Legacy OAuth-method users only; orphaned in v1.0.2 but
                        // may persist on installs that pre-date the move to local
}
```

### V2 (target — quota-aware per-key sync split)

```jsonc
chrome.storage.local: {
  storage_version: 2,
  active_account_id: 'gh_brady',
  accounts: {
    'gh_brady': {
      auth: { method: 'github_app', token: '...', user: {...} },
      pr_store: { prs: [...], lastPollAt: 1746604800000 },
      activity: { entries: [...] },
      pingedPRs: { '123': 1746604800000 },
      resolved_threads: { '<threadId>': 1746604800000 }   // moved from v1 root
    }
    // additional accounts added as the user signs in
  },
  _migration_backup_v1: {
    auth, pr_store, activity, pingedPRs, resolved_threads, etags,
    settings, automation_settings, github_token,
    backed_up_at: 1746604800000
  }
  // Note: `etags` is dropped on migration (not carried into accounts.<id>).
  // The ETag cache is regenerable on the next poll cycle; persisting it
  // through migration adds complexity without benefit.
}

chrome.storage.sync: {
  storage_version: 2,
  global_settings: { intervalMinutes: 5, ignoredRepos: [...], enableKeyboardShortcuts: true },
  // Per-account settings stored under SEPARATE KEYS to stay under
  // chrome.storage.sync.QUOTA_BYTES_PER_ITEM = 8192 bytes. Two accounts
  // with ~15 opt-out repos per automation per account exceed 8 KB in a
  // nested-object form. Per-key splitting gives each account its own
  // 8 KB budget; total sync quota (100 KB) supports ≥10 accounts.
  "per_account_settings:gh_brady": {
    autoDeleteMergedBranch, autoDeleteOptOutRepos,
    autoEnableAutoMerge, autoMergeOptOutRepos, mergeMethodPreference,
    autoResolveOutdatedThreads, autoResolveOptOutRepos,
    enableStaleBadge, staleThresholdDays, staleThresholdOverrides,
    staleCountsAsAttention, enablePingReviewers, pingTemplate
  },
  per_account_settings_index: ["gh_brady"]               // discovery key
}
```

## Migration steps

Implemented in `src/core/migrations/v1-to-v2.ts`. Runs in the service worker on `chrome.runtime.onInstalled` (event reason: `update`).

1. **Read `storage_version`.** If `2`, return — already migrated.
2. **Read v1 keys** in parallel:
   - `chrome.storage.local`: `auth`, `pr_store`, `activity`, `pingedPRs`, `resolved_threads`, `etags`
   - `chrome.storage.sync`: `settings`, `automation_settings`, `github_token` (legacy OAuth path)
3. **If `auth` is missing** → no v1 install was active. Set `storage_version: 2`, write empty `accounts: {}`, return.
4. **Generate account ID:** `acct_id = 'gh_' + auth.user.login.toLowerCase()` (or `'pat_' + sha1(token).slice(0,8)` for unauthenticated PAT path with no user info).
5. **Backup v1 keys** to `_migration_backup_v1` with timestamp — must include all 9 v1 keys so rollback restores complete state. Do NOT delete the original keys yet.
6. **Write v2 shape:**
   - `chrome.storage.local.set({ storage_version: 2, active_account_id: acct_id, accounts: { [acct_id]: { auth, pr_store, activity, pingedPRs, resolved_threads } } })`
   - For each account, write the per-key sync entry:
     `chrome.storage.sync.set({ ['per_account_settings:' + acct_id]: extractPerAccount(automation_settings) })`
   - Write the discovery index + global settings:
     `chrome.storage.sync.set({ storage_version: 2, global_settings: extractGlobal(settings, automation_settings), per_account_settings_index: [acct_id] })`
7. **Verify** by re-reading the v2 keys and confirming structure.
8. **If verify succeeds** → delete v1 keys (`auth`, `pr_store`, `activity`, `pingedPRs`, `resolved_threads`, `etags` from local; `settings`, `automation_settings`, `github_token` from sync). Keep `_migration_backup_v1`.
9. **If verify fails** → leave v1 keys in place; **log error to `console.error`** (not the activity log — that store may itself be partially migrated and untrustworthy at this point); show error toast in popup ("Migration failed; v1 data preserved. Please reinstall or contact support."). Do NOT proceed with v2.

### Extracting global vs per-account settings

`global_settings` (cross-account, in `storage.sync`):
- `intervalMinutes`
- `ignoredRepos`
- `enableKeyboardShortcuts`

`per_account_settings.<acct_id>` (per-account, in `storage.sync`):
- `autoDeleteMergedBranch`, `autoDeleteOptOutRepos`
- `autoEnableAutoMerge`, `autoMergeOptOutRepos`, `mergeMethodPreference`
- `autoResolveOutdatedThreads`, `autoResolveOptOutRepos`
- `enableStaleBadge`, `staleThresholdDays`, `staleThresholdOverrides`, `staleCountsAsAttention`
- `enablePingReviewers`, `pingTemplate`

## Rollback path

`_migration_backup_v1` is preserved for **60 days**. Delete via a scheduled `chrome.alarms` task on day 60.

If a user reports a v2 issue and we need to roll them back to v1:
1. Read `_migration_backup_v1` (contains all 9 v1 keys).
2. Restore from it:
   - `chrome.storage.local`: `auth`, `pr_store`, `activity`, `pingedPRs`, `resolved_threads`, `etags`
   - `chrome.storage.sync`: `settings`, `automation_settings`, `github_token` (if present in backup)
3. Delete v2 keys:
   - `chrome.storage.local`: `storage_version`, `active_account_id`, `accounts`
   - `chrome.storage.sync`: `storage_version`, `global_settings`, `per_account_settings_index`, and every `per_account_settings:<acct_id>` key listed in the index before deletion.
4. The user installs the v1.0.x build (still on the v1.0.2 GitHub release).

This rollback is operator-driven (devtools console), not automatic. v2 ships with a "stuck" recovery story, not silent fallback.

## Test plan

Before shipping v2.0.0, verify migration with these fixtures:

1. **Fresh install** (no v1 data): migrate sets `storage_version: 2`, `accounts: {}`, no backup. Pass.
2. **GitHub App user** (typical v1.0.2 install): migrate creates `gh_<login>` account, preserves all PR cache + activity log + automation toggles. Pass.
3. **PAT user** (legacy): migrate creates `pat_<hash>` account, same preservation. Pass.
4. **Corrupted v1 data** (malformed JSON in storage): migration aborts with error toast, v1 keys preserved. Pass.
5. **Quota near full** (chrome.storage.local 5MB cap): migration gracefully fails before write, restores; same as #4.

## Acceptance criteria for shipping v2.0.0

- [ ] All 5 fixtures above pass in a clean Chrome profile.
- [ ] `_migration_backup_v1` exists after migration and contains the full v1 state.
- [ ] User can sign in to a second account post-migration without affecting the migrated one.
- [ ] Activity log shows a single "v1 → v2 migration completed" entry stamped with the migration timestamp.
- [ ] Error toast wording is reviewed for clarity — assume the user has no idea what "storage migration" means.
