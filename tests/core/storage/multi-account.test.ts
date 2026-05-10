import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  STORAGE_KEYS_V2,
  buildAccountId,
  getActiveAccountId,
  setActiveAccountId,
  listAccountIds,
  getAccountState,
  setAccountState,
  removeAccount,
  getGlobalSetting,
  setGlobalSetting,
  getPerAccountSetting,
  setPerAccountSetting,
  __testing,
} from '../../../src/core/storage/multi-account';

// In-memory fake for chrome.storage.{local,sync}. Each test gets a fresh pair.
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

beforeEach(() => {
  const local = makeStorage();
  const sync = makeStorage();
  chrome.storage.local.get = local.get as unknown as typeof chrome.storage.local.get;
  chrome.storage.local.set = local.set as unknown as typeof chrome.storage.local.set;
  chrome.storage.local.remove = local.remove as unknown as typeof chrome.storage.local.remove;
  chrome.storage.sync.get = sync.get as unknown as typeof chrome.storage.sync.get;
  chrome.storage.sync.set = sync.set as unknown as typeof chrome.storage.sync.set;
  chrome.storage.sync.remove = sync.remove as unknown as typeof chrome.storage.sync.remove;
});

describe('buildAccountId', () => {
  it('builds gh_<login> for cloud', () => {
    expect(buildAccountId('Octocat')).toBe('gh_octocat');
  });

  it('lowercases login and trims', () => {
    expect(buildAccountId('  ACME-Bot  ')).toBe('gh_acme-bot');
  });

  it('builds gh_<host>_<login> for GHES, dots → underscores', () => {
    expect(buildAccountId('octocat', 'github.acme.corp')).toBe('gh_github_acme_corp_octocat');
  });
});

describe('active account', () => {
  it('returns null on fresh install', async () => {
    expect(await getActiveAccountId()).toBeNull();
  });

  it('round-trips active id', async () => {
    await setActiveAccountId('gh_octocat');
    expect(await getActiveAccountId()).toBe('gh_octocat');
  });

  it('listAccountIds returns [] when no accounts namespace', async () => {
    expect(await listAccountIds()).toEqual([]);
  });
});

describe('per-account state', () => {
  it('round-trips a value for a given account+key', async () => {
    const prStore = { prs: [], lastPollAt: 123 } as never;
    await setAccountState('gh_octocat', 'pr_store', prStore);
    expect(await getAccountState('gh_octocat', 'pr_store')).toEqual(prStore);
  });

  it('creates a new account namespace without touching siblings', async () => {
    await setAccountState('gh_octocat', 'pr_store', { prs: [], lastPollAt: 1 } as never);
    await setAccountState('gh_acme', 'pr_store', { prs: [], lastPollAt: 2 } as never);
    expect((await getAccountState('gh_octocat', 'pr_store')) as { lastPollAt: number }).toEqual({
      prs: [],
      lastPollAt: 1,
    });
    expect(await listAccountIds()).toEqual(['gh_octocat', 'gh_acme']);
  });

  it('returns undefined for a key not yet written', async () => {
    expect(await getAccountState('gh_octocat', 'auth')).toBeUndefined();
  });
});

describe('removeAccount', () => {
  it('drops local namespace and sync settings + index entry', async () => {
    await setAccountState('gh_octocat', 'pr_store', { prs: [], lastPollAt: 1 } as never);
    await setAccountState('gh_acme', 'pr_store', { prs: [], lastPollAt: 2 } as never);
    await setPerAccountSetting('gh_octocat', 'autoEnableAutoMerge', true);
    await setPerAccountSetting('gh_acme', 'autoEnableAutoMerge', true);
    await setActiveAccountId('gh_octocat');

    await removeAccount('gh_octocat');

    expect(await listAccountIds()).toEqual(['gh_acme']);
    // Active id falls back to first remaining account.
    expect(await getActiveAccountId()).toBe('gh_acme');
    // Sync settings key for the removed account is gone.
    expect(await getPerAccountSetting('gh_octocat', 'autoEnableAutoMerge')).toBeUndefined();
    // Index updated.
    const syncSnap = await chrome.storage.sync.get(STORAGE_KEYS_V2.perAccountSettingsIndex);
    expect(syncSnap[STORAGE_KEYS_V2.perAccountSettingsIndex]).toEqual(['gh_acme']);
  });

  it('sets active to null when removing the last account', async () => {
    await setAccountState('gh_only', 'pr_store', { prs: [], lastPollAt: 1 } as never);
    await setActiveAccountId('gh_only');
    await removeAccount('gh_only');
    expect(await getActiveAccountId()).toBeNull();
  });
});

