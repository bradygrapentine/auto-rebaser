// T2 acceptance — cross-account isolation in runPollCycle.
//
// Probative assertions:
//  1. Each account's per-account store calls (loadStoreFor, upsertPRsFor,
//     stampPollTimeFor, etc.) receive the EXACT accountId the outer loop is
//     iterating — never some other account's id, never undefined.
//  2. GitHub endpoint calls (searchAuthoredPRs, getPR) are invoked with the
//     iterating accountId — proving no implicit getActiveAccountId() read can
//     race with the loop.
//
// Regression target: pre-T2, runPollCycleInner read getActiveAccountId() at
// several points to pick the store namespace. Under SW eviction, that read
// could resolve to a stale account id between iterations of the outer loop,
// causing one account's PRs to be written to another's namespace.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/endpoints', () => ({
  searchAuthoredPRs: vi.fn(),
  getPR: vi.fn(),
  updateBranch: vi.fn(),
}));

vi.mock('../../src/github/endpoints/repos', () => ({
  getRepo: vi.fn(),
  getBranchHeadSHA: vi.fn(),
}));

vi.mock('../../src/core/pr-store', () => ({
  loadStore: vi.fn(),
  saveStore: vi.fn().mockResolvedValue(undefined),
  upsertPRs: vi.fn().mockResolvedValue(undefined),
  pruneStale: vi.fn().mockResolvedValue(undefined),
  stampPollTime: vi.fn().mockResolvedValue(undefined),
  loadStoreFor: vi.fn(),
  saveStoreFor: vi.fn().mockResolvedValue(undefined),
  upsertPRsFor: vi.fn().mockResolvedValue(undefined),
  pruneStaleFor: vi.fn().mockResolvedValue(undefined),
  stampPollTimeFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/background/badge', () => ({
  setBadgeCount: vi.fn(),
  clearBadge: vi.fn(),
}));

vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  getAutomationSettingsFor: vi.fn(),
  getResolvedThreads: vi.fn(),
  getResolvedThreadsFor: vi.fn(),
  saveResolvedThreads: vi.fn().mockResolvedValue(undefined),
  saveResolvedThreadsFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/background/automations/orchestrator', () => ({
  runAllAutomations: vi.fn(),
}));

vi.mock('../../src/core/activity-log', () => ({
  appendActivity: vi.fn().mockResolvedValue(undefined),
  appendActivityFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/known-repos-store', () => ({
  recordKnownRepos: vi.fn().mockResolvedValue(undefined),
  recordKnownReposFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/auth-store', () => ({
  getAuth: vi.fn().mockResolvedValue(null),
  getAuthFor: vi.fn().mockResolvedValue(null),
  setInstallations: vi.fn().mockResolvedValue(undefined),
  setInstallationsFor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/storage/multi-account', () => ({
  // CRITICAL: poll cycle must NOT call this — but mock it to a "wrong" value
  // anyway. If T2 regressed and inner code reads getActiveAccountId(), it
  // would write account A's PRs into account B's namespace; assertions below
  // would fail because *For calls would be uniform 'gh_wrong' instead of the
  // iterating id.
  getActiveAccountId: vi.fn().mockResolvedValue('gh_wrong'),
  setActiveAccountId: vi.fn().mockResolvedValue(undefined),
  listAccountIds: vi.fn().mockResolvedValue([]),
  setAccountState: vi.fn().mockResolvedValue(undefined),
}));

import { runPollCycle } from '../../src/background/poll-cycle';
import { searchAuthoredPRs, getPR } from '../../src/github/endpoints';
import {
  loadStoreFor,
  upsertPRsFor,
  pruneStaleFor,
  stampPollTimeFor,
} from '../../src/core/pr-store';
import { listAccountIds } from '../../src/core/storage/multi-account';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import { getAutomationSettingsFor } from '../../src/core/automations-store';
import type { PRStore, PullRequest } from '../../src/core/types';

const EMPTY_STORE: PRStore = { prs: [], lastPollAt: null };

function makePR(id: number, repo: string): PullRequest {
  return {
    id,
    number: id,
    title: `PR ${id}`,
    html_url: `https://github.com/${repo}/pull/${id}`,
    mergeable_state: 'clean',
    base: { repo: { full_name: repo } },
  } as PullRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadStoreFor as ReturnType<typeof vi.fn>).mockResolvedValue({ ...EMPTY_STORE });
  (upsertPRsFor as ReturnType<typeof vi.fn>).mockResolvedValue({ ...EMPTY_STORE });
  (pruneStaleFor as ReturnType<typeof vi.fn>).mockResolvedValue({ ...EMPTY_STORE });
  (stampPollTimeFor as ReturnType<typeof vi.fn>).mockResolvedValue({ ...EMPTY_STORE });
  (getAutomationSettingsFor as ReturnType<typeof vi.fn>).mockResolvedValue({
    ...DEFAULT_AUTOMATION_SETTINGS,
  });
});

