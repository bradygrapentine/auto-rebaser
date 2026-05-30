# OAuth Device Flow against a GitHub App (PAT as legacy path)

**Date:** 2026-05-30
**Status:** Accepted
**Backlog:** DOC-1 (retrospective — v2 auth mechanism)

## Context

The extension needs a GitHub credential to poll and rebase PRs. A browser
extension has no server-side component to safely hold an OAuth client secret and
no stable redirect URI of the kind the web application flow expects, so the
standard authorization-code flow is an awkward fit.

> Scope: this ADR covers the auth *mechanism* (how the token is obtained). Where
> the resulting token is *stored* is a separate decision — see
> [Access token in `chrome.storage.session`](2026-05-29-access-token-session-storage.md) (SEC-5).

## Decision

Authenticate via the **OAuth Device Flow** against a GitHub App. The app's client
id is public and **no client secret is required** (`src/core/auth-constants.ts`:
`GITHUB_APP_CLIENT_ID`, with the comment "No client_secret is needed"). The user
authorizes by entering a device code on github.com; the runner
(`src/core/auth-device-flow.ts`, `src/background/auth-device-flow-runner.ts`)
polls for the resulting `access_token` + `refresh_token` + `expires_in`.

A **Personal Access Token (PAT)** path is retained as a legacy alternative for
users or enterprises who prefer to supply their own long-lived token.

## Consequences

- **Benefit:** no client secret ships in the extension bundle (where it could not
  be kept secret anyway), and no redirect-URI infrastructure is needed.
- **Benefit:** tokens are short-lived and refreshable, which enables the SEC-5
  decision to keep the access token in `chrome.storage.session` and re-acquire it
  from the refresh token after a restart.
- **Cost:** the device-flow UX requires the user to visit github.com and enter a
  code — more friction than a one-click redirect, accepted for the security and
  simplicity gains.
- **Cost:** two auth code paths (GitHub App + PAT) must both be maintained.
