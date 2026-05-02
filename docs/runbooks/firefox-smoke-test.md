# Runbook — Firefox smoke test

_Goal: verify Auto Rebaser works in Firefox before AMO submission._

## Prerequisites

- Firefox 115+ (Manifest V3 stable).
- A GitHub account with at least 2 open authored PRs across 2 different repos.
- A GitHub Personal Access Token, classic, scope `repo`. Generate at https://github.com/settings/tokens/new?scopes=repo&description=Auto%20Rebaser.
- (Optional, for Phase 2 notification scenarios) A second token with `repo` + `notifications` scopes.

## 1. Build

```bash
npm run build:firefox
```

Confirm `dist-firefox/manifest.json` exists and has `browser_specific_settings.gecko.id`.

## 2. Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Pick `dist-firefox/manifest.json`.
4. Confirm the extension appears in the list with the Auto Rebaser icon. **Note the "Internal UUID"** (used for debugging).
5. Open the **Inspect** view to access the service-worker console.

**Note:** temporary add-ons disappear on browser restart. For a sticky install, use Firefox Developer Edition or Nightly with `xpinstall.signatures.required=false`, or wait until AMO is signed.

## 3. Authenticate

1. Click the toolbar icon → popup opens.
2. Sign-in view: paste PAT into the input.
3. Click **save token**.
4. Expect transition to PR list view with your authored PRs grouped by repo.

If sign-in fails: check the inspect-view console for fetch errors. Most likely culprit is a typo'd PAT or a token without `repo` scope.

## 4. MVP scenarios (RUNBOOK §3)

For each, observe the popup, the toolbar badge, and the inspect-view console.

| # | Scenario | Expected |
|---|---|---|
| 3.1 | Open popup with no behind PRs | Status badge shows "current" for each PR; badge text empty or "0". |
| 3.2 | Force a PR behind by pushing to base | Within one poll cycle (~5 min, or trigger via toolbar refresh icon), PR moves to "behind" → "updating" → "updated"; toolbar badge increments. |
| 3.3 | Refresh icon | Click refresh; icon spins; poll runs; spin stops on completion. |
| 3.4 | Conflict PR | Force a real merge conflict; PR moves to "needs-manual"; no auto-rebase loop. |
| 3.5 | Sign out | Click "exit"; PAT cleared; sign-in view returns. |
| 3.6 | Settings — change interval | Change to 1 min; alarm reschedules; next poll fires at the new cadence. |
| 3.7 | Repo opt-out | Toggle a repo off; that repo's PRs are skipped on the next poll. |

## 5. Phase 2 scenarios (RUNBOOK §4)

| # | Scenario | Expected |
|---|---|---|
| 4.1 | Auto-rebase chain | Multiple behind PRs in the same repo are rebased sequentially, not in parallel. |
| 4.2 | Branch deletion after merge | When a PR is merged, its head branch is deleted; footer shows "deleted owner/repo:branch". |
| 4.3 | Auto-merge | Automation toggle on; PR with passing checks + approvals merges automatically. |
| 4.4 | Thread resolve | Resolved review threads stay resolved across polls. |
| 4.5 | Notification dismiss | Stale notification dismissed once underlying PR is closed. (Requires `notifications` scope.) |

## 6. Document the run

Append a dated row to `docs/runbooks/phase2-validation.md`:

```
| 2026-MM-DD | Firefox <ver> | <SHA> | All 12 scenarios ✅ | <notes> |
```

If any scenario fails, file an issue with: scenario number, expected, actual, console log excerpt.

## Exit

- All 12 scenarios pass on Firefox.
- One row added to validation table.

## Red flags

- "Service worker not waking on alarm." Firefox MV3 alarm behavior differs slightly from Chrome. Check that `chrome.alarms.create` was actually called once; check `about:debugging` for alarm fire events. If the alarm doesn't fire, it's a real Firefox-specific bug — don't ship.
- "Storage didn't persist after browser restart." Temporary add-ons reset state — that's expected. Don't fix what isn't broken.
- "PAT prompt shows but submit button does nothing." Look for CSP errors in the inspect console; Firefox is stricter than Chrome on inline scripts.
- "Everything works, ship it!" — only after the validation table has an actual entry.
