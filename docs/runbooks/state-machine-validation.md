# Runbook: State Machine Validation

_Validates the popup PR-state badges and transitions against `bradygrapentine/qm-test-fixture`. Covers STATE-1, BEHIND-1, DRAFT-1, REBASE-OPT-OUT, MERGE-1, MERGE-2._

**Owner:** Brady · **Last validated:** 2026-05-10

---

## Prerequisites

1. The latest `dist/` build loaded as an unpacked extension in Chrome (or `dist-firefox/` in Firefox).
2. Signed in as `bradygrapentine` (PRs are authored by that account).
3. The GitHub App installed on `bradygrapentine/qm-test-fixture` (auth path) OR a PAT with repo access.

## Pre-test toggles (in popup → Settings → automations)

Add `bradygrapentine/qm-test-fixture` to **all four** of these per-automation skip lists. Skipping any of them lets the extension act on the fixture and you'll lose the steady badge state.

| Section | Skip-list field | Why |
|---|---|---|
| **Auto-rebase behind PRs** | `autoRebaseOptOutRepos` | Behind PRs stay visibly `[Behind]` instead of flashing through `[Updated]`. |
| **Auto-enable auto-merge** | `autoMergeOptOutRepos` | No auto-merge enabling on test PRs. |
| **Merge clean PRs immediately** | `mergeCleanPRsOptOutRepos` | No direct REST merges on test PRs (separate list since 2026-05-10). |
| **Auto-delete merged branches** | `autoDeleteOptOutRepos` | Preserves head branches if a PR ends up merged, so the runbook can be re-run. |

Leave **Auto-resolve outdated review threads** and **Stale-PR badge / Allow ping reviewers** alone — they don't affect state observation, and the fixture won't be idle long enough to matter.

**Do NOT add the repo to "Ignored repos"** — that hides it from the popup entirely and defeats the test.

## Fixture inventory

All in `bradygrapentine/qm-test-fixture`. PRs are created and refreshed by `tests/scripts/setup-fixture-prs.sh` (kept in `/tmp/auto-rebaser-fixture-work/qm-test-fixture` during a session).

| PR | Branch | `mergeable_state` | `draft` | Behind base? | Expected badge |
|---|---|---|---|---|---|
| #2 | `behind-base` | `dirty` | false | n/a (conflict) | `[Conflict]` (red) |
| #3 | `draft-tiny` | `blocked` | true | n/a (draft) | `[Draft]` (muted) |
| #6 | `failing-ci` | `blocked` | false | yes | `[Behind]` (amber) |
| #7 | `test/behind-1-blocked` | `blocked` | false | yes | `[Behind]` (amber) |
| #8 | `test/pending-up-to-date` | `blocked` | false | yes (now) | `[Behind]` (amber) |
| #9 | `test/draft-state` | `unknown`/`blocked` | true | yes | `[Draft]` (muted) |
| #10 | `test/pending-fresh` | `blocked` | false | **no** | `[Pending]` (yellow) |

Branch protection on `main` requires the (never-reported) status check `auto-rebaser-test-required-check`, which is what makes most PRs land in `mergeable_state: blocked`.

## Step 1 — Steady-state observation

With all four skip lists configured per the table above:

1. Open the popup.
2. Click **Poll now** (or press `r`).
3. Wait for the spinner to clear.
4. Confirm each PR row matches the **Expected badge** column above.

Specific things to verify:

- [ ] **#10 `[Pending]` is yellow**, not amber. The PR is up-to-date; `[Pending]` proves STATE-1's `blocked → pending` mapping AND BEHIND-1's "no rebase when SHAs match" guard.
- [ ] **#3 and #9 both show `[Draft]`** (muted), not `[Pending]`. This proves DRAFT-1: `pr.draft=true` short-circuits regardless of `mergeable_state`.
- [ ] **#6, #7, #8 show `[Behind]`** (amber), not `[Pending]` or `[Updated]`. Proves BEHIND-1's SHA-mismatch detection (since `mergeable_state` is `blocked` not `behind`) AND REBASE-OPT-OUT (skip list prevents the rebase action from firing).
- [ ] **#2 shows `[Conflict]`** (red).

If any badge is wrong, see "Troubleshooting" below.

## Step 2 — Verify REBASE-OPT-OUT toggle

Tests that the per-repo skip list is what's holding the behind PRs in `[Behind]`.

1. Settings → automations → **Auto-rebase behind PRs** → remove `bradygrapentine/qm-test-fixture` from Skip repos.
2. Back to popup → **Poll now**.
3. Within one cycle, **#6, #7, #8** should flip to `[Updated]` (green). On the next poll they settle to `[Pending]` or `[Current]`.
4. Re-add `bradygrapentine/qm-test-fixture` to the Skip list before continuing — otherwise subsequent steps will keep rebasing the test PRs.

