# Wave B1 — Account Switcher + Add-Account Flow

_Drafted: 2026-05-10 · target: v2.0.0 · effort: 2 dev days · single PR · depends on MA-1 merged_

> **Scope contract.** Header avatar becomes a switcher; sign-in flow accepts adding additional accounts; poll cycle iterates over all signed-in accounts; rate-limit / 401 handling is per-account. **No** new automation behavior, **no** UI changes outside header + sign-in flow + poll plumbing. Settings split is B2's job; activity-log filter chip is B3's.

## Goal

A user with one signed-in GitHub account can add a second (or third) account without signing out, switch which account the popup focuses on with one click, and have the extension poll all of them on the same alarm.

## User-facing changes

| Before (v1.0.x / post-MA-1) | After (B1) |
|---|---|
| Header shows `[octocat]` static text | Header shows `[octocat ▾]` clickable dropdown |
| Sign-out is buried in Settings | Dropdown has `+ Add account`, `Sign out octocat`, `Sign out all` |
| Single account polled per cycle | Every signed-in account polled per cycle, in order |
| Rate-limit / 401 on the one account = the whole extension stops working | Rate-limit / 401 isolated to that account; others keep going |

The popup body (PR list, badges, activity log, settings) still shows **the active account only** in B1. Cross-account views are B2/B3.

## File-touch list

### New

- `src/popup/components/AccountSwitcher.tsx` — dropdown component. Avatar / login / chevron; opens menu with account list + actions.
- `src/popup/hooks/useAccounts.ts` — `useAccounts(): { accounts: AccountSummary[]; activeId: string | null; switchTo(id), signOut(id), signOutAll() }`. Reads from the multi-account facade.
- `src/core/storage/account-summary.ts` — pure helper: `getAccountSummaries(): Promise<AccountSummary[]>`. Returns `{ id, login, avatarUrl, host, method, suspended }` per signed-in account.
- `tests/popup/components/AccountSwitcher.test.tsx`
- `tests/popup/hooks/useAccounts.test.ts`
- `tests/core/storage/account-summary.test.ts`

### Modified

| File | Change |
|---|---|
| `src/popup/components/Header.tsx` (or wherever the existing user pill lives) | Replace static user pill with `<AccountSwitcher />`. |
| `src/popup/views/SignInView.tsx` | Add a "Sign in with a different account" entry point that's only visible when `listAccountIds()` is non-empty. Re-uses existing Device Flow / PAT path; on success, calls `setActiveAccountId(newId)` and writes the new account namespace via `setAccountState`. **Does NOT replace** the existing flow for first sign-in. |
| `src/background/poll-cycle.ts` | Loop over `listAccountIds()` instead of single active account. Each iteration: `tokenForAccount(id)` → run cycle → continue on per-account error. **MA-1 leaves a TODO marker for this — replace it.** |
| `src/background/automations/orchestrator.ts` | Already accepts `accountId` post-MA-1; no change beyond the per-account error boundary. |
| `src/core/auth-store.ts` | Add `getAuthForAccount(id)` (post-MA-1) usage by poll loop. |
| `src/core/auth-device-flow.ts` | Add an "additional account" flag so the in-progress account id isn't auto-set as active until the user confirms in B1's "Add account" CTA. |
| `src/popup/hooks/usePRStore.ts` | Re-keys subscription on active account change. (Should already do this if MA-1 plumbed `accountId` through hooks correctly — verify.) |
| `src/core/badge.ts` | Aggregates rebased counts across all accounts for the toolbar badge. |

## Switcher UX detail

Closed:
```
[ octocat ▾ ]
```

Open:
```
┌────────────────────────────────┐
│ ● octocat (active)             │
│   acme-bot                     │
│ ────────────────────────────── │
│ + Add account                  │
│ ────────────────────────────── │
│ Sign out octocat               │
│ Sign out all                   │
└────────────────────────────────┘
```

- Click an account name → `setActiveAccountId(id)`; popup re-mounts focused on that account; auto-closes the menu.
- `+ Add account` → routes to `SignInView` in "additional account" mode. Existing accounts stay signed in throughout.
- `Sign out X` → calls `removeAccount(id)`. If `id === activeId`, switch active to first remaining account, or to the sign-in screen if none.
- `Sign out all` → confirmation dialog; `removeAccount(id)` for each.

