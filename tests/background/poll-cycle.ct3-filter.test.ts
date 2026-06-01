// CT-3 T3 — the auto-action filter gate, wired into the poll cycle.
//
// The poll cycle consults evaluateAutoActionFilter at TWO seams:
//   Seam 1 (rebase): a suppressed PR is NOT rebased (updateBranch not called)
//     but STAYS VISIBLE in the store with its true derived state — identical
//     fall-through to CT-2's ciRed / the rebase-opt-out path.
//   Seam 2 (automations): a suppressed PR is excluded from the candidate list
//     handed to runAllAutomations (no delete-branch / auto-merge / etc.).
//
// The gate is INERT by default (empty allow/deny, skipDraftPRs:false, empty
// label lists) — the regression guard below proves a behind PR still rebases.
//
// Harness mirrors poll-cycle.ci-gate.test.ts (mocks status-check-rollup
// directly, not just the barrel).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/endpoints', () => ({
  searchAuthoredPRs: vi.fn(),
  getPR: vi.fn(),
  updateBranch: vi.fn(),
}));
vi.mock('../../src/github/endpoints/status-check-rollup', () => ({
  getPRStatusRollup: vi.fn(),
  getPRStatusRollupDetail: vi.fn(),
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
import { getPRStatusRollup, getPRStatusRollupDetail } from '../../src/github/endpoints/status-check-rollup';
import { loadStore, upsertPRs } from '../../src/core/pr-store';
import { getAutomationSettings } from '../../src/core/automations-store';
import { runAllAutomations } from '../../src/background/automations/orchestrator';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { AutomationSettings } from '../../src/core/automations-types';
import type { PRStore, PullRequest } from '../../src/core/types';

type Item = { id: number; number: number; title: string; html_url: string; repository_url: string };

const item = (id: number, fullName: string): Item => ({
  id,
  number: id,
  title: `PR ${id}`,
  html_url: `https://github.com/${fullName}/pull/${id}`,
  repository_url: `https://api.github.com/repos/${fullName}`,
});

function makePR(
  fullName: string,
  mergeable_state: PullRequest['mergeable_state'],
  opts: { id?: number; draft?: boolean; labels?: Array<{ name: string }>; headSha?: string } = {},
): PullRequest {
  const id = opts.id ?? 1;
  return {
    id,
    number: id,
    title: `PR ${id}`,
    html_url: `https://github.com/${fullName}/pull/${id}`,
    node_id: `PR_node_${id}`,
    mergeable_state,
    base: { repo: { full_name: fullName } },
    head: { ref: 'feature', repo: { full_name: fullName }, sha: opts.headSha ?? 'abc' },
    ...(opts.draft !== undefined ? { draft: opts.draft } : {}),
    ...(opts.labels !== undefined ? { labels: opts.labels } : {}),
  } as PullRequest;
}

const settings = (over: Partial<AutomationSettings> = {}): AutomationSettings => ({
  ...DEFAULT_AUTOMATION_SETTINGS,
  ...over,
});

const setSettings = (s: AutomationSettings) =>
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(s);
const setSearch = (...items: Item[]) =>
  (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items });

const upserted = () =>
  (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ id: number; state: string }>;
const candidateIds = (): number[] => {
  const arg = (runAllAutomations as ReturnType<typeof vi.fn>).mock.calls[0][0] as { prs: Array<{ id: number }> };
  return arg.prs.map((p) => p.id);
};

beforeEach(() => {
  vi.clearAllMocks();
  setSettings(settings());
  (updateBranch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  setSearch(item(1, 'org/repo'));
  const store: PRStore = { prs: [], lastPollAt: null };
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(store);
  (getPRStatusRollup as ReturnType<typeof vi.fn>).mockResolvedValue('SUCCESS');
  // The poll cycle's CI read is getPRStatusRollupDetail; default it green so the
  // rebase path proceeds (failures empty) unless a test overrides.
  (getPRStatusRollupDetail as ReturnType<typeof vi.fn>).mockResolvedValue({ state: 'SUCCESS', failures: [] });
});

describe('poll-cycle — CT-3 auto-action filter (Seam 1: rebase)', () => {
  it('default settings are INERT: a behind PR IS still rebased', async () => {
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR('org/repo', 'behind'))
      .mockResolvedValueOnce(makePR('org/repo', 'clean'));
    await runPollCycle();
    expect(updateBranch).toHaveBeenCalledWith('org', 'repo', 1, undefined);
  });

  it('denied repo: behind PR NOT rebased but stays visible (state behind)', async () => {
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR('org/repo', 'behind'));
    setSettings(settings({ denyRepos: ['org/repo'] }));
    await runPollCycle();
    expect(updateBranch).not.toHaveBeenCalled();
    expect(upserted()).toHaveLength(1);
    expect(upserted()[0]).toMatchObject({ id: 1, state: 'behind' });
  });

  it('allow-list MISS: behind PR in an unlisted repo is suppressed', async () => {
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR('org/repo', 'behind'));
    setSettings(settings({ allowRepos: ['org/other'] }));
    await runPollCycle();
    expect(updateBranch).not.toHaveBeenCalled();
    expect(upserted()[0].state).toBe('behind');
  });

  it('allow-list HIT: behind PR in a listed repo IS rebased (selective, not blanket)', async () => {
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR('org/repo', 'behind'))
      .mockResolvedValueOnce(makePR('org/repo', 'clean'));
    setSettings(settings({ allowRepos: ['org/repo'] }));
    await runPollCycle();
    expect(updateBranch).toHaveBeenCalled();
  });

  // NOTE: skip-drafts is NOT exercised at Seam 1. A draft PR derives
  // `action:'none'` (deriveStateFromMergeable short-circuits on isDraft before
  // the rebase path), so `updateBranch` is never called regardless of
  // `skipDraftPRs` — a Seam-1 draft assertion is tautological. The real
  // skip-drafts enforcement is at Seam 2 (candidate exclusion), covered below.

  it('exclude-label: a behind PR carrying an excluded label is NOT rebased', async () => {
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR('org/repo', 'behind', { labels: [{ name: 'do-not-merge' }] }),
    );
    setSettings(settings({ excludeLabels: ['do-not-merge'] }));
    await runPollCycle();
    expect(updateBranch).not.toHaveBeenCalled();
    expect(upserted()[0].state).toBe('behind');
  });

  it('persists name-only labels on every record (current poll truth, not stale)', async () => {
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR('org/repo', 'clean', { labels: [{ name: 'feature' }] }),
    );
    await runPollCycle();
    expect((upserted()[0] as any).labels).toEqual([{ name: 'feature' }]);
  });
});

