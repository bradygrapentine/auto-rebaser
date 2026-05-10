// REVIEWER-AUTOMATIONS — poll-cycle integration tests for the reviewer phase.
//
// Verifies the master-toggle gate, happy-path fire of enableAutoMerge through
// the 4-gate detector, idempotent suppression via reviewerAutoMergeArmed, and
// the SHA-change invalidation that re-opens the gate after the author pushes.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/endpoints', () => ({
  searchAuthoredPRs: vi.fn(),
  getPR: vi.fn(),
  updateBranch: vi.fn(),
  getAuthenticatedUser: vi.fn().mockResolvedValue({ login: 'alice', id: 1, avatar_url: '' }),
}));
vi.mock('../../src/github/endpoints/reviewer-search', () => ({
  searchReviewerPRs: vi.fn(),
}));
vi.mock('../../src/github/endpoints/auto-merge', () => ({
  enablePullRequestAutoMerge: vi.fn(),
}));
vi.mock('../../src/github/endpoints/pr-review-decision', () => ({
  getPRReviewDecision: vi.fn(),
}));
vi.mock('../../src/github/endpoints/repos', () => ({
  getRepo: vi.fn(),
  getBranchHeadSHA: vi.fn(),
}));
vi.mock('../../src/github/endpoints/reviews', () => ({
  listReviews: vi.fn(),
  requestReviewers: vi.fn(),
}));
vi.mock('../../src/core/pr-store', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/pr-store')>('../../src/core/pr-store');
  return {
    ...actual,
    loadStore: vi.fn(),
    saveStore: vi.fn().mockResolvedValue(undefined),
    upsertPRs: vi.fn().mockResolvedValue(undefined),
    pruneStale: vi.fn().mockResolvedValue(undefined),
    stampPollTime: vi.fn().mockResolvedValue(undefined),
    loadReviewerStore: vi.fn(),
    upsertReviewerPRs: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('../../src/background/badge', () => ({
  setBadgeCount: vi.fn(),
  clearBadge: vi.fn(),
}));
vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  getResolvedThreads: vi.fn().mockResolvedValue({}),
  saveResolvedThreads: vi.fn().mockResolvedValue(undefined),
  saveAutomationSettings: vi.fn().mockResolvedValue(undefined),
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
vi.mock('../../src/core/auth-store', () => ({
  getAuth: vi.fn().mockResolvedValue({ method: 'pat', token: 't', login: 'alice' }),
  setInstallations: vi.fn().mockResolvedValue(undefined),
}));

import { runPollCycle } from '../../src/background/poll-cycle';
import { searchAuthoredPRs, getPR, getAuthenticatedUser } from '../../src/github/endpoints';
import { searchReviewerPRs } from '../../src/github/endpoints/reviewer-search';
import { enablePullRequestAutoMerge } from '../../src/github/endpoints/auto-merge';
import { getPRReviewDecision } from '../../src/github/endpoints/pr-review-decision';
import { listReviews } from '../../src/github/endpoints/reviews';
import { loadStore, loadReviewerStore, upsertReviewerPRs } from '../../src/core/pr-store';
import { getAutomationSettings, saveAutomationSettings } from '../../src/core/automations-store';
import { appendActivity } from '../../src/core/activity-log';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRStore, PullRequest, PRRecord } from '../../src/core/types';
import type { PRRecordPhaseTwo } from '../../src/core/automations-types';

const reviewerSearch = (id = 42) => ({
  items: [
    {
      id,
      number: id,
      title: 'reviewer PR',
      html_url: `https://github.com/org/api/pull/${id}`,
      repository_url: 'https://api.github.com/repos/org/api',
    },
  ],
});

function makePR(over: Partial<PullRequest> & { headSha?: string } = {}): PullRequest {
  const { headSha, head, ...rest } = over;
  return {
    id: 42,
    number: 42,
    title: 'reviewer PR',
    html_url: 'https://github.com/org/api/pull/42',
    mergeable_state: 'clean',
    node_id: 'PR_nodeid_42',
    base: { repo: { full_name: 'org/api' } },
    head: head ?? { ref: 'feat', repo: { full_name: 'org/api' }, sha: headSha ?? 'sha-CUR' },
    requested_reviewers: [],
    ...rest,
  };
}

function withSettings(over: Partial<typeof DEFAULT_AUTOMATION_SETTINGS> = {}) {
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
    ...DEFAULT_AUTOMATION_SETTINGS,
    ...over,
  });
}

function withReviewerStore(prs: Array<PRRecord & PRRecordPhaseTwo>) {
  const store: PRStore = { prs, lastPollAt: null };
  (loadReviewerStore as ReturnType<typeof vi.fn>).mockResolvedValue(store);
}

