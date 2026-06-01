// CT-1 — conflict-aware rebase backoff.
//
// After a rebase is rejected (HTTP_422 → 'rebase-rejected'), the poll cycle must
// NOT re-attempt the rebase until the PR's head SHA changes (the signal the user
// pushed a fix). Otherwise every cycle re-fires updateBranch → another 422 →
// wasted Actions minutes. Verifies: backoff holds (no call, chip kept), backoff
// clears on push (call re-fires), fresh rejection persists the SHA, and the
// stored SHA is cleared on a non-rejected outcome (no carry-through leak).

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
import { loadStore, upsertPRs } from '../../src/core/pr-store';
import { getAutomationSettings } from '../../src/core/automations-store';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRStore, PullRequest, PRRecord } from '../../src/core/types';
import type { PRRecordPhaseTwo } from '../../src/core/automations-types';

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

function behindPR(headSha: string, mergeable_state: PullRequest['mergeable_state'] = 'behind'): PullRequest {
  return {
    id: 1,
    number: 1,
    title: 'PR',
    html_url: 'https://github.com/org/repo/pull/1',
    mergeable_state,
    base: { repo: { full_name: 'org/repo' } },
    head: { ref: 'feature', repo: { full_name: 'org/repo' }, sha: headSha },
  } as PullRequest;
}

function withStore(prs: Array<PRRecord & PRRecordPhaseTwo>) {
  const store: PRStore = { prs, lastPollAt: null };
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(store);
}

const rejectedPrior = (sha: string): PRRecord & PRRecordPhaseTwo => ({
  id: 1, number: 1, title: 'PR', repo: 'org/repo',
  url: 'https://github.com/org/repo/pull/1',
  state: 'rebase-rejected', lastUpdated: 0,
  errorMessage: 'Rebase rejected by GitHub',
  rebaseRejectedAtSha: sha,
} as PRRecord & PRRecordPhaseTwo);

const upsertedRecords = () =>
  (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<PRRecord & PRRecordPhaseTwo>;

beforeEach(() => {
  vi.clearAllMocks();
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DEFAULT_AUTOMATION_SETTINGS });
  (updateBranch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  withStore([]);
});

describe('poll-cycle — CT-1 conflict-aware rebase backoff', () => {
  it('backoff HOLDS: rebase-rejected + head SHA unchanged → no updateBranch, chip kept', async () => {
    withStore([rejectedPrior('abc')]);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search());
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(behindPR('abc')); // head unchanged

    await runPollCycle();

    expect(updateBranch).not.toHaveBeenCalled();
    const rec = upsertedRecords()[0];
    expect(rec.state).toBe('rebase-rejected');
    expect(rec.errorMessage).toBe('Rebase rejected by GitHub');
    expect(rec.rebaseRejectedAtSha).toBe('abc'); // re-persisted at unchanged head
  });

  it('backoff CLEARS on push: rebase-rejected + head SHA changed → updateBranch re-fires', async () => {
    withStore([rejectedPrior('abc')]);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search());
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(behindPR('def'))             // head moved → re-attempt
      .mockResolvedValueOnce(behindPR('def', 'clean'));   // post-rebase re-fetch

    await runPollCycle();

    expect(updateBranch).toHaveBeenCalledWith('org', 'repo', 1, undefined);
  });

  it('CARRY-THROUGH cleared (leak test): prior SHA set, head moved, rebase succeeds → field undefined', async () => {
    withStore([rejectedPrior('abc')]);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search());
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(behindPR('def'))
      .mockResolvedValueOnce(behindPR('def', 'clean'));

    await runPollCycle();

    const rec = upsertedRecords()[0];
    expect(rec.state).toBe('updated');
    expect(rec.rebaseRejectedAtSha).toBeUndefined(); // NOT carried from 'abc'
  });

  it('FRESH rejection persists the head SHA', async () => {
    withStore([]); // no prior backoff
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(search());
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(behindPR('xyz'));
    (updateBranch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP_422: Unprocessable'));

    await runPollCycle();

    expect(updateBranch).toHaveBeenCalledWith('org', 'repo', 1, undefined);
    const rec = upsertedRecords()[0];
    expect(rec.state).toBe('rebase-rejected');
    expect(rec.rebaseRejectedAtSha).toBe('xyz');
  });
});