describe('poll-cycle — CT-3 auto-action filter (Seam 2: automations candidates)', () => {
  it('excludes a denied PR from the candidate list, keeps the allowed one', async () => {
    setSearch(item(1, 'org/denied'), item(2, 'org/allowed'));
    // Resolve each item to its own clean PR (keyed by the repo path segment).
    (getPR as ReturnType<typeof vi.fn>).mockImplementation((_o: string, repo: string) =>
      Promise.resolve(
        repo === 'denied'
          ? makePR('org/denied', 'clean', { id: 1 })
          : makePR('org/allowed', 'clean', { id: 2 }),
      ),
    );
    setSettings(settings({ denyRepos: ['org/denied'] }));
    await runPollCycle();
    const ids = candidateIds();
    expect(ids).toContain(2);
    expect(ids).not.toContain(1);
  });

  it('default settings: BOTH PRs reach the candidate list (inert)', async () => {
    setSearch(item(1, 'org/denied'), item(2, 'org/allowed'));
    (getPR as ReturnType<typeof vi.fn>).mockImplementation((_o: string, repo: string) =>
      Promise.resolve(
        repo === 'denied'
          ? makePR('org/denied', 'clean', { id: 1 })
          : makePR('org/allowed', 'clean', { id: 2 }),
      ),
    );
    await runPollCycle();
    const ids = candidateIds();
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });

  // The seam evaluates the filter on the PERSISTED record (pr.isDraft /
  // pr.labels), not the live PR — so these clean PRs WOULD be valid candidates
  // (delete-branch / auto-merge act on non-behind PRs); the gate is the only
  // thing that drops them. Each test keeps a second, unsuppressed PR to prove
  // the filter is selective, not a blanket drop.

  it('skip-drafts: a persisted-draft PR is excluded from the candidate list', async () => {
    setSearch(item(1, 'org/draft'), item(2, 'org/ready'));
    (getPR as ReturnType<typeof vi.fn>).mockImplementation((_o: string, repo: string) =>
      Promise.resolve(
        repo === 'draft'
          ? makePR('org/draft', 'clean', { id: 1, draft: true })
          : makePR('org/ready', 'clean', { id: 2, draft: false }),
      ),
    );
    setSettings(settings({ skipDraftPRs: true }));
    await runPollCycle();
    const ids = candidateIds();
    expect(ids).toContain(2);
    expect(ids).not.toContain(1);
  });

  it('exclude-label: a PR carrying an excluded label is excluded from candidates', async () => {
    setSearch(item(1, 'org/blocked'), item(2, 'org/clean'));
    (getPR as ReturnType<typeof vi.fn>).mockImplementation((_o: string, repo: string) =>
      Promise.resolve(
        repo === 'blocked'
          ? makePR('org/blocked', 'clean', { id: 1, labels: [{ name: 'do-not-merge' }] })
          : makePR('org/clean', 'clean', { id: 2, labels: [{ name: 'ready' }] }),
      ),
    );
    setSettings(settings({ excludeLabels: ['do-not-merge'] }));
    await runPollCycle();
    const ids = candidateIds();
    expect(ids).toContain(2);
    expect(ids).not.toContain(1);
  });

  it('include-label MISS: a PR lacking every required label is excluded', async () => {
    setSearch(item(1, 'org/tagged'), item(2, 'org/untagged'));
    (getPR as ReturnType<typeof vi.fn>).mockImplementation((_o: string, repo: string) =>
      Promise.resolve(
        repo === 'tagged'
          ? makePR('org/tagged', 'clean', { id: 1, labels: [{ name: 'automate' }] })
          : makePR('org/untagged', 'clean', { id: 2, labels: [{ name: 'other' }] }),
      ),
    );
    setSettings(settings({ includeLabels: ['automate'] }));
    await runPollCycle();
    const ids = candidateIds();
    expect(ids).toContain(1);
    expect(ids).not.toContain(2);
  });
});

