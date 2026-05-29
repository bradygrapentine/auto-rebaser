# Access token in `chrome.storage.session`, refresh token in `local` (SEC-5)

**Date:** 2026-05-29
**Status:** Accepted
**Backlog:** SEC-5

## Context

`chrome.storage.local` is unencrypted at rest. Pre-SEC-5, the GitHub App
**access token** was persisted there as a field of the per-account `Auth` blob
(`accounts[<id>].auth.accessToken`), alongside the refresh token and expiry
metadata. OWASP A04 (insecure design) / A07 (identification & auth failures):
a short-lived bearer token sitting on disk is unnecessary exposure when the
runtime offers an in-memory alternative.

`chrome.storage.session` is per-extension-session, in-memory, and cleared on
browser restart — a better home for a short-lived credential.

## Decision

Keep the GitHub App **access token** in `chrome.storage.session` (per account,
key `access_token:<accountId>`). Keep the **refresh token + expiry metadata +
method + login + installations** in the local `auth` blob, with the blob's
`accessToken` field blanked to `''`.

- **Write** funnels through `splitAccessToken` at every auth writer
  (`setAuthGitHubApp`/`For`, `setInstallations`/`For`, and `migrateAndWriteAuth`
  — the latter covers first sign-in and the add-account runner transitively).
- **Read** overlays the session token in `getAuth`/`getAuthFor`; `getToken`
  returns `null` when the session token is absent.
- **Eviction** (SW/browser restart clears session): `ensureFreshToken` sees an
  empty access token with a valid refresh token and refreshes to re-acquire,
  re-stashing in session. `getToken` → `null` signals callers to refresh.
- **Sign-out / account removal** (`clearAuth`, `removeAccount`) clear the
  session token too — no token survives across sign-ins on a shared device.

The **PAT** path is unchanged: a PAT is the user's long-lived credential (not a
rotating short-lived token), so it stays in local. Moving it to session would
force re-entry on every browser restart with no security gain (the PAT is the
durable secret either way).

## Consequences

- **Benefit:** the access token is no longer written to disk. The on-disk
  refresh token is single-use-rotating and is required to be persistent for
  unattended re-auth, so it stays — this is the intended trust boundary.
- **Cost:** one extra refresh roundtrip after a browser restart (the access
  token must be re-acquired from the refresh token). Acceptable — refresh
  already happens routinely on expiry.
- **Migration:** a pre-SEC-5 github_app account whose token sits in a local
  blob simply has it re-stashed to session on the next write/refresh; the
  legacy top-level `auth` key read by the add-account migration path
  (`auth-device-flow-runner.ts`) only ever holds pre-SEC-5 data (real token
  present), so that path is unaffected.
- **Runtime guard:** if `chrome.storage.session` is unavailable (older
  runtimes/tests), the token isn't persisted across calls and the refresh path
  re-acquires it — degraded, not broken.
