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
    const partial = { autoDeleteMergedBranch: false, autoMergeMethod: 'MERGE' };
    chrome.storage.sync.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.settings]: partial });
    const result = await getAutomationSettings();
    // Stored values win for present fields
    expect(result.autoDeleteMergedBranch).toBe(false);
    expect(result.autoMergeMethod).toBe('MERGE');
    // Default fills missing fields
    expect(result.autoEnableAutoMerge).toBe(DEFAULT_AUTOMATION_SETTINGS.autoEnableAutoMerge);
    expect(result.autoResolveOutdatedThreads).toBe(
      DEFAULT_AUTOMATION_SETTINGS.autoResolveOutdatedThreads,
    );
    expect(result.notificationsScopeGranted).toBe(
      DEFAULT_AUTOMATION_SETTINGS.notificationsScopeGranted,
    );
  });

  it('returns stored values for fields that are present', async () => {
    const stored: AutomationSettings = {
      ignoredRepos: ['org/repo-ignored'],
      autoDeleteMergedBranch: false,
      autoDeleteOptOutRepos: ['org/repo-a'],
      autoEnableAutoMerge: true,
      autoMergeMethod: 'REBASE',
      autoMergeOptOutRepos: ['org/repo-b'],
      autoResolveOutdatedThreads: true,
      autoResolveOptOutRepos: [],
      autoDismissStaleNotifications: true,
      unsubscribeStalePRNotifications: true,
      autoDismissOptOutRepos: [],
      notificationsScopeGranted: true,
    };
    chrome.storage.sync.get = vi
      .fn()
      .mockResolvedValue({ [AUTOMATION_STORAGE_KEYS.settings]: stored });
    const result = await getAutomationSettings();
    expect(result).toEqual(stored);
  });

  // ── saveAutomationSettings ────────────────────────────────────────────────

  it('writes to chrome.storage.sync under the correct key', async () => {
    chrome.storage.sync.set = vi.fn().mockResolvedValue(undefined);
    const settings: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, autoEnableAutoMerge: true };
    await saveAutomationSettings(settings);
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