describe('poll-cycle — CT-3 gate interaction matrix', () => {
  it('CT-3-suppressed behind PR short-circuits the CI rollup AND the rebase', async () => {
    // A denied behind PR: the filter verdict suppresses the rebase, which must
    // skip BOTH the updateBranch call (Seam 1) and the upstream CT-2 CI-rollup
    // fetch — the rollup is read ONLY for a PR we're actually about to rebase
    // (poll-cycle.ts:336 guards on !rebaseSkipped), so suppression saves the
    // GraphQL round-trip, not just the rebase.
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR('org/repo', 'behind'));
    setSettings(settings({ denyRepos: ['org/repo'] }));
    await runPollCycle();
    expect(updateBranch).not.toHaveBeenCalled();
    expect(getPRStatusRollupDetail).not.toHaveBeenCalled();
    expect(upserted()[0].state).toBe('behind');
  });

  it('denyRepos + prior rebase-rejected@same-SHA: backoff still parks the chip', async () => {
    // Both gates fire at once: the CT-3 deny suppresses the rebase AND the CT-1
    // conflict-backoff is engaged (prior 'rebase-rejected' at the unchanged head
    // SHA). updateBranch and the CI rollup are both skipped, yet the backed-off
    // branch (poll-cycle.ts:411) re-affirms 'rebase-rejected' and RE-PERSISTS
    // rebaseRejectedAtSha so next cycle's backoff stays engaged.
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR('org/repo', 'behind', { headSha: 'abc' }),
    );
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({
      prs: [
        {
          id: 1,
          number: 1,
          title: 'PR 1',
          repo: 'org/repo',
          url: 'https://github.com/org/repo/pull/1',
          state: 'rebase-rejected',
          lastUpdated: 0,
          rebaseRejectedAtSha: 'abc',
        },
      ],
      lastPollAt: null,
    });
    setSettings(settings({ denyRepos: ['org/repo'] }));
    await runPollCycle();
    expect(updateBranch).not.toHaveBeenCalled();
    expect(getPRStatusRollupDetail).not.toHaveBeenCalled();
    const rec = upserted()[0] as { state: string; rebaseRejectedAtSha?: string };
    expect(rec.state).toBe('rebase-rejected');
    expect(rec.rebaseRejectedAtSha).toBe('abc');
  });
});
