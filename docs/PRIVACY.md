# Auto Rebaser — Privacy Policy

**Last updated:** 2026-05-06
**Contact:** grapentineb@gmail.com

Auto Rebaser ("the extension") is a browser extension that automatically rebases your open GitHub pull requests when they fall behind their base branch. This policy explains what the extension stores, where it sends data, and what it does not do.

## Data the extension stores

All data is stored locally in the browser via the standard `chrome.storage` API. Nothing is sent to any server operated by us — there is no Auto Rebaser backend.

The extension stores:

- **Authentication credential.** Either a GitHub App user-to-server access token (acquired via the GitHub App OAuth Device Flow) or a Personal Access Token (PAT) you paste in. Stored in `chrome.storage.local`.
- **GitHub App refresh token** (App-auth only). Used to silently renew the access token before it expires. Stored in `chrome.storage.local`.
- **List of pull requests** authored by the signed-in user, fetched fresh on every poll. Includes PR title, number, repository name, mergeable state, head branch reference, requested reviewers, last-updated timestamp, and a few derived fields. Stored in `chrome.storage.local`.
- **Automation settings** (toggles + opt-out lists). Stored in `chrome.storage.sync` so they sync across signed-in browsers.
- **Activity log.** A bounded log (200 most recent entries / 30 days) of automated actions the extension has taken: rebases, branch deletions, auto-merge enablements, thread resolutions, ping comments. Each entry contains action type, repo, PR number, timestamp, and result. Stored in `chrome.storage.local`.
- **Throttle state.** A small map of `{ prId → last-pinged-timestamp }` to prevent re-pinging the same PR within 24 hours. Stored in `chrome.storage.local`.

## Where data goes

The extension makes HTTPS requests **only** to:

- `api.github.com` (or your configured GitHub Enterprise Server host).
- `github.com` (for the OAuth Device Flow code-exchange and verification URL).

Every request is authenticated with the credential you provided. No third-party analytics, telemetry, error reporting, or advertising services are loaded or contacted.

## What the extension does on your behalf

When the conditions you configure are met, the extension calls these GitHub API endpoints:

- `PUT /repos/{owner}/{repo}/pulls/{n}/update-branch` — rebases a PR onto its base branch (Story 2.5).
- `DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}` — deletes a merged branch (Story 2.6, opt-in).
- `enablePullRequestAutoMerge` GraphQL mutation — flips per-PR auto-merge (Story 2.7, opt-in).
- `resolveReviewThread` GraphQL mutation — resolves outdated review threads (Story 2.8, opt-in).
- `POST /repos/{owner}/{repo}/issues/{n}/comments` — posts a ping comment when you click the ping link (Story 5.1, manual confirmation required).

All of these are gated by explicit user toggles in the popup; defaults are conservative (read-only or local-only by default).

## What the extension does NOT do

- No tracking, analytics, or telemetry.
- No data is sent anywhere other than github.com / your configured GHES host.
- The credential never leaves your browser.
- No advertising.
- No personal data is collected, profiled, or shared.

## Removing your data

Uninstalling the extension wipes `chrome.storage.local` (credentials, PR cache, activity log). `chrome.storage.sync` (settings) clears when you sign out of the browser profile or via Chrome's settings.

You can also clear the activity log manually from the popup's activity page.

## Open source

The extension's full source is published at https://github.com/bradygrapentine/auto-rebaser. You can audit exactly what it does at any version.

## Changes to this policy

If we update this policy, we'll bump the date at the top and update the published URL. The extension's version is in `manifest.json` so you can correlate.
