# Auto Rebaser — Privacy Policy

_Last updated: 2026-05-14 (v2.0.0)_

Auto Rebaser is a browser extension that automatically rebases your open GitHub pull requests when they fall behind their base branch and runs a small set of opt-in housekeeping automations. v2 adds multi-account support and an opt-in desktop-notifications path. This document describes what data the extension handles and how.

## Summary

- The extension stores your GitHub credentials **locally on your machine** — never on a remote server.
- It makes API calls **only** to `api.github.com` and `github.com` (or your GitHub Enterprise Server host, if you've configured one).
- It does **not** send any data to the extension author, to analytics services, or to any third party.
- It does **not** track your browsing.
- There is no backend server. Everything runs locally in your browser.
- Multiple GitHub accounts on one install are kept fully scoped — each account's auth, settings, PR cache, ETag cache, and throttle state live in its own per-account namespace and never cross.

## Authentication

Two sign-in methods are supported:

1. **GitHub App + OAuth Device Flow** (recommended). You authorize the official Auto Rebaser GitHub App on github.com. The extension receives a short-lived access token (~8h) and a refresh token (~6 months). Refresh happens automatically; you only re-authenticate when the refresh token expires or you sign out.
2. **Personal Access Token (legacy)**. You paste a token with the `repo` scope.

Both methods store credentials in `chrome.storage.local` (or `browser.storage.local` on Firefox). **No credentials are ever written to `chrome.storage.sync`** — they stay on the device that signed in.

### Multi-account (v2)

You can sign in with more than one GitHub account on a single install. Each account is identified by its GitHub login and stored under a per-account namespace inside `chrome.storage.local` (`accounts.<id>.*`). Every per-account data category below is keyed by that namespace — there is no shared global cache for auth, PR data, ETags, or throttles. Switching the active account in the popup only changes which namespace the UI reads from; nothing is exchanged between accounts.

## What we store, where, and why

| Data | Storage | Per-account? | Purpose |
|---|---|---|---|
| Auth credentials (GitHub App token set, OR personal access token) | `chrome.storage.local` | yes | Authenticates GitHub API calls. Required for the extension to function. |
| List of GitHub App installations accessible to you | `chrome.storage.local` | yes | Display "via GitHub App on org-a, org-b" and gate writes against suspended installations. |
| List of your open authored PRs (repo, number, title, state, etc.) | `chrome.storage.local` | yes | Display in the popup; detect when a PR falls behind. |
| Reviewer PR cache (PRs where you're a requested reviewer or assignee, v2) | `chrome.storage.local` | yes | Render the reviewer dashboard tab. |
| Per-URL ETags | `chrome.storage.local` | yes | Reduce GitHub API quota consumption via conditional requests. Per-account so no account ever echoes another's `If-None-Match`. |
| Settings — global (poll interval, ignored repos, keyboard shortcuts, GHES host) | `chrome.storage.sync` | no — shared | Cross-account preferences synced by your browser vendor. |
| Settings — per-account (automation toggles, opt-out lists, notification preferences, reviewer-tab toggle) | `chrome.storage.sync` | yes | Each signed-in account keeps its own opt-outs and toggles. |
| Activity log (action, repo, PR number, PR title, result, timestamp) | `chrome.storage.local` | yes | Audit trail for automated actions. Capped at 200 entries / 30 days. Cleared on demand via "Clear log". Never synced. |
| Ping throttle (PR id → last-pinged timestamp) | `chrome.storage.local` | yes | Prevents the popup's "ping reviewers" button from re-posting within 24 hours. Pruned automatically. |
| Rerequest throttle (PR id → last-rerequested timestamp) | `chrome.storage.local` | yes | Same throttle pattern for the v2 push-since-approval re-review chip. |
| Notification throttle (`(prId, event)` → last-notified timestamp, v2) | `chrome.storage.local` | yes | 1-hour throttle per (PR, event) so desktop notifications don't spam. Pruned automatically. |
| Already-resolved review threads (thread id → timestamp) | `chrome.storage.local` | yes | Prevents re-resolving threads that a teammate manually un-resolved. |
| Reviewer auto-merge arming cache (v2) | `chrome.storage.local` | yes | Records that the 4-gate reviewer auto-merge has fired for a given PR, so the gate is idempotent across polls. |

`chrome.storage.sync` data is synced by your browser vendor (Google or Mozilla) to your other signed-in browser instances, encrypted in transit. Auto Rebaser does not control or have access to that sync channel.

Sign-out for a single account clears that account's namespace (auth, PR caches, throttles). "Sign out all" wipes every account's namespace. Uninstall removes everything.

## What we send, where

The extension makes HTTPS requests **only** to:

- `https://api.github.com/*` (REST + GraphQL) and `https://github.com/*` (OAuth + Device Flow endpoints), OR
- if you've configured a GitHub Enterprise Server host: `https://<your-ghes-host>/*` instead.

Each request includes the active account's access token in the `Authorization` header so GitHub can authenticate you. No request goes anywhere else.

## Desktop notifications (v2, opt-in)

The `notifications` permission is **optional** and requested at runtime only when you toggle desktop notifications ON in settings. Default is OFF. If you grant the permission, the extension calls the browser's local `chrome.notifications.create` API to display a system notification — no notification content is ever transmitted off your device. Toggling notifications OFF in settings revokes the runtime permission grant.

## What we do NOT do

- No analytics, telemetry, crash reporting, or usage tracking.
- No advertising, no ad networks, no fingerprinting.
- No data sold or shared with any third party.
- No remote configuration server. The extension's behavior is fully determined by code shipped in the published version.
- No content-script injection into github.com or any other site. The extension never reads page content.
- No cross-account data sharing. Account A's auth token, ETags, PR cache, and throttles are never visible to account B.

## Permissions

| Permission | Required? | Why |
|---|---|---|
| `storage` | install-time | Store the items in the table above. |
| `alarms` | install-time | Schedule the periodic poll (default every 5 minutes). |
| `host_permissions: api.github.com, github.com` | install-time | Talk to the GitHub API and complete the OAuth Device Flow. |
| `optional_host_permissions: https://*/*` (Chrome) / `optional_permissions: https://*/*` (Firefox) | **runtime, opt-in** | Requested only if you configure a GitHub Enterprise Server host in settings. The browser prompts you to grant access to that specific host before any request is made. |
| `notifications` (v2) | **runtime, opt-in** | Requested only when you toggle desktop notifications ON in settings. Used to display local system notifications via `chrome.notifications.create`. No data is transmitted. |

## Threat model & storage

`chrome.storage.local` (and `browser.storage.local` on Firefox) is **unencrypted at rest**. If local malware runs with access to your browser profile, or if another extension has been granted the `storage` permission with broad host access, it could read the tokens stored there. This is an inherent limitation of the browser extension storage API; it is not specific to Auto Rebaser.

**What this means in practice:**

- **Tokens are device-scoped.** Access and refresh tokens are written only to the local device's storage. Nothing is sent to any Auto Rebaser server — there is no Auto Rebaser server.
- **Refresh-token rotation is atomic.** When an access token expires the extension fetches a new token pair (access + refresh) before making any GitHub API call. The old pair is replaced in a single `chrome.storage.local.set` call, so there is no window where the extension holds two valid refresh tokens simultaneously.
- **No server-side exposure.** The only parties that ever see your tokens are your local browser and GitHub's authentication servers (`github.com`). Auto Rebaser has no backend that receives, logs, or proxies credentials.
- **Revocation path.** You can immediately invalidate all tokens without touching the extension:
  - *GitHub App tokens:* GitHub → Settings → Applications → Authorized GitHub Apps → revoke Auto Rebaser.
  - *Personal Access Tokens:* GitHub → Settings → Developer settings → Personal access tokens → delete the token.
  - After revocation the extension's tokens stop working on the next API call.

For the full vulnerability assessment and residual risk register that informed these design choices, see [`docs/security/2026-05-14-owasp-review.md`](docs/security/2026-05-14-owasp-review.md).

## Your control

- **Sign out** clears that account's stored credentials and per-account caches.
- **Sign out all** wipes every signed-in account's namespace.
- **Uninstalling the extension** removes all locally stored data.
- **Revoke a Personal Access Token** at https://github.com/settings/tokens.
- **Revoke the GitHub App** at https://github.com/settings/applications. Once revoked, the extension's tokens stop working immediately.
- **Toggle notifications OFF** in settings → the browser revokes the `notifications` permission grant.

## Source code

Auto Rebaser is open source. You can read every line that handles your data: https://github.com/bradygrapentine/auto-rebaser

## Contact

Questions or concerns: grapentineb@gmail.com
