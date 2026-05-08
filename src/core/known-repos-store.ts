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

export async function getKnownRepos(): Promise<KnownRepo[]> {
  const result = await chrome.storage.local.get(KNOWN_REPOS_KEY);
  const raw: unknown[] = result[KNOWN_REPOS_KEY] ?? [];
  return (raw as KnownRepo[]).filter(
    (entry) => entry && isValidFullName(entry.fullName) && typeof entry.lastSeenAt === 'number',
  );
}

export async function recordKnownRepos(fullNames: readonly string[]): Promise<void> {
  const valid = fullNames.filter(isValidFullName);
  if (valid.length === 0) {
    const existing = await getKnownRepos();
    if (existing.length === 0) return;
  }

  const existing = await getKnownRepos();
  const map = new Map<string, KnownRepo>(existing.map((r) => [r.fullName, r]));
  const now = Date.now();

  for (const name of valid) {
    map.set(name, { fullName: name, lastSeenAt: now });
  }

  const sorted = [...map.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const capped = sorted.slice(0, KNOWN_REPOS_CAP);

  await chrome.storage.local.set({ [KNOWN_REPOS_KEY]: capped });
}
