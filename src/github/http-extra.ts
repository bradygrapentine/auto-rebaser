import { getToken, clearToken } from '../core/auth-store';
import { GITHUB_API_BASE } from '../core/constants';

// Companion to http.ts for endpoints with empty bodies (204 No Content, 205 Reset
// Content) where calling response.json() would throw. At v1 merge time this can
// fold into http.ts as a `noBody?: boolean` option on RequestOptions.

export async function requestNoBody(
  path: string,
  options: RequestInit = {}
): Promise<number> {
  const token = await getToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const url = GITHUB_API_BASE + path;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const response = await fetch(url, { ...options, headers });
  const { status } = response;

  if (status === 401) {
    await clearToken();
    throw new Error('AUTH_ERROR');
  }
  if (status === 403) {
    throw new Error('FORBIDDEN');
  }
  if (status === 429) throw new Error('RATE_LIMITED');

  return status;
}
