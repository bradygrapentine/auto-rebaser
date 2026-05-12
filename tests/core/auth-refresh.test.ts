import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/core/auth-store', () => ({
  getAuth: vi.fn(),
  setAuthGitHubApp: vi.fn(),
  clearAuth: vi.fn(),
  getAuthFor: vi.fn(),
  setAuthGitHubAppFor: vi.fn(),
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
  getAuthFor,
  setAuthGitHubAppFor,
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

// T2 acceptance — per-account in-flight dedup. Two concurrent ensureFreshToken
// calls on DIFFERENT accountIds must each issue their own network refresh
// (separate /login/oauth/access_token POSTs). Same-account concurrent calls
// share one. Regression target: pre-T2, a single global inFlight slot caused
// A's refresh to cross-resolve B's caller.
describe('ensureFreshToken — per-account refresh dedup', () => {
  it('different accountIds each get their own network roundtrip', async () => {
    const mGetAuthFor = vi.mocked(getAuthFor);
    const mSetAuthFor = vi.mocked(setAuthGitHubAppFor);

    // Both accounts are at/past their access-token expiry so a refresh is forced.
    const aAuth = baseAppAuth({ accessTokenExpiresAt: NOW - 1000, refreshToken: 'ghr_a' });
    const bAuth = baseAppAuth({ accessTokenExpiresAt: NOW - 1000, refreshToken: 'ghr_b' });
    mGetAuthFor.mockImplementation(async (id: string) => (id === 'gh_a' ? aAuth : bAuth));
    mSetAuthFor.mockResolvedValue(undefined);

    let aResolve!: (r: Response) => void;
    let bResolve!: (r: Response) => void;
    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const body = String(opts.body ?? '');
      calls.push(body.includes('ghr_a') ? 'a' : 'b');
      return new Promise<Response>((resolve) => {
        if (body.includes('ghr_a')) aResolve = resolve;
        else bResolve = resolve;
      });
    });

    // Kick off both concurrently — they should NOT collapse onto one promise.
    const pA = ensureFreshToken(NOW, 'gh_a');
    const pB = ensureFreshToken(NOW, 'gh_b');

    // Give the microtask queue a couple of ticks so fetches land.
    // Flush the getAuthFor + host-config + refreshSharedFlight await chain.
    await new Promise((r) => setTimeout(r, 0));

    expect(calls.sort()).toEqual(['a', 'b']);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Resolve each independently with distinct tokens — they must not swap.
    aResolve(jsonResponse({
      access_token: 'gho_a_new', refresh_token: 'ghr_a_new',
      expires_in: 3600, refresh_token_expires_in: 15897600,
    }));
    bResolve(jsonResponse({
      access_token: 'gho_b_new', refresh_token: 'ghr_b_new',
      expires_in: 3600, refresh_token_expires_in: 15897600,
    }));

    expect(await pA).toBe('gho_a_new');
    expect(await pB).toBe('gho_b_new');
  });

  it('same accountId concurrent calls share one network roundtrip', async () => {
    const mGetAuthFor = vi.mocked(getAuthFor);
    const mSetAuthFor = vi.mocked(setAuthGitHubAppFor);
    mGetAuthFor.mockResolvedValue(baseAppAuth({ accessTokenExpiresAt: NOW - 1000 }));
    mSetAuthFor.mockResolvedValue(undefined);

    let resolveFetch!: (r: Response) => void;
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );

    const p1 = ensureFreshToken(NOW, 'gh_a');
    // p1 must register its inFlight entry before p2 arrives — otherwise both
    // race past getAuthFor and each issues its own fetch.
    await new Promise((r) => setTimeout(r, 0));
    const p2 = ensureFreshToken(NOW, 'gh_a');
    await new Promise((r) => setTimeout(r, 0));

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse({
      access_token: 'gho_shared', refresh_token: 'ghr_shared',
      expires_in: 3600, refresh_token_expires_in: 15897600,
    }));

    expect(await p1).toBe('gho_shared');
    expect(await p2).toBe('gho_shared');
  });
});
