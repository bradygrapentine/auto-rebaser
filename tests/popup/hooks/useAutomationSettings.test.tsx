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
      autoMergeMethod: 'REBASE' as const,
    };
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(stored);
    const { result } = renderHook(() => useAutomationSettings());
    await act(async () => {});
    expect(result.current.settings.autoEnableAutoMerge).toBe(true);
    expect(result.current.settings.autoMergeMethod).toBe('REBASE');
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
});
