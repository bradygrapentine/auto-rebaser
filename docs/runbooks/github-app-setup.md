# Runbook — GitHub App registration & per-browser wiring

_Goal: Phase 4 ships with a registered, listed GitHub App and Device-Flow sign-in working identically on Chrome and Firefox._

This is mostly a **one-time** runbook with two recurring sections (Chrome / Firefox) that you'll re-walk on every browser-specific change.

## 0. Prerequisites

- [ ] Phase 4 spec read end-to-end (`docs/superpowers/specs/2026-05-02-github-app-auth-design.md`).
- [ ] Decision: ship the App under your personal GitHub account or an org account. (Recommendation: org account — easier to transfer ownership later.)
- [ ] Repo public on GitHub (for Marketplace listing trust).
- [ ] PRIVACY.md hosted (Marketplace requires a privacy URL).

## 1. Register the App

Open https://github.com/settings/apps/new (or `https://github.com/organizations/<org>/settings/apps/new`).

Fill in:

| Field | Value |
|---|---|
| GitHub App name | `auto-rebaser` (must be globally unique) |
| Description | "Automatically rebases your open GitHub PRs when they fall behind their base branch." |
| Homepage URL | `https://github.com/<owner>/auto-rebaser` |
| Callback URL | _leave blank_ |
| Setup URL | _leave blank_ |
| Webhook → Active | **uncheck** |
| Webhook URL / secret | _leave blank_ |

Identifying & authorizing users:

| Field | Value |
|---|---|
| Request user authorization (OAuth) during installation | **checked** |
| Enable Device Flow | **checked** |
| Expire user authorization tokens | **checked** |

Permissions — Repository:

| Permission | Access |
|---|---|
| Pull requests | Read & write |
| Contents | Read-only |
| Metadata | Read-only (auto-granted) |

Permissions — Account:

| Permission | Access |
|---|---|
| Email addresses | Read-only |

Where can this App be installed?: **Any account**.

Click **Create GitHub App**.

Capture from the resulting App settings page:

- **App ID** (numeric) — public.
- **Client ID** (`Iv1.<hex>`) — public, ships in extension.
- **Slug** (URL part, e.g. `auto-rebaser`) — used in marketplace URLs.

We do **not** need the Client Secret or a Private Key for Device Flow. Skip those.

## 2. Marketplace listing

App settings → **Public page** tab → fill in:

- Logo: 200×200 PNG, transparent background, same artwork as the extension icon (Track 2 of LAUNCH_PLAN).
- Cover image: 1280×640.
- Categories: Developer Tools, Productivity.
- Pricing: Free.
- Permissions explanation: copy from `docs/superpowers/specs/2026-05-02-github-app-auth-design.md` §"GitHub App configuration".
- Privacy policy URL: same Pages URL used in Web Store / AMO listings.
- Terms of service URL: optional, link to repo `LICENSE`.

Submit for review. GitHub Marketplace approval is usually 1–2 business days.

## 3. Wire client_id into the extension

```ts
// src/core/auth-constants.ts
export const GITHUB_APP_CLIENT_ID = 'Iv1.0123456789abcdef'; // from step 1
export const GITHUB_DEVICE_FLOW_BASE = 'https://github.com';
export const GITHUB_API_BASE = 'https://api.github.com';
```

Commit. There is no secret to protect — `client_id` is intentionally public for Device Flow.

## 4. Implement Device Flow module

See backlog Story 4.2 for shape. Key points:

- Single `auth-device-flow.ts` with no browser-specific code.
- Polling loop respects the server's `interval` and `slow_down` directives.
- Polling lives in the **service worker**, not the popup, so it survives popup close.
- Per-attempt state held in worker memory (`Map<attemptId, DeviceFlowStart>`); never persisted to storage.

## 5. Chrome verification

Each step is a check, not a build instruction.

### 5.1 Build & load

```bash
npm run build
```

