import { describe, it, expect, vi } from 'vitest';
import { loadSettings, saveSettings } from '../../src/core/settings-store';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../../src/core/constants';
import { STORAGE_KEYS_V2 } from '../../src/core/storage/multi-account';
import type { Settings } from '../../src/core/types';

describe('settings-store', () => {
  it('returns DEFAULT_SETTINGS when nothing stored', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    const result = await loadSettings();
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('returns v1 stored settings as fallback (pre-migration)', async () => {
    const stored: Settings = { intervalMinutes: 15 };
    chrome.storage.sync.get = vi.fn().mockImplementation(async (key: string) => {
      // Return v2 global empty so loadSettings falls through to v1.
      if (key === STORAGE_KEYS_V2.globalSettings) return {};
      if (key === STORAGE_KEYS.settings) return { [STORAGE_KEYS.settings]: stored };
      return {};
    });
    const result = await loadSettings();
    expect(result).toEqual(stored);
  });

  it('reads v2 split shape (global_settings) when present', async () => {
    chrome.storage.sync.get = vi.fn().mockImplementation(async (key: string) => {
      if (key === STORAGE_KEYS_V2.globalSettings) {
        return {
          [STORAGE_KEYS_V2.globalSettings]: {
            intervalMinutes: 60,
            enterpriseHost: 'github.acme.corp',
            enterpriseClientId: 'Iv23',
          },
        };
      }
      return {};
    });
    const result = await loadSettings();
    expect(result).toEqual({
      intervalMinutes: 60,
      enterpriseHost: 'github.acme.corp',
      enterpriseClientId: 'Iv23',
    });
  });

  it('saveSettings writes via global_settings (v2)', async () => {
    const data: Record<string, unknown> = {};
    chrome.storage.sync.get = vi.fn().mockImplementation(async (key: string) => {
      return { [key]: data[key] };
    });
    chrome.storage.sync.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    });
    const settings: Settings = { intervalMinutes: 1 };
    await saveSettings(settings);
    expect(data[STORAGE_KEYS_V2.globalSettings]).toEqual(
      expect.objectContaining({ intervalMinutes: 1 }),
    );
  });
});
