import { clearToken } from '../core/auth-store';
import { ensureFreshToken, forceRefresh } from '../core/auth-refresh';
import { getEntry, setEntry } from '../core/etag-cache';
import { getApiBase, getGraphQLEndpoint } from '../core/host-config';

export interface RequestOptions extends RequestInit {
  useETag?: boolean;
  /**
   * Story 4.6 — when true, the request targets the GraphQL endpoint instead
   * of the REST API base. The cloud endpoints alias to the same origin, but
   * on GHES they live at different paths (`/api/v3` vs `/api/graphql`).
   */
  useGraphQL?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!path.startsWith('/')) throw new Error('INVALID_PATH');

  const token = await ensureFreshToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const { useETag, useGraphQL, ...fetchOptions } = options;
  const url = useGraphQL
    ? await getGraphQLEndpoint()
    : (await getApiBase()) + path;

  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const userHeaders = fetchOptions.headers
    ? (fetchOptions.headers as Record<string, string>)
    : {};

  let cachedData: unknown = undefined;
  if (useETag) {
    const entry = await getEntry(url);
    if (entry) {
      baseHeaders['If-None-Match'] = entry.etag;
      cachedData = entry.data;
    }
  }

  let response = await fetch(url, { ...fetchOptions, headers: { ...baseHeaders, ...userHeaders } });

  // Story 4.3 — reactive refresh path: a 401 on a github_app token means the
  // server invalidated it earlier than expected. Force a refresh and retry
  // once. PAT 401 falls through to the existing clear-and-throw path.
  if (response.status === 401) {
    const refreshed = await forceRefresh().catch(() => null);
    if (refreshed) {
      const retryHeaders = { ...baseHeaders, Authorization: `Bearer ${refreshed}`, ...userHeaders };
      response = await fetch(url, { ...fetchOptions, headers: retryHeaders });
    }
  }

  const { status } = response;

  if (status === 304 && useETag) {
    return cachedData as T;
  }

  // 401 only clears auth when refresh has already been tried (above) and
  // still failed. 403 is "token valid, lacks permission for this resource"
  // — for GitHub App user-to-server tokens that's common when the App
  // wasn't granted a particular permission scope, and clearing auth would
  // dump the user into a sign-in loop the next mount can't escape. Surface
  // it as a non-fatal HTTP error instead.
  if (status === 401) {
    await clearToken();
    throw new Error('AUTH_ERROR');
  }
  if (status === 403) {
    throw new Error('HTTP_403');
  }

  if (status === 429) {
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    throw new Error(`HTTP_${status}`);
  }

  const data = await response.json() as T;

  if (useETag) {
    const etag = response.headers.get('etag');
    if (etag) {
      await setEntry(url, { etag, data });
    }
  }

  return data;
}
