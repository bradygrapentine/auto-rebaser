# Wave B3 — Activity Log Account-Filter Chip

_Drafted: 2026-05-10 · target: v2.0.0 · effort: 1 dev day · single PR · depends on MA-1 merged · parallel-safe with B1 and B2_

> **Scope contract.** Activity Log view only. Adds an "account" filter chip alongside the existing action / repo / date / sort controls. Default behavior unchanged for single-account users (chip is hidden when `listAccountIds().length <= 1`).

## Goal

A user with multiple accounts can scope the activity log to a single account or view all accounts merged. Default is "this account" — matches B1's mental model where the popup body always represents the active account.

## User-facing changes

| Single-account user (today) | Multi-account user (post-B3) |
|---|---|
| No account chip | New select chip: `account: this · all` |
| Activity log shows the active account's entries | Default: this account; "all" merges entries across accounts in newest-first order with an `[acme-bot]` prefix on rows from non-active accounts |

## File-touch list

### New

- `tests/popup/views/ActivityLogView.account-filter.test.tsx` — additional tests for the new chip (kept separate from the existing `ActivityLogView.test.tsx` to avoid blowing up the file).

### Modified

| File | Change |
|---|---|
| `src/popup/views/ActivityLogView.tsx` | Add `accountFilter: 'this' \| 'all'` state. Show a `<Select>` chip only when `useAccounts().accounts.length > 1`. Filter the entries source accordingly. |
| `src/popup/hooks/useActivityLog.ts` | New `useActivityLog({ scope: 'account' \| 'all' })`. `'account'` reads the active account only (current behavior). `'all'` reads every account's `activity` and merges by `at` desc. Both return the same `ActivityEntry[]` shape with an extra `accountId` field. |
| `src/core/activity-log-types.ts` | Add `accountId?: string` to `ActivityEntry`. Backfilled on read (entries written pre-MA-1 lack it; resolved to active account at read time, no migration needed). |
| `src/popup/components/ActivityEntryRow.tsx` (or inline JSX in `ActivityLogView`) | When `accountFilter === 'all'`, prepend a small `[<login>]` tag from `entry.accountId`. Hidden in `'this'` mode. |
| `src/popup/popup.css` | `.activity-entry__account-tag` style: muted cyan, monospace, fixed-width. |

## Test cases

### Unit — `useActivityLog.test.ts` updates

- Scope `'account'` returns only the active account's entries (current behavior preserved).
- Scope `'all'` returns merged entries from every account, sorted by `at` desc.
- Each merged entry has its `accountId` populated.

### Unit — `ActivityLogView.account-filter.test.tsx`

- Single-account fixture: account chip is **not** rendered.
- Two-account fixture: chip renders with options `this` / `all`. Default `this`.
- Switching to `all` includes both accounts' entries; rows from the inactive account show the `[login]` tag.
- Switching back to `this` hides the inactive account's entries and the tag.
- The existing date / action / repo / sort filters still work in both scopes.

### Manual smoke

- Two-account fixture with non-empty activity logs on both. Open activity log: defaults to this account. Switch chip → entries from both accounts interleaved chronologically with login tags. Switch action filter to `rebase` → still works in 'all' mode.

## Risks and unknowns

| Risk | Mitigation |
|---|---|
| Reading every account's activity log on every render is N reads per second | `useActivityLog({ scope: 'all' })` memoizes the merged stream and only re-runs on storage `onChanged` for `accounts.*.activity` keys. |
| User confusion about which account a `failed` entry belongs to in `all` mode | The `[login]` tag is always visible in `all` mode, never in `this` mode. |
| Existing entries written pre-MA-1 lack `accountId` | Resolved to the entry's containing account at read time (we know the namespace it came from). No data migration. |

## Acceptance

- [ ] New `account` filter chip visible only when more than one account is signed in.
- [ ] Default scope is `this` (matches B1 mental model).
- [ ] `all` scope merges accounts and tags non-active rows with `[login]`.
- [ ] All existing `ActivityLogView.test.tsx` tests continue to pass unchanged.
- [ ] Coverage ≥ baseline; bundle delta < 5%.

## Out of scope

- Per-account activity-log retention / export.
- Settings split (B2).
- Account-switcher header (B1).
