import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettings } from '../../../src/popup/hooks/useSettings';

vi.mock('../../../src/core/settings-store', () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

import { loadSettings, saveSettings } from '../../../src/core/settings-store';

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (loadSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ intervalMinutes: 5 });
    (saveSettings as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  });

  it('loads settings on mount', async () => {
    const { result } = renderHook(() => useSettings());
    await act(async () => {});
    expect(result.current.settings.intervalMinutes).toBe(5);
  });

  it('saveSettings calls core saveSettings', async () => {
    const { result } = renderHook(() => useSettings());
    await act(async () => {});
    await act(async () => {
      await result.current.saveSettings({ intervalMinutes: 15 });
    });
    expect(saveSettings).toHaveBeenCalledWith({ intervalMinutes: 15 });
  });

  it('saveSettings sends SET_INTERVAL message', async () => {
    const { result } = renderHook(() => useSettings());
    await act(async () => {});
    await act(async () => {
      await result.current.saveSettings({ intervalMinutes: 30 });
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SET_INTERVAL',
      intervalMinutes: 30,
    });
  });

  it('saveSettings updates local state', async () => {
    const { result } = renderHook(() => useSettings());
    await act(async () => {});
    await act(async () => {
      await result.current.saveSettings({ intervalMinutes: 1 });
    });
    expect(result.current.settings.intervalMinutes).toBe(1);
  });
});
