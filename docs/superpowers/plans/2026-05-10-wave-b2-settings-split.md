# Wave B2 — Per-Account vs Global Settings Split

_Drafted: 2026-05-10 · target: v2.0.0 · effort: 1.5 dev days · single PR · depends on MA-1 merged · parallel-safe with B1 and B3_

> **Scope contract.** Settings page only. Splits the existing toggle pile into two visually distinct sections (Global / This account) backed by the new facade. **No** changes to automation behavior, **no** new toggles. B1 owns the header; B3 owns the activity log.

## Goal

Settings page makes it obvious which toggles affect every account vs only the active one. A user with two accounts can have `autoEnableAutoMerge: true` on one account and `false` on the other without confusion.

## What goes where

Per the MA-1 contract and the existing automation-settings shape:

**Global** (`per_account_settings_index`-independent — always one value):
- `intervalMinutes` (poll cadence)
- `ignoredRepos` (cross-account ignore — same repo across accounts is hidden everywhere)
- `enableKeyboardShortcuts`

**Per-account** (one value per `accounts.<id>`):
- `autoRebaseEnabled` + `autoRebaseOptOutRepos`
- `autoDeleteMergedBranch` + `autoDeleteOptOutRepos`
- `autoEnableAutoMerge` + `mergeMethodPreference` + `autoMergeOptOutRepos`
- `mergeCleanPRsImmediately` + `mergeCleanPRsOptOutRepos`
- `autoResolveOutdatedThreads` + `autoResolveOptOutRepos`
- `enableStaleBadge` + `staleThresholdDays` + `staleThresholdOverrides` + `staleCountsAsAttention`
- `enablePingReviewers` + `pingTemplate`
- `enterpriseHost` + `enterpriseClientId` (these belong to the account they were set for)

## File-touch list

### New

- `src/popup/components/SettingsGlobalSection.tsx` — wraps the 3 global controls.
- `src/popup/components/SettingsAccountSection.tsx` — wraps everything per-account, with a "for octocat" header strip showing active account.
- `tests/popup/components/SettingsGlobalSection.test.tsx`
- `tests/popup/components/SettingsAccountSection.test.tsx`

### Modified

| File | Change |
|---|---|
| `src/popup/views/SettingsView.tsx` | Restructure body: `# global` heading → `<SettingsGlobalSection />`, then `# this account (octocat)` heading → `<SettingsAccountSection />`. Account heading uses the active account's login dynamically. |
| `src/popup/components/AutomationsSettings.tsx` | Move into `SettingsAccountSection`. Skip-list entries pass through `accountId` so they write to per-account storage. |
| `src/popup/hooks/useSettings.ts` | Returns `{ global, account }`. Reads global via `getGlobalSetting`; reads account via `getPerAccountSetting(activeId, …)`. Writes route the same way. |
| `src/popup/hooks/useAutomationSettings.ts` | Same shape change. |
| `src/popup/popup.css` | New `.settings__section--global` and `.settings__section--account` separators (dashed cyan top border + tag). |

## UX detail

```
← back · settings · clear log

# global
github_poll_interval        — [ 1m ▾ ]
keyboard_shortcuts          — [x] enabled
ignored_repos               (chevron)

# this account (octocat)
account_method              — GitHub App
[ switch to PAT ]

▶ Auto-rebase behind PRs
▶ Auto-delete merged branches
▶ Auto-enable auto-merge
▶ Merge clean PRs immediately
▶ Auto-resolve outdated review threads
▶ Stale-PR badge
▶ Allow ping reviewers
```

The `# this account (octocat)` heading updates live when the user changes active account via B1's switcher (no remount needed; `useAutomationSettings` re-reads on activeId change).

## Test cases

### Unit — `useSettings.test.ts` / `useAutomationSettings.test.ts` updates

- Returns global values from `getGlobalSetting`.
- Returns per-account values from `getPerAccountSetting(activeId, …)`.
- Switching active account causes per-account values to reload, global values stay constant.
- Saving a global value writes via `setGlobalSetting` (not `setPerAccountSetting`).
- Saving a per-account value scopes to the active account (other accounts' settings unchanged).

### Unit — section components

- `SettingsGlobalSection` renders the 3 global controls.
- `SettingsAccountSection` renders the active account's login in its header.
- Sections render under their own headings with the right CSS classes.

### Integration — `SettingsView`

- Two-account fixture: switching active account updates the account section's header AND the per-account toggles.
- Editing a per-account toggle on account A and switching to B shows B's old value (no leak).

### Manual smoke

- Sign in to two accounts. Toggle `autoEnableAutoMerge` on for account A only. Switch to B → off. Switch back to A → on. Storage inspector confirms two separate `per_account_settings:gh_<id>` keys.

## Risks and unknowns

| Risk | Mitigation |
|---|---|
| User assumes `ignoredRepos` is per-account when they wanted that | Add an inline hint under the global section: "Ignored repos hide PRs from every account." Future iteration could move `ignoredRepos` per-account; OOS for B2. |
| Stale per-account read while account is switching | `useAutomationSettings` keys its query by `activeId`; React re-runs on change. |
| 8 KB-per-key sync quota for the account-settings key | MA-1 already migrated each account into its own sync key; the per-account payload is comfortably under quota. Quota assertion test in MA-1 already guards. |

## Acceptance

- [ ] Settings page shows Global and Per-account sections clearly distinguished.
- [ ] `# this account (login)` heading updates live when active account changes.
- [ ] All toggles read/write through the correct facade method (global vs per-account).
- [ ] Two-account fixture: per-account toggles isolated; global toggles shared.
- [ ] All existing settings tests pass with the new shape.
- [ ] Coverage ≥ baseline; bundle delta < 5%.

## Out of scope

- New automation toggles.
- Inline UI to copy settings from another account ("apply to all accounts" button) — defer to v2.1.0 if requested.
- Activity-log split (B3).
- Account-switcher header (B1).
