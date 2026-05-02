import { STORAGE_KEYS } from './constants';

export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.token);
  return (result[STORAGE_KEYS.token] as string) ?? null;
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.token]: token });
}

export async function clearToken(): Promise<void> {
  await chrome.storage.sync.remove(STORAGE_KEYS.token);
}