If they don't flip: BEHIND-1 isn't detecting the SHA mismatch. Check `pr.base.sha` vs `getBranchHeadSHA('bradygrapentine', 'qm-test-fixture', 'main')` in the SW console.

## Step 3 — Verify the global toggle

1. Settings → automations → **Auto-rebase behind PRs** → flip the parent toggle OFF.
2. Remove `bradygrapentine/qm-test-fixture` from the **Auto-rebase** skip list (so the global toggle is the only thing gating).
3. **Poll now**.
4. **#6, #7, #8** should remain `[Behind]`. Proves the `autoRebaseEnabled: false` gate in `poll-cycle.ts`.
5. Flip the parent toggle back ON and re-add the repo to the skip list before continuing.

## Step 4 — Verify the sticky-Manual cure (STATE-1 regression)

1. Manually drive PR #7 to `[Manual]` (red): temporarily revoke the App's repo access OR revoke the PAT scopes so the next `update-branch` call returns 422 / 403 / 404. Easier alternative: change PR #7's head ref to a SHA that conflicts with the rebase, forcing 422.
2. **Poll now** → PR #7 lands in `[Manual]`.
3. Restore App access / scopes.
4. **Poll now** again. PR #7 should move from `[Manual]` to either `[Behind]` (if behind) or `[Pending]` / `[Current]` (if base SHA matches now). It MUST NOT stay in `[Manual]` while `mergeable_state` is `blocked`/`unstable`.

If it stays `[Manual]` across multiple polls without intervention, STATE-1's overwrite-on-blocked logic regressed.

## Step 5 — Refresh the fixture

When the PR set drifts (someone merged a test PR, branches went stale, etc.):

```bash
mkdir -p /tmp/auto-rebaser-fixture-work && cd /tmp/auto-rebaser-fixture-work
gh repo clone bradygrapentine/qm-test-fixture
cd qm-test-fixture
git config user.email "brady.grapentine@gmail.com"
git config user.name "Brady"

# Bump main so existing blocked PRs become behind.
TS=$(date -u +%Y%m%dT%H%M%SZ)
echo "main bump $TS" > .auto-rebaser-trigger
git add .auto-rebaser-trigger
git commit -m "test: bump main ($TS)"
git push origin main

# Recreate the up-to-date pending fixture against the new main.
git checkout -B test/pending-fresh main
mkdir -p tests
echo "pending fixture $TS" > tests/pending-fresh.md
git add tests/pending-fresh.md
git commit -m "test: fresh up-to-date pending PR ($TS)"
git push -u origin test/pending-fresh --force
```

If the corresponding PRs were closed, reopen with `gh pr reopen <num>` or `gh pr create`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| All test PRs show `[Updated]` (green) instead of `[Behind]` | Missed adding `bradygrapentine/qm-test-fixture` to **Auto-rebase → Skip repos**. |
| #10 shows `[Behind]` instead of `[Pending]` | The fresh-pending PR drifted behind base. Run Step 5 again to recreate it. |
| #3 / #9 show `[Pending]` instead of `[Draft]` | DRAFT-1 (`pr.draft` short-circuit) regressed. Check `state-machine.ts:deriveStateFromMergeable`. |
| All PRs show `[Pending]` (none `[Behind]`) | BEHIND-1's SHA-mismatch detection isn't firing. Likely the `getBranchHeadSHA` ETag is returning stale data, or `pr.base.sha` is being cached at the wrong layer. Check SW console. |
| One repeatedly-clicked **Poll now** does nothing | The `pollInProgress` flag may be stuck. Reload the extension. |
| Auth errors in console | App was uninstalled or PAT expired — re-sign-in. Migration banner may also need a manual dismiss. |

## Why this runbook exists

The popup's badge rendering depends on a chain of work:

- **STATE-1** (PR #73) — maps GitHub `mergeable_state` to popup badges. Killed the sticky-Manual bug.
- **BEHIND-1** (PR #78) — detects "behind base" via base-SHA comparison when `mergeable_state` masks it as `blocked`/`unstable`.
- **DRAFT-1** (PR #79) — `pr.draft=true` short-circuits to `Draft`.
- **REBASE-OPT-OUT** (PR #80) — gives users a kill-switch + per-repo skip list (also what makes this runbook viable).
- **MERGE-CLEAN-SKIP** (PR #82) — separate skip list for the merge-clean fall-through.

Each of these is small individually but interacts with the others. This runbook is the cheapest end-to-end smoke test that covers all of them in one popup load.
