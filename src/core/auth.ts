import { setToken, clearToken } from './auth-store';
import {
  GITHUB_AUTHORIZE_URL,
  GITHUB_TOKEN_URL,
  BASE_SCOPES,
  OPTIONAL_SCOPES,
} from './constants';
import { getAutomationSettings, saveAutomationSettings } from './automations-store';

/**
 * Composes the OAuth scope string at sign-in time.
 * Always includes `BASE_SCOPES`; appends optional scopes for any enabled
 * automation that requires elevated permission.
 */
export async function composeOAuthScope(): Promise<string> {
  const scopes = [BASE_SCOPES];
  try {
    const settings = await getAutomationSettings();
    if (settings.autoDismissStaleNotifications) {
      scopes.push(OPTIONAL_SCOPES.notifications);
    }
  } catch {
    // If automation settings can't be loaded, fall back to base scopes.
  }
  return scopes.join(' ');
}

export async function signIn(): Promise<void> {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID as string;
  const clientSecret = import.meta.env.VITE_GITHUB_CLIENT_SECRET as string;
  const redirectURL = chrome.identity.getRedirectURL();
  const state = crypto.randomUUID();

  const scope = await composeOAuthScope();

  const authorizeURL = new URL(GITHUB_AUTHORIZE_URL);
  authorizeURL.searchParams.set('client_id', clientId);
  authorizeURL.searchParams.set('redirect_uri', redirectURL);
  authorizeURL.searchParams.set('scope', scope);
  authorizeURL.searchParams.set('state', state);

  const responseURL = await chrome.identity.launchWebAuthFlow({
    url: authorizeURL.toString(),
    interactive: true,
  });

  if (!responseURL) {
    throw new Error('AUTH_CANCELLED');
  }

  const params = new URL(responseURL).searchParams;
  const returnedState = params.get('state');
  const code = params.get('code');

  if (returnedState !== state) {
    throw new Error('AUTH_STATE_MISMATCH');
  }

  if (!code) {
    throw new Error('AUTH_NO_CODE');
  }

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectURL,
    }),
  });

  const data = await tokenResponse.json() as { access_token?: string; error?: string; scope?: string };

  if (data.error || !data.access_token) {
    throw new Error(`AUTH_TOKEN_ERROR: ${data.error ?? 'no token'}`);
  }

  await setToken(data.access_token);

  // Persist whether the granted token includes the optional notifications scope.
  // GitHub's token-exchange response body contains a `scope` field (comma-separated)
  // listing the scopes the user actually granted — which can differ from what we
  // requested if the user de-selected one on the consent screen. Trust that, not
  // the request. Falls back to the requested scope only if `scope` is absent
  // (e.g., a non-standard OAuth proxy), and silently no-ops if the settings
  // store is unavailable.
  try {
    const settings = await getAutomationSettings();
    const grantedList = (data.scope ?? scope.replace(/\s+/g, ',')).split(',').map(s => s.trim());
    const granted = grantedList.includes(OPTIONAL_SCOPES.notifications);
    if (settings.notificationsScopeGranted !== granted) {
      await saveAutomationSettings({ ...settings, notificationsScopeGranted: granted });
    }
  } catch {
    // Settings store unavailable — sign-in still succeeded; skip the bookkeeping.
  }
}

export async function signOut(): Promise<void> {
  await clearToken();
}

/**
 * Saves a Personal Access Token, validates it by calling /user, and reads the
 * granted scopes from the `X-OAuth-Scopes` response header so phase-2
 * automation gates know whether `notifications` was included.
 *
 * Throws on invalid token (401/403) or network failure. On success, returns
 * the GitHub user login + the scope list (helpful for surfacing in the popup).
 */
export async function setTokenFromPAT(pat: string): Promise<{ login: string; scopes: string[] }> {
  const trimmed = pat.trim();
  if (!trimmed) throw new Error('PAT_EMPTY');

  let response: Response;
  try {
    response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${trimmed}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    throw new Error('PAT_NETWORK_ERROR');
  }

  if (!response.ok) {
    throw new Error(`PAT_INVALID: HTTP_${response.status}`);
  }

  const user = (await response.json()) as { login?: string };
  if (!user.login) throw new Error('PAT_INVALID: no login');

  await setToken(trimmed);

  const scopesHeader = response.headers.get('x-oauth-scopes') ?? '';
  const scopes = scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);

  // Mirror the actual granted scope into automation_settings so the
  // dismissStaleNotifs gate (which checks notificationsScopeGranted) is correct.
  try {
    const settings = await getAutomationSettings();
    const granted = scopes.includes(OPTIONAL_SCOPES.notifications);
    if (settings.notificationsScopeGranted !== granted) {
      await saveAutomationSettings({ ...settings, notificationsScopeGranted: granted });
    }
  } catch {
    // best-effort; PAT itself is saved.
  }

  return { login: user.login, scopes };
}
