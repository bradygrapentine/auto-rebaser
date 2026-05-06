import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/core/auth-store', () => ({
  getAuth: vi.fn(),
  setAuthGitHubApp: vi.fn(),
  clearAuth: vi.fn(),
}));

import {
  ensureFreshToken,
  forceRefresh,
  REFRESH_LEAD_MS,
  _resetInFlight,
} from '../../src/core/auth-refresh';
import {
  getAuth,
  setAuthGitHubApp,
  clearAuth,
  type AuthGitHubApp,
} from '../../src/core/auth-store';

const mGetAuth = vi.mocked(getAuth);
const mSetAuth = vi.mocked(setAuthGitHubApp);
const mClearAuth = vi.mocked(clearAuth);

const realFetch = globalThis.fetch;

function mockFetch(handler: () => Response | Promise<Response>) {
  globalThis.fetch = vi.fn().mockImplementation(handler);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const NOW = 1_700_000_000_000;
const baseAppAuth = (over: Partial<AuthGitHubApp> = {}): AuthGitHubApp => ({
  method: 'github_app',
  accessToken: 'gho_old',
  refreshToken: 'ghr_old',
  accessTokenExpiresAt: NOW + 60 * 60 * 1000, // 1h ahead
  refreshTokenExpiresAt: NOW + 6 * 30 * 24 * 60 * 60 * 1000, // 6mo ahead
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  _resetInFlight();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('ensureFreshToken', () => {
  it('returns null when signed out', async () => {
    mGetAuth.mockResolvedValue(null);
    expect(await ensureFreshToken(NOW)).toBeNull();
  });

  it('returns the PAT verbatim for pat auth', async () => {
    mGetAuth.mockResolvedValue({ method: 'pat', token: 'ghp_x' });
    expect(await ensureFreshToken(NOW)).toBe('ghp_x');
  });

  it('returns access token without refresh when far from expiry', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth());
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    expect(await ensureFreshToken(NOW)).toBe('gho_old');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes when within REFRESH_LEAD_MS of expiry', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth({
      accessTokenExpiresAt: NOW + REFRESH_LEAD_MS - 1000,
    }));
    mockFetch(() => jsonResponse({
      access_token: 'gho_new',
      refresh_token: 'ghr_new',
      expires_in: 28800,
      refresh_token_expires_in: 15897600,
    }));

    const token = await ensureFreshToken(NOW);
    expect(token).toBe('gho_new');
    expect(mSetAuth).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'gho_new', refreshToken: 'ghr_new' }),
    );
  });

  it('refreshes when access token already expired', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth({
      accessTokenExpiresAt: NOW - 60_000,
    }));
    mockFetch(() => jsonResponse({
      access_token: 'gho_new',
      refresh_token: 'ghr_new',
      expires_in: 28800,
      refresh_token_expires_in: 15897600,
    }));

    expect(await ensureFreshToken(NOW)).toBe('gho_new');
  });

  it('clears auth and returns null when refresh token expired', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth({
      refreshTokenExpiresAt: NOW - 1000,
    }));
    expect(await ensureFreshToken(NOW)).toBeNull();
    expect(mClearAuth).toHaveBeenCalled();
  });

  it('GitHub-error envelope clears auth and rejects', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth({
      accessTokenExpiresAt: NOW - 1000,
    }));
    mockFetch(() => jsonResponse({ error: 'bad_refresh_token' }));

    await expect(ensureFreshToken(NOW)).rejects.toThrow(/REFRESH_FAILED/);
    expect(mClearAuth).toHaveBeenCalled();
  });

  it('transient HTTP failure rejects but does NOT clear auth', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth({
      accessTokenExpiresAt: NOW - 1000,
    }));
    mockFetch(() => new Response('', { status: 503 }));

    await expect(ensureFreshToken(NOW)).rejects.toThrow(/HTTP_503/);
    expect(mClearAuth).not.toHaveBeenCalled();
  });

  it('concurrent calls share a single in-flight refresh', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth({
      accessTokenExpiresAt: NOW - 1000,
    }));
    let calls = 0;
    mockFetch(async () => {
      calls++;
      // Simulate a slow refresh so the second call can race the first.
      await new Promise((r) => setTimeout(r, 10));
      return jsonResponse({
        access_token: 'gho_new',
        refresh_token: 'ghr_new',
        expires_in: 28800,
        refresh_token_expires_in: 15897600,
      });
    });

    const [a, b, c] = await Promise.all([
      ensureFreshToken(NOW),
      ensureFreshToken(NOW),
      ensureFreshToken(NOW),
    ]);
    expect(a).toBe('gho_new');
    expect(b).toBe('gho_new');
    expect(c).toBe('gho_new');
    expect(calls).toBe(1);
  });
});

describe('forceRefresh', () => {
  it('returns null when method is pat', async () => {
    mGetAuth.mockResolvedValue({ method: 'pat', token: 'x' });
    expect(await forceRefresh()).toBeNull();
  });

  it('returns null when signed out', async () => {
    mGetAuth.mockResolvedValue(null);
    expect(await forceRefresh()).toBeNull();
  });

  it('refreshes regardless of expiry clock', async () => {
    mGetAuth.mockResolvedValue(baseAppAuth()); // far from expiry
    mockFetch(() => jsonResponse({
      access_token: 'gho_forced',
      refresh_token: 'ghr_forced',
      expires_in: 28800,
      refresh_token_expires_in: 15897600,
    }));
    expect(await forceRefresh()).toBe('gho_forced');
  });
});