describe('global settings', () => {
  it('round-trips a global setting', async () => {
    await setGlobalSetting('intervalMinutes', 5);
    expect(await getGlobalSetting('intervalMinutes')).toBe(5);
  });

  it('returns undefined when unset', async () => {
    expect(await getGlobalSetting('intervalMinutes')).toBeUndefined();
  });

  it('preserves siblings on partial write', async () => {
    await setGlobalSetting('intervalMinutes', 5);
    await setGlobalSetting('enableKeyboardShortcuts', false);
    expect(await getGlobalSetting('intervalMinutes')).toBe(5);
    expect(await getGlobalSetting('enableKeyboardShortcuts')).toBe(false);
  });
});

describe('per-account settings', () => {
  it('writes to a separate sync key per account', async () => {
    await setPerAccountSetting('gh_octocat', 'autoEnableAutoMerge', true);
    await setPerAccountSetting('gh_acme', 'autoEnableAutoMerge', false);
    expect(await getPerAccountSetting('gh_octocat', 'autoEnableAutoMerge')).toBe(true);
    expect(await getPerAccountSetting('gh_acme', 'autoEnableAutoMerge')).toBe(false);
  });

  it('updates per_account_settings_index', async () => {
    await setPerAccountSetting('gh_octocat', 'autoEnableAutoMerge', true);
    await setPerAccountSetting('gh_acme', 'autoEnableAutoMerge', true);
    const snap = await chrome.storage.sync.get(STORAGE_KEYS_V2.perAccountSettingsIndex);
    expect(snap[STORAGE_KEYS_V2.perAccountSettingsIndex]).toEqual(['gh_octocat', 'gh_acme']);
  });

  it('does not duplicate index entries on re-write', async () => {
    await setPerAccountSetting('gh_octocat', 'autoEnableAutoMerge', true);
    await setPerAccountSetting('gh_octocat', 'autoEnableAutoMerge', false);
    const snap = await chrome.storage.sync.get(STORAGE_KEYS_V2.perAccountSettingsIndex);
    expect(snap[STORAGE_KEYS_V2.perAccountSettingsIndex]).toEqual(['gh_octocat']);
  });

  it('uses the per_account_settings:<id> key shape', () => {
    expect(__testing.perAccountSettingsKey('gh_octocat')).toBe(
      'per_account_settings:gh_octocat',
    );
  });

  it('quota assertion: 50 opt-out repos × 4 lists fits in 8 KB', async () => {
    const repos = Array.from({ length: 50 }, (_, i) => `org${i}/repo${i}-with-longer-name`);
    await setPerAccountSetting('gh_octocat', 'autoRebaseOptOutRepos', repos);
    await setPerAccountSetting('gh_octocat', 'autoDeleteOptOutRepos', repos);
    await setPerAccountSetting('gh_octocat', 'autoMergeOptOutRepos', repos);
    await setPerAccountSetting('gh_octocat', 'mergeCleanPRsOptOutRepos', repos);
    const snap = await chrome.storage.sync.get(__testing.perAccountSettingsKey('gh_octocat'));
    const size = new TextEncoder().encode(
      JSON.stringify(snap[__testing.perAccountSettingsKey('gh_octocat')]),
    ).length;
    expect(size).toBeLessThan(8192);
  });
});
