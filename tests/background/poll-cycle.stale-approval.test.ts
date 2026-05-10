// Story 5.2-A — poll-cycle integration tests for stale-approval detection.
//
// Verifies the FOUR gating paths from the plan §"When the detector runs":
//   1. master toggle off → zero listReviews calls
//   2. head SHA unchanged + prior staleApproval=null (negative cache) → zero calls
//   3. head SHA unchanged + prior staleApproval populated → zero calls; reused
//   4. lastSeenHeadSha missing (newly-discovered PR) → one call; result persisted
//   5. head SHA changed → one call; lastHeadShaChangedAt stamped to cycle's now()

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
vi.mock('../../src/github/endpoints/reviews', () => ({
  listReviews: vi.fn(),
  requestReviewers: vi.fn(),
}));
vi.mock('../../src/core/pr-store', () => ({
  loadStore: vi.fn(),
  saveStore: vi.fn().mockResolvedValue(undefined),
  upsertPRs: vi.fn().mockResolvedValue(undefined),
  pruneStale: vi.fn().mockResolvedValue(undefined),
  stampPollTime: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/background/badge', () => ({
  setBadgeCount: vi.fn(),
  clearBadge: vi.fn(),
}));
vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  getResolvedThreads: vi.fn().mockResolvedValue({}),
  saveResolvedThreads: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/background/automations/orchestrator', () => ({
  runAllAutomations: vi.fn().mockResolvedValue({
    summary: { ranAt: 1000, rebased: 0, branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 },
    prUpdates: [],
    resolvedThreads: {},
  }),
}));
vi.mock('../../src/core/activity-log', () => ({
  appendActivity: vi.fn().mockResolvedValue(undefined),
}));

import { runPollCycle } from '../../src/background/poll-cycle';
import { searchAuthoredPRs, getPR } from '../../src/github/endpoints';
import { listReviews } from '../../src/github/endpoints/reviews';
import { loadStore, upsertPRs } from '../../src/core/pr-store';
import { getAutomationSettings } from '../../src/core/automations-store';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRStore, PullRequest, PRRecord } from '../../src/core/types';
import type { PRRecordPhaseTwo } from '../../src/core/automations-types';

const search = (id = 1) => ({
  items: [
    {
      id,
      number: 1,
      title: 'PR',
      html_url: 'https://github.com/org/repo/pull/1',
      repository_url: 'https://api.github.com/repos/org/repo',
    },
  ],
});

function makePR(over: Partial<PullRequest> & { headSha?: string } = {}): PullRequest {
  const { headSha, head, ...rest } = over;
  return {
    id: 1,
    number: 1,
    title: 'PR',
    html_url: 'https://github.com/org/repo/pull/1',
    mergeable_state: 'clean',
    base: { repo: { full_name: 'org/repo' } },
    head: head ?? { ref: 'main', repo: { full_name: 'org/repo' }, sha: headSha ?? 'sha-NEW' },
    ...rest,
  };
}

function withSettings(over: Partial<typeof DEFAULT_AUTOMATION_SETTINGS> = {}) {
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
    ...DEFAULT_AUTOMATION_SETTINGS,
    ...over,
  });
}

function withStore(prs: Array<PRRecord & PRRecordPhaseTwo>) {
  const store: PRStore = { prs, lastPollAt: null };
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(store);
}

beforeEach(() => {
  vi.clearAllMocks();
  withSettings();
  withStore([]);
  (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe('poll-cycle — stale-approval gating', () => {
  it('master toggle OFF: zero listReviews calls regardless of state', async () => {
    withSettings({ enablePushSinceApproval: false });
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search(1));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-NEW' }));
    await runPollCycle();
    expect(listReviews).not.toHaveBeenCalled();
  });

  it('master toggle ON, head SHA unchanged + prior staleApproval=null (negative cache): zero calls; null carried forward', async () => {
    withSettings({ enablePushSinceApproval: true });
    withStore([
      {
        id: 1,
        number: 1,
        title: 'PR',
        repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/1',
        state: 'current',
        lastUpdated: 0,
        lastSeenHeadSha: 'sha-NEW',
        staleApproval: null,
      } as PRRecord & PRRecordPhaseTwo,
    ]);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search(1));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-NEW' }));
    await runPollCycle();
    expect(listReviews).not.toHaveBeenCalled();
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<PRRecord & PRRecordPhaseTwo>;
    expect(upserted[0].staleApproval).toBeNull();
    expect(upserted[0].lastSeenHeadSha).toBe('sha-NEW');
  });

  it('master toggle ON, head SHA unchanged + prior staleApproval populated: zero calls; cached value carried forward', async () => {
    const cached = {
      lastApprovedAt: 1000,
      lastPushedAt: 2000,
      approvers: ['alice'],
    };
    withSettings({ enablePushSinceApproval: true });
    withStore([
      {
        id: 1,
        number: 1,
        title: 'PR',
        repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/1',
        state: 'current',
        lastUpdated: 0,
        lastSeenHeadSha: 'sha-NEW',
        staleApproval: cached,
      } as PRRecord & PRRecordPhaseTwo,
    ]);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search(1));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-NEW' }));
    await runPollCycle();
    expect(listReviews).not.toHaveBeenCalled();
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<PRRecord & PRRecordPhaseTwo>;
    expect(upserted[0].staleApproval).toEqual(cached);
  });

  it('master toggle ON, lastSeenHeadSha missing (new PR): one listReviews call; lastSeenHeadSha + lastHeadShaChangedAt stamped', async () => {
    withSettings({ enablePushSinceApproval: true });
    withStore([]); // no prior record at all
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search(1));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-NEW' }));
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([]); // no approvers → null
    await runPollCycle();
    expect(listReviews).toHaveBeenCalledTimes(1);
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<PRRecord & PRRecordPhaseTwo>;
    expect(upserted[0].lastSeenHeadSha).toBe('sha-NEW');
    expect(typeof upserted[0].lastHeadShaChangedAt).toBe('number');
    expect(upserted[0].staleApproval).toBeNull();
  });

  it('master toggle ON, head SHA changed since last cycle: one listReviews call; lastHeadShaChangedAt advanced', async () => {
    const before = Date.now();
    withSettings({ enablePushSinceApproval: true });
    withStore([
      {
        id: 1,
        number: 1,
        title: 'PR',
        repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/1',
        state: 'current',
        lastUpdated: 0,
        lastSeenHeadSha: 'sha-OLD',
        lastHeadShaChangedAt: 1, // ancient
        staleApproval: null,
      } as PRRecord & PRRecordPhaseTwo,
    ]);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search(1));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-NEW' }));
    // Reviews — alice approved before the new push, so detector should fire.
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: before - 60_000 },
    ]);
    await runPollCycle();
    expect(listReviews).toHaveBeenCalledTimes(1);
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<PRRecord & PRRecordPhaseTwo>;
    expect(upserted[0].lastSeenHeadSha).toBe('sha-NEW');
    expect(upserted[0].lastHeadShaChangedAt).toBeGreaterThanOrEqual(before);
    expect(upserted[0].staleApproval).toMatchObject({
      approvers: ['alice'],
      lastPushedAt: upserted[0].lastHeadShaChangedAt,
    });
  });
});