In `chrome://extensions`:
- Developer mode on.
- Load unpacked → `dist/`.
- Note the **Extension ID** (top of the card, e.g. `dnphbljgalpaocikalochfopadijgbab`). With the existing `manifest.json` `key` field, this ID is stable across machines.

### 5.2 Smoke-test Device Flow

- Click toolbar icon → "Sign in with GitHub App".
- Code (e.g. `ABCD-1234`) appears in popup with Copy button.
- A new tab opens to `https://github.com/login/device`.
- Paste code → Continue → Authorize `auto-rebaser`.
- Within 10 seconds, popup transitions to PR list.

### 5.3 Service worker checks

Open the extension's worker console (extension card → `service worker`):

- `chrome.storage.local.get('auth')` returns `{ method: 'github_app', accessToken, refreshToken, ... }`.
- `chrome.storage.sync.get('auth')` returns `{}`. Tokens must NOT be in sync.
- A network request to `api.github.com` fires within 30 seconds (initial poll). `Authorization: Bearer <token>` header present.

### 5.4 Refresh path

- In the worker console, force-expire the access token:

  ```js
  await chrome.storage.local.get('auth').then(({ auth }) =>
    chrome.storage.local.set({ auth: { ...auth, accessTokenExpiresAt: 0 } })
  );
  ```

- Trigger a poll (toolbar refresh). Network panel should show one POST to `github.com/login/oauth/access_token` followed by the API call. Storage should show a new `accessToken` and `refreshToken` (both rotated).

### 5.5 Refresh-token expiry

- Force-expire the refresh token:

  ```js
  await chrome.storage.local.get('auth').then(({ auth }) =>
    chrome.storage.local.set({ auth: { ...auth, refreshTokenExpiresAt: 0 } })
  );
  ```

- Trigger a poll. Popup should return to sign-in screen with no refresh request fired (we check expiry locally).

### 5.6 Marketplace install link

