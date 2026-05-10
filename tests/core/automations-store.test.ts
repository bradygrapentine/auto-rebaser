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
    // Global half always written.
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ global_settings: expect.any(Object) }),
    );
    // No active account → falls back to v1 single-key write.
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      [AUTOMATION_STORAGE_KEYS.settings]: settings,
    });
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
