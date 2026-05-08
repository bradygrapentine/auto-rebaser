import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KNOWN_REPOS_KEY,
  KNOWN_REPOS_CAP,
  isValidFullName,
  getKnownRepos,
  recordKnownRepos,
  type KnownRepo,
} from '../../src/core/known-repos-store';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isValidFullName', () => {
  it.each(['a/b', 'Org-Name/repo.name', 'user/repo_1'])('accepts %s', (s) => {
    expect(isValidFullName(s)).toBe(true);
  });

  it.each(['bare', 'a/', '/b', 'a b/c', ''])('rejects %s', (s) => {
    expect(isValidFullName(s)).toBe(false);
  });
});

describe('getKnownRepos', () => {
  it('returns [] when storage empty', async () => {
    chrome.storage.local.get = vi.fn().mockResolvedValue({});
    expect(await getKnownRepos()).toEqual([]);
  });

  it('filters out malformed entries already in storage', async () => {
    const good: KnownRepo = { fullName: 'owner/repo', lastSeenAt: 1000 };
    const bad = { fullName: 'bad-no-slash', lastSeenAt: 2000 };
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      [KNOWN_REPOS_KEY]: [good, bad],
    });
    expect(await getKnownRepos()).toEqual([good]);
  });

  it('returns [] when storage holds a non-array', async () => {
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      [KNOWN_REPOS_KEY]: 'corrupted',
    });
    expect(await getKnownRepos()).toEqual([]);
  });
});

describe('recordKnownRepos', () => {
  it('inserts new repos with current time', async () => {
    vi.setSystemTime(5000);
    chrome.storage.local.get = vi.fn().mockResolvedValue({});
    chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

    await recordKnownRepos(['owner/repo']);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [KNOWN_REPOS_KEY]: [{ fullName: 'owner/repo', lastSeenAt: 5000 }],
    });
  });

  it('upserts existing repo and updates lastSeenAt (no duplicate)', async () => {
    vi.setSystemTime(9000);
    const existing: KnownRepo = { fullName: 'owner/repo', lastSeenAt: 1000 };
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      [KNOWN_REPOS_KEY]: [existing],
    });
    chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

    await recordKnownRepos(['owner/repo']);

    const written: KnownRepo[] = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0][KNOWN_REPOS_KEY];
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual({ fullName: 'owner/repo', lastSeenAt: 9000 });
  });

  it('drops malformed entries silently', async () => {
    vi.setSystemTime(1000);
    chrome.storage.local.get = vi.fn().mockResolvedValue({});
    chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

    await recordKnownRepos(['good/repo', 'bad-no-slash', '', '/nope']);

    const written: KnownRepo[] = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0][KNOWN_REPOS_KEY];
    expect(written).toHaveLength(1);
    expect(written[0].fullName).toBe('good/repo');
  });

  it('does not write when called with [] and storage is non-empty', async () => {
    const existing: KnownRepo = { fullName: 'owner/repo', lastSeenAt: 1000 };
    chrome.storage.local.get = vi.fn().mockResolvedValue({
      [KNOWN_REPOS_KEY]: [existing],
    });
    chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

    await recordKnownRepos([]);

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('caps at KNOWN_REPOS_CAP, evicting oldest first', async () => {
    const now = 100_000;
    vi.setSystemTime(now);

    const existing: KnownRepo[] = Array.from({ length: KNOWN_REPOS_CAP }, (_, i) => ({
      fullName: `org/repo-${i}`,
      lastSeenAt: i,
    }));
    chrome.storage.local.get = vi.fn().mockResolvedValue({ [KNOWN_REPOS_KEY]: existing });
    chrome.storage.local.set = vi.fn().mockResolvedValue(undefined);

    await recordKnownRepos(['new/entry']);

    const written: KnownRepo[] = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0][0][KNOWN_REPOS_KEY];
    expect(written).toHaveLength(KNOWN_REPOS_CAP);
    expect(written[0]).toEqual({ fullName: 'new/entry', lastSeenAt: now });
    const names = written.map((r) => r.fullName);
    expect(names).not.toContain('org/repo-0');
  });
});