describe('runPollCycle — cross-account isolation', () => {
  it('threads the iterating accountId through every per-account store call', async () => {
    (listAccountIds as ReturnType<typeof vi.fn>).mockResolvedValue(['gh_alice', 'gh_bob']);

    // Account A sees one PR in alice-org/repo; Account B sees one in bob-org/repo.
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockImplementation(async (accountId?: string) => {
      if (accountId === 'gh_alice') {
        return {
          items: [{
            id: 1, number: 1, title: 'A1',
            html_url: 'https://github.com/alice-org/repo/pull/1',
            repository_url: 'https://api.github.com/repos/alice-org/repo',
          }],
        };
      }
      if (accountId === 'gh_bob') {
        return {
          items: [{
            id: 2, number: 2, title: 'B1',
            html_url: 'https://github.com/bob-org/repo/pull/2',
            repository_url: 'https://api.github.com/repos/bob-org/repo',
          }],
        };
      }
      throw new Error(`searchAuthoredPRs called with unexpected accountId=${accountId}`);
    });
    (getPR as ReturnType<typeof vi.fn>).mockImplementation(
      async (owner: string, repo: string, num: number, accountId?: string) => {
        // Each PR must arrive with the matching accountId — proves the inner
        // loop is not reading getActiveAccountId() (which is mocked to 'gh_wrong').
        if (owner === 'alice-org' && accountId !== 'gh_alice') {
          throw new Error(`alice PR fetched with wrong accountId=${accountId}`);
        }
        if (owner === 'bob-org' && accountId !== 'gh_bob') {
          throw new Error(`bob PR fetched with wrong accountId=${accountId}`);
        }
        return makePR(num, `${owner}/${repo}`);
      },
    );

    await runPollCycle();

    // Every loadStoreFor call must be for one of the two real accounts —
    // never 'gh_wrong' (the active-account mock).
    const loadCalls = (loadStoreFor as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(loadCalls.length).toBeGreaterThan(0);
    for (const id of loadCalls) {
      expect(['gh_alice', 'gh_bob']).toContain(id);
    }

    // upsertPRsFor receives the iterating accountId, never 'gh_wrong'.
    const upsertCalls = (upsertPRsFor as ReturnType<typeof vi.fn>).mock.calls;
    const upsertIds = upsertCalls.map((c) => c[0]);
    expect(upsertIds).toContain('gh_alice');
    expect(upsertIds).toContain('gh_bob');
    expect(upsertIds).not.toContain('gh_wrong');

    // stampPollTimeFor and pruneStaleFor — same shape, one call per account.
    const stampIds = (stampPollTimeFor as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(new Set(stampIds)).toEqual(new Set(['gh_alice', 'gh_bob']));

    const pruneIds = (pruneStaleFor as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(new Set(pruneIds)).toEqual(new Set(['gh_alice', 'gh_bob']));

    // No PR record was ever written to the wrong account's namespace.
    const aliceUpserts = upsertCalls.filter((c) => c[0] === 'gh_alice');
    for (const call of aliceUpserts) {
      const records = call[1] as Array<{ repo: string }>;
      for (const rec of records) {
        expect(rec.repo).toBe('alice-org/repo');
      }
    }
    const bobUpserts = upsertCalls.filter((c) => c[0] === 'gh_bob');
    for (const call of bobUpserts) {
      const records = call[1] as Array<{ repo: string }>;
      for (const rec of records) {
        expect(rec.repo).toBe('bob-org/repo');
      }
    }
  });

  it('loadStoreFor reads the explicit accountId — does not consult getActiveAccountId', async () => {
    // Sentinel store keyed by accountId. If the inner loop ever read the
    // (deliberately-wrong) active-account mock, loadStoreFor('gh_wrong')
    // would be called and bubble up an undefined entry.
    const byAccount = new Map<string, PRStore>([
      ['gh_alice', { prs: [], lastPollAt: 1 }],
      ['gh_bob', { prs: [], lastPollAt: 2 }],
    ]);
    (listAccountIds as ReturnType<typeof vi.fn>).mockResolvedValue(['gh_alice', 'gh_bob']);
    (loadStoreFor as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      const s = byAccount.get(id);
      if (!s) throw new Error(`loadStoreFor called with unknown accountId=${id}`);
      return s;
    });
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });

    await expect(runPollCycle()).resolves.toBeUndefined();

    // Both accounts hit loadStoreFor; 'gh_wrong' never did.
    const ids = (loadStoreFor as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(ids).toContain('gh_alice');
    expect(ids).toContain('gh_bob');
    expect(ids).not.toContain('gh_wrong');
  });
});
