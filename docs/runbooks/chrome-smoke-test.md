# Runbook — Chrome smoke test

_Goal: verify Auto Rebaser works in Chrome before Web Store submission._

## Prerequisites

- Chrome 120+ (or Chromium-based: Edge, Brave, Arc).
- A GitHub account with at least 2 open authored PRs across 2 different repos.
- A GitHub Personal Access Token, classic, scope `repo`. Generate at https://github.com/settings/tokens/new?scopes=repo&description=Auto%20Rebaser.
- (Optional, for Phase 2 notification scenarios) A second token with `repo` + `notifications` scopes.

## 1. Build

```bash
npm run build
```

Confirm `dist/manifest.json` exists and has `manifest_version: 3` and the Chrome `key` field.

## 2. Load in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** → pick the `dist/` directory.
4. Confirm the extension appears with the Auto Rebaser icon and no error banner.
5. Click **service worker** under the extension card to open the worker console — keep it open while testing.

If you see "Manifest file is missing or unreadable", you picked the wrong directory. Pick `dist/`, not the repo root.

## 3. Authenticate

1. Pin the Auto Rebaser icon to the toolbar (puzzle icon → pin).
2. Click the icon → popup opens with sign-in view.
3. Paste PAT → **save token**.
4. Expect transition to PR list grouped by repo.

If sign-in fails: open the popup's devtools (right-click popup → Inspect) and check the console for fetch errors.

## 4. MVP scenarios (RUNBOOK §3)

Same 7 scenarios as the Firefox runbook. See `docs/runbooks/firefox-smoke-test.md` §4 for the full table.

## 5. Phase 2 scenarios (RUNBOOK §4)

Same 5 scenarios as the Firefox runbook. See `docs/runbooks/firefox-smoke-test.md` §5.

## 6. Chrome-specific extras

Chrome has stricter service-worker lifecycle behavior than Firefox.

- **Service worker idle eviction.** Open `chrome://serviceworker-internals/`, find the auto-rebaser worker, observe whether it's "ACTIVATED and is running" or idle. Trigger a poll via the refresh icon and confirm the worker wakes.
- **Alarm wakes worker.** Wait the configured interval (set to 1 min for testing). Confirm the worker wakes from idle state and runs the poll. This is the single most common Chrome MV3 failure mode.
- **`chrome.storage.sync` quota.** Confirm with `await chrome.storage.sync.getBytesInUse()` in the worker console — should be well under the 100 KB cap.

## 7. Document the run

Append a dated row to `docs/runbooks/phase2-validation.md`:

```
| 2026-MM-DD | Chrome <ver> | <SHA> | All 12 scenarios ✅ | <notes> |
```

## Exit

- All 12 scenarios pass on Chrome.
- Service worker wakes from idle on alarm and on icon click.
- One row added to validation table.

## Red flags

- "Worker keeps dying mid-poll." Chrome enforces a 30s idle timeout per execution. If polls take >30s, they get killed. Audit `runPollCycle` for unbounded loops.
- "Badge stuck at old count after sign out." Worker probably cached state — confirm `setBadgeText({text: ''})` runs in the sign-out path.
- "Works on Chrome, fails on Edge/Brave." Almost always a missing-permissions or CSP issue. Don't ship until reproduced.
