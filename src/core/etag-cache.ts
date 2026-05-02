import { STORAGE_KEYS } from './constants';

export interface ETagEntry {
  etag: string;
  data: unknown;
}

type ETagMap = Record<string, ETagEntry>;

/** Maximum cache entries before eviction kicks in. Bounds chrome.storage.local growth. */
export const MAX_ENTRIES = 200;
/** Number of oldest entries dropped when MAX_ENTRIES is exceeded. */
export const EVICT_BATCH = 50;

async function loadMap(): Promise<ETagMap> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.etags);
  return (result[STORAGE_KEYS.etags] as ETagMap) ?? {};
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

  await chrome.storage.local.set({ [STORAGE_KEYS.etags]: map });
}
