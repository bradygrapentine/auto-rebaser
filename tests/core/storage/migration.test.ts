import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runMigrationIfNeeded } from '../../../src/core/storage/migration';
import { STORAGE_KEYS_V2, STORAGE_VERSION } from '../../../src/core/storage/multi-account';

vi.mock('../../../src/github/http', () => ({
  request: vi.fn(),
}));
import { request } from '../../../src/github/http';
const mockedRequest = vi.mocked(request);

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
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
let sync: ReturnType<typeof makeStorage>;

function install(localInit: Record<string, unknown>, syncInit: Record<string, unknown>) {
  local = makeStorage(localInit);
  sync = makeStorage(syncInit);
  chrome.storage.local.get = local.get as unknown as typeof chrome.storage.local.get;
  chrome.storage.local.set = local.set as unknown as typeof chrome.storage.local.set;
  chrome.storage.local.remove = local.remove as unknown as typeof chrome.storage.local.remove;
  chrome.storage.sync.get = sync.get as unknown as typeof chrome.storage.sync.get;
  chrome.storage.sync.set = sync.set as unknown as typeof chrome.storage.sync.set;
  chrome.storage.sync.remove = sync.remove as unknown as typeof chrome.storage.sync.remove;
}

beforeEach(() => {
  mockedRequest.mockReset();
});

describe('runMigrationIfNeeded — fresh install', () => {
  it('stamps storage_version and exits with no accounts written', async () => {
    install({}, {});
    await runMigrationIfNeeded();
    expect(local.data[STORAGE_KEYS_V2.storageVersion]).toBe(STORAGE_VERSION);
    expect(sync.data[STORAGE_KEYS_V2.storageVersion]).toBe(STORAGE_VERSION);
    expect(local.data[STORAGE_KEYS_V2.accounts]).toBeUndefined();
    expect(local.data[STORAGE_KEYS_V2.activeAccountId]).toBeUndefined();
  });
});

describe('runMigrationIfNeeded — idempotent', () => {
  it('exits immediately when local storage_version is already 2', async () => {
    install({ [STORAGE_KEYS_V2.storageVersion]: STORAGE_VERSION }, {});
    await runMigrationIfNeeded();
    expect(local.set).not.toHaveBeenCalled();
    expect(sync.set).not.toHaveBeenCalled();
  });
});

