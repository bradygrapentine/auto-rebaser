import type { Settings } from './types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants';

export async function loadSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.settings);
  return (result[STORAGE_KEYS.settings] as Settings) ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.settings]: settings });
}

/** Story 4.6 alias — read-only accessor used by host-config.ts. */
export async function getSettings(): Promise<Settings> {
  return loadSettings();
}
