# Auto Rebaser — Privacy Policy

_Last updated: 2026-05-02_

Auto Rebaser is a browser extension that automatically rebases your open GitHub pull requests when they fall behind their base branch. This document describes what data the extension handles and how.

## Summary

- The extension stores **one secret** locally: your GitHub Personal Access Token (PAT).
- It makes API calls **only** to `api.github.com` and `github.com`, on your behalf, using your PAT.
- It does **not** send any data to the extension author, to analytics services, or to any third party.
- It does **not** track your browsing.
- There is no backend server. Everything runs locally in your browser.

## What we store, where, and why

| Data | Storage | Purpose |
|---|---|---|
| GitHub Personal Access Token | `chrome.storage.sync` (or `browser.storage.sync` on Firefox) | Authenticates GitHub API calls. Required for the extension to function. |
| List of your open authored PRs (repo, number, title, state, base SHA, etc.) | `chrome.storage.local` | Display in the popup; detect when a PR falls behind. |
| Per-PR last-known ETags | `chrome.storage.local` | Reduce GitHub API quota consumption via conditional requests. |
| Settings (poll interval, automation toggles, per-repo opt-outs) | `chrome.storage.sync` | Your preferences. |

`chrome.storage.sync` data is synced by your browser vendor (Google or Mozilla) to your other signed-in browser instances, encrypted in transit. Auto Rebaser does not control or have access to that sync channel.

## What we send, where

The extension makes HTTPS requests **only** to:

- `https://api.github.com/*` — to list your PRs, fetch PR details, trigger rebases, resolve review threads, fetch notifications.
- `https://github.com/*` — host permission required by some GitHub API redirects.

Each request includes your PAT in the `Authorization` header so GitHub can authenticate you. No request goes anywhere else.

## What we do NOT do

- No analytics, telemetry, crash reporting, or usage tracking.
- No advertising, no ad networks, no fingerprinting.
- No data sold or shared with any third party.
- No remote configuration server. The extension's behavior is fully determined by code shipped in the published version.
- No content-script injection into github.com or any other site. The extension never reads page content.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Store the items in the table above. |
| `alarms` | Schedule the periodic poll (default every 5 minutes). |
| `host_permissions: api.github.com, github.com` | Talk to the GitHub API. |
| `identity` (Chrome only, currently unused) | Reserved for an optional future OAuth sign-in flow. Not invoked at runtime in the current version. |

## Your control

- **Sign out** clears your stored PAT.
- **Uninstalling the extension** removes all locally stored data.
- **Revoke the PAT** at https://github.com/settings/tokens at any time; the extension will stop being able to act on your behalf immediately.

## Source code

Auto Rebaser is open source. You can read every line that handles your data: <REPO_URL>

## Contact

Questions or concerns: grapentineb@gmail.com
