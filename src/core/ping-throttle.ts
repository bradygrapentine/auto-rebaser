// Story 5.1 — per-PR ping throttle. Disables the ping button for 24h after
// the user successfully posts a ping comment. Lives in `chrome.storage.local`
// so it doesn't sync across devices.

const STORAGE_KEY = 'pingedPRs';
const PING_THROTTLE_MS = 24 * 60 * 60 * 1000;

export type PingedStore = Record<number, { at: number }>;

export async function getPingedStore(): Promise<PingedStore> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as PingedStore) ?? {};
}

/**
 * Audit P1 — drop entries past the throttle window. Called from `recordPing`
 * so the store stays bounded without a separate sweep.
 */
function prune(store: PingedStore, now: number): PingedStore {
  const cutoff = now - PING_THROTTLE_MS;
  const out: PingedStore = {};
  for (const key of Object.keys(store)) {
    const id = Number(key);
    const entry = store[id];
    if (entry && entry.at >= cutoff) out[id] = entry;
  }
  return out;
}

export async function recordPing(prId: number, now: number = Date.now()): Promise<void> {
  const store = prune(await getPingedStore(), now);
  store[prId] = { at: now };
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}

/** Sign-out cleanup — drops the throttle map entirely. */
export async function clearPingedStore(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

export function isThrottled(
  store: PingedStore,
  prId: number,
  now: number = Date.now(),
): boolean {
  const entry = store[prId];
  if (!entry) return false;
  return now - entry.at < PING_THROTTLE_MS;
}

/** Hours since the last ping. Returns null if never pinged. */
export function hoursSinceLastPing(
  store: PingedStore,
  prId: number,
  now: number = Date.now(),
): number | null {
  const entry = store[prId];
  if (!entry) return null;
  return Math.floor((now - entry.at) / (60 * 60 * 1000));
}

export const PING_THROTTLE_KEY = STORAGE_KEY;
export const PING_THROTTLE_WINDOW_MS = PING_THROTTLE_MS;
