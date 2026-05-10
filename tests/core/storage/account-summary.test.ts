import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAccountSummaries } from '../../../src/core/storage/account-summary';
import { STORAGE_KEYS_V2, setActiveAccountId } from '../../../src/core/storage/multi-account';

function makeStorage() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys == null) return { ...data };
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (k in data) out[k] = data[k];
      return out;
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete data[k];
    }),
  };
}

let local: ReturnType<typeof makeStorage>;

beforeEach(() => {
  local = makeStorage();
  chrome.storage.local.get = local.get as unknown as typeof chrome.storage.local.get;
  chrome.storage.local.set = local.set as unknown as typeof chrome.storage.local.set;
  chrome.storage.local.remove = local.remove as unknown as typeof chrome.storage.local.remove;
});

describe('getAccountSummaries', () => {
  it('returns [] on fresh install', async () => {
    expect(await getAccountSummaries()).toEqual([]);
  });

  it('returns one summary per signed-in account, insertion order', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_octocat: {
        auth: { method: 'github_app', accessToken: 't', refreshToken: 'r', accessTokenExpiresAt: 0, refreshTokenExpiresAt: 0 },
      },
      gh_acme: {
        auth: { method: 'pat', token: 'p' },
      },
    };
    const summaries = await getAccountSummaries();
    expect(summaries).toHaveLength(2);
    expect(summaries[0].id).toBe('gh_octocat');
    expect(summaries[0].login).toBe('octocat');
    expect(summaries[0].method).toBe('github_app');
    expect(summaries[0].host).toBe('');
    expect(summaries[0].suspended).toBe(false);
    expect(summaries[1].id).toBe('gh_acme');
    expect(summaries[1].method).toBe('pat');
  });

  it('skips accounts whose namespace exists but auth is missing', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_octocat: { pr_store: { prs: [], lastPollAt: 1 } },
    };
    expect(await getAccountSummaries()).toEqual([]);
  });

  it('parses GHES accountId into login + host', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_github_acme_corp_octocat: {
        auth: { method: 'github_app', accessToken: 't', refreshToken: 'r', accessTokenExpiresAt: 0, refreshTokenExpiresAt: 0 },
      },
    };
    const [s] = await getAccountSummaries();
    expect(s.login).toBe('octocat');
    expect(s.host).toBe('github.acme.corp');
  });

  it('flags suspended=true when every installation is suspended', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_octocat: {
        auth: {
          method: 'github_app',
          accessToken: 't',
          refreshToken: 'r',
          accessTokenExpiresAt: 0,
          refreshTokenExpiresAt: 0,
          installations: [
            { id: 1, account: { login: 'octocat', type: 'User' }, target_type: 'User', repository_selection: 'all', suspended_at: '2026-05-01T00:00:00Z' },
          ],
        },
      },
    };
    const [s] = await getAccountSummaries();
    expect(s.suspended).toBe(true);
  });

  it('flags suspended=false when any installation is active', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_octocat: {
        auth: {
          method: 'github_app',
          accessToken: 't',
          refreshToken: 'r',
          accessTokenExpiresAt: 0,
          refreshTokenExpiresAt: 0,
          installations: [
            { id: 1, account: { login: 'octocat', type: 'User' }, target_type: 'User', repository_selection: 'all', suspended_at: null },
            { id: 2, account: { login: 'acme', type: 'Organization' }, target_type: 'Organization', repository_selection: 'all', suspended_at: '2026-05-01T00:00:00Z' },
          ],
        },
      },
    };
    const [s] = await getAccountSummaries();
    expect(s.suspended).toBe(false);
  });

  it('coexists with active_account_id storage', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_a: { auth: { method: 'pat', token: 'p' } },
    };
    await setActiveAccountId('gh_a');
    const summaries = await getAccountSummaries();
    expect(summaries.map((s) => s.id)).toEqual(['gh_a']);
  });
});