Keyboard: `↑/↓` navigate accounts, `Enter` selects, `Esc` closes. Single-letter prefix jump (typing `a` highlights `acme-bot`) is OOS for B1 — file under polish.

## Multi-account poll loop

Per-cycle pseudocode:

```ts
const ids = await listAccountIds();
for (const id of ids) {
  const auth = await getAuthForAccount(id);
  if (!auth || isSuspended(auth)) {
    markAccountIdle(id, 'unauthenticated');
    continue;
  }
  try {
    await pollOneAccount(id, auth);
  } catch (err) {
    if (isRateLimited(err)) markAccountThrottled(id, retryAfter(err));
    else if (is401(err)) markAccountAuthExpired(id);
    else recordPollError(id, err);
    // Other accounts continue.
  }
}
```

Per-account errors **do not** abort the loop. The popup surfaces account-level error states via the switcher dot (red dot on the offending account in the dropdown).

## Test cases

### Unit — `useAccounts.test.ts`

- Returns empty array on fresh install.
- Lists every signed-in account in stable insertion order.
- `switchTo(id)` writes `active_account_id` and triggers a re-render.
- `signOut(id)` removes the account; if it was active, falls back to the first remaining; if none remain, returns sign-in mode.
- `signOutAll()` clears every account namespace and `active_account_id`.

### Unit — `AccountSwitcher.test.tsx`

- Renders avatar + login + chevron.
- Opens on click; closes on outside click + Esc.
- Shows active dot on the active account only.
- "+ Add account" dispatches the right route message.
- Account row click calls `switchTo(id)`.
- Suspended-installation account renders with a yellow dot and tooltip.

### Unit — `account-summary.test.ts`

- Returns `[]` when no accounts.
- Surfaces `host` for GHES accounts (`gh_acme_corp_octocat` → `host: acme.corp`).
- Suspended-installation auth produces `suspended: true`.

### Integration — poll cycle

- Two-account fixture: both polled, both PR stores updated, both activity logs appended.
- One-account 401: marked `auth-expired`, other accounts complete normally; activity-log entry on the failed account only.
- One-account rate-limit: `markAccountThrottled` called with the right `retryAfter`; other accounts complete normally.
- All accounts rate-limited: cycle ends without errors thrown out of the loop.
- Active-account switch mid-cycle is a no-op for the currently-running cycle (the cycle reads its account list once at the top).

### Manual smoke

- Sign in to account A. Add account B via `+ Add account`. Switch back to A. Switch to B. Verify popup PR list and activity log each show only the active account's data.
- Revoke access for account B at github.com → next cycle marks B as `auth-expired`; account A still polls cleanly.
- Sign out B from the switcher → namespace gone; A still works.

## Risks and unknowns

| Risk | Mitigation |
|---|---|
| Accidentally treating sequential per-account polls as "everything's broken" when one account is slow | Each account has its own error boundary + per-account `lastPollAt`. The popup's "last poll" timestamp shows the active account's. |
| Token-refresh races across accounts | Each account's auth-store has its own `inFlightRefresh` promise (already account-scoped post-MA-1). |
| Adding account triggers Device Flow that overwrites active account auth on success | "Additional account" flag on Device Flow result writes via `setAccountState(newId, 'auth', …)` and only flips `active_account_id` when the user explicitly chooses to switch. |
| Switcher dropdown clipped by Chrome's 600px popup max-height | Menu is positioned-fixed inside the popup, capped at 280px tall, scrolls inside if account count exceeds visible rows. |

## Acceptance

- [ ] `AccountSwitcher` replaces the static user pill in the header.
- [ ] User can add a second account without signing out the first.
- [ ] Active account switch is one click and the PR list / activity log re-key correctly.
- [ ] Poll cycle iterates every signed-in account; per-account errors don't abort the loop.
- [ ] Sign-out removes only that account's namespace; siblings preserved.
- [ ] All existing tests pass with the new account-list-aware mocks.
- [ ] New tests cover the cases above.
- [ ] Coverage ≥ baseline; bundle delta < 5%.

## Out of scope

- Settings split (B2).
- Activity-log filter chip (B3).
- Cross-account aggregate views ("All accounts" mode) for PR list — explicitly per-active-account in B1.
- Per-account avatar caching from `GET /user` — MA-1's account-summary already stores `avatarUrl`.
- GitLab provider (v3).
