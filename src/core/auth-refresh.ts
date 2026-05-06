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
import { clearAuth, getAuth, setAuthGitHubApp } from './auth-store';

const REFRESH_GRANT_TYPE = 'refresh_token';

/** Refresh when this close to access-token expiry (or already past it). */
export const REFRESH_LEAD_MS = 5 * 60 * 1000;

let inFlight: Promise<string> | null = null;

/**
 * Returns a usable access token. For PAT, that's the stored token. For
 * GitHub App, refreshes if the access token is within 5 minutes of expiry.
 * Returns null when the user is signed out OR the refresh token has expired
 * (in which case the caller should surface the sign-in screen).
 */
export async function ensureFreshToken(now: number = Date.now()): Promise<string | null> {
  const auth = await getAuth();
  if (!auth) return null;
  if (auth.method === 'pat') return auth.token;

  if (now >= auth.refreshTokenExpiresAt) {
    await clearAuth();
    return null;
  }

  if (now < auth.accessTokenExpiresAt - REFRESH_LEAD_MS) {
    return auth.accessToken;
  }
  return refreshSharedFlight(auth.refreshToken);
}

/**
 * Force a refresh — used after a 401 response, where the proactive expiry
 * check passed but the token was rejected anyway (clock skew, server-side
 * revocation, etc.). Returns null if the auth method is PAT (PATs don't
 * refresh) or there's no auth at all.
 */
export async function forceRefresh(): Promise<string | null> {
  const auth = await getAuth();
  if (!auth || auth.method !== 'github_app') return null;
  return refreshSharedFlight(auth.refreshToken);
}

function refreshSharedFlight(refreshToken: string): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = doRefresh(refreshToken).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(refreshToken: string): Promise<string> {
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
    await clearAuth();
    throw new Error(`REFRESH_FAILED: ${data.error ?? 'no_access_token'}`);
  }

  const now = Date.now();
  await setAuthGitHubApp({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    accessTokenExpiresAt: now + (data.expires_in ?? 0) * 1000,
    refreshTokenExpiresAt: now + (data.refresh_token_expires_in ?? 0) * 1000,
  });

  return data.access_token;
}

// Test-only — clears the in-flight promise between cases.
export function _resetInFlight(): void {
  inFlight = null;
}
