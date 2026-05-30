import { describe, it, expect, vi } from 'vitest';
import { getEntry, setEntry, MAX_ENTRIES, EVICT_BATCH } from '../../src/core/etag-cache';
import { STORAGE_KEYS } from '../../src/core/constants';
import { STORAGE_KEYS_V2 } from '../../src/core/storage/multi-account';

function makeMockStore() {
  const store: Record<string, unknown> = {};
  chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => ({ [key]: store[key] }));
  chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
    Object.assign(store, obj);
  });
  return store;
}

describe('etag-cache', () => {
  it('returns null on cache miss', async () => {
    chrome.storage.local.get = vi.fn().mockResolvedValue({});
    const result = await getEntry('https://api.github.com/user');
    expect(result).toBeNull();
  });

  it('returns null when url not in cache map', async () => {
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      [STORAGE_KEYS.etags]: { 'https://other.com': { etag: 'abc', data: {} } },
    });
    const result = await getEntry('https://api.github.com/user');
    expect(result).toBeNull();
  });

  it('round-trips set/get', async () => {
    const store: Record<string, unknown> = {};
    chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => {
      return { [key]: store[key] };
    });
    chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(store, obj);
    });

    const url = 'https://api.github.com/repos/a/b/pulls/1';
    const entry = { etag: '"abc123"', data: { id: 1 } };
    await setEntry(url, entry);

    const result = await getEntry(url);
    expect(result).toEqual(entry);
  });

  it('setEntry preserves other entries (no clobber)', async () => {
    const existing = {
      'https://other-url.com': { etag: '"xyz"', data: { existing: true } },
    };
    const store: Record<string, unknown> = { [STORAGE_KEYS.etags]: existing };

    chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => {
      return { [key]: store[key] };
    });
    chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(store, obj);
    });

    const newUrl = 'https://api.github.com/user';
    await setEntry(newUrl, { etag: '"new"', data: { login: 'me' } });

    const map = store[STORAGE_KEYS.etags] as Record<string, unknown>;
    expect(map['https://other-url.com']).toEqual({ etag: '"xyz"', data: { existing: true } });
    expect(map[newUrl]).toEqual({ etag: '"new"', data: { login: 'me' } });
  });

  describe('eviction', () => {
    it('does not evict below MAX_ENTRIES', async () => {
      const store = makeMockStore();
      for (let i = 0; i < MAX_ENTRIES; i++) {
        await setEntry(`url-${i}`, { etag: `"e${i}"`, data: i });
      }
      const map = store[STORAGE_KEYS.etags] as Record<string, unknown>;
      expect(Object.keys(map)).toHaveLength(MAX_ENTRIES);
    });

    it('evicts the oldest EVICT_BATCH entries when over MAX_ENTRIES', async () => {
      const store = makeMockStore();
      for (let i = 0; i < MAX_ENTRIES + 1; i++) {
        await setEntry(`url-${i}`, { etag: `"e${i}"`, data: i });
      }
      const map = store[STORAGE_KEYS.etags] as Record<string, unknown>;
      // After eviction, MAX_ENTRIES + 1 - EVICT_BATCH entries remain.
      expect(Object.keys(map)).toHaveLength(MAX_ENTRIES + 1 - EVICT_BATCH);
      // The first EVICT_BATCH urls were dropped.
      expect(map['url-0']).toBeUndefined();
      expect(map[`url-${EVICT_BATCH - 1}`]).toBeUndefined();
      expect(map[`url-${EVICT_BATCH}`]).toBeDefined();
      expect(map[`url-${MAX_ENTRIES}`]).toBeDefined();
    });

    it('re-setting an existing url does not grow the cache', async () => {
      const store = makeMockStore();
      for (let i = 0; i < MAX_ENTRIES; i++) {
        await setEntry(`url-${i}`, { etag: `"e${i}"`, data: i });
      }
      // Re-set an existing entry — should not trigger eviction since size doesn't grow.
      await setEntry('url-50', { etag: '"updated"', data: 'fresh' });

      const map = store[STORAGE_KEYS.etags] as Record<string, unknown>;
      expect(Object.keys(map)).toHaveLength(MAX_ENTRIES);
      expect(map['url-50']).toEqual({ etag: '"updated"', data: 'fresh' });
      expect(map['url-0']).toBeDefined();
    });

    it('re-setting moves an entry to most-recent position so it survives eviction', async () => {
      const store = makeMockStore();
      // Fill cache.
      for (let i = 0; i < MAX_ENTRIES; i++) {
        await setEntry(`url-${i}`, { etag: `"e${i}"`, data: i });
      }
      // Bump url-0 to most-recent.
      await setEntry('url-0', { etag: '"refreshed"', data: 0 });
      // Add one more, triggering eviction of the (now) oldest batch.
      await setEntry('url-new', { etag: '"new"', data: 'new' });

      const map = store[STORAGE_KEYS.etags] as Record<string, unknown>;
      // url-0 should still be present because it was bumped.
      expect(map['url-0']).toEqual({ etag: '"refreshed"', data: 0 });
      // url-1 .. url-50 should have been evicted (oldest after the bump).
      expect(map['url-1']).toBeUndefined();
      expect(map['url-new']).toBeDefined();
    });
  });

  // Per-account scoping is the cross-account-leak guard: with an explicit
  // accountId, the cache lives under the v2 accounts namespace, keyed by id —
  // so account A's cached 304 body can never be returned to account B.
  describe('per-account scoping', () => {
    it('getEntry reads from the v2 accounts namespace for an explicit accountId', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({
        [STORAGE_KEYS_V2.accounts]: {
          'acct-1': { [STORAGE_KEYS.etags]: { 'https://api.github.com/user': { etag: '"a1"', data: { who: 'one' } } } },
          'acct-2': { [STORAGE_KEYS.etags]: { 'https://api.github.com/user': { etag: '"a2"', data: { who: 'two' } } } },
        },
      });
      const r1 = await getEntry('https://api.github.com/user', 'acct-1');
      const r2 = await getEntry('https://api.github.com/user', 'acct-2');
      expect(r1).toEqual({ etag: '"a1"', data: { who: 'one' } });
      expect(r2).toEqual({ etag: '"a2"', data: { who: 'two' } });
    });

    it('getEntry returns null when the account has no etag map yet', async () => {
      chrome.storage.local.get = vi.fn().mockResolvedValue({
        [STORAGE_KEYS_V2.accounts]: { 'acct-1': {} },
      });
      const result = await getEntry('https://api.github.com/user', 'acct-1');
      expect(result).toBeNull();
    });

    it('setEntry writes under the account id and preserves sibling accounts', async () => {
      const store: Record<string, unknown> = {
        [STORAGE_KEYS_V2.accounts]: {
          'acct-2': { [STORAGE_KEYS.etags]: { 'https://x.com': { etag: '"keep"', data: { other: true } } } },
        },
      };
      chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => ({ [key]: store[key] }));
      chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      });

      await setEntry('https://api.github.com/user', { etag: '"new"', data: { who: 'one' } }, 'acct-1');

      const accounts = store[STORAGE_KEYS_V2.accounts] as Record<string, Record<string, unknown>>;
      // The new entry landed under acct-1.
      const a1 = accounts['acct-1'][STORAGE_KEYS.etags] as Record<string, unknown>;
      expect(a1['https://api.github.com/user']).toEqual({ etag: '"new"', data: { who: 'one' } });
      // acct-2's pre-existing cache is untouched (no cross-account clobber).
      const a2 = accounts['acct-2'][STORAGE_KEYS.etags] as Record<string, unknown>;
      expect(a2['https://x.com']).toEqual({ etag: '"keep"', data: { other: true } });
    });

    it('round-trips set/get scoped to the same account', async () => {
      const store: Record<string, unknown> = {};
      chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => ({ [key]: store[key] }));
      chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      });

      const url = 'https://api.github.com/repos/a/b/pulls/1';
      const entry = { etag: '"abc123"', data: { id: 1 } };
      await setEntry(url, entry, 'acct-9');
      const result = await getEntry(url, 'acct-9');
      expect(result).toEqual(entry);
      // A different account does not see acct-9's cache.
      expect(await getEntry(url, 'acct-other')).toBeNull();
    });
  });
});
