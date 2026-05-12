import { STORAGE_KEYS } from './constants';
import { getActiveAccountId, STORAGE_KEYS_V2 } from './storage/multi-account';

export interface ETagEntry {
  etag: string;
  data: unknown;
}

type ETagMap = Record<string, ETagEntry>;

/** Maximum cache entries before eviction kicks in. Bounds chrome.storage.local growth. */
export const MAX_ENTRIES = 200;
/** Number of oldest entries dropped when MAX_ENTRIES is exceeded. */
export const EVICT_BATCH = 50;

// Per-account ETag cache. Keyed by accountId (or '' for the legacy
// pre-migration path) under the v2 accounts namespace. Without this scoping,
// account A polls /search/issues?author=@me, GitHub returns ETag X + A's PRs;
// account B polls the same URL, sends If-None-Match X, and on 304 we return
// A's cached body to B — the cross-account leak.

async function loadMap(): Promise<ETagMap> {
  const id = await getActiveAccountId();
  if (id) {
    const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
    const accounts = (result[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, Record<string, unknown>>;
    return (accounts[id]?.[STORAGE_KEYS.etags] as ETagMap) ?? {};
  }
  const result = await chrome.storage.local.get(STORAGE_KEYS.etags);
  return (result[STORAGE_KEYS.etags] as ETagMap) ?? {};
}

async function saveMap(map: ETagMap): Promise<void> {
  const id = await getActiveAccountId();
  if (id) {
    const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
    const accounts = (result[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, Record<string, unknown>>;
    const acct = { ...(accounts[id] ?? {}), [STORAGE_KEYS.etags]: map };
    await chrome.storage.local.set({
      [STORAGE_KEYS_V2.accounts]: { ...accounts, [id]: acct },
    });
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.etags]: map });
}

export async function getEntry(url: string): Promise<ETagEntry | null> {
  const map = await loadMap();
  return map[url] ?? null;
}

export async function setEntry(url: string, entry: ETagEntry): Promise<void> {
  const map = await loadMap();

  // Bump position to most-recent. Object key insertion order is stable in JS, so
  // delete-then-set moves an existing key to the end of the iteration order.
  delete map[url];
  map[url] = entry;

  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    for (const stale of keys.slice(0, EVICT_BATCH)) delete map[stale];
  }

  await saveMap(map);
}
