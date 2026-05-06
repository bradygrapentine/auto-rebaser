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

export async function recordPing(prId: number, now: number = Date.now()): Promise<void> {
  const store = await getPingedStore();
  store[prId] = { at: now };
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
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
