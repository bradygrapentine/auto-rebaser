# Runbook — Chrome smoke test

_Goal: verify Auto Rebaser works in Chrome before Web Store submission._

The cross-browser scenario matrix lives in `firefox-smoke-test.md`. This runbook covers the Chrome load steps and the Chrome-specific service-worker checks.

## Prerequisites

- Chrome 120+ (or Chromium-based: Edge, Brave, Arc).
- A GitHub account with at least 2 open authored PRs across 2 different repos.
- (Recommended) A second GitHub account for multi-account scenarios.
- For PAT-only fallback: a classic Personal Access Token with scope `repo`.

## 1. Build

```bash
npm run build
```

Confirm `dist/manifest.json` exists, has `manifest_version: 3` and the Chrome `key` field.

## 2. Load in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** → pick the `dist/` directory.
4. Confirm the extension appears with the Auto Rebaser icon and no error banner.
5. Click **service worker** under the extension card to open the worker console — keep it open while testing.

If you see "Manifest file is missing or unreadable", you picked the wrong directory. Pick `dist/`, not the repo root.

## 3. Authenticate

Pin the Auto Rebaser icon to the toolbar (puzzle icon → pin), then click it.

For the GitHub App device-flow and PAT-legacy paths, follow `firefox-smoke-test.md` §3 and §3a — they're identical on Chrome.

To open the popup's devtools: **right-click inside the popup → Inspect Popup**. Regular F12 inspects the underlying page, not the popup.

## 4. Run the cross-browser scenario matrix

Walk through §4 (core), §5 (automation), and §6 (multi-account) of `firefox-smoke-test.md`. The expected behavior is identical on Chrome.

## 5. Chrome-specific extras

Chrome has stricter service-worker lifecycle behavior than Firefox.

- **Service worker idle eviction.** Open `chrome://serviceworker-internals/`, find the auto-rebaser worker, observe whether it's "ACTIVATED and is running" or idle. Trigger a poll via the toolbar refresh icon and confirm the worker wakes.
- **Alarm wakes worker.** Set the poll interval to 1 min for testing. Confirm the worker wakes from idle and runs the poll within ~1 min. This is the single most common Chrome MV3 failure mode.
- **`chrome.storage.sync` quota.** Confirm via `await chrome.storage.sync.getBytesInUse()` in the worker console — should be well under the 100 KB cap (multi-account per-account settings each have an 8 KB sub-budget).
- **`chrome.windows.getCurrent` height.** The popup reads the browser window height from this API to size itself. Confirm via the popup console: `await chrome.windows.getCurrent()` returns a real `height` value.

## 6. Document the run

Append a dated row to `docs/runbooks/state-machine-validation.md`:

```
| 2026-MM-DD | Chrome <ver> | <SHA> | All scenarios ✅ | <notes> |
```

## Exit

- All cross-browser scenarios from `firefox-smoke-test.md` pass on Chrome.
- Service worker wakes from idle on alarm and on icon click.
- One row added to validation log.

## Red flags

- "Worker keeps dying mid-poll." Chrome enforces a 30s idle timeout per execution. If polls take >30s, they get killed. Audit `runPollCycle` for unbounded loops.
- "Badge stuck at old count after sign out." Worker probably cached state — confirm `setBadgeText({text: ''})` runs in the sign-out path.
- "Works on Chrome, fails on Edge/Brave." Almost always a missing-permissions or CSP issue. Don't ship until reproduced.
- "Popup is taller than the browser window — footer cut off." `chrome.windows.getCurrent()` should be capping height; check the popup console for the `--popup-h` CSS custom property value.
