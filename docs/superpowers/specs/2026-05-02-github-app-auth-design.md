# GitHub App Authentication — Design Spec

_2026-05-02 · status: ✅ shipped (v0.2.0, Phase 4). Frozen reference; `src/core/auth*.ts` + `docs/superpowers/BACKLOG.md` §7 are authoritative._

## Goal

Replace user-pasted Personal Access Tokens with a **GitHub App + OAuth Device Flow** authentication path that meets typical enterprise security requirements. PAT remains as a fallback for individual users on personal accounts.

## Why this matters

PATs are unacceptable for most companies because:

| PAT problem | Enterprise expectation |
|---|---|
| User-managed credential, no central revoke | Admin-managed install, revoke kills all users at once |
| No expiry (classic PATs) or 1y max (fine-grained) | Short-lived access tokens (8h) + rotating refresh tokens (6mo) |
| Broad scopes (`repo` is "everything in every repo") | Per-repository, per-permission scopes (e.g. "Pull requests: write" only) |
| No audit trail of which app called what | Per-App audit in org settings |
| User can leak / commit / phish their own PAT | Token never typed; never displayed; never copied to clipboard |
| `chrome.storage.sync` propagates the secret across devices | Tokens stay on one device; refresh tokens not synced |

A GitHub App addresses every row.

## Architecture choice: Device Flow (no backend)

Two ways to do OAuth for a GitHub App from a browser extension:

### Option A: Authorization Code Flow (web-server flow)

Pros: smooth one-tab UX. Cons: requires a backend to hold `client_secret` for code↔token exchange. ~$0–5/mo Cloudflare Worker. Adds infrastructure to maintain, monitor, and pay for.

### Option B: Device Flow ✅ recommended

Pros: **no backend, no client_secret**. The extension can do the entire flow itself. Works identically on Chrome and Firefox. GitHub Enterprise Server compatible.

Cons: two-tab UX — extension shows an 8-character code, user pastes it into a github.com page in another tab. Familiar pattern (gh CLI, AWS CLI, kubectl OIDC all do this).

**We pick B.** No backend simplifies hosting, security, and store-listing review. UX cost is one-time at sign-in.

## Flow

```
┌────────────┐                      ┌──────────────┐                    ┌────────┐
│ Extension  │                      │  github.com  │                    │  User  │
└─────┬──────┘                      └──────┬───────┘                    └────┬───┘
      │  POST /login/device/code            │                                 │
      │  { client_id }                      │                                 │
      ├────────────────────────────────────►│                                 │
      │                                     │                                 │
      │  { device_code,                     │                                 │
      │    user_code: "ABCD-1234",          │                                 │
      │    verification_uri,                │                                 │
      │    interval: 5, expires_in: 900 }   │                                 │
      │◄────────────────────────────────────┤                                 │
      │                                     │                                 │
      │  Show code "ABCD-1234"             │                                 │
      │  Open https://github.com/login/device                                 │
      ├──────────────────────────────────────────────────────────────────────►│
      │                                     │  Type code + authorize          │
      │                                     │◄────────────────────────────────┤
      │                                     │                                 │
      │  Poll POST /login/oauth/access_token │                                 │
      │  every 5s with device_code           │                                 │
      ├────────────────────────────────────►│                                 │
      │  { error: "authorization_pending" } │                                 │
      │◄────────────────────────────────────┤                                 │
      │  ... eventually ...                  │                                 │
      │  { access_token, refresh_token,      │                                 │
      │    expires_in: 28800,                │                                 │
      │    refresh_token_expires_in: 15552000 } │                              │
      │◄────────────────────────────────────┤                                 │
      │                                     │                                 │
      │  Store in chrome.storage.local      │                                 │
```

Refresh on 401 or proactively when `now > expires_at - 5min`:

```
POST /login/oauth/access_token
  { client_id, refresh_token, grant_type: "refresh_token" }
→ { access_token, refresh_token, expires_in, refresh_token_expires_in }
```

No `client_secret` is ever needed.

## GitHub App configuration

