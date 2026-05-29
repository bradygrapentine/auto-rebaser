// SEC-5 — access token lives in chrome.storage.session (per-account), never in
// chrome.storage.local. These tests drive the real auth-store / auth-refresh /
// multi-account functions through a STATEFUL storage mock so we can assert
// exactly WHERE each value lands (local blob vs session).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setAuthGitHubApp,
  setAuthGitHubAppFor,
  setInstallationsFor,
  getAuth,
  getAuthFor,
  getToken,
  setAuthPAT,
  clearAuth,
} from '../../src/core/auth-store';
import {
  setActiveAccountId,
  removeAccount,
  STORAGE_KEYS_V2,
  readAccessTokenFor,
} from '../../src/core/storage/multi-account';
import { ensureFreshToken, _resetInFlight } from '../../src/core/auth-refresh';

// ── stateful storage backing ──────────────────────────────────────────────
let local: Record<string, unknown>;
let session: Record<string, unknown>;
let sync: Record<string, unknown>;

function installStatefulStorage() {
  local = {};
  session = {};
  sync = {};
  const area = (backing: Record<string, unknown>) => ({
    get: vi.fn(async (keys?: string | string[]) => {
      if (keys == null) return { ...backing };
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in backing) out[k] = backing[k];
      return out;
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(backing, obj);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete backing[k];
    }),
    clear: vi.fn(async () => {
      for (const k of Object.keys(backing)) delete backing[k];
    }),
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  });
  (chrome.storage as unknown as Record<string, unknown>).local = area(local);
  (chrome.storage as unknown as Record<string, unknown>).session = area(session);
  (chrome.storage as unknown as Record<string, unknown>).sync = area(sync);
}

const TS = {
  accessToken: 'gho_REAL',
  refreshToken: 'ghr_x',
  accessTokenExpiresAt: Date.now() + 3_600_000,
  refreshTokenExpiresAt: Date.now() + 30 * 24 * 3_600_000,
};

function localAuthBlob(id: string): Record<string, unknown> | undefined {
  const accounts = (local[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, { auth?: Record<string, unknown> }>;
  return accounts[id]?.auth;
}

beforeEach(() => {
  installStatefulStorage();
  _resetInFlight();
});

describe('SEC-5 access token → chrome.storage.session', () => {
  it('setAuthGitHubAppFor stores token in session, NOT in the local blob; getAuthFor overlays it', async () => {
    await setAuthGitHubAppFor('acct', TS);
    expect(localAuthBlob('acct')?.accessToken).toBe('');
    expect(session[`access_token:acct`]).toBe('gho_REAL');
    const auth = await getAuthFor('acct');
    expect(auth?.method).toBe('github_app');
    expect((auth as { accessToken: string }).accessToken).toBe('gho_REAL');
  });

  it('first sign-in (no active id) via migrateAndWriteAuth keeps the token out of local', async () => {
    // setAuthGitHubApp with no active account → first-sign-in migrate path.
    // /user fetch derives the id; mock it.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ login: 'octocat' }), { status: 200 }),
    );
    await setAuthGitHubApp(TS);
    const accounts = (local[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, { auth?: { accessToken?: string } }>;
    const id = Object.keys(accounts)[0];
    expect(id).toBeTruthy();
    expect(accounts[id].auth?.accessToken).toBe('');
    expect(session[`access_token:${id}`]).toBe('gho_REAL');
  });

  it('setInstallationsFor does NOT re-leak the overlaid token to local', async () => {
    await setAuthGitHubAppFor('acct', TS);
    await setInstallationsFor('acct', [{ id: 1, account: 'octocat', type: 'User' } as never]);
    expect(localAuthBlob('acct')?.accessToken).toBe('');
    expect(session['access_token:acct']).toBe('gho_REAL');
    const auth = await getAuthFor('acct');
    expect((auth as { installations?: unknown[] }).installations?.length).toBe(1);
    expect((auth as { accessToken: string }).accessToken).toBe('gho_REAL');
  });

  it('per-account isolation: A read never returns B token', async () => {
    await setAuthGitHubAppFor('A', { ...TS, accessToken: 'gho_A' });
    await setAuthGitHubAppFor('B', { ...TS, accessToken: 'gho_B' });
    expect((await getAuthFor('A') as { accessToken: string }).accessToken).toBe('gho_A');
    expect((await getAuthFor('B') as { accessToken: string }).accessToken).toBe('gho_B');
    expect(await readAccessTokenFor('A')).toBe('gho_A');
  });

  it('SW eviction (session cleared) → ensureFreshToken refreshes', async () => {
    await setAuthGitHubAppFor('acct', TS);
    // Simulate SW restart: session wiped, local (refresh token) intact.
    for (const k of Object.keys(session)) delete session[k];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: 'gho_NEW', refresh_token: 'ghr_y', expires_in: 3600, refresh_token_expires_in: 9999999 }),
        { status: 200 },
      ),
    );
    const tok = await ensureFreshToken(Date.now(), 'acct');
    expect(tok).toBe('gho_NEW');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(session['access_token:acct']).toBe('gho_NEW');
    expect(localAuthBlob('acct')?.accessToken).toBe('');
  });

  it('getToken returns null when the github_app session token is absent', async () => {
    await setAuthGitHubAppFor('acct', TS);
    await setActiveAccountId('acct');
    for (const k of Object.keys(session)) delete session[k];
    expect(await getToken()).toBeNull();
  });

  it('clearAuth removes both the local blob and the session token', async () => {
    await setAuthGitHubAppFor('acct', TS);
    await setActiveAccountId('acct');
    await clearAuth();
    expect(session['access_token:acct']).toBeUndefined();
  });

  it('removeAccount clears the session token for that account', async () => {
    await setAuthGitHubAppFor('acct', TS);
    await setActiveAccountId('acct');
    await removeAccount('acct');
    expect(session['access_token:acct']).toBeUndefined();
  });

  it('PAT path unchanged: token stays in local, no session entry', async () => {
    await setAuthGitHubAppFor('acct', TS); // create an active account context
    await setActiveAccountId('acct');
    await setAuthPAT('ghp_pat', 'octocat');
    const auth = await getAuth();
    expect(auth?.method).toBe('pat');
    expect((auth as { token: string }).token).toBe('ghp_pat');
  });

  it('re-auth github_app → PAT on the same id clears the stale App session token', async () => {
    await setAuthGitHubAppFor('acct', TS);
    await setActiveAccountId('acct');
    expect(session['access_token:acct']).toBe('gho_REAL');
    // Switch the same account to a PAT — the old App access token must not linger.
    await setAuthPAT('ghp_pat', 'octocat');
    expect(session['access_token:acct']).toBeUndefined();
  });
});
