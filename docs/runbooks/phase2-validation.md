# Phase 2 Validation Runbook

Manual end-to-end test of the four Phase 2 automations against a real GitHub repo. Run before flipping a public release that includes Phase 2 features. Not part of CI — destructive operations against a real repo are out of scope for automated tests.

## Prior run — 2026-05-02 (Brady, sandbox `bradygrapentine/auto-rebaser-sandbox`)

| Story | Outcome | Evidence |
|---|---|---|
| 2.5 — auto-rebase | ✅ pass | PR #1 head SHA went `eb0e7a1` → `d6842c0` after `mergeable_state: behind` was forced via `strict: true` branch protection + a required-context. |
| 2.6 — delete merged branch | ✅ pass (×2) | Branches `feat/scenario-1-rebase` and `feat/scenario-4-automerge` both returned 404 from `GET /branches/{ref}` after their PRs merged. |
| 2.7 — auto-enable auto-merge | ✅ pass | PR #3 ended with `auto_merge.enabled_by: bradygrapentine, merge_method: squash`. Status check posted afterward fired the queued merge immediately. |
| 2.8 — auto-resolve outdated thread | ✅ pass | PR #2 thread on `comments.txt` went `isResolved: true` after the file was deleted in a follow-up commit (anchor lost → `line: null`). |
| 2.9 — dismiss stale notifications | ⏭ skipped (live) | GitHub categorically refuses to notify a single account about its own actions; needs a 2nd account to demo. Verified by 12 unit tests + 100% line/branch coverage on `notifications.ts` and `dismiss-stale-notifs.ts`. |

**Sandbox-config gotchas worth knowing for the next run:**
- `mergeable_state: behind` ONLY fires when branch protection has both `strict: true` AND at least one required status check context. Without a context, "strict" is a no-op and PRs sit `clean` even when divergent.
- Repo-level `allow_auto_merge` must be enabled (`PATCH /repos/{owner}/{repo}` with `allow_auto_merge: true`) before Story 2.7's GraphQL mutation will succeed.
- Self-actions never generate notifications; 2.9's live demo requires a second GitHub account or a bot.

## Prerequisites

- A throwaway GitHub repo you own (e.g. `<you>/auto-rebaser-sandbox`). Settings:
  - "Automatically delete head branches" → **OFF** (so 2.6 has work to do)
  - "Allow squash merging" → **ON**
  - "Allow auto-merge" → **ON**
  - Branch protection on `main` requiring at least 1 review and 1 status check (so auto-merge has a real gate)
- The extension installed in dev mode against this repo's authenticated user.
- A second GitHub account (or organisation member) able to leave reviews.

## Setup script

Each test creates a fresh PR via the GitHub CLI. Replace `OWNER/REPO` and `BASE_SHA` accordingly.

```bash
gh repo set-default OWNER/REPO
git switch -c phase2-test-$(date +%s)
echo "tweak $(date +%s)" >> NOTES.md
git add NOTES.md && git commit -m "phase2 sandbox tweak"
git push -u origin HEAD
gh pr create --fill
```

## Test 1 — Story 2.6 (auto-delete merged branch)

1. Create PR via setup script.
2. Merge it manually via the GitHub UI.
3. Confirm in repo settings the auto-delete-on-merge is OFF (the branch should still exist).
4. Trigger a poll cycle from the popup ("Poll now").
5. **Expected:** within 1 cycle, the branch is gone. `git ls-remote origin <branch>` returns nothing.
6. **Counter check:** popup shows "Deleted 1 branch" in the last-cycle summary.

Repeat with: a fork-sourced PR (should NOT delete), a repo on the opt-out list (should NOT delete), a repo that already has auto-delete on (should skip with no API spend).

## Test 2 — Story 2.7 (auto-enable auto-merge)

1. Toggle "Enable auto-merge" ON in extension settings, method = squash.
2. Create PR via setup script.
3. **Expected within 1 cycle:** PR detail page shows "Auto-merge enabled by <you>".
4. Have the second account approve the PR.
5. **Expected:** GitHub merges the PR automatically.
6. **Negative test:** create a draft PR — auto-merge should NOT be enabled. Mark draft → ready, expect auto-merge enabled on next cycle.
7. **Negative test:** create a PR with a merge conflict (modify a file already changed on `main`). Auto-merge should NOT be enabled.

## Test 3 — Story 2.8 (resolve obsolete review threads)

1. Toggle "Resolve obsolete review threads" ON.
2. Create PR with a multi-line file change. Have second account leave a line comment on line 5.
3. Push a new commit that removes line 5 entirely (and several lines around it so GitHub loses the anchor — verify in PR UI that the comment is shown as "Outdated" and unanchored).
4. **Expected within 1 cycle:** the review thread is marked Resolved.
5. **Negative test:** leave a comment on a line, then push a commit that modifies that line but doesn't delete it. Comment may show as "Outdated" but is still anchored — auto-resolve should NOT touch it.
6. **Idempotency:** manually unresolve the auto-resolved thread. Next poll should NOT resolve it again.

## Test 4 — Story 2.9 (dismiss stale PR notifications)

1. Re-authenticate the extension to grant the `notifications` scope.
2. Toggle "Dismiss stale PR notifications" ON.
3. Have the second account comment on one of your existing open PRs to generate a notification.
4. Confirm the notification appears in https://github.com/notifications.
5. Close the PR (do not merge).
6. **Expected within 1 cycle:** the notification is marked read on https://github.com/notifications/?query=is%3Aread.
7. **Negative test:** generate a notification for an open PR. It should remain unread after a poll.
8. **Negative test:** an Issue notification for a closed issue should remain unread (we only touch PullRequest type).

## Cleanup

```bash
# Optional: bulk-close any leftover sandbox PRs
gh pr list --json number --jq '.[].number' | xargs -I{} gh pr close {}
# Delete leftover branches
git branch -r | grep 'origin/phase2-test-' | sed 's|origin/||' | xargs -I{} git push origin --delete {}
```

## Sign-off checklist

- [ ] All four automations fire correctly on the happy path
- [ ] Negative cases (drafts, forks, anchored comments, open PRs) are NOT touched
- [ ] Per-repo opt-outs honored
- [ ] Kill-switches OFF results in zero API calls (verified via DevTools network tab)
- [ ] No errors in the service worker console across all tests
- [ ] OAuth re-auth flow works (tested by revoking the token and re-running test 4)
