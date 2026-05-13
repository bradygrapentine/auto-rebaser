import { setAuthPAT, clearToken } from './auth-store';
import { BASE_SCOPES } from './constants';

export async function composeOAuthScope(): Promise<string> {
  return BASE_SCOPES;
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

  // Pass the login through so setAuthPAT can derive the accountId without
  // a duplicate /user fetch and write directly under accounts.<id>.
  await setAuthPAT(trimmed, user.login);

  const scopesHeader = response.headers.get('x-oauth-scopes') ?? '';
  const scopes = scopesHeader.split(',').map((s) => s.trim()).filter(Boolean);

  return { login: user.login, scopes };
}
