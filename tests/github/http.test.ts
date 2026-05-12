import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from '../../src/github/http';
import * as authStore from '../../src/core/auth-store';
import * as authRefresh from '../../src/core/auth-refresh';
import * as etagCache from '../../src/core/etag-cache';
import { GITHUB_API_BASE } from '../../src/core/constants';

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const headerMap = new Map(Object.entries(headers));
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headerMap.get(k) ?? null },
    json: vi.fn().mockResolvedValue(body),
  });
}

beforeEach(() => {
  vi.spyOn(authRefresh, 'ensureFreshToken');
  vi.spyOn(authRefresh, 'forceRefresh').mockResolvedValue(null);
  vi.spyOn(authStore, 'clearToken').mockResolvedValue(undefined);
  vi.spyOn(etagCache, 'getEntry');
  vi.spyOn(etagCache, 'setEntry').mockResolvedValue(undefined);
});

describe('http.request', () => {
  it('throws INVALID_PATH when path does not start with /', async () => {
    await expect(request('https://evil.example.com/x')).rejects.toThrow('INVALID_PATH');
    await expect(request('user')).rejects.toThrow('INVALID_PATH');
  });

  it('throws NOT_AUTHENTICATED when no token', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue(null);
    await expect(request('/user')).rejects.toThrow('NOT_AUTHENTICATED');
  });

  it('sends Authorization header', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok123');
    global.fetch = mockFetch(200, { login: 'me' });

    await request('/user');

    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${GITHUB_API_BASE}/user`);
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer tok123');
  });

  it('304 with useETag returns cached data', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    vi.mocked(etagCache.getEntry).mockResolvedValue({ etag: '"abc"', data: { cached: true } });
    global.fetch = mockFetch(304, null);

    const result = await request('/search/issues', { useETag: true });
    expect(result).toEqual({ cached: true });
  });

  it('304 with useETag sends If-None-Match header', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    vi.mocked(etagCache.getEntry).mockResolvedValue({ etag: '"etag-val"', data: {} });
    global.fetch = mockFetch(304, null);

    await request('/search/issues', { useETag: true });

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((opts.headers as Record<string, string>)['If-None-Match']).toBe('"etag-val"');
  });

  it('200 with etag stores new entry', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    vi.mocked(etagCache.getEntry).mockResolvedValue(null);
    global.fetch = mockFetch(200, { items: [] }, { etag: '"new-etag"' });

    await request('/search/issues', { useETag: true });
    expect(etagCache.setEntry).toHaveBeenCalledWith(
      `${GITHUB_API_BASE}/search/issues`,
      { etag: '"new-etag"', data: { items: [] } },
      undefined,
    );
  });

  it('401 → throws AUTH_ERROR and calls clearToken', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(401, { message: 'Bad credentials' });

    await expect(request('/user')).rejects.toThrow('AUTH_ERROR');
    expect(authStore.clearToken).toHaveBeenCalled();
  });

  it('403 → throws HTTP_403 without clearing auth (App scope error, not invalid token)', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(403, { message: 'Forbidden' });

    await expect(request('/user')).rejects.toThrow('HTTP_403');
    expect(authStore.clearToken).not.toHaveBeenCalled();
  });

  it('429 → throws RATE_LIMITED', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(429, {});

    await expect(request('/user')).rejects.toThrow('RATE_LIMITED');
  });

  it('500 → throws HTTP_500', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(500, { message: 'Server Error' });

    await expect(request('/user')).rejects.toThrow('HTTP_500');
  });

  it('merges user-provided headers', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(200, {});

    await request('/repos/a/b/pulls/1/update-branch', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });

    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('does not call etag-cache when useETag is false/absent', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(200, {});

    await request('/user');
    expect(etagCache.getEntry).not.toHaveBeenCalled();
    expect(etagCache.setEntry).not.toHaveBeenCalled();
  });

  it('sends standard Accept and X-GitHub-Api-Version headers', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(200, {});

    await request('/user');
    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const h = opts.headers as Record<string, string>;
    expect(h['Accept']).toBe('application/vnd.github+json');
    expect(h['X-GitHub-Api-Version']).toBe('2022-11-28');
  });
});
