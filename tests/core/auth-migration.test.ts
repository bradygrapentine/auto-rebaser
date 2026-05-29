// T1 acceptance tests — auth migration safety.
//
// Covers three regressions the v2 Cowork smoke surfaced:
//
// 1. `migrateAndWriteAuth` lands legacy migrate + new auth + active id in
//    one chrome.storage.local.set call (atomicity under SW eviction).
// 2. `setAuthPAT` throws on /user failure and NEVER writes a `gh_unknown`
//    account namespace.
// 3. add-account preserves the first account when first sign-in used the
//    legacy top-level storage shape (the headline regression — A → add B
//    must keep A visible to listAccountIds).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  migrateAndWriteAuth,
  listAccountIds,
} from '../../src/core/storage/multi-account';
import { setAuthPAT } from '../../src/core/auth-store';
import type { Auth, AuthPAT, AuthGitHubApp } from '../../src/core/auth-store';

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

/** Simple in-memory chrome.storage.local backing the mocked get/set/remove. */
function installStorageBacking(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };

  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
    async (keys: string | string[] | Record<string, unknown> | null) => {
      if (keys == null) return { ...store };
      const want = Array.isArray(keys) ? keys : [keys as string];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in store) out[k] = store[k];
      return out;
    },
  );
  (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockImplementation(
    async (patch: Record<string, unknown>) => {
      Object.assign(store, patch);
    },
  );
  (chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockImplementation(
    async (keys: string | string[]) => {
      const want = Array.isArray(keys) ? keys : [keys];
      for (const k of want) delete store[k];
    },
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('migrateAndWriteAuth — atomicity', () => {
  it('lands legacy migrate + new auth + active id in one storage.set call', async () => {
    const store = installStorageBacking({
      auth: { method: 'pat', token: 'old_pat', login: 'alice' } satisfies AuthPAT,
    });
    const setSpy = chrome.storage.local.set as ReturnType<typeof vi.fn>;

    const legacyAuth: AuthPAT = { method: 'pat', token: 'old_pat', login: 'alice' };
    const newAuth: AuthGitHubApp = {
      method: 'github_app',
      accessToken: 'gho_bob',
      refreshToken: 'ghr_bob',
      accessTokenExpiresAt: Date.now() + 3600_000,
      refreshTokenExpiresAt: Date.now() + 86400_000,
      login: 'bob',
    };

    await migrateAndWriteAuth({
      legacyAuth,
      legacyId: 'gh_alice',
      newId: 'gh_bob',
      newAuth,
    });

    // Single atomic set covers both accounts + the active-account flip.
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.active_account_id).toBe('gh_bob');
    const accounts = setArg.accounts as Record<string, { auth: Auth }>;
    expect(accounts.gh_alice.auth).toEqual(legacyAuth); // PAT — pass-through, stays in local
    // SEC-5: the github_app access token is blanked in local and stashed in
    // chrome.storage.session under access_token:<id>.
    expect(accounts.gh_bob.auth).toEqual({ ...newAuth, accessToken: '' });
    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      'access_token:gh_bob': 'gho_bob',
    });

    // Legacy top-level key removed after the atomic write.
    expect(store.auth).toBeUndefined();
    expect((store.active_account_id as string)).toBe('gh_bob');
  });

  it('skips legacy migration when legacyAuth is null (first sign-in)', async () => {
    installStorageBacking({});
    const setSpy = chrome.storage.local.set as ReturnType<typeof vi.fn>;

    const newAuth: AuthPAT = { method: 'pat', token: 'pat_x', login: 'carol' };
    await migrateAndWriteAuth({
      legacyAuth: null,
      legacyId: null,
      newId: 'gh_carol',
      newAuth,
    });

    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.active_account_id).toBe('gh_carol');
    const accounts = setArg.accounts as Record<string, { auth: Auth }>;
    expect(Object.keys(accounts)).toEqual(['gh_carol']);
    expect(accounts.gh_carol.auth).toEqual(newAuth);

    // No legacy remove when there was no legacy to migrate.
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
});

describe('setAuthPAT — no gh_unknown fallback', () => {
  it('throws when /user fails and never writes accounts.gh_unknown.*', async () => {
    const store = installStorageBacking({});
    mockFetch(() => jsonResponse({ message: 'Bad credentials' }, 401));

    await expect(setAuthPAT('ghp_bad')).rejects.toThrow(/AUTH_USER_FETCH_FAILED/);

    // No storage write should have landed.
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(store.accounts).toBeUndefined();
    expect(store.auth).toBeUndefined();
  });

  it('uses knownLogin when provided, avoiding a duplicate /user fetch', async () => {
    installStorageBacking({});
    mockFetch(() => {
      throw new Error('fetch should not be called when knownLogin is passed');
    });

    await setAuthPAT('ghp_good', 'alice');

    // Verify the write landed under accounts.gh_alice, not gh_unknown.
    const setSpy = chrome.storage.local.set as ReturnType<typeof vi.fn>;
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    const accounts = setArg.accounts as Record<string, { auth: AuthPAT }>;
    expect(accounts.gh_alice).toBeDefined();
    expect(accounts.gh_alice.auth.login).toBe('alice');
    expect(accounts.gh_unknown).toBeUndefined();
  });
});

describe('add-account preserves the first account on legacy top-level storage', () => {
  it('migrateAndWriteAuth leaves both accounts visible to listAccountIds', async () => {
    installStorageBacking({
      auth: { method: 'pat', token: 'pat_alice', login: 'alice' },
    });

    // Simulate the add-account success path: A is on legacy top-level,
    // user authenticates as B. Runner calls migrateAndWriteAuth with
    // legacyId derived from A's login.
    await migrateAndWriteAuth({
      legacyAuth: { method: 'pat', token: 'pat_alice', login: 'alice' },
      legacyId: 'gh_alice',
      newId: 'gh_bob',
      newAuth: {
        method: 'github_app',
        accessToken: 'gho_bob',
        refreshToken: 'ghr_bob',
        accessTokenExpiresAt: Date.now() + 3600_000,
      refreshTokenExpiresAt: Date.now() + 86400_000,
        login: 'bob',
      },
    });

    const ids = await listAccountIds();
    expect(ids.sort()).toEqual(['gh_alice', 'gh_bob']);
  });
});