- In an incognito window logged into a different test account, visit `https://github.com/marketplace/auto-rebaser` (or `https://github.com/apps/auto-rebaser` if listing isn't approved yet).
- Click Install → choose account / select repos → Authorize.
- Switch to the Auto Rebaser extension (already authed in the original profile? If new profile, sign in via Device Flow).
- Verify the new account's installation appears under the user info.

### 5.7 Suspended-install path

- In github.com, suspend the install (App settings → Installations → suspend).
- Trigger a poll. PRs from that org render with the "Suspended" badge; no automation actions taken.
- Re-enable. Next poll, badges clear and automations resume.

### 5.8 Edge cases checklist

- [ ] User cancels device-code entry → "Sign-in cancelled" message, popup returns to sign-in.
- [ ] User waits >15 min before authorizing → "Code expired — start over".
- [ ] User closes the popup mid-polling and reopens 30s later → polling resumed, code still visible.
- [ ] User signs in via App, then signs out, then signs in via PAT → PAT works, App tokens cleared.
- [ ] Two browser windows open at once on the same Chrome profile → single shared auth state.

## 6. Firefox verification

Mostly identical. Only the deltas:

### 6.1 Build & load

```bash
npm run build:firefox
```

In `about:debugging#/runtime/this-firefox`:
- Load Temporary Add-on → `dist-firefox/manifest.json`.
- Note the **Internal UUID** (different from Chrome's Extension ID).

### 6.2 Stable UUID

For dev: temporary add-ons get a fresh UUID per session. The `client_id` flow does NOT depend on the UUID (Device Flow has no redirect). So this doesn't matter for auth — only for Marketplace screenshots.

For production (AMO-signed): the `gecko.id` in `manifest.firefox.json` (`auto-rebaser@grapentineb.dev`) pins the addon-id, but the UUID component used in URLs is still per-install. Again, irrelevant to Device Flow.

### 6.3 Smoke-test Device Flow

Walk steps 5.2 through 5.5 in Firefox. Behavior must be identical. If any step diverges, **stop and investigate** — divergence here usually means a `chrome.*` API call has a different shape under Firefox's polyfill.

Specific Firefox gotchas to verify:

- **`chrome.tabs.create`** opens a tab (not a window). If Firefox opens a window instead, check that the call is to `chrome.tabs.create`, not `chrome.windows.create`.
- **`chrome.alarms` cadence**: Firefox enforces a minimum alarm period of 1 minute in MV3 release builds. The poll loop uses 5-second `setTimeout` for Device Flow — that's not affected. But if any future code uses `alarms` for sub-minute work, it will silently get clamped on Firefox.
- **CSP**: open the **Add-on Debugger** (about:debugging → Inspect). Network tab must show requests to `github.com/login/device/code` and `github.com/login/oauth/access_token` succeeding. If blocked, see CSP override in §6.5.

### 6.4 Service worker idle behavior

Firefox's MV3 service worker idles slightly differently from Chrome. Polling loops that span minutes must:

- Use `chrome.alarms` for waits >25 seconds.
- Re-load state from `chrome.storage.local` on every alarm fire (do not assume in-memory state survived).

Verify by leaving the popup closed for 5 minutes mid-polling, then reopening. Authentication must complete or surface a clear "Code expired" if past `expiresAt`.

### 6.5 CSP override (only if §6.3 shows blocked requests)

Edit `manifest.firefox.json`:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src https://github.com https://api.github.com"
}
```

Rebuild, retest. If still blocked, the issue is elsewhere — don't paper over with `*` directives.

### 6.6 AMO permission review

AMO reviewers will scan the manifest for permissions. With Device Flow:

- `host_permissions: ["https://api.github.com/*", "https://github.com/*"]` — required, justified.
- `permissions: ["alarms", "storage"]` — required, justified.
- **Do not add `identity`** — we don't use `launchWebAuthFlow`. AMO will ask why if it's there.
- **Do not add `tabs`** — `chrome.tabs.create` is allowed without `tabs` permission as long as you don't read tab metadata. Verify by removing if present.

### 6.7 Edge cases checklist (Firefox-specific)

- [ ] Same as Chrome §5.8 plus:
- [ ] Install via temporary-addon → sign in → restart Firefox → addon is gone (expected). Re-install → sign-in state lost (also expected for temp installs; not a bug).
- [ ] After AMO signing, the same checklist on a regular Firefox install.

## 7. Cross-browser sanity

Run both `dist/` (Chrome) and `dist-firefox/` (Firefox) sign-ins simultaneously against the same GitHub account. Both should succeed independently and not interfere — installations are per-user, not per-browser, so the Auto Rebaser App appears once on github.com no matter how many browsers connect.

## 8. Document the run

Append to `docs/runbooks/phase2-validation.md` (extend the table to a Phase 4 section):

```
| 2026-MM-DD | App v1.0 | <SHA> | Chrome <ver> | All §5 steps ✅ | <notes> |
| 2026-MM-DD | App v1.0 | <SHA> | Firefox <ver> | All §6 steps ✅ | <notes> |
```

## Red flags

- **"I'll just commit the client_secret to make Authorization Code Flow work"** — no. Device Flow exists specifically to avoid this. If you find yourself writing a backend, re-read the spec.
- **"The polling loop hangs the popup"** — popup closes, worker continues. If the popup is hanging, the polling is in the wrong context. Move it to the service worker.
- **"Firefox CSP errors so I'll set `connect-src '*'`"** — that's an AMO review fail. The two GitHub origins are explicit and sufficient.
- **"Device Flow code expired during user testing — let me extend it"** — the 15-minute window is GitHub-controlled, not configurable. If users routinely time out, the issue is UX clarity (make the "open github.com" step more obvious), not the timeout.
- **"Marketplace listing rejected for permissions justification"** — re-read least-privilege list in §1. We do not need Issues, Workflows, Administration, Actions, or Packages permissions.
- **"GHES test against a fake host without installing the App there"** — won't work. The App must be registered separately on each GHES instance. Testing GHES requires a real (or trial) GHES instance.
