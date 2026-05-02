import { describe, it, expect, vi } from 'vitest';
import { loadSettings, saveSettings } from '../../src/core/settings-store';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../../src/core/constants';
import type { Settings } from '../../src/core/types';

describe('settings-store', () => {
  it('returns DEFAULT_SETTINGS when nothing stored', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    const result = await loadSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('returns stored settings', async () => {
    const stored: Settings = { intervalMinutes: 15 };
    chrome.storage.sync.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.settings]: stored });
    const result = await loadSettings();
    expect(result).toEqual(stored);
  });

  it('round-trips save/load', async () => {
    const data: Record<string, unknown> = {};
    chrome.storage.sync.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    });
    chrome.storage.sync.get = vi.fn().mockImplementation(async (key: string) => {
      return { [key]: data[key] };
    });

    const settings: Settings = { intervalMinutes: 30 };
    await saveSettings(settings);
    const loaded = await loadSettings();
    expect(loaded).toEqual(settings);
  });

  it('saveSettings writes only the settings key', async () => {
    chrome.storage.sync.set = vi.fn().mockResolvedValue(undefined);
    const settings: Settings = { intervalMinutes: 1 };
    await saveSettings(settings);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [STORAGE_KEYS.settings]: settings });
  });
});