describe('runMigrationIfNeeded — full v1 → v2', () => {
  const v1Local = {
    auth: {
      method: 'github_app',
      accessToken: 'tok',
      refreshToken: 'rt',
      accessTokenExpiresAt: 1,
      refreshTokenExpiresAt: 2,
      installations: [],
    },
    pr_store: { prs: [], lastPollAt: 999 },
    etags: { 'https://api/x': { etag: '"abc"', data: {} } },
    activity: { entries: [{ at: 1, action: 'rebase', repo: 'a/b', prNumber: 1, prTitle: 't', result: 'success' }] },
    pingedPRs: { 42: { at: 1700000000000 } },
    resolved_threads: { 'thread-1': 1700000000000 },
    known_repos: ['org/a', 'org/b'],
  };

  const v1Sync = {
    settings: { intervalMinutes: 10, enterpriseHost: 'github.acme.corp', enterpriseClientId: 'Iv23' },
    automation_settings: {
      ignoredRepos: ['org/ignored'],
      enableKeyboardShortcuts: false,
      autoRebaseEnabled: true,
      autoRebaseOptOutRepos: ['org/skip-rebase'],
      autoDeleteMergedBranch: true,
      autoDeleteOptOutRepos: [],
      autoEnableAutoMerge: true,
      mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
      autoMergeOptOutRepos: [],
      mergeCleanPRsImmediately: false,
      mergeCleanPRsOptOutRepos: [],
      autoResolveOutdatedThreads: false,
      autoResolveOptOutRepos: [],
      enableStaleBadge: true,
      staleThresholdDays: 14,
      staleThresholdOverrides: {},
      staleCountsAsAttention: false,
      enablePingReviewers: false,
      pingTemplate: 'hi',
    },
    migration_banner_dismissed: true,
  };

  beforeEach(() => {
    install({ ...v1Local }, { ...v1Sync });
    mockedRequest.mockResolvedValue({ login: 'Octocat' });
  });

  it('migrates auth/pr_store/activity/pingedPRs/resolved_threads under accounts.<id>', async () => {
    await runMigrationIfNeeded();
    const expectedId = 'gh_github_acme_corp_octocat';
    expect(local.data[STORAGE_KEYS_V2.activeAccountId]).toBe(expectedId);
    const accounts = local.data[STORAGE_KEYS_V2.accounts] as Record<string, unknown>;
    const account = accounts[expectedId] as Record<string, unknown>;
    expect(account.auth).toEqual(v1Local.auth);
    expect(account.pr_store).toEqual(v1Local.pr_store);
    expect(account.activity).toEqual(v1Local.activity);
    expect(account.pingedPRs).toEqual(v1Local.pingedPRs);
    expect(account.resolved_threads).toEqual(v1Local.resolved_threads);
  });

  it('keeps known_repos at the top level (not under accounts)', async () => {
    await runMigrationIfNeeded();
    expect(local.data[STORAGE_KEYS_V2.knownRepos]).toEqual(['org/a', 'org/b']);
    const accounts = local.data[STORAGE_KEYS_V2.accounts] as Record<string, unknown>;
    const account = accounts['gh_github_acme_corp_octocat'] as Record<string, unknown>;
    expect(account.known_repos).toBeUndefined();
  });

  it('drops etags entirely', async () => {
    await runMigrationIfNeeded();
    expect(local.data.etags).toBeUndefined();
    const accounts = local.data[STORAGE_KEYS_V2.accounts] as Record<string, unknown>;
    const account = accounts['gh_github_acme_corp_octocat'] as Record<string, unknown>;
    expect(account.etags).toBeUndefined();
  });

  it('writes _migration_backup_v1 with all v1 keys + backed_up_at', async () => {
    await runMigrationIfNeeded();
    const backup = local.data[STORAGE_KEYS_V2.migrationBackupV1] as Record<string, unknown>;
    expect(backup.auth).toEqual(v1Local.auth);
    expect(backup.pr_store).toEqual(v1Local.pr_store);
    expect(backup.etags).toEqual(v1Local.etags);
    expect(backup.automation_settings).toEqual(v1Sync.automation_settings);
    expect(typeof backup.backed_up_at).toBe('number');
  });

  it('splits automation_settings into global vs per-account', async () => {
    await runMigrationIfNeeded();
    const global = sync.data[STORAGE_KEYS_V2.globalSettings] as Record<string, unknown>;
    expect(global.intervalMinutes).toBe(10);
    expect(global.ignoredRepos).toEqual(['org/ignored']);
    expect(global.enableKeyboardShortcuts).toBe(false);
    expect(global.enterpriseHost).toBe('github.acme.corp');
    expect(global.enterpriseClientId).toBe('Iv23');

    const perAccountKey = `${STORAGE_KEYS_V2.perAccountSettingsPrefix}gh_github_acme_corp_octocat`;
    const perAccount = sync.data[perAccountKey] as Record<string, unknown>;
    expect(perAccount.autoRebaseEnabled).toBe(true);
    expect(perAccount.autoRebaseOptOutRepos).toEqual(['org/skip-rebase']);
    // Global keys must NOT appear in per-account.
    expect(perAccount.ignoredRepos).toBeUndefined();
    expect(perAccount.enableKeyboardShortcuts).toBeUndefined();
  });

  it('populates per_account_settings_index', async () => {
    await runMigrationIfNeeded();
    expect(sync.data[STORAGE_KEYS_V2.perAccountSettingsIndex]).toEqual([
      'gh_github_acme_corp_octocat',
    ]);
  });

  it('preserves migration_banner_dismissed (PAT-migration banner)', async () => {
    await runMigrationIfNeeded();
    expect(sync.data[STORAGE_KEYS_V2.migrationBannerDismissed]).toBe(true);
  });

  it('removes old top-level keys from local + sync', async () => {
    await runMigrationIfNeeded();
    expect(local.data.auth).toBeUndefined();
    expect(local.data.pr_store).toBeUndefined();
    expect(local.data.etags).toBeUndefined();
    expect(local.data.activity).toBeUndefined();
    expect(local.data.pingedPRs).toBeUndefined();
    expect(local.data.resolved_threads).toBeUndefined();
    expect(sync.data.settings).toBeUndefined();
    expect(sync.data.automation_settings).toBeUndefined();
  });

  it('stamps storage_version=2 on both surfaces', async () => {
    await runMigrationIfNeeded();
    expect(local.data[STORAGE_KEYS_V2.storageVersion]).toBe(STORAGE_VERSION);
    expect(sync.data[STORAGE_KEYS_V2.storageVersion]).toBe(STORAGE_VERSION);
  });

  it('is idempotent — second call is a no-op', async () => {
    await runMigrationIfNeeded();
    sync.set.mockClear();
    local.set.mockClear();
    mockedRequest.mockClear();
    await runMigrationIfNeeded();
    expect(local.set).not.toHaveBeenCalled();
    expect(sync.set).not.toHaveBeenCalled();
    expect(mockedRequest).not.toHaveBeenCalled();
  });
});

