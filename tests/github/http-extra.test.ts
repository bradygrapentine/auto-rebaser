import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestNoBody } from '../../src/github/http-extra';
import * as authStore from '../../src/core/auth-store';
import * as authRefresh from '../../src/core/auth-refresh';
import { GITHUB_API_BASE } from '../../src/core/constants';

function mockFetch(status: number) {
  return vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300 });
}

beforeEach(() => {
  vi.spyOn(authRefresh, 'ensureFreshToken');
  vi.spyOn(authStore, 'clearToken').mockResolvedValue(undefined);
});

describe('requestNoBody', () => {
  it('throws NOT_AUTHENTICATED when no token', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue(null);
    await expect(requestNoBody('/x', { method: 'DELETE' })).rejects.toThrow('NOT_AUTHENTICATED');
  });

  it('returns the status code on success without parsing body', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(204);
    const status = await requestNoBody('/x', { method: 'DELETE' });
    expect(status).toBe(204);
  });

  it('sends Authorization + Accept + version headers', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(204);
    await requestNoBody('/x', { method: 'DELETE' });
    const [url, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${GITHUB_API_BASE}/x`);
    const h = opts.headers as Record<string, string>;
    expect(h['Authorization']).toBe('Bearer tok');
    expect(h['Accept']).toBe('application/vnd.github+json');
    expect(h['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('401 → throws AUTH_ERROR and clears token', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(401);
    await expect(requestNoBody('/x', { method: 'DELETE' })).rejects.toThrow('AUTH_ERROR');
    expect(authStore.clearToken).toHaveBeenCalled();
  });

  it('403 → throws FORBIDDEN without clearing token (preserves missing-scope case)', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(403);
    await expect(requestNoBody('/x', { method: 'DELETE' })).rejects.toThrow('FORBIDDEN');
    expect(authStore.clearToken).not.toHaveBeenCalled();
  });

  it('429 → throws RATE_LIMITED', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(429);
    await expect(requestNoBody('/x', { method: 'DELETE' })).rejects.toThrow('RATE_LIMITED');
  });

  it('returns non-success status without throwing (caller decides)', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(404);
    const status = await requestNoBody('/x', { method: 'DELETE' });
    expect(status).toBe(404);
  });

  it('merges user headers', async () => {
    vi.mocked(authRefresh.ensureFreshToken).mockResolvedValue('tok');
    global.fetch = mockFetch(204);
    await requestNoBody('/x', { method: 'PATCH', headers: { 'X-Test': '1' } });
    const [, opts] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const h = opts.headers as Record<string, string>;
    expect(h['X-Test']).toBe('1');
    expect(h['Authorization']).toBe('Bearer tok');
  });
});
