# Runbook — GitLab OAuth Application Setup

> **Scope changed (post-review):** GitLab is now planned for **v3.0.0**, not v2. This runbook stays as the v3 design reference. v2.0.0 + v2.1.0 ship GitHub-only multi-account; v3 work begins after v2 demand validates the GitLab investment. See `docs/superpowers/plans/2026-05-07-v2-implementation-plan.md` for the rationale.

GitLab uses OAuth 2.0 with PKCE for browser-based clients. No client_secret is embedded in the extension.

## Step 1 — Decide host scope

- **gitlab.com (cloud)** — single registration covers all gitlab.com users.
- **Self-hosted** — each instance needs its own registration. The user provides the host + their own client_id (mirrors the v1.0.x enterprise-host flow for GHES).

v2.0.0 may ship gitlab.com only (deferring self-hosted to v2.1) — see "Open questions" #1 in the V2 plan. Decide before this step.

## Step 2 — Register on gitlab.com

1. Go to **https://gitlab.com/-/profile/applications** (or under a group: Group → Settings → Applications).
2. **Name:** `Auto Rebaser`
3. **Redirect URI:** must come from the runtime, not be guessed.
   - Chrome production: run `chrome.identity.getRedirectURL()` once after the v3 build is loaded to get the canonical `https://<extension-id>.chromiumapp.org/` URL — paste this into the GitLab Application config.
   - Firefox production: run `browser.identity.getRedirectURL()` to get the `https://<uuid>.extensions.allizom.org/` URL (the uuid is *not* the extension ID and isn't guessable from the manifest — it's derived from `browser_specific_settings.gecko.id`).
   - Development: same calls in your dev profile yield the dev IDs; add those URLs to the Application's allowed redirect list.
4. **Confidential:** **NO** (public client — PKCE flow, no secret).
5. **Scopes:**
   - `read_user` (always)
   - `read_api` (read MRs + repo metadata)
   - `api` (write actions — required for rebase, merge, comment; user can opt to read-only)
6. Save → record the **Application ID** (this is the public `client_id`).

## Step 3 — Wire client_id into the extension

For the bundled gitlab.com client_id, add to `src/core/constants.ts`:

```ts
export const GITLAB_DEFAULT_CLIENT_ID = 'gloat_xxx...'; // gitlab.com app
```

For self-hosted, the user provides their own client_id via settings (mirrors the GHES flow at Story 4.6).

## Step 4 — OAuth flow implementation notes

GitLab's PKCE flow:

1. Generate `code_verifier` (random ≥43 chars), `code_challenge = SHA256(code_verifier)` base64url-encoded.
2. Get the redirect URI **from the browser**, do not hardcode:
   - Chrome: `chrome.identity.getRedirectURL()` → `https://<extension-id>.chromiumapp.org/`
   - Firefox: `browser.identity.getRedirectURL()` → `https://<uuid>.extensions.allizom.org/` where the uuid is derived from `browser_specific_settings.gecko.id` (`auto-rebaser@grapentineb.dev`).
3. Build the authorize URL. **Scope must be space-separated, percent-encoded** (RFC 6749 — GitLab is inconsistent about accepting plus-encoded `+`):
   ```
   https://gitlab.com/oauth/authorize?
     response_type=code
     &client_id=<app_id>
     &redirect_uri=<encoded_redirect_url>
     &scope=read_user%20read_api%20api          // NOT read_user+read_api+api
     &state=<random>
     &code_challenge=<challenge>
     &code_challenge_method=S256
   ```
4. Hand the URL to `chrome.identity.launchWebAuthFlow({url, interactive: true}, callback)`. This opens a **browser-controlled popup window** (not a new tab) that handles the OAuth flow and closes itself after redirecting to the redirect URI. The callback receives the final URL containing `?code=...&state=...`.
5. Verify state. POST `https://gitlab.com/oauth/token` with `grant_type=authorization_code&client_id=...&code=...&redirect_uri=...&code_verifier=...`.
6. Receive `access_token`, `refresh_token`, `expires_in` (typically 7200s).
7. Store under `accounts.<acct_id>.auth` per the V2 multi-account shape.

Refresh: when 401 is returned, POST `/oauth/token` with `grant_type=refresh_token`. Same single-in-flight-promise pattern as the GitHub App refresh in v1 (`src/core/auth-refresh.ts`).

## Step 5 — Self-hosted variant

User provides:
- `host` — e.g. `gitlab.acme.corp`
- `client_id` — from their self-hosted instance's app registration

All OAuth + API URLs swap `gitlab.com` for the user's host. Same pattern as `enterpriseHost` in v1.

## Step 6 — Smoke test

After `npm run build:store && npm run build:firefox` produces a v2 build:
1. Load unpacked in Chrome → click "Sign in with GitLab" → confirm authorization page is gitlab.com → approve.
2. Popup shows your authored open MRs, grouped by project.
3. Trigger a rebase against an MR that's behind master. Confirm rebase completes (poll `rebase_in_progress` field). Verify on gitlab.com that the rebase actually landed.
4. Sign out → token cleared from storage → popup returns to sign-in.

## Step 7 — Document for users

Add to `README.md` and `docs/STORE_LISTING.md`:

> **Self-hosted GitLab** (v2.1+): Settings → Enterprise → enter `gitlab.host.example` and the App ID from your instance. Your administrator may need to register the OAuth Application on the instance (Admin Area → Applications) before you can sign in.

## Edge cases observed in development

- **Approval reset on push** — gitlab.com's default; surfaced in the popup as the 5.2 "approvals reset" badge.
- **Async rebase** — GitLab's rebase endpoint returns 202 immediately. Poll `rebase_in_progress` on the MR detail every 2s for up to 30s before declaring failure. Don't block the popup; show an "updating" badge same as GitHub's behind→updating transition.
- **Squash-on-merge** — per-project setting AND per-MR override. GitLab API exposes both; `enableAutoMerge` should respect the user's preference order from `mergeMethodPreference` and degrade gracefully (badge "auto-merge skipped: SQUASH not allowed on this project") if neither preferred method is permitted.
