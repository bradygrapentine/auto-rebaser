import { describe, it, expect, vi } from 'vitest';
import { getToken, setToken, clearToken } from '../../src/core/auth-store';
import { STORAGE_KEYS } from '../../src/core/constants';

describe('auth-store', () => {
  it('getToken returns null when key missing', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({});
    const result = await getToken();
    expect(result).toBeNull();
  });

  it('getToken returns stored token', async () => {
    chrome.storage.sync.get = vi.fn().mockResolvedValue({ [STORAGE_KEYS.token]: 'my-token' });
    const result = await getToken();
    expect(result).toBe('my-token');
  });

  it('setToken writes correct key', async () => {
    chrome.storage.sync.set = vi.fn().mockResolvedValue(undefined);
    await setToken('abc123');
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [STORAGE_KEYS.token]: 'abc123' });
  });

  it('clearToken calls remove with correct key', async () => {
    chrome.storage.sync.remove = vi.fn().mockResolvedValue(undefined);
    await clearToken();
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith(STORAGE_KEYS.token);
  });
});
