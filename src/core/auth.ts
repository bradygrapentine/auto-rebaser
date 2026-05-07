import { setToken, clearToken } from './auth-store';
import {
  GITHUB_AUTHORIZE_URL,
  GITHUB_TOKEN_URL,
  BASE_SCOPES,
} from './constants';

export async function composeOAuthScope(): Promise<string> {
  return BASE_SCOPES;
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
}

export async function signOut(): Promise<void> {
  await clearToken();
}

/**
 * Saves a Personal Access Token and validates it by calling /user.
 * Throws on invalid token (401/403) or network failure. On success, returns
 * the GitHub user login + the scope list (read from `X-OAuth-Scopes` header).
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

  return { login: user.login, scopes };
}
