# Cross-account "needs action" dot — design spec

**Status:** Backlog — small post-v2 enhancement
**Surface:** AccountSwitcher pill in popup header

## Goal

When the user has multiple GitHub accounts signed in and the *non-active* account has PRs that require user action, show a small attention dot on the AccountSwitcher pill in the header. Tapping the pill (existing behavior) opens the dropdown, where the offending account's row also gets a dot so the user knows where to switch.

Today, the multi-account poll loop already polls every account each cycle, but actionable state on the *inactive* account is invisible until the user manually switches over.

## What "needs action" means

Strictly: states the user must do something about. Excludes states that auto-rebase / time / GitHub itself will resolve. Excludes informational chips.

A PR contributes to the actionable count when **any** of these hold:

| Condition | Why it counts |
|---|---|
| `state === 'behind'` AND auto-rebase is OFF for that PR's repo (either `autoRebaseEnabled === false` globally, or repo is in `autoRebaseOptOutRepos`) | Won't self-resolve — user must rebase manually |
| `state === 'conflict'` | Auto-rebase already tried and hit a 409; user must resolve in GitHub |
| `state === 'needs-manual'` | Rebase hit a 422 (protected branch, etc.); user must resolve |
| `pushSinceApproval` flag is set AND `enablePushSinceApproval` is on | The `! re-review` chip — user is the one who needs to nudge reviewers |

**Explicitly excluded:**
- `state === 'behind'` with auto-rebase enabled — will resolve next cycle, not actionable
- `state === 'pending'` (passing/failing required checks — CI's job, not user's)
- `state === 'error'` (transient API errors — not actionable in any predictable way)
- `state === 'draft'`, `'current'`, `'updated'`, `'merged'`, `'closed'`
- Idle / staleness — surfaced via existing `idle Nd` pill; not "action required by user"

The reviewer-tab PRs (`reviewerStore.prs`) do NOT contribute. The dot is "I have authored work waiting on me elsewhere," not "someone wants me to review elsewhere."

## Architecture

Two changes, both small:

1. **Compute per-account actionable count at the end of each poll cycle.** Walk the just-saved `authoredStore.prs` for the now-active account, apply the predicate above, write the count to a new per-account key (`account_actionable_count`) via the storage facade. Default 0. The poll-loop in `runPollCycle` is the natural place — it already toggles active id per account, so writing to per-account storage Just Works.

2. **Surface in `AccountSummary`.** Extend `AccountSummary` with an `actionableCount: number` field (0 when none). `getAccountSummaries` reads the per-account key alongside the existing `auth` + `installations` reads. The header's `AccountSwitcher` consumes it: dot on the pill if **any non-active account** has `actionableCount > 0`; same dot on the matching dropdown row.

The popup never re-walks PR stores to compute this — the value is already persisted by the poll cycle. This keeps the popup render path cheap (especially on a popup re-open while the SW is between polls).

## Visual

- **Pill (closed state):** the existing `account-switcher__pill` gets a small yellow dot appended after the login (e.g. `[ @brady ↕ ●]`). Reuses the existing `.account-switcher__dot` infrastructure with a new `--attention` variant — yellow (`var(--term-yellow)`), same as `.repo-group__attention-dot`. Yellow is overloaded with `--suspended`, but suspended is an active-account state and rare; collision in practice is near-zero, and consistency with the existing "attention" pattern is more important than disambiguation.
- **Dropdown row:** each non-active account row that has `actionableCount > 0` gets the same dot next to its login. No numeric count (per design ask — keep it minimal, match existing visual language).
- Accessibility: dot is decorative; supplement with `aria-label="<login> — PRs need attention"` on the row and `aria-label` on the pill when the dot is showing.

## Data model

New per-account storage key: `account_actionable_count: number` (default 0). Lives under `accounts.<id>.*` via the multi-account facade.

`AccountSummary` gains:
```ts
/** PRs in actionable state under this account (poll-computed). 0 when none. */
actionableCount: number;
```

No migration needed — the field reads as 0 when the key is absent (storage-fallback default), matching the no-actionable-PRs case. Stale data is self-correcting: each poll overwrites the count.

## Edge cases

- **Account with 0 PRs total:** count is 0 → no dot. Correct.
- **Active account has actionable PRs:** no dot on the pill. The user is already looking at them; the dot is strictly a "switch over here" signal for inactive accounts.
- **Account never polled (auth expired):** count stays at its last value until next successful poll. If that's stale-and-actionable, the dot is *over*-eager — but the user clicks through, sees nothing actionable, gets the signal that this account needs re-auth (which the popup already surfaces independently). Acceptable.
- **PR moves from `behind` → `updated` mid-cycle (auto-rebase fires):** count is computed *after* `processedPRs` is finalized for the cycle, so the post-rebase state is what counts. The `behind`-with-auto-rebase-on case is excluded anyway.
- **No accounts namespace (pre-multi-account install):** the pre-B1 fallback path doesn't go through the multi-account loop — it polls the v1 fallback only. There's no "other account" to surface, so the dot logic is a no-op (single-account header doesn't render `AccountSwitcher` at all). Confirmed by reading `runPollCycle` — `ids.length === 0` short-circuits.

## Tests

- `tests/background/poll-cycle.test.ts`: new describe block — seed two accounts, run a poll where account B has 1 `conflict` PR; assert `account_actionable_count` for B equals 1 in the post-cycle storage map.
- `tests/background/poll-cycle.test.ts`: PR is `behind` but `autoRebaseEnabled === true` AND repo not in opt-out → count is 0.
- `tests/background/poll-cycle.test.ts`: PR has `pushSinceApproval` set but `enablePushSinceApproval === false` → count is 0.
- `tests/core/storage/account-summary.test.ts`: `getAccountSummaries` returns the `actionableCount` from per-account storage; defaults to 0 when missing.
- `tests/popup/components/AccountSwitcher.test.tsx`: dot rendered on pill when any non-active account has `actionableCount > 0`; not rendered when only active account has it; dropdown row renders dot for the right account.

## Out of scope

- Numeric count on the dot (per design decision)
- Notification on the *system* level (we already have desktop notifications for state transitions — duplicate signal)
- Reviewer-tab cross-account surfacing — different feature, would need its own predicate
- Action-required surfacing per-repo (the existing `.repo-group__attention-dot` already does this within an account)
- Configurability of the predicate — single fixed definition; revisit only if users push back

## Acceptance

- Two accounts signed in, account B has at least 1 `conflict` / `needs-manual` / opt-out-`behind` / `pushSinceApproval` PR
- While active account is A: AccountSwitcher pill shows the dot; dropdown row for B shows it
- After switching to B: pill dot disappears (B is now active); A's row in the dropdown does NOT show the dot (A had no actionable PRs)
- Resolving the offending PR (e.g. push a fix) and waiting one poll: dot disappears within one cycle
