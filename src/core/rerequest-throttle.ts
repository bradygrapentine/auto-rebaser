// Story 5.2-A — per-PR re-request-review throttle. Mirrors `ping-throttle.ts`.
// Disables the badge action for 24h after a successful re-request so the user
// doesn't double-fire on the same PR.

import {
  readAccountKey,
  writeAccountKey,
  removeAccountKey,
  readAccountKeyFor,
  writeAccountKeyFor,
} from './storage/multi-account';

const STORAGE_KEY = 'rerequestedPRs';
const THROTTLE_MS = 24 * 60 * 60 * 1000;

export type RerequestStore = Record<number, { at: number }>;

export async function getRerequestStore(): Promise<RerequestStore> {
  const stored = await readAccountKey('rerequestedPRs');
  return (stored as RerequestStore | undefined) ?? {};
}

function prune(store: RerequestStore, now: number): RerequestStore {
  const cutoff = now - THROTTLE_MS;
  const out: RerequestStore = {};
  for (const key of Object.keys(store)) {
    const id = Number(key);
    const entry = store[id];
    if (entry && entry.at >= cutoff) out[id] = entry;
  }
  return out;
}

export async function recordRerequest(prId: number, now: number = Date.now()): Promise<void> {
  const store = prune(await getRerequestStore(), now);
  store[prId] = { at: now };
  await writeAccountKey('rerequestedPRs', store);
}

export async function clearRerequestStore(): Promise<void> {
  await removeAccountKey('rerequestedPRs');
}

/** Explicit-id variants for SW poll-cycle use. */
export async function getRerequestStoreFor(accountId: string): Promise<RerequestStore> {
  const stored = await readAccountKeyFor(accountId, 'rerequestedPRs');
  return (stored as RerequestStore | undefined) ?? {};
}

export async function recordRerequestFor(
  accountId: string,
  prId: number,
  now: number = Date.now(),
): Promise<void> {
  const store = prune(await getRerequestStoreFor(accountId), now);
  store[prId] = { at: now };
  await writeAccountKeyFor(accountId, 'rerequestedPRs', store);
}

export function isThrottled(
  store: RerequestStore,
  prId: number,
  now: number = Date.now(),
): boolean {
  const entry = store[prId];
  if (!entry) return false;
  return now - entry.at < THROTTLE_MS;
}

export function hoursSinceLastRerequest(
  store: RerequestStore,
  prId: number,
  now: number = Date.now(),
): number | null {
  const entry = store[prId];
  if (!entry) return null;
  return Math.floor((now - entry.at) / (60 * 60 * 1000));
}

export const RE_REQUEST_THROTTLE_KEY = STORAGE_KEY;
export const RE_REQUEST_THROTTLE_WINDOW_MS = THROTTLE_MS;
