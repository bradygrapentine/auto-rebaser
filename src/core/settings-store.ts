import type { Settings } from './types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants';
import { getGlobalSetting, setGlobalSetting } from './storage/multi-account';

export async function loadSettings(): Promise<Settings> {
  const intervalMinutes = await getGlobalSetting('intervalMinutes');
  if (intervalMinutes !== undefined) {
    const enterpriseHost = await getGlobalSetting('enterpriseHost');
    const enterpriseClientId = await getGlobalSetting('enterpriseClientId');
    return {
      intervalMinutes,
      ...(enterpriseHost ? { enterpriseHost } : {}),
      ...(enterpriseClientId ? { enterpriseClientId } : {}),
    };
  }
  // Pre-migration / test fallback.
  const result = await chrome.storage.sync.get(STORAGE_KEYS.settings);
  return ((result ?? {})[STORAGE_KEYS.settings] as Settings) ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setGlobalSetting('intervalMinutes', settings.intervalMinutes);
  await setGlobalSetting('enterpriseHost', settings.enterpriseHost);
  await setGlobalSetting('enterpriseClientId', settings.enterpriseClientId);
}

/** Story 4.6 alias — read-only accessor used by host-config.ts. */
export async function getSettings(): Promise<Settings> {
  return loadSettings();
}
