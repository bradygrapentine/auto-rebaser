import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAutomationSettings } from '../../../src/popup/hooks/useAutomationSettings';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';

vi.mock('../../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  saveAutomationSettings: vi.fn(),
}));

import {
  getAutomationSettings,
  saveAutomationSettings,
} from '../../../src/core/automations-store';

describe('useAutomationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (saveAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('starts with defaults and loading=true', () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    const { result } = renderHook(() => useAutomationSettings());
    expect(result.current.settings).toEqual(DEFAULT_AUTOMATION_SETTINGS);
    expect(result.current.loading).toBe(true);
  });

  it('loads stored settings on mount', async () => {
    const stored = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoEnableAutoMerge: true,
      mergeMethodPreference: ['REBASE', 'SQUASH', 'MERGE'] as Array<'REBASE' | 'SQUASH' | 'MERGE'>,
    };
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(stored);
    const { result } = renderHook(() => useAutomationSettings());
    await act(async () => {});
    expect(result.current.settings.autoEnableAutoMerge).toBe(true);
    expect(result.current.settings.mergeMethodPreference).toEqual(['REBASE', 'SQUASH', 'MERGE']);
    expect(result.current.loading).toBe(false);
  });

  it('falls back to defaults when storage rejects (Part A not yet merged)', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('not yet implemented')
    );
    const { result } = renderHook(() => useAutomationSettings());
    await act(async () => {});
    expect(result.current.settings).toEqual(DEFAULT_AUTOMATION_SETTINGS);
    expect(result.current.loading).toBe(false);
  });

  it('save merges patch onto current settings', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    const { result } = renderHook(() => useAutomationSettings());
    await act(async () => {});
    await act(async () => {
      await result.current.save({ autoEnableAutoMerge: true });
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoEnableAutoMerge: true,
    });
    expect(result.current.settings.autoEnableAutoMerge).toBe(true);
  });

  it('save updates local state', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    const { result } = renderHook(() => useAutomationSettings());
    await act(async () => {});
    await act(async () => {
      await result.current.save({ ignoredRepos: ['o/r'] });
    });
    expect(result.current.settings.ignoredRepos).toEqual(['o/r']);
  });

  // T1 regression cover — pre-fix, the hook only loaded settings on mount,
  // so a cross-context write to chrome.storage.sync (e.g. from another
  // popup mount or the SettingsView round-trip that surfaced live in the
  // reviewer-flow smoke) wouldn't refresh state. Stale flag values could
  // then overwrite real ones on the next save({...settings, ...patch}).
  it('refreshes state when chrome.storage.onChanged fires for the automations key', async () => {
    const initial = { ...DEFAULT_AUTOMATION_SETTINGS, enableReviewerTab: false };
    const updated = { ...DEFAULT_AUTOMATION_SETTINGS, enableReviewerTab: true };

    (getAutomationSettings as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useAutomationSettings());
    await act(async () => {});
    expect(result.current.settings.enableReviewerTab).toBe(false);

    // Fire the storage event as another context would.
    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>)
      .mock.calls.at(-1)?.[0];
    expect(listener).toBeDefined();
    await act(async () => {
      listener!(
        { automation_settings: { oldValue: initial, newValue: updated } },
        'sync',
      );
    });

    expect(result.current.settings.enableReviewerTab).toBe(true);
  });

  it('echo-guards onChanged events where newValue equals oldValue', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS,
    );
    renderHook(() => useAutomationSettings());
    await act(async () => {});

    const callCountBefore = (getAutomationSettings as ReturnType<typeof vi.fn>).mock.calls.length;
    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>)
      .mock.calls.at(-1)?.[0];
    await act(async () => {
      listener!(
        { automation_settings: { oldValue: DEFAULT_AUTOMATION_SETTINGS, newValue: DEFAULT_AUTOMATION_SETTINGS } },
        'sync',
      );
    });
    // No additional fetch — the echo guard skipped the reload.
    const callCountAfter = (getAutomationSettings as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callCountAfter).toBe(callCountBefore);
  });

  it('ignores onChanged events for other storage keys or areas', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS,
    );
    renderHook(() => useAutomationSettings());
    await act(async () => {});
    const callCountBefore = (getAutomationSettings as ReturnType<typeof vi.fn>).mock.calls.length;
    const listener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>)
      .mock.calls.at(-1)?.[0];

    // Wrong area.
    await act(async () => {
      listener!(
        { automation_settings: { oldValue: {}, newValue: { foo: 1 } } },
        'local',
      );
    });
    // Different key.
    await act(async () => {
      listener!(
        { some_other_key: { oldValue: 1, newValue: 2 } },
        'sync',
      );
    });
    expect((getAutomationSettings as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callCountBefore,
    );
  });

  it('removes the storage listener on unmount', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS,
    );
    const { unmount } = renderHook(() => useAutomationSettings());
    await act(async () => {});
    const addedListener = (chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>)
      .mock.calls.at(-1)?.[0];
    unmount();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(addedListener);
  });
});