describe('runMigrationIfNeeded — account-id derivation', () => {
  it('cloud GitHub account: gh_<lowercased login>', async () => {
    install(
      {
        auth: {
          method: 'github_app',
          accessToken: 't',
          refreshToken: 'r',
          accessTokenExpiresAt: 0,
          refreshTokenExpiresAt: 0,
          installations: [],
        },
      },
      {},
    );
    mockedRequest.mockResolvedValue({ login: 'Octocat' });
    await runMigrationIfNeeded();
    expect(local.data[STORAGE_KEYS_V2.activeAccountId]).toBe('gh_octocat');
  });

  it('PAT auth path derives id the same way', async () => {
    install({ auth: { method: 'pat', token: 'pat-tok', notificationsScopeGranted: false } }, {});
    mockedRequest.mockResolvedValue({ login: 'patuser' });
    await runMigrationIfNeeded();
    expect(local.data[STORAGE_KEYS_V2.activeAccountId]).toBe('gh_patuser');
  });

  it('GET /user failure → gh_unknown placeholder', async () => {
    install(
      {
        auth: {
          method: 'github_app',
          accessToken: 't',
          refreshToken: 'r',
          accessTokenExpiresAt: 0,
          refreshTokenExpiresAt: 0,
          installations: [],
        },
      },
      {},
    );
    mockedRequest.mockRejectedValue(new Error('network down'));
    await runMigrationIfNeeded();
    expect(local.data[STORAGE_KEYS_V2.activeAccountId]).toBe('gh_unknown');
  });
});

describe('runMigrationIfNeeded — legacy github_token only', () => {
  it('treats stale legacy token without auth as fresh install (no migration)', async () => {
    install({}, { github_token: 'legacy-pat' });
    await runMigrationIfNeeded();
    // No account derived (no auth to query /user with).
    expect(local.data[STORAGE_KEYS_V2.accounts]).toBeUndefined();
    expect(local.data[STORAGE_KEYS_V2.storageVersion]).toBe(STORAGE_VERSION);
  });
});

describe('runMigrationIfNeeded — failure recovery', () => {
  it('mid-write failure leaves storage_version unset and backup intact for retry', async () => {
    install(
      {
        auth: {
          method: 'github_app',
          accessToken: 't',
          refreshToken: 'r',
          accessTokenExpiresAt: 0,
          refreshTokenExpiresAt: 0,
          installations: [],
        },
        pr_store: { prs: [], lastPollAt: 1 },
      },
      {},
    );
    mockedRequest.mockResolvedValue({ login: 'octocat' });

    let calls = 0;
    const realSet = local.set;
    chrome.storage.local.set = vi.fn(async (obj: Record<string, unknown>) => {
      calls += 1;
      if (calls === 2) throw new Error('storage write failed');
      return realSet(obj);
    }) as unknown as typeof chrome.storage.local.set;

    await expect(runMigrationIfNeeded()).rejects.toThrow('storage write failed');

    // Backup landed; version not stamped; v1 keys still in place for retry.
    expect(local.data[STORAGE_KEYS_V2.migrationBackupV1]).toBeDefined();
    expect(local.data[STORAGE_KEYS_V2.storageVersion]).toBeUndefined();
    expect(local.data.auth).toBeDefined();
    expect(local.data.pr_store).toBeDefined();
  });
});
