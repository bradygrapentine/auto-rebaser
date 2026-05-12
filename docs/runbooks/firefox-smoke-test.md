# Runbook — Firefox smoke test

_Goal: verify Auto Rebaser works in Firefox before AMO submission._

This runbook owns the cross-browser scenario matrix. `chrome-smoke-test.md` covers the same scenarios plus Chrome-specific extras.

## Prerequisites

- Firefox 115+ (Manifest V3 stable).
- A GitHub account with at least 2 open authored PRs across 2 different repos.
- (Recommended) A second GitHub account for multi-account scenarios.
- For PAT-only fallback: a classic Personal Access Token with scope `repo`. Generate at https://github.com/settings/tokens/new?scopes=repo&description=Auto%20Rebaser.
- (Optional, for stale-notification dismissal) A token with `repo` + `notifications` scopes.

## 1. Build

```bash
npm run build:firefox
```

Confirm `dist-firefox/manifest.json` exists and has `browser_specific_settings.gecko.id`.

## 2. Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Pick `dist-firefox/manifest.json`.
4. Confirm the extension appears with the Auto Rebaser icon. Note the **Internal UUID**.
5. Open the **Inspect** view to access the service-worker console — keep it open while testing.

**Note:** temporary add-ons disappear on browser restart. For a sticky install, use Firefox Developer Edition or Nightly with `xpinstall.signatures.required=false`, or wait until AMO is signed.

## 3. Authenticate — GitHub App (recommended path)

1. Click the toolbar icon → popup opens with the sign-in chooser.
2. Click **sign in with GitHub App (recommended)**.
3. A new tab opens to GitHub's device-flow page with a user code prefilled. Approve.
4. Popup transitions to the PR list grouped by repo.

## 3a. Authenticate — PAT (legacy path)

1. From the sign-in chooser, click **use a personal access token (legacy)**.
2. Paste the PAT → **save token**.
3. Popup transitions to the PR list. The account-switcher pill shows your GitHub login (not "me").

If sign-in fails: open the popup's devtools (right-click popup → **Inspect Popup**) and check the console for fetch errors.

## 4. Core scenarios

For each, observe the popup, the toolbar badge, and the worker console.

| # | Scenario | Expected |
|---|---|---|
| 4.1 | Open popup with no behind PRs | Status badge shows "current" for each PR; toolbar badge empty or "0". |
| 4.2 | Force a PR behind by pushing to base | Within one poll cycle (~5 min, or trigger via toolbar refresh icon), PR moves to "behind" → "updating" → "updated"; toolbar badge increments. |
| 4.3 | Refresh icon | Click refresh; icon spins; poll runs; spin stops on completion. |
| 4.4 | Conflict PR | Force a real merge conflict; PR moves to "needs-manual"; no auto-rebase loop. |
| 4.5 | Sign out | Account switcher → "Sign out <login>"; PAT/App auth cleared; sign-in chooser returns. |
| 4.6 | Settings — change interval | Change to 1 min via the github_poll_interval select; alarm reschedules; next poll fires at the new cadence. |
| 4.7 | Repo opt-out | Toggle a repo off in automations; that repo's PRs are skipped on the next poll. |
| 4.8 | Empty state | If no open PRs are found, popup shows centered `$ no open PRs found` filling the list area. |
| 4.9 | Popup sizing | Resize the browser window very short; the popup caps to the browser height and the footer (View activity / shortcuts) stays pinned. Sign-in view auto-sizes to its short content and doesn't reserve empty space. |

## 5. Automation scenarios

| # | Scenario | Expected |
|---|---|---|
| 5.1 | Auto-rebase chain | Multiple behind PRs in the same repo rebase sequentially, not in parallel. |
| 5.2 | Branch deletion after merge | When a PR is merged, its head branch is deleted; activity log records the deletion. |
| 5.3 | Auto-enable auto-merge | Settings → enable; PR with passing checks + reviewer approvals flips to auto-merge. |
| 5.4 | Merge clean PRs immediately | Settings → enable; PRs that are already clean (no behind, no unresolved review threads, ready for review) merge on next poll. |
| 5.5 | Resolve outdated review threads | Enable in settings; resolved threads stay resolved across polls; thread on stale commit gets resolved automatically. |
| 5.6 | Ping reviewers when stale | Enable + edit ping template; when a PR is stale beyond the threshold, a single comment is posted using `{reviewers}` substitution. |
| 5.7 | Re-request review | From a PR with stale approvers, click the stale badge → re-request modal → confirm → reviewers re-requested. |
| 5.8 | Notification dismiss | Stale GitHub notification is dismissed when the PR is closed (requires `notifications` scope on the active token). |

## 6. Multi-account scenarios

| # | Scenario | Expected |
|---|---|---|
| 6.1 | Add a second account | Account switcher → "+ Add account" → device-flow tab opens; on success the new account becomes active and the PR list reflects only its PRs (not the prior account's). |
| 6.2 | Switch active account | Click a non-active row in the switcher; PR list refreshes; settings pages with "applies to active account only" hint update. |
| 6.3 | Activity log scoping | Activity view shows entries for the active account only, no rows from sibling accounts. |
| 6.4 | Sign out one account | "Sign out <login>" on the dropdown; that account's namespace is gone; remaining accounts unaffected. |
| 6.5 | Sign out all | Removes every signed-in account; sign-in chooser returns. |

## 7. Document the run

Append a dated row to `docs/runbooks/state-machine-validation.md` (or the active validation log):

```
| 2026-MM-DD | Firefox <ver> | <SHA> | All scenarios ✅ | <notes> |
```

If any scenario fails, file an issue with: scenario number, expected, actual, console log excerpt.

## Exit

- All scenarios pass on Firefox.
- One row added to validation log.

## Red flags

- "Service worker not waking on alarm." Firefox MV3 alarm behavior differs slightly from Chrome. Check that `chrome.alarms.create` was actually called once; check `about:debugging` for alarm fire events.
- "Storage didn't persist after browser restart." Temporary add-ons reset state — that's expected.
- "Sign-in chooser shows but device-flow button does nothing." CSP errors in the inspect console; Firefox is stricter than Chrome on inline scripts.
- "Newly-added account sees previous account's PRs." Should not happen — `readAccountKey` is scoped to the active account with no legacy fallback. If observed, capture exact repro before continuing.