beforeEach(() => {
  vi.clearAllMocks();
  withSettings();
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({ prs: [], lastPollAt: null });
  withReviewerStore([]);
  // Authored search returns nothing — we focus on the reviewer phase here.
  (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
  (getAuthenticatedUser as ReturnType<typeof vi.fn>).mockResolvedValue({ login: 'alice', id: 1, avatar_url: '' });
  (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (enablePullRequestAutoMerge as ReturnType<typeof vi.fn>).mockResolvedValue({ enabled: true, unsupported: false });
});

describe('poll-cycle — reviewer phase', () => {
  it('enableReviewerTab=false: skips searchReviewerPRs entirely', async () => {
    withSettings({ enableReviewerTab: false });
    await runPollCycle();
    expect(searchReviewerPRs).not.toHaveBeenCalled();
  });

  it('enableReviewerTab=true: runs searchReviewerPRs and writes results to reviewer store', async () => {
    withSettings({ enableReviewerTab: true });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    await runPollCycle();
    expect(searchReviewerPRs).toHaveBeenCalledTimes(1);
    const writes = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls;
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toHaveLength(1);
    expect(writes[0][0][0]).toMatchObject({ id: 42, repo: 'org/api' });
  });

  it('fires enableAutoMerge once when all 4 gates pass + caches reviewerAutoMergeArmed', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
    ]);
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');

    await runPollCycle();

    expect(enablePullRequestAutoMerge).toHaveBeenCalledTimes(1);
    expect(enablePullRequestAutoMerge).toHaveBeenCalledWith('PR_nodeid_42', 'SQUASH');
    const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(upserted.reviewerAutoMergeArmed).toMatchObject({ at: expect.any(Number) });
  });

  it('does NOT re-fire enableAutoMerge when reviewerAutoMergeArmed is already cached for the current head SHA', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    withReviewerStore([
      {
        id: 42,
        number: 42,
        title: 'reviewer PR',
        repo: 'org/api',
        url: 'https://github.com/org/api/pull/42',
        state: 'current',
        lastUpdated: 0,
        lastSeenHeadSha: 'sha-CUR',
        reviewerAutoMergeArmed: { at: Date.now() - 60_000 },
      } as PRRecord & PRRecordPhaseTwo,
    ]);
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
    ]);
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');

    await runPollCycle();

    expect(enablePullRequestAutoMerge).not.toHaveBeenCalled();
  });

  it('clears reviewerAutoMergeArmed when head SHA changes (new push after arm)', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    withReviewerStore([
      {
        id: 42,
        number: 42,
        title: 'reviewer PR',
        repo: 'org/api',
        url: 'https://github.com/org/api/pull/42',
        state: 'current',
        lastUpdated: 0,
        lastSeenHeadSha: 'sha-OLD',
        reviewerAutoMergeArmed: { at: Date.now() - 60_000 },
      } as PRRecord & PRRecordPhaseTwo,
    ]);
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-NEW' }));
    // No new approval yet on the new SHA — gate should NOT fire either.
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 7_200_000 },
    ]);
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('REVIEW_REQUIRED');

    await runPollCycle();

    expect(enablePullRequestAutoMerge).not.toHaveBeenCalled();
    const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(upserted.reviewerAutoMergeArmed).toBeUndefined();
    expect(upserted.lastSeenHeadSha).toBe('sha-NEW');
  });

  it('on enableAutoMerge "clean status" failure: logs + skips, no arm cached', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
    ]);
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');
    (enablePullRequestAutoMerge as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: false,
      unsupported: true,
      reason: 'Pull request is in clean status',
    });

    await runPollCycle();

    expect(enablePullRequestAutoMerge).toHaveBeenCalledTimes(1);
    const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(upserted.reviewerAutoMergeArmed).toBeUndefined();
  });

  it('appends activity log entry on successful fire', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
    ]);
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');

    await runPollCycle();

    expect(appendActivity).toHaveBeenCalled();
    const calls = (appendActivity as ReturnType<typeof vi.fn>).mock.calls;
    // appendActivity may be called once with array, or several times. Search across all.
    const all = calls.flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]));
    expect(all).toContainEqual(
      expect.objectContaining({
        action: 'reviewer_auto_merge_armed',
        repo: 'org/api',
        prNumber: 42,
      }),
    );
    // saveAutomationSettings should NOT have been called on the happy path
    expect(saveAutomationSettings).not.toHaveBeenCalled();
  });

  it('on enableAutoMerge "not allowed" failure: revokes repo from allowlist via saveAutomationSettings', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
    ]);
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');
    (enablePullRequestAutoMerge as ReturnType<typeof vi.fn>).mockResolvedValue({
      enabled: false,
      unsupported: true,
      reason: 'Pull request auto-merge is not allowed for this repository',
    });

    await runPollCycle();

    expect(saveAutomationSettings).toHaveBeenCalledTimes(1);
    const persisted = (saveAutomationSettings as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(persisted.autoMergeReviewerOptInRepos).toEqual([]);
    // No arm cached — the next cycle will see the empty allowlist and skip.
    expect(upsertReviewerPRs).toHaveBeenCalledTimes(1);
    const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(upserted.reviewerAutoMergeArmed).toBeUndefined();
  });

  it('on listReviews error: phase proceeds with empty review data; gate does not fire', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    (listReviews as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');

    await runPollCycle();

    expect(enablePullRequestAutoMerge).not.toHaveBeenCalled();
    // Guard: the row MUST have been upserted, otherwise the next assertion
    // would throw a TypeError on undefined and mask a real crash as a test
    // error instead of a clean failure.
    expect(upsertReviewerPRs).toHaveBeenCalledTimes(1);
    const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(upserted.myReviewState).toBe('AWAITING');
  });

  it('on getPRReviewDecision error: gate treats decision as null and does not fire', async () => {
    withSettings({
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
      autoMergeReviewerOptInRepos: ['org/api'],
    });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
    (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
    ]);
    (getPRReviewDecision as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('graphql failure'));

    await runPollCycle();

    expect(enablePullRequestAutoMerge).not.toHaveBeenCalled();
  });
});
