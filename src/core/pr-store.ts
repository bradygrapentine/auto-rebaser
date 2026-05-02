import type { PRRecord, PRStore } from './types';
import { STORAGE_KEYS } from './constants';

const EMPTY_STORE: PRStore = { prs: [], lastPollAt: null };

export async function loadStore(): Promise<PRStore> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.prStore);
  return (result[STORAGE_KEYS.prStore] as PRStore) ?? { ...EMPTY_STORE };
}

export async function saveStore(store: PRStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.prStore]: store });
}

export async function upsertPRs(records: PRRecord[]): Promise<PRStore> {
  const current = await loadStore();
  const map = new Map(current.prs.map((pr) => [pr.id, pr]));
  for (const rec of records) {
    map.set(rec.id, rec);
  }
  const next: PRStore = { prs: Array.from(map.values()), lastPollAt: current.lastPollAt };
  await saveStore(next);
  return next;
}

export async function pruneStale(activeIds: number[]): Promise<PRStore> {
  const current = await loadStore();
  const idSet = new Set(activeIds);
  const next: PRStore = {
    prs: current.prs.filter((pr) => idSet.has(pr.id)),
    lastPollAt: current.lastPollAt,
  };
  await saveStore(next);
  return next;
}

export async function stampPollTime(now?: number): Promise<PRStore> {
  const current = await loadStore();
  const next: PRStore = { ...current, lastPollAt: now ?? Date.now() };
  await saveStore(next);
  return next;
}
