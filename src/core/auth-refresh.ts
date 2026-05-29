// Story 4.3 — token refresh + storage.
//
// Two entry points used by the rest of the codebase:
//   ensureFreshToken()   proactive — returns a token suitable for the next
//                        API call. Refreshes if within 5 minutes of expiry.
//   forceRefresh()       reactive — called on a 401 response. Refreshes
//                        unconditionally if method=github_app.
//
// All concurrent callers share a single in-flight refresh promise to avoid
// hammering /login/oauth/access_token. Refresh-token rotation is atomic:
// the new token replaces the old one in one chrome.storage.local.set call,
// matching the GitHub server-side rotation policy.

import { getOAuthClientId, getOriginBase } from './host-config';
import {
  clearAuth,
  getAuth,
  setAuthGitHubApp,
  getAuthFor,
  setAuthGitHubAppFor,
} from './auth-store';

const REFRESH_GRANT_TYPE = 'refresh_token';

/** Refresh when this close to access-token expiry (or already past it). */
export const REFRESH_LEAD_MS = 5 * 60 * 1000;

// In-flight refresh map, keyed by accountId. The sentinel '__implicit__' is
// used for the no-id (popup) path. Same-account concurrent calls dedup to one
// network roundtrip; cross-account concurrent calls each issue their own.
// Keying on accountId (stable) instead of refreshToken (rotates on success)
// avoids a stale-window hole where a post-rotation read computes a different
// key and triggers a redundant refresh against the now-invalid old token.
const IMPLICIT = '__implicit__';
const inFlight = new Map<string, Promise<string>>();

/**
 * Returns a usable access token. For PAT, that's the stored token. For
 * GitHub App, refreshes if the access token is within 5 minutes of expiry.
 * Returns null when the user is signed out OR the refresh token has expired
 * (in which case the caller should surface the sign-in screen).
 *
 * Pass `accountId` from any code path that iterates accounts (the SW poll
 * cycle) — that scopes both the auth read and the refresh dedup to the
 * named account, so cross-account concurrent refreshes don't collide.
 */
export async function ensureFreshToken(
  now: number = Date.now(),
  accountId?: string,
): Promise<string | null> {
  const auth = accountId ? await getAuthFor(accountId) : await getAuth();
  if (!auth) return null;
  if (auth.method === 'pat') return auth.token;

  if (now >= auth.refreshTokenExpiresAt) {
    if (accountId) {
      // Per-account expiry — DON'T call clearAuth() which operates on the
      // active account. The poll-cycle caller will surface the per-account
      // failure via its existing error handling.
      return null;
    }
    await clearAuth();
    return null;
  }

  // SEC-5 — the access token lives in chrome.storage.session and is cleared on
  // SW/browser restart. An absent (overlaid-to-'') token with a still-valid
  // refresh token means "evicted" — refresh to re-acquire, regardless of the
  // recorded access-token expiry.
  if (!auth.accessToken) {
    return refreshSharedFlight(auth.refreshToken, accountId ?? IMPLICIT);
  }

  if (now < auth.accessTokenExpiresAt - REFRESH_LEAD_MS) {
    return auth.accessToken;
  }
  return refreshSharedFlight(auth.refreshToken, accountId ?? IMPLICIT);
}

/**
 * Force a refresh — used after a 401 response, where the proactive expiry
 * check passed but the token was rejected anyway (clock skew, server-side
 * revocation, etc.). Returns null if the auth method is PAT (PATs don't
 * refresh) or there's no auth at all.
 */
export async function forceRefresh(accountId?: string): Promise<string | null> {
  const auth = accountId ? await getAuthFor(accountId) : await getAuth();
  if (!auth || auth.method !== 'github_app') return null;
  return refreshSharedFlight(auth.refreshToken, accountId ?? IMPLICIT);
}

function refreshSharedFlight(refreshToken: string, accountId: string): Promise<string> {
  const existing = inFlight.get(accountId);
  if (existing) return existing;
  const promise = doRefresh(refreshToken, accountId).finally(() => {
    inFlight.delete(accountId);
  });
  inFlight.set(accountId, promise);
  return promise;
}

async function doRefresh(refreshToken: string, accountId: string): Promise<string> {
  const origin = await getOriginBase();
  const clientId = await getOAuthClientId();
  const res = await fetch(`${origin}/login/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: REFRESH_GRANT_TYPE,
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    // Network / server failure — preserve the existing tokens so retries can
    // happen on the next call. Caller treats this as "couldn't refresh, retry
    // later".
    throw new Error(`HTTP_${res.status}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
  };

  if (data.error || !data.access_token) {
    // GitHub returned an error envelope — refresh token is invalid (revoked
    // or rotated past us). Drop the auth so the popup sends the user back to
    // sign-in.
    if (accountId === IMPLICIT) {
      await clearAuth();
    }
    // For per-account callers, leave the auth in place — the poll-cycle will
    // surface this as a per-account error and continue with other accounts.
    throw new Error(`REFRESH_FAILED: ${data.error ?? 'no_access_token'}`);
  }

  const now = Date.now();
  const next = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    accessTokenExpiresAt: now + (data.expires_in ?? 0) * 1000,
    refreshTokenExpiresAt: now + (data.refresh_token_expires_in ?? 0) * 1000,
  };
  if (accountId === IMPLICIT) {
    await setAuthGitHubApp(next);
  } else {
    await setAuthGitHubAppFor(accountId, next);
  }

  return data.access_token;
}

// Test-only — clears the in-flight map between cases.
export function _resetInFlight(): void {
  inFlight.clear();
}
