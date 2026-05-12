import { describe, it, expect, vi } from 'vitest';
import {
  getAutomationSettings,
  saveAutomationSettings,
  getResolvedThreads,
  saveResolvedThreads,
} from '../../src/core/automations-store';
import {
  DEFAULT_AUTOMATION_SETTINGS,
  type AutomationSettings,
  type ResolvedThreadsStore,
} from '../../src/core/automations-types';
import { AUTOMATION_STORAGE_KEYS } from '../../src/core/automations-constants';

describe('automations-store', () => {
  it('exposes reviewer-automations defaults: OFF + empty allowlist', () => {
    expect(DEFAULT_AUTOMATION_SETTINGS.enableReviewerTab).toBe(false);
    expect(DEFAULT_AUTOMATION_SETTINGS.enableReviewerAutoMerge).toBe(false);
    expect(DEFAULT_AUTOMATION_SETTINGS.autoMergeReviewerOptInRepos).toEqual([]);
  });

  // ── getAutomationSettings ──────────────────────────────────────────────────

  it('returns DEFAULT_AUTOMATION_SETTINGS when nothing stored', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    const result = await getAutomationSettings();
    expect(result).toEqual(DEFAULT_AUTOMATION_SETTINGS);
  });

  it('merges stored partial with defaults (forward-compat: new fields filled by defaults)', async () => {
    // Simulate an old stored object missing newer fields
    const partial = { autoDeleteMergedBranch: false };
    chrome.storage.sync.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.settings]: partial });
    const result = await getAutomationSettings();
    // Stored values win for present fields
    expect(result.autoDeleteMergedBranch).toBe(false);
    // Default fills missing fields
    expect(result.autoEnableAutoMerge).toBe(DEFAULT_AUTOMATION_SETTINGS.autoEnableAutoMerge);
    expect(result.mergeMethodPreference).toEqual(
      DEFAULT_AUTOMATION_SETTINGS.mergeMethodPreference,
    );
    expect(result.autoResolveOutdatedThreads).toBe(
      DEFAULT_AUTOMATION_SETTINGS.autoResolveOutdatedThreads,
    );
  });

  // Story 5.4 migration tests
  it('migrates legacy autoMergeMethod=REBASE → mergeMethodPreference [REBASE, SQUASH, MERGE]', async () => {
    const legacy = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoMergeMethod: 'REBASE' as const,
    };
    // Strip the new field to simulate pre-5.4 storage
    delete (legacy as Partial<AutomationSettings>).mergeMethodPreference;
    chrome.storage.sync.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.settings]: legacy });
    const result = await getAutomationSettings();
    expect(result.mergeMethodPreference).toEqual(['REBASE', 'SQUASH', 'MERGE']);
    // Legacy field is dropped from the returned shape.
    expect((result as Partial<AutomationSettings> & { autoMergeMethod?: string }).autoMergeMethod).toBeUndefined();
  });

  it('migrates legacy autoMergeMethod=MERGE preserves user choice as first slot', async () => {
    const legacy = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoMergeMethod: 'MERGE' as const,
    };
    delete (legacy as Partial<AutomationSettings>).mergeMethodPreference;
    chrome.storage.sync.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.settings]: legacy });
    const result = await getAutomationSettings();
    expect(result.mergeMethodPreference[0]).toBe('MERGE');
    expect(result.mergeMethodPreference).toHaveLength(3);
  });

  it('does NOT migrate when mergeMethodPreference already present', async () => {
    const stored = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      mergeMethodPreference: ['MERGE'] as Array<'SQUASH' | 'MERGE' | 'REBASE'>,
      // Stale legacy field shouldn't override the new one.
      autoMergeMethod: 'REBASE' as const,
    };
    chrome.storage.sync.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.settings]: stored });
    const result = await getAutomationSettings();
    expect(result.mergeMethodPreference).toEqual(['MERGE']);
  });

  it('returns stored values for fields that are present', async () => {
    const stored: AutomationSettings = {
      ignoredRepos: ['org/repo-ignored'],
      enableIgnoredRepos: true,
      autoRebaseEnabled: false,
      autoRebaseOptOutRepos: ['org/repo-skip-rebase'],
      autoDeleteMergedBranch: false,
      autoDeleteOptOutRepos: ['org/repo-a'],
      autoEnableAutoMerge: true,
      mergeMethodPreference: ['REBASE', 'SQUASH', 'MERGE'],
      autoMergeOptOutRepos: ['org/repo-b'],
      autoResolveOutdatedThreads: true,
      autoResolveOptOutRepos: [],
      enableKeyboardShortcuts: false,
      enableStaleBadge: true,
      staleThresholdDays: 30,
      staleThresholdOverrides: { 'org/x': 7 },
      staleCountsAsAttention: false,
      enablePingReviewers: true,
      pingTemplate: 'hi {reviewers}',
      mergeCleanPRsImmediately: true,
      mergeCleanPRsOptOutRepos: ['org/repo-skip-merge-clean'],
      repoFilter: ['org/repo-a'],
      enablePushSinceApproval: true,
      enableRequestRereview: false,
      enableReviewerTab: false,
      enableReviewerAutoMerge: false,
      autoMergeReviewerOptInRepos: [],
      notificationsEnabled: false,
      notifyOnRebased: false,
      notifyOnConflicted: false,
      notifyOnMerged: false,
      notifyOnIdle: false,
      notifyOnPingConfirmed: false,
    };
    chrome.storage.sync.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.settings]: stored });
    const result = await getAutomationSettings();
    expect(result).toEqual(stored);
  });

  // ── saveAutomationSettings ────────────────────────────────────────────────

  it('writes to chrome.storage.sync under the v1 key when no active account (pre-migration)', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    chrome.storage.local.get = vi.fn().mockResolvedValue({});
    chrome.storage.sync.set = vi.fn().mockResolvedValue(undefined);
    const settings: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, autoEnableAutoMerge: true };
    await saveAutomationSettings(settings);
    // No active account → v1 single-key write ONLY. global_settings must NOT
    // be touched — writing it makes the next read take the v2 branch and
    // return DEFAULTS because perAccount is empty.
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      [AUTOMATION_STORAGE_KEYS.settings]: settings,
    });
  });

  it('round-trips autoRebaseEnabled=false through storage when no active account is set', async () => {
    // Reproduces the bug surfaced by the settings-persistence E2E: pre-migration
    // / no-active-account path used to leak `global_settings.ignoredRepos` as a
    // side effect of save, which made the next read take the v2 branch and
    // return DEFAULTS instead of the v1-fallback write.
    const storage: Record<string, unknown> = {};
    chrome.storage.sync.get = vi.fn(async (keys: unknown) => {
      if (keys == null) return { ...storage };
      const want = Array.isArray(keys) ? (keys as string[]) : [keys as string];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in storage) out[k] = storage[k];
      return out;
    }) as typeof chrome.storage.sync.get;
    chrome.storage.sync.set = vi.fn(async (patch: unknown) => {
      Object.assign(storage, patch as Record<string, unknown>);
    }) as typeof chrome.storage.sync.set;
    chrome.storage.local.get = vi.fn().mockResolvedValue({}); // no active_account_id

    const next: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, autoRebaseEnabled: false };
    await saveAutomationSettings(next);
    const round = await getAutomationSettings();
    expect(round.autoRebaseEnabled).toBe(false);
  });

  it('upgrade-from-old-build: returns v1 fallback values when global_settings is leaked and no active account', async () => {
    // FOLLOWUP-3 — read-side companion to PR #106. A user who saved settings
    // on a pre-#106 build has both `global_settings` (leaked write-side) AND
    // the v1 fallback blob in storage. Without this fix, getAutomationSettings
    // sees the leaked globals, takes the v2 branch, reads an empty perAccount,
    // and returns DEFAULTS — silently dropping the user's v1-blob settings.
    const storage: Record<string, unknown> = {
      global_settings: { ignoredRepos: [], enableKeyboardShortcuts: true },
      [AUTOMATION_STORAGE_KEYS.settings]: {
        ...DEFAULT_AUTOMATION_SETTINGS,
        autoRebaseEnabled: false,
        mergeCleanPRsImmediately: true,
      },
    };
    chrome.storage.sync.get = vi.fn(async (keys: unknown) => {
      if (keys == null) return { ...storage };
      const want = Array.isArray(keys) ? (keys as string[]) : [keys as string];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in storage) out[k] = storage[k];
      return out;
    }) as typeof chrome.storage.sync.get;
    chrome.storage.local.get = vi.fn().mockResolvedValue({}); // no active_account_id

    const result = await getAutomationSettings();
    expect(result.autoRebaseEnabled).toBe(false);
    expect(result.mergeCleanPRsImmediately).toBe(true);
  });

  // ── v2 path: active account ────────────────────────────────────────────────

  it('v2 read: merges DEFAULTS + perAccount + global ignoredRepos/keyboard', async () => {
    const syncStorage: Record<string, unknown> = {
      global_settings: {
        ignoredRepos: ['org/skip'],
        enableKeyboardShortcuts: false,
      },
      'per_account_settings:gh_octocat': {
        autoRebaseEnabled: false,
        autoEnableAutoMerge: true,
      },
    };
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      active_account_id: 'gh_octocat',
    });
    chrome.storage.sync.get = vi.fn(async (keys: unknown) => {
      if (keys == null) return { ...syncStorage };
      const want = Array.isArray(keys) ? (keys as string[]) : [keys as string];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in syncStorage) out[k] = syncStorage[k];
      return out;
    }) as typeof chrome.storage.sync.get;

    const result = await getAutomationSettings();
    expect(result.ignoredRepos).toEqual(['org/skip']);
    expect(result.enableKeyboardShortcuts).toBe(false);
    expect(result.autoRebaseEnabled).toBe(false);
    expect(result.autoEnableAutoMerge).toBe(true);
    // unknown fields fall back to defaults
    expect(result.autoDeleteMergedBranch).toBe(DEFAULT_AUTOMATION_SETTINGS.autoDeleteMergedBranch);
  });

  it('v2 save: writes global_settings + per-account split', async () => {
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      active_account_id: 'gh_octocat',
    });
    const setSync = vi.fn().mockResolvedValue(undefined);
    chrome.storage.sync.set = setSync as unknown as typeof chrome.storage.sync.set;
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});

    const next: AutomationSettings = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoRebaseEnabled: false,
      ignoredRepos: ['org/a', 'org/b'],
    };
    await saveAutomationSettings(next);

    const patches = setSync.mock.calls.map((c) => c[0]);
    const globalPatches = patches.filter((p) => 'global_settings' in p);
    expect(globalPatches.length).toBeGreaterThan(0);
    const perAccountPatch = patches.find((p) => 'per_account_settings:gh_octocat' in p);
    expect(perAccountPatch).toBeTruthy();
    expect(
      (perAccountPatch as Record<string, { autoRebaseEnabled: boolean }>)[
        'per_account_settings:gh_octocat'
      ].autoRebaseEnabled,
    ).toBe(false);
  });

  // ── getResolvedThreads ─────────────────────────────────────────────────────

  it('returns {} when nothing stored', async () => {
    chrome.storage.local.get = vi.fn().mockResolvedValue({});
    const result = await getResolvedThreads();
    expect(result).toEqual({});
  });

  it('returns stored map verbatim', async () => {
    const stored: ResolvedThreadsStore = { 'thread-1': 1714600000000, 'thread-2': 1714700000000 };
    chrome.storage.local.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.resolvedThreads]: stored });
    const result = await getResolvedThreads();
    expect(result).toEqual(stored);
  });

  // ── saveResolvedThreads ────────────────────────────────────────────────────

  it('overwrites correctly — second write wins', async () => {
    const data: Record<string, unknown> = {};
    chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    });
    chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => {
      return { [key]: data[key] };
    });

    const first: ResolvedThreadsStore = { 'thread-1': 1000 };
    const second: ResolvedThreadsStore = { 'thread-2': 2000 };
    await saveResolvedThreads(first);
    await saveResolvedThreads(second);
    const result = await getResolvedThreads();
    // second write completely overwrites
    expect(result).toEqual(second);
    expect(result['thread-1']).toBeUndefined();
  });
});
