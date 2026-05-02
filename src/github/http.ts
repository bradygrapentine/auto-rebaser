import { getToken, clearToken } from '../core/auth-store';
import { getEntry, setEntry } from '../core/etag-cache';
import { GITHUB_API_BASE } from '../core/constants';

export interface RequestOptions extends RequestInit {
  useETag?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!path.startsWith('/')) throw new Error('INVALID_PATH');

  const token = await getToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');

  const { useETag, ...fetchOptions } = options;
  const url = GITHUB_API_BASE + path;

  const baseHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Merge user-provided headers
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

  const headers = { ...baseHeaders, ...userHeaders };
  const response = await fetch(url, { ...fetchOptions, headers });

  const { status } = response;

  if (status === 304 && useETag) {
    return cachedData as T;
  }

  if (status === 401 || status === 403) {
    await clearToken();
    throw new Error('AUTH_ERROR');
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
