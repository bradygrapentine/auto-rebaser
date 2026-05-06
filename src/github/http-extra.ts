import { clearToken } from '../core/auth-store';
import { ensureFreshToken, forceRefresh } from '../core/auth-refresh';
import { getApiBase } from '../core/host-config';

// Companion to http.ts for endpoints with empty bodies (204 No Content, 205 Reset
// Content) where calling response.json() would throw. At v1 merge time this can
// fold into http.ts as a `noBody?: boolean` option on RequestOptions.

export async function requestNoBody(
  path: string,
  options: RequestInit = {}
): Promise<number> {
  const token = await ensureFreshToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const url = (await getApiBase()) + path;
  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const userHeaders = (options.headers as Record<string, string>) ?? {};

  let response = await fetch(url, { ...options, headers: { ...baseHeaders, ...userHeaders } });

  // Story 4.3 / audit B1 — same reactive refresh path as http.ts. A 401 on a
  // github_app token forces one refresh + retry before bailing.
  if (response.status === 401) {
    const refreshed = await forceRefresh().catch(() => null);
    if (refreshed) {
      const retryHeaders = {
        ...baseHeaders,
        Authorization: `Bearer ${refreshed}`,
        ...userHeaders,
      };
      response = await fetch(url, { ...options, headers: retryHeaders });
    }
  }

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
