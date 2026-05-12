# Auto Rebaser — Privacy Policy

_Last updated: 2026-05-06_

Auto Rebaser is a browser extension that automatically rebases your open GitHub pull requests when they fall behind their base branch. This document describes what data the extension handles and how.

## Summary

- The extension stores your GitHub credentials **locally on your machine** — never on a remote server.
- It makes API calls **only** to `api.github.com` and `github.com` (or your GitHub Enterprise Server host, if you've configured one).
- It does **not** send any data to the extension author, to analytics services, or to any third party.
- It does **not** track your browsing.
- There is no backend server. Everything runs locally in your browser.

## Authentication

Two sign-in methods are supported:

1. **GitHub App + OAuth Device Flow** (recommended). You authorize the official Auto Rebaser GitHub App on github.com. The extension receives a short-lived access token (~8h) and a refresh token (~6 months). Refresh happens automatically; you only re-authenticate when the refresh token expires or you sign out.
2. **Personal Access Token (legacy)**. You paste a token with the `repo` scope (and optionally `notifications` for the dismiss-stale-notifications automation).

Both methods store credentials in `chrome.storage.local` (or `browser.storage.local` on Firefox). **No credentials are ever written to `chrome.storage.sync`** — they stay on the device that signed in.

## What we store, where, and why

| Data | Storage | Purpose |
|---|---|---|
| Auth credentials (GitHub App token set, OR personal access token) | `chrome.storage.local` | Authenticates GitHub API calls. Required for the extension to function. |
| List of GitHub App installations accessible to you | `chrome.storage.local` | Display "via GitHub App on org-a, org-b" and gate writes against suspended installations. |
| List of your open authored PRs (repo, number, title, state, etc.) | `chrome.storage.local` | Display in the popup; detect when a PR falls behind. |
| Per-URL ETags | `chrome.storage.local` | Reduce GitHub API quota consumption via conditional requests. |
| Settings (poll interval, automation toggles, per-repo opt-outs, enterprise host) | `chrome.storage.sync` | Your preferences, optionally synced across your signed-in browser instances by the browser vendor. |
| Activity log (action, repo, PR number, PR title, result, timestamp) | `chrome.storage.local` | Audit trail for automated actions. Capped at 200 entries / 30 days. Cleared on demand via "Clear log". Never synced. |
| Ping throttle (PR id → last-pinged timestamp) | `chrome.storage.local` | Prevents the popup's "ping reviewers" button from re-posting within 24 hours. Pruned automatically. |
| Already-resolved review threads (thread id → timestamp) | `chrome.storage.local` | Prevents re-resolving threads that a teammate manually un-resolved. |

`chrome.storage.sync` data is synced by your browser vendor (Google or Mozilla) to your other signed-in browser instances, encrypted in transit. Auto Rebaser does not control or have access to that sync channel.

Sign-out clears auth credentials AND the per-PR caches (ping-throttle, resolved-threads) to prevent state leakage between accounts on shared devices.

## What we send, where

The extension makes HTTPS requests **only** to:

- `https://api.github.com/*` (REST API) and `https://github.com/*` (OAuth + Device Flow endpoints), OR
- if you've configured a GitHub Enterprise Server host: `https://<your-ghes-host>/*` instead.

Each request includes your access token in the `Authorization` header so GitHub can authenticate you. No request goes anywhere else.

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
| `host_permissions: api.github.com, github.com` | Talk to the GitHub API and complete the OAuth Device Flow. |
| `optional_host_permissions: https://*/*` (Chrome) / `optional_permissions: https://*/*` (Firefox) | Requested **only** if you configure a GitHub Enterprise Server host in settings. The browser prompts you to grant access to that specific host before any request is made. |

## Your control

- **Sign out** clears your stored credentials and per-PR caches.
- **Uninstalling the extension** removes all locally stored data.
- **Revoke a Personal Access Token** at https://github.com/settings/tokens.
- **Revoke the GitHub App** at https://github.com/settings/applications. Once revoked, the extension's tokens stop working immediately.

## Source code

Auto Rebaser is open source. You can read every line that handles your data: https://github.com/bradygrapentine/auto-rebaser

## Contact

Questions or concerns: grapentineb@gmail.com
