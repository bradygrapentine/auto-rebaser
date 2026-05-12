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

async function loadMap(accountId: string | null): Promise<ETagMap> {
  if (accountId) {
    const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
    const accounts = (result[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, Record<string, unknown>>;
    return (accounts[accountId]?.[STORAGE_KEYS.etags] as ETagMap) ?? {};
  }
  const result = await chrome.storage.local.get(STORAGE_KEYS.etags);
  return (result[STORAGE_KEYS.etags] as ETagMap) ?? {};
}

async function saveMap(accountId: string | null, map: ETagMap): Promise<void> {
  if (accountId) {
    const result = await chrome.storage.local.get(STORAGE_KEYS_V2.accounts);
    const accounts = (result[STORAGE_KEYS_V2.accounts] ?? {}) as Record<string, Record<string, unknown>>;
    const acct = { ...(accounts[accountId] ?? {}), [STORAGE_KEYS.etags]: map };
    await chrome.storage.local.set({
      [STORAGE_KEYS_V2.accounts]: { ...accounts, [accountId]: acct },
    });
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.etags]: map });
}

/**
 * Get the cached entry for a URL. Pass `accountId` from the poll cycle's
 * iteration; popup callers pass null and the implicit-id resolution runs.
 */
export async function getEntry(url: string, accountId?: string | null): Promise<ETagEntry | null> {
  const id = accountId === undefined ? await getActiveAccountId() : accountId;
  const map = await loadMap(id);
  return map[url] ?? null;
}

export async function setEntry(
  url: string,
  entry: ETagEntry,
  accountId?: string | null,
): Promise<void> {
  const id = accountId === undefined ? await getActiveAccountId() : accountId;
  const map = await loadMap(id);

  // Bump position to most-recent. Object key insertion order is stable in JS, so
  // delete-then-set moves an existing key to the end of the iteration order.
  delete map[url];
  map[url] = entry;

  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    for (const stale of keys.slice(0, EVICT_BATCH)) delete map[stale];
  }

  await saveMap(id, map);
}
