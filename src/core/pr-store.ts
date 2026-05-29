import type { PRRecord, PRStore } from './types';
import {
  readAccountKey,
  writeAccountKey,
  readAccountKeyFor,
  writeAccountKeyFor,
} from './storage/multi-account';

const EMPTY_STORE: PRStore = { prs: [], lastPollAt: null };

// Implicit-id helpers (popup-context).

export async function loadStore(): Promise<PRStore> {
  const stored = await readAccountKey('pr_store');
  return stored ?? { ...EMPTY_STORE };
}

export async function saveStore(store: PRStore): Promise<void> {
  await writeAccountKey('pr_store', store);
}

export async function loadReviewerStore(): Promise<PRStore> {
  const stored = await readAccountKey('reviewerPRs');
  return stored ?? { ...EMPTY_STORE };
}

export async function saveReviewerStore(store: PRStore): Promise<void> {
  await writeAccountKey('reviewerPRs', store);
}

// Explicit-id helpers — use these from the SW poll cycle.

export async function loadStoreFor(accountId: string): Promise<PRStore> {
  const stored = await readAccountKeyFor(accountId, 'pr_store');
  return stored ?? { ...EMPTY_STORE };
}

export async function saveStoreFor(accountId: string, store: PRStore): Promise<void> {
  await writeAccountKeyFor(accountId, 'pr_store', store);
}

export async function upsertPRsFor(accountId: string, records: PRRecord[]): Promise<PRStore> {
  const current = await loadStoreFor(accountId);
  const map = new Map(current.prs.map((pr) => [pr.id, pr]));
  for (const rec of records) {
    map.set(rec.id, rec);
  }
  const next: PRStore = { prs: Array.from(map.values()), lastPollAt: current.lastPollAt };
  await saveStoreFor(accountId, next);
  return next;
}

export async function pruneStaleFor(accountId: string, activeIds: number[]): Promise<PRStore> {
  const current = await loadStoreFor(accountId);
  const idSet = new Set(activeIds);
  const next: PRStore = {
    prs: current.prs.filter((pr) => idSet.has(pr.id)),
    lastPollAt: current.lastPollAt,
  };
  await saveStoreFor(accountId, next);
  return next;
}

export async function stampPollTimeFor(accountId: string, now?: number): Promise<PRStore> {
  const current = await loadStoreFor(accountId);
  const next: PRStore = { ...current, lastPollAt: now ?? Date.now() };
  await saveStoreFor(accountId, next);
  return next;
}

export async function pruneStaleReviewerFor(accountId: string, activeIds: number[]): Promise<PRStore> {
  const current = await loadReviewerStoreFor(accountId);
  const idSet = new Set(activeIds);
  const next: PRStore = {
    prs: current.prs.filter((pr) => idSet.has(pr.id)),
    lastPollAt: current.lastPollAt,
  };
  await saveReviewerStoreFor(accountId, next);
  return next;
}

export async function loadReviewerStoreFor(accountId: string): Promise<PRStore> {
  const stored = await readAccountKeyFor(accountId, 'reviewerPRs');
  return stored ?? { ...EMPTY_STORE };
}

export async function saveReviewerStoreFor(accountId: string, store: PRStore): Promise<void> {
  await writeAccountKeyFor(accountId, 'reviewerPRs', store);
}

export async function upsertReviewerPRsFor(
  accountId: string,
  records: PRRecord[],
): Promise<PRStore> {
  const current = await loadReviewerStoreFor(accountId);
  const map = new Map(current.prs.map((pr) => [pr.id, pr]));
  for (const rec of records) {
    map.set(rec.id, rec);
  }
  const next: PRStore = { prs: Array.from(map.values()), lastPollAt: current.lastPollAt };
  await saveReviewerStoreFor(accountId, next);
  return next;
}

// Back-compat implicit-id wrappers — kept so existing popup-side callers
// don't need to change. Deprecated for SW-side use.

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

export async function pruneStaleReviewer(activeIds: number[]): Promise<PRStore> {
  const current = await loadReviewerStore();
  const idSet = new Set(activeIds);
  const next: PRStore = {
    prs: current.prs.filter((pr) => idSet.has(pr.id)),
    lastPollAt: current.lastPollAt,
  };
  await saveReviewerStore(next);
  return next;
}
