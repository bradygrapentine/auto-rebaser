import {
  readAccountKey,
  writeAccountKey,
  readAccountKeyFor,
  writeAccountKeyFor,
  getActiveAccountId,
} from './storage/multi-account';

/**
 * Legacy single-bucket key. Pre-multi-account installs stored every account's
 * repos here. Reads still consult it as a fallback when there's no active
 * account or the per-account list is empty; writes go to the per-account
 * shape so new accounts never see each other's repos.
 */
export const KNOWN_REPOS_KEY = 'knownRepos';
export const KNOWN_REPOS_CAP = 200;

export interface KnownRepo {
  fullName: string;
  lastSeenAt: number;
}

const FULL_NAME_RE = /^[\w.-]+\/[\w.-]+$/;

export function isValidFullName(s: string): boolean {
  return FULL_NAME_RE.test(s);
}

function sanitize(raw: unknown): KnownRepo[] {
  if (!Array.isArray(raw)) return [];
  return (raw as KnownRepo[]).filter(
    (entry) => entry && isValidFullName(entry.fullName) && typeof entry.lastSeenAt === 'number',
  );
}

export async function getKnownRepos(): Promise<KnownRepo[]> {
  const id = await getActiveAccountId();
  if (id) {
    const perAccount = await readAccountKey('knownRepos');
    if (perAccount && perAccount.length > 0) return sanitize(perAccount);
  }
  // Pre-migration fallback — single global bucket.
  const result = await chrome.storage.local.get(KNOWN_REPOS_KEY);
  return sanitize(result[KNOWN_REPOS_KEY]);
}

export async function recordKnownRepos(fullNames: readonly string[]): Promise<void> {
  const valid = fullNames.filter(isValidFullName);
  if (valid.length === 0) return;
  const existing = await getKnownRepos();
  const map = new Map<string, KnownRepo>(existing.map((r) => [r.fullName, r]));
  const now = Date.now();

  for (const name of valid) {
    map.set(name, { fullName: name, lastSeenAt: now });
  }

  const sorted = [...map.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const capped = sorted.slice(0, KNOWN_REPOS_CAP);

  const id = await getActiveAccountId();
  if (id) {
    await writeAccountKey('knownRepos', capped);
    return;
  }
  await chrome.storage.local.set({ [KNOWN_REPOS_KEY]: capped });
}

/** Explicit-id variant for SW poll-cycle use. */
export async function recordKnownReposFor(
  accountId: string,
  fullNames: readonly string[],
): Promise<void> {
  const valid = fullNames.filter(isValidFullName);
  if (valid.length === 0) return;
  const existing = sanitize(await readAccountKeyFor(accountId, 'knownRepos'));
  const map = new Map<string, KnownRepo>(existing.map((r) => [r.fullName, r]));
  const now = Date.now();

  for (const name of valid) {
    map.set(name, { fullName: name, lastSeenAt: now });
  }

  const sorted = [...map.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const capped = sorted.slice(0, KNOWN_REPOS_CAP);
  await writeAccountKeyFor(accountId, 'knownRepos', capped);
}