Created once at `https://github.com/settings/apps/new` (or the org's App settings).

### Identity

| Field | Value |
|---|---|
| App name | `auto-rebaser` (must be globally unique on GitHub) |
| Homepage URL | https://github.com/<owner>/auto-rebaser |
| Description | "Automatically rebases your open GitHub PRs when they fall behind." |
| Webhook | **Disabled** (we poll; no webhooks needed) |
| Request user authorization (OAuth) during installation | **Yes** |
| Enable Device Flow | **Yes** |

### Permissions (per-repository)

Granular and least-privilege:

| Permission | Access | Why |
|---|---|---|
| **Pull requests** | Read & Write | Update branch (rebase), enable auto-merge, list PRs |
| **Contents** | Read | Read base/head SHAs for rebase decisions |
| **Metadata** | Read | Required for any repo permission (auto-granted) |
| **Issues** | _none_ | Not used |
| **Workflows** | _none_ | Not used |

### Permissions (account / user)

| Permission | Access | Why |
|---|---|---|
| **Email addresses** | Read | Display signed-in user in popup |

### Notification limitation (Story 2.9)

GitHub Apps **do not have a `notifications` permission**. Notification dismissal (Story 2.9) requires user-OAuth `notifications` scope, which is OAuth-App-only.

Three options for v0.2.0:

1. **Drop 2.9 from the GitHub App path.** Show "Notification cleanup unavailable when signed in via GitHub App." Most enterprise users don't want this anyway.
2. **Keep PAT as the auth method specifically for users who need 2.9.** UI lets them switch.
3. **Hybrid: GitHub App + supplementary fine-grained PAT** with notifications scope. Two credentials, more complex.

Recommendation: ship v0.2.0 with option 1, document the limitation. Revisit if user demand emerges.

## Token storage

```ts
// chrome.storage.local — NEVER chrome.storage.sync (no cross-device sync of tokens)
{
  auth: {
    method: "github_app",
    accessToken: string,
    refreshToken: string,
    accessTokenExpiresAt: number,    // epoch ms
    refreshTokenExpiresAt: number,   // epoch ms
    installations: Array<{ id: number; account: string; type: "User" | "Organization" }>,
    scopes: string[],
  }
}
```

PAT path remains its own shape under `auth: { method: "pat", token, ... }`.

## Service-worker changes

```ts
// Pseudocode
async function callGitHub(req: Request): Promise<Response> {
  let token = await getAccessToken();
  let res = await fetch(req, { ...req, headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    token = await refreshAccessToken();
    res = await fetch(req, { ...req, headers: { Authorization: `Bearer ${token}` } });
  }
  return res;
}

async function getAccessToken(): Promise<string> {
  const auth = await loadAuth();
  if (Date.now() < auth.accessTokenExpiresAt - 5 * 60 * 1000) return auth.accessToken;
  return refreshAccessToken();
}

async function refreshAccessToken(): Promise<string> {
  const auth = await loadAuth();
  if (Date.now() >= auth.refreshTokenExpiresAt) {
    await chrome.runtime.sendMessage({ type: 'AUTH_EXPIRED' });
    throw new Error('Refresh token expired');
  }
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: APP_CLIENT_ID,
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error_description ?? data.error);
  await saveAuth({ ...auth, ...mapTokenResponse(data) });
  return data.access_token;
}
```

A single in-flight refresh promise prevents thundering-herd when the worker wakes up to find an expired token and starts multiple concurrent fetches.

## Sign-in UX

```
┌─────────────────────────────────────┐
│ ➜ auto-rebaser --auth                │
│                                      │
│ Sign in with GitHub                  │
│                                      │
│  ●  GitHub App  (recommended)        │
│  ○  Personal Access Token  (legacy)  │
│                                      │
│  [ Continue ]                        │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│ Enter this code on github.com:       │
│                                      │
│         ABCD-1234                    │
│         [ Copy ]                     │
│                                      │
│  Opening github.com/login/device... │
│                                      │
│  Waiting for you to authorize...    │
│  [ Cancel ]                          │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│ Signed in as octocat                 │
│ via auto-rebaser App                 │
│ Installations: personal, acme-corp   │
└─────────────────────────────────────┘
```

The verification page on github.com guides the user through code entry, shows which permissions are being granted, and (for org-restricted users) the "Request access" flow.

## Migration

| Phase | Behavior |
|---|---|
| v0.1.x | PAT only. Current state. |
| v0.2.0 | Both methods. New users default to GitHub App. PAT users keep working. Banner in popup invites PAT users to migrate. |
| v0.3.0+ | Reassess. If GitHub App adoption is healthy, consider deprecating PAT for new sign-ins. Existing PAT users still supported indefinitely. |

A user can switch methods at any time via Settings → Sign out → re-sign-in with the other method.

## GitHub Enterprise Server compatibility

Trivial after this change:

- All OAuth endpoints become `<ghes_host>/login/...` instead of `github.com/login/...`.
- API calls become `<ghes_host>/api/v3/...`.
- Settings adds an optional `enterpriseHost` field.
- Same App must be installed on the GHES instance (different App entity from github.com).

Tracked as a v0.3.0 follow-up; the v0.2.0 plumbing makes it a few-hour change.

## Threat model

| Threat | Mitigation |
|---|---|
| Compromised browser extracts refresh token | Same risk as PAT today, but: token is scoped per-permission per-repo (vs PAT's `repo:*`), refresh tokens rotate every refresh, org admin can revoke install centrally. Strict net improvement. |
| Compromised GitHub App | App publisher can revoke. Users see App provenance during device-flow auth. Open-source code reviewable. |
| Phishing during sign-in | Device flow happens on real github.com — extension never asks for password or token. Phishing surface near-zero. |
| Token exfiltration via storage sync | We use `chrome.storage.local` only; tokens never sync across devices. |
| CSRF on auth flow | Device flow has no redirect, no `state` param needed; the device_code is the binding. |

## Open questions for review

1. **Should v0.2.0 ship dual-path or App-only?** Recommendation: dual. PAT users keep working; new sign-ins default to App.
2. **Do we want to publish a separate "Enterprise Edition"** with App-only auth and additional config knobs (allowlist, deny list, custom redirect)? Recommendation: no — overcomplicates v1. Single App handles both.
3. **Distribution of the GitHub App**: public listing on GitHub Marketplace vs. unlisted? Recommendation: public listing — discovery + admin trust.
4. **Story 2.9 (notification dismissal)**: drop, hybrid, or workaround? Recommendation: drop for App users; document.

## Estimated effort

- GitHub App registration: 1 hour (one-time, manual).
- Auth core (device-flow, refresh, storage): 4–6 hours.
- UI (sign-in view, mid-flow polling state, signed-in display): 2–3 hours.
- Tests (auth-store, refresh logic, device-flow polling): 3–4 hours.
- Migration & dual-path UX: 2 hours.
- Docs + privacy-policy update: 1 hour.

**Total: ~2 days of focused work.** Ship as v0.2.0.
