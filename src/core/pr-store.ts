import type { PRRecord, PRStore } from './types';
import { readAccountKey, writeAccountKey } from './storage/multi-account';

const EMPTY_STORE: PRStore = { prs: [], lastPollAt: null };

export async function loadStore(): Promise<PRStore> {
  const stored = await readAccountKey('pr_store');
  return stored ?? { ...EMPTY_STORE };
}

export async function saveStore(store: PRStore): Promise<void> {
  await writeAccountKey('pr_store', store);
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

// REVIEWER-AUTOMATIONS — parallel reviewer-tab store. Same PRStore shape as
// the authored namespace, separate account-scoped key.

export async function loadReviewerStore(): Promise<PRStore> {
  const stored = await readAccountKey('reviewerPRs');
  return stored ?? { ...EMPTY_STORE };
}

export async function saveReviewerStore(store: PRStore): Promise<void> {
  await writeAccountKey('reviewerPRs', store);
}

export async function upsertReviewerPRs(records: PRRecord[]): Promise<PRStore> {
  const current = await loadReviewerStore();
  const map = new Map(current.prs.map((pr) => [pr.id, pr]));
  for (const rec of records) {
    map.set(rec.id, rec);
  }
  const next: PRStore = { prs: Array.from(map.values()), lastPollAt: current.lastPollAt };
  await saveReviewerStore(next);
  return next;
}
