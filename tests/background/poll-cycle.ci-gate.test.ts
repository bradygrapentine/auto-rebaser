// CT-2 — CI-green gate before auto-rebase.
//
// Before rebasing a behind PR, the poll cycle reads the PR's statusCheckRollup
// and SUPPRESSES the rebase only when CI is definitively red (FAILURE/ERROR).
// SUCCESS / PENDING / EXPECTED / no-checks(null) all PROCEED; a rollup-fetch
// failure fails OPEN (proceeds). The rollup is fetched ONLY for a PR about to be
// rebased (no wasted call on non-behind PRs).
//
// NOTE: getPRStatusRollup is imported into poll-cycle from the SUBDIR module, so
// this test mocks '../../src/github/endpoints/status-check-rollup' DIRECTLY —
// mocking only the barrel would not intercept it (per opus-on-opus cycle 1).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/endpoints', () => ({
  searchAuthoredPRs: vi.fn(),
  getPR: vi.fn(),
  updateBranch: vi.fn(),
}));
vi.mock('../../src/github/endpoints/status-check-rollup', () => ({
  getPRStatusRollup: vi.fn(),
}));
vi.mock('../../src/github/endpoints/repos', () => ({
  getRepo: vi.fn(),
  getBranchHeadSHA: vi.fn(),
}));
vi.mock('../../src/github/endpoints/reviews', () => ({
  listReviews: vi.fn().mockResolvedValue([]),
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
import { searchAuthoredPRs, getPR, updateBranch } from '../../src/github/endpoints';
import { getPRStatusRollup } from '../../src/github/endpoints/status-check-rollup';
import { loadStore, upsertPRs } from '../../src/core/pr-store';
import { getAutomationSettings } from '../../src/core/automations-store';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRStore, PullRequest } from '../../src/core/types';

const search = () => ({
  items: [
    {
      id: 1,
      number: 1,
      title: 'PR',
      html_url: 'https://github.com/org/repo/pull/1',
      repository_url: 'https://api.github.com/repos/org/repo',
    },
  ],
});

function makePR(mergeable_state: PullRequest['mergeable_state'], headSha = 'abc'): PullRequest {
  return {
    id: 1,
    number: 1,
    title: 'PR',
    html_url: 'https://github.com/org/repo/pull/1',
    node_id: 'PR_node_1',
    mergeable_state,
    base: { repo: { full_name: 'org/repo' } },
    head: { ref: 'feature', repo: { full_name: 'org/repo' }, sha: headSha },
  } as PullRequest;
}

const setRollup = (v: unknown) =>
  (getPRStatusRollup as ReturnType<typeof vi.fn>).mockResolvedValue(v);

beforeEach(() => {
  vi.clearAllMocks();
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DEFAULT_AUTOMATION_SETTINGS });
  (updateBranch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search());
  const store: PRStore = { prs: [], lastPollAt: null };
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(store);
  setRollup('SUCCESS');
});

const upsertedState = () =>
  ((upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ state: string }>)[0].state;

describe('poll-cycle — CT-2 CI-green gate', () => {
  it('RED (FAILURE) blocks: updateBranch NOT called, PR stays behind', async () => {
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR('behind'));
    setRollup('FAILURE');
    await runPollCycle();
    expect(getPRStatusRollup).toHaveBeenCalledWith('PR_node_1', undefined);
    expect(updateBranch).not.toHaveBeenCalled();
    expect(upsertedState()).toBe('behind');
  });

  it('ERROR blocks: updateBranch NOT called', async () => {
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR('behind'));
    setRollup('ERROR');
    await runPollCycle();
    expect(updateBranch).not.toHaveBeenCalled();
    expect(upsertedState()).toBe('behind');
  });

  it('SUCCESS proceeds: updateBranch IS called', async () => {
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR('behind'))
      .mockResolvedValueOnce(makePR('clean')); // post-rebase re-fetch
    setRollup('SUCCESS');
    await runPollCycle();
    expect(updateBranch).toHaveBeenCalledWith('org', 'repo', 1, undefined);
  });

  it('PENDING proceeds: updateBranch IS called (only definitive red blocks)', async () => {
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR('behind'))
      .mockResolvedValueOnce(makePR('clean'));
    setRollup('PENDING');
    await runPollCycle();
    expect(updateBranch).toHaveBeenCalled();
  });

  it('no-checks (null rollup) proceeds: updateBranch IS called', async () => {
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR('behind'))
      .mockResolvedValueOnce(makePR('clean'));
    setRollup(null);
    await runPollCycle();
    expect(updateBranch).toHaveBeenCalled();
  });

  it('fails OPEN: a rollup-fetch error does NOT block the rebase', async () => {
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR('behind'))
      .mockResolvedValueOnce(makePR('clean'));
    (getPRStatusRollup as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('GraphQL boom'));
    await runPollCycle();
    expect(updateBranch).toHaveBeenCalled();
  });

  it('gate is rebase-only: a non-behind PR never queries the rollup', async () => {
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR('clean'));
    await runPollCycle();
    expect(getPRStatusRollup).not.toHaveBeenCalled();
    expect(updateBranch).not.toHaveBeenCalled();
  });
});
