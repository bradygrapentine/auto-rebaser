import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/github/endpoints', () => ({
  searchAuthoredPRs: vi.fn(),
  getPR: vi.fn(),
  updateBranch: vi.fn(),
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
  getResolvedThreads: vi.fn(),
  saveResolvedThreads: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/background/automations/orchestrator', () => ({
  runAllAutomations: vi.fn(),
}));

vi.mock('../../src/core/activity-log', () => ({
  appendActivity: vi.fn().mockResolvedValue(undefined),
}));

import { runPollCycle } from '../../src/background/poll-cycle';
import { searchAuthoredPRs, getPR, updateBranch } from '../../src/github/endpoints';
import { loadStore, saveStore, upsertPRs, pruneStale, stampPollTime } from '../../src/core/pr-store';
import { setBadgeCount, clearBadge } from '../../src/background/badge';
import { getAutomationSettings, getResolvedThreads, saveResolvedThreads } from '../../src/core/automations-store';
import { runAllAutomations } from '../../src/background/automations/orchestrator';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRStore, SearchResult, PullRequest } from '../../src/core/types';
import { appendActivity } from '../../src/core/activity-log';
import type { ActivityEntry } from '../../src/core/activity-log-types';

const EMPTY_STORE: PRStore = { prs: [], lastPollAt: null };

function makeSearchResult(...overrides: Partial<{ id: number; number: number; title: string; html_url: string; repository_url: string }>[]) {
  const items = overrides.map((o, i) => ({
    id: o.id ?? 100 + i,
    number: o.number ?? 1 + i,
    title: o.title ?? `PR ${1 + i}`,
    html_url: o.html_url ?? `https://github.com/org/repo/pull/${1 + i}`,
    repository_url: o.repository_url ?? 'https://api.github.com/repos/org/repo',
  }));
  return { items } as SearchResult;
}

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 100,
    number: 1,
    title: 'Test PR',
    html_url: 'https://github.com/org/repo/pull/1',
    mergeable_state: 'clean',
    base: { repo: { full_name: 'org/repo' } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({ ...EMPTY_STORE });
  (saveStore as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (upsertPRs as ReturnType<typeof vi.fn>).mockResolvedValue(EMPTY_STORE);
  (pruneStale as ReturnType<typeof vi.fn>).mockResolvedValue(EMPTY_STORE);
  (stampPollTime as ReturnType<typeof vi.fn>).mockResolvedValue(EMPTY_STORE);
  (updateBranch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DEFAULT_AUTOMATION_SETTINGS });
  (getResolvedThreads as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
    summary: { ranAt: 1000, rebased: 0, branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 },
    prUpdates: [],
    resolvedThreads: {},
  });
});

describe('all-clean cycle', () => {
  it('2 clean PRs → both current, no rebase, badge cleared then 0', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 }, { id: 2, number: 2 })
    );
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR({ id: 1, number: 1, mergeable_state: 'clean' }))
      .mockResolvedValueOnce(makePR({ id: 2, number: 2, mergeable_state: 'clean' }));

    await runPollCycle();

    expect(clearBadge).toHaveBeenCalledTimes(1);
    expect(updateBranch).not.toHaveBeenCalled();
    expect(setBadgeCount).toHaveBeenCalledWith(0);

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted).toHaveLength(2);
    expect(upserted[0].state).toBe('current');
    expect(upserted[1].state).toBe('current');
  });
});

describe('behind PR rebase', () => {
  it('single behind PR → rebased, state=updated, badge=1', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'behind' })
    );

    await runPollCycle();

    expect(updateBranch).toHaveBeenCalledWith('org', 'repo', 1);
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('updated');
    expect(setBadgeCount).toHaveBeenCalledWith(1);
  });
});

describe('behind + HTTP_422', () => {
  it('needs-manual state on 422', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'behind' })
    );
    (updateBranch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP_422: Unprocessable'));

    await runPollCycle();

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('needs-manual');
    expect(upserted[0].errorMessage).toBe('Rebase rejected by GitHub');
  });
});

describe('behind + HTTP_409', () => {
  it('conflict state on 409', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'behind' })
    );
    (updateBranch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP_409: Conflict'));

    await runPollCycle();

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('conflict');
    expect(upserted[0].errorMessage).toBe('Merge conflict');
  });
});

describe('dirty PR', () => {
  it('conflict state, no rebase call', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'dirty' })
    );

    await runPollCycle();

    expect(updateBranch).not.toHaveBeenCalled();
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('conflict');
  });
});

describe('unknown mergeable_state', () => {
  it('keeps previousState from store', async () => {
    const existingStore: PRStore = {
      prs: [{ id: 1, number: 1, title: 'PR 1', repo: 'org/repo', url: 'https://github.com/org/repo/pull/1', state: 'behind', lastUpdated: 0 }],
      lastPollAt: null,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(existingStore);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'unknown' })
    );

    await runPollCycle();

    expect(updateBranch).not.toHaveBeenCalled();
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('behind');
  });
});

describe('AUTH_ERROR from getPR aborts cycle', () => {
  it('returns early, no upsertPRs after failure', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('AUTH_ERROR'));

    await runPollCycle();

    expect(upsertPRs).not.toHaveBeenCalled();
    expect(stampPollTime).not.toHaveBeenCalled();
  });
});

describe('NOT_AUTHENTICATED from getPR aborts cycle', () => {
  it('returns early, no upsertPRs', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    await runPollCycle();

    expect(upsertPRs).not.toHaveBeenCalled();
  });
});

describe('RATE_LIMITED from searchAuthoredPRs', () => {
  it('aborts cycle, no saveStore at all', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('RATE_LIMITED'));

    await runPollCycle();

    expect(upsertPRs).not.toHaveBeenCalled();
    expect(pruneStale).not.toHaveBeenCalled();
    expect(stampPollTime).not.toHaveBeenCalled();
  });
});

describe('NOT_AUTHENTICATED from searchAuthoredPRs', () => {
  it('aborts cycle', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    await runPollCycle();

    expect(upsertPRs).not.toHaveBeenCalled();
  });
});

describe('pruneStale', () => {
  it('called with active ids only', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 42, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 42, number: 1, mergeable_state: 'clean' })
    );

    await runPollCycle();

    expect(pruneStale).toHaveBeenCalledWith([42]);
  });
});

describe('stampPollTime', () => {
  it('called after upsert', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );

    const order: string[] = [];
    (upsertPRs as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push('upsert'); return EMPTY_STORE; });
    (stampPollTime as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push('stamp'); return EMPTY_STORE; });

    await runPollCycle();

    expect(order).toEqual(['upsert', 'stamp']);
  });
});

describe('multiple updates badge count', () => {
  it('badge=2 when 2 behind PRs rebase successfully', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 }, { id: 2, number: 2 })
    );
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR({ id: 1, number: 1, mergeable_state: 'behind' }))
      .mockResolvedValueOnce(makePR({ id: 2, number: 2, mergeable_state: 'behind' }));

    await runPollCycle();

    expect(setBadgeCount).toHaveBeenCalledWith(2);
  });
});

describe('HTTP_500 from getPR keeps cycle running', () => {
  it('errored PR recorded, other PRs still processed', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 }, { id: 2, number: 2 })
    );
    (getPR as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('HTTP_500: Server Error'))
      .mockResolvedValueOnce(makePR({ id: 2, number: 2, mergeable_state: 'clean' }));

    await runPollCycle();

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted).toHaveLength(2);
    const pr1 = upserted.find((p: { id: number }) => p.id === 1);
    const pr2 = upserted.find((p: { id: number }) => p.id === 2);
    expect(pr1.state).toBe('error');
    expect(pr2.state).toBe('current');
  });
});

describe('AUTH_ERROR from updateBranch aborts cycle', () => {
  it('no upsertPRs after auth error in rebase', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'behind' })
    );
    (updateBranch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('AUTH_ERROR'));

    await runPollCycle();

    expect(upsertPRs).not.toHaveBeenCalled();
  });
});

describe('error PR retried on next cycle', () => {
  it('PR previously in error transitions to current when getPR succeeds next cycle', async () => {
    // Story 1.10 AC: error PRs are retried on the next poll cycle.
    const previousStore: PRStore = {
      prs: [{
        id: 1, number: 1, title: 'PR 1', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/1',
        state: 'error', lastUpdated: 1000, errorMessage: 'HTTP_500: Server Error',
      }],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(previousStore);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    // This cycle, getPR succeeds with mergeable_state=clean.
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );

    await runPollCycle();

    // The error PR was re-fetched (no skip-on-error logic).
    expect(getPR).toHaveBeenCalledTimes(1);
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].id).toBe(1);
    expect(upserted[0].state).toBe('current');
    // errorMessage cleared on the new state.
    expect(upserted[0].errorMessage).toBeUndefined();
  });

  it('PR previously in error stays in error when getPR fails again', async () => {
    const previousStore: PRStore = {
      prs: [{
        id: 1, number: 1, title: 'PR 1', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/1',
        state: 'error', lastUpdated: 1000, errorMessage: 'HTTP_500',
      }],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(previousStore);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP_502: Bad Gateway'));

    await runPollCycle();

    expect(getPR).toHaveBeenCalledTimes(1);
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('error');
    expect(upserted[0].errorMessage).toContain('HTTP_502');
  });
});

describe('phase-2 automation pass (A3 integration)', () => {
  it('calls runAllAutomations with processedPRs, prDetails, settings, and resolvedThreads', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    const detail = makePR({ id: 1, number: 1, mergeable_state: 'clean' });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    (getResolvedThreads as ReturnType<typeof vi.fn>).mockResolvedValue({ 'thread-1': 999 });

    await runPollCycle();

    expect(runAllAutomations).toHaveBeenCalledTimes(1);
    const call = (runAllAutomations as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prs).toHaveLength(1);
    expect(call.prs[0].id).toBe(1);
    expect(call.prDetails.get(1)).toEqual(detail);
    expect(call.settings).toEqual(DEFAULT_AUTOMATION_SETTINGS);
    expect(call.resolvedThreads).toEqual({ 'thread-1': 999 });
    expect(call.github).toMatchObject({
      getRepo: expect.any(Function),
      deleteRef: expect.any(Function),
      enableAutoMerge: expect.any(Function),
      listThreads: expect.any(Function),
      resolveThread: expect.any(Function),
    });
  });

  it('persists lastPollSummary with rebased count stamped from cycle', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 }, { id: 2, number: 2 })
    );
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR({ id: 1, number: 1, mergeable_state: 'behind' }))
      .mockResolvedValueOnce(makePR({ id: 2, number: 2, mergeable_state: 'clean' }));

    (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: { ranAt: 1000, rebased: 0, branchesDeleted: 1, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 },
      prUpdates: [],
      resolvedThreads: {},
    });

    await runPollCycle();

    expect(saveStore).toHaveBeenCalled();
    // saveStore is called multiple times (pollInProgress flag + summary +
    // pollInProgress reset in finally). Find the call that wrote the summary.
    const summaryCall = (saveStore as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .find((arg) => arg.lastPollSummary != null);
    expect(summaryCall).toBeDefined();
    expect(summaryCall.lastPollSummary).toMatchObject({
      rebased: 1,            // one behind PR rebased
      branchesDeleted: 1,    // from orchestrator result
    });
  });

  it('applies prUpdates patches via second upsertPRs call', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 42, number: 7 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 42, number: 7, mergeable_state: 'clean' })
    );
    (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: { ranAt: 1000, rebased: 0, branchesDeleted: 1, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 },
      prUpdates: [{ prId: 42, patch: { branchDeleted: true } }],
      resolvedThreads: {},
    });

    await runPollCycle();

    // upsertPRs called twice: once for v1 rebase results, once with patches applied.
    expect(upsertPRs).toHaveBeenCalledTimes(2);
    const secondCall = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(secondCall[0].id).toBe(42);
    expect(secondCall[0].branchDeleted).toBe(true);
  });

  it('saves resolvedThreads only when orchestrator returns a different reference', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );

    const sameRef = { 'thread-1': 999 };
    (getResolvedThreads as ReturnType<typeof vi.fn>).mockResolvedValue(sameRef);
    (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: { ranAt: 1000, rebased: 0, branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 },
      prUpdates: [],
      resolvedThreads: sameRef, // same reference — no change
    });

    await runPollCycle();
    expect(saveResolvedThreads).not.toHaveBeenCalled();
  });

  it('saves resolvedThreads when orchestrator returns a new reference', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );
    (getResolvedThreads as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: { ranAt: 1000, rebased: 0, branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 1, errors: 0 },
      prUpdates: [],
      resolvedThreads: { 'thread-2': 1234 },
    });

    await runPollCycle();
    expect(saveResolvedThreads).toHaveBeenCalledWith({ 'thread-2': 1234 });
  });

  it('orchestrator throwing does not break v1 rebase path or block badge update', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'behind' })
    );
    (runAllAutomations as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('orchestrator boom'));

    await runPollCycle();

    // V1 rebase path still ran (badge set, PR upserted).
    expect(updateBranch).toHaveBeenCalled();
    expect(setBadgeCount).toHaveBeenCalledWith(1);
    // No saveStore for summary (the catch swallowed it).
  });

  it('does NOT call upsertPRs a second time when prUpdates is empty', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );
    // Default mock: orchestrator returns empty prUpdates.

    await runPollCycle();

    // Only one upsertPRs (the v1 rebase result).
    expect(upsertPRs).toHaveBeenCalledTimes(1);
  });
});

describe('Phase-2 field carry-over (Codex finding #2 fix)', () => {
  it('preserves branchDeleted/autoMergeEnabled/nodeId from prior store on next poll', async () => {
    const prior: PRStore = {
      prs: [{
        id: 1, number: 1, title: 'PR 1', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/1',
        state: 'current', lastUpdated: 1000,
        // Phase-2 fields cast onto the record (runtime extension).
        branchDeleted: true, autoMergeEnabled: true, nodeId: 'PR_node_xyz',
      } as never],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean', node_id: 'PR_node_xyz' })
    );

    await runPollCycle();

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const pr1 = upserted.find((p: { id: number }) => p.id === 1);
    expect(pr1.branchDeleted).toBe(true);
    expect(pr1.autoMergeEnabled).toBe(true);
    expect(pr1.nodeId).toBe('PR_node_xyz');
    // V1 fields refreshed.
    expect(pr1.state).toBe('current');
  });
});

describe('Transition detection: open→merged/closed (Codex finding #1 fix)', () => {
  it('PR open last cycle, absent from search now, returns merged_at → state=merged + mergedAt set', async () => {
    const prior: PRStore = {
      prs: [{
        id: 99, number: 42, title: 'About to merge', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/42',
        state: 'current', lastUpdated: 1000,
      }],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    // Search returns NOTHING — PR has been merged so it dropped out.
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    // getPR is called for the transitioned PR; returns merged detail.
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 99, number: 42, title: 'About to merge', html_url: 'https://github.com/org/repo/pull/42',
      mergeable_state: 'unknown',
      base: { repo: { full_name: 'org/repo' } },
      state: 'closed', merged: true, merged_at: '2026-05-02T13:00:00Z',
      head: { ref: 'feat/x', repo: { full_name: 'org/repo' } },
    });

    await runPollCycle();

    expect(getPR).toHaveBeenCalledWith('org', 'repo', 42);
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted).toHaveLength(1);
    expect(upserted[0].state).toBe('merged');
    expect(upserted[0].mergedAt).toBe(Date.parse('2026-05-02T13:00:00Z'));
    expect(upserted[0].headRef).toBe('feat/x');
  });

  it('PR open last cycle, absent from search now, returns no merged_at → state=closed', async () => {
    const prior: PRStore = {
      prs: [{
        id: 100, number: 50, title: 'Closed without merge', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/50',
        state: 'current', lastUpdated: 1000,
      }],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 100, number: 50, title: 'Closed without merge', html_url: 'https://github.com/org/repo/pull/50',
      mergeable_state: 'unknown',
      base: { repo: { full_name: 'org/repo' } },
      state: 'closed', merged: false, merged_at: null,
    });

    await runPollCycle();

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('closed');
    expect(upserted[0].mergedAt).toBeUndefined();
  });

  it('Merged PR with branchDeleted=true is NOT re-detected (eligible for prune)', async () => {
    const prior: PRStore = {
      prs: [{
        id: 200, number: 60, title: 'Was merged + branch already cleaned', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/60',
        state: 'merged', lastUpdated: 1000,
        branchDeleted: true,
      } as never],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });

    await runPollCycle();

    // No transition fetch — already done.
    expect(getPR).not.toHaveBeenCalled();
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted).toHaveLength(0);
  });

  it('Merged PR with branchDeleted=false IS re-detected (retry pending deletion)', async () => {
    // Codex finding H2 fix: transient deleteRef failures must not become permanent.
    const prior: PRStore = {
      prs: [{
        id: 201, number: 61, title: 'Branch delete failed last cycle', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/61',
        state: 'merged', lastUpdated: 1000,
        mergedAt: 999, branchDeleted: false,
      } as never],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 201, number: 61, title: 'PR', html_url: 'https://github.com/org/repo/pull/61',
      mergeable_state: 'unknown',
      base: { repo: { full_name: 'org/repo' } },
      state: 'closed', merged: true, merged_at: '2026-05-02T13:00:00Z',
      head: { ref: 'feat/x', repo: { full_name: 'org/repo' } },
    });

    await runPollCycle();

    expect(getPR).toHaveBeenCalledWith('org', 'repo', 61);
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('merged');
    expect(upserted[0].branchDeleted).toBe(false);
  });


  it('PR absent from search but detail.state=open → preserve as open, do not stamp closed (Codex H1.2)', async () => {
    // Defends against the GitHub Search API 1000-result cap: a PR can fall
    // out of search results yet still be open. Detail fetch is the source
    // of truth for state.
    const prior: PRStore = {
      prs: [{
        id: 555, number: 555, title: 'Open but past 1000-result cap', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/555',
        state: 'current', lastUpdated: 1000,
      }],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 555, number: 555, title: 'Open but past 1000-result cap',
      html_url: 'https://github.com/org/repo/pull/555',
      mergeable_state: 'clean',
      base: { repo: { full_name: 'org/repo' } },
      state: 'open', merged: false, merged_at: null,
    });

    await runPollCycle();

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted[0].state).toBe('current');
    expect(upserted[0].state).not.toBe('merged');
    expect(upserted[0].state).not.toBe('closed');
  });

  it('Transient transition-fetch errors preserve the prior record (no permanent drop)', async () => {
    // Codex round-2 H2 fix: a transient HTTP 5xx during transition reprocessing
    // must not cause the PR to fall out of the store via pruneStale.
    const prior: PRStore = {
      prs: [{
        id: 300, number: 70, title: 'PR with flaky GitHub fetch', repo: 'org/repo',
        url: 'https://github.com/org/repo/pull/70',
        state: 'current', lastUpdated: 1000,
      }],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    (getPR as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP_500'));

    await runPollCycle();

    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Prior record preserved — its state stays 'current', will retry next cycle.
    expect(upserted).toHaveLength(1);
    expect(upserted[0].id).toBe(300);
    expect(upserted[0].state).toBe('current');
  });
});

describe('ignoredRepos filter', () => {
  it('drops search items whose repo is in ignoredRepos and never fetches their PR', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      ignoredRepos: ['org/secret'],
    });
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({ prs: [], lastPollAt: null });
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        { id: 1, number: 1, title: 'A', html_url: '', repository_url: 'https://api.github.com/repos/org/keep' },
        { id: 2, number: 2, title: 'B', html_url: '', repository_url: 'https://api.github.com/repos/org/secret' },
      ],
    });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ mergeable_state: 'clean' }));

    await runPollCycle();

    // Only the kept PR was fetched.
    expect((getPR as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((getPR as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['org', 'keep', 1]);
    // Only the kept PR was persisted.
    const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upserted).toHaveLength(1);
    expect(upserted[0].repo).toBe('org/keep');
  });

  it('drops store transitions for ignored repos so pruneStale evicts them', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      ignoredRepos: ['org/secret'],
    });
    const prior: PRStore = {
      prs: [
        { id: 1, number: 1, title: 'kept', repo: 'org/keep', url: '', state: 'current', lastUpdated: 0 },
        { id: 2, number: 2, title: 'ignored', repo: 'org/secret', url: '', state: 'current', lastUpdated: 0 },
      ],
      lastPollAt: 1000,
    };
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue(prior);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ state: 'closed', merged: false }));

    await runPollCycle();

    // Only the kept PR's transition was detected — ignored repo was skipped entirely.
    expect((getPR as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect((getPR as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('org');
    expect((getPR as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('keep');
    // pruneStale receives only the kept id; ignored PR will be evicted from the store.
    const activeIds = (pruneStale as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(activeIds).toEqual([1]);
  });

  it('falls back to "no repos ignored" when settings load fails', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('storage down'));
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({ prs: [], lastPollAt: null });
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [{ id: 1, number: 1, title: 'A', html_url: '', repository_url: 'https://api.github.com/repos/org/keep' }],
    });
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ mergeable_state: 'clean' }));

    await runPollCycle();

    expect((getPR as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

// ── Activity log integration ─────────────────────────────────────────────────

describe('activity log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({ ...EMPTY_STORE });
    (saveStore as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (upsertPRs as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (pruneStale as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (stampPollTime as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (updateBranch as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
    });
    (getResolvedThreads as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (appendActivity as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: {
        ranAt: 1000, rebased: 0, branchesDeleted: 0,
        autoMergeEnabled: 0, threadsResolved: 0, errors: 0,
      },
      prUpdates: [],
      resolvedThreads: {},
    });
  });

  it('calls appendActivity EXACTLY ONCE per cycle even with multiple write actions', async () => {
    // Cycle: 1 rebase + 1 branch-delete + 1 auto-merge-enabled.
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult(
        { id: 1, number: 1, title: 'Rebase PR' },
        { id: 2, number: 2, title: 'Merge PR' },
        { id: 3, number: 3, title: 'AutoMerge PR' },
      )
    );
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR({ id: 1, number: 1, mergeable_state: 'behind' }))
      .mockResolvedValueOnce(makePR({ id: 2, number: 2, mergeable_state: 'clean' }))
      .mockResolvedValueOnce(makePR({ id: 3, number: 3, mergeable_state: 'clean' }));

    (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: {
        ranAt: 1000, rebased: 0, branchesDeleted: 1,
        autoMergeEnabled: 1, threadsResolved: 0, errors: 0,
      },
      prUpdates: [
        { prId: 2, patch: { branchDeleted: true } },
        { prId: 3, patch: { autoMergeEnabled: true } },
      ],
      resolvedThreads: {},
    });

    await runPollCycle();

    // appendActivity must be called exactly once per cycle.
    expect(appendActivity).toHaveBeenCalledTimes(1);
  });

  it('activity entries include rebase and branch_deleted', async () => {
    // Simple scenario: 1 rebase PR in search, 1 merged PR (with headRef) triggers branch delete.
    // The merged PR (id=2) is NOT in the current search → ends up in toReprocess.
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1, title: 'Rebase Me' })
    );
    // getPR calls: first for id=1 (search loop), second for id=2 (transition reprocess)
    (getPR as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makePR({ id: 1, number: 1, mergeable_state: 'behind' }))
      .mockResolvedValueOnce(
        makePR({ id: 2, number: 2, title: 'Delete Branch',
          state: 'closed', merged: true, merged_at: '2024-01-01T00:00:00Z',
          head: { ref: 'feat/x', repo: { full_name: 'org/repo' } } } as PullRequest)
      );
    // Store has a merged PR that still needs branch deletion.
    (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({
      prs: [
        { id: 2, number: 2, title: 'Delete Branch', repo: 'org/repo',
          url: 'http://u', state: 'merged', lastUpdated: 1, mergedAt: 1000,
          headRef: 'feat/x' },
      ],
      lastPollAt: null,
    });

    (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: {
        ranAt: 1000, rebased: 0, branchesDeleted: 1,
        autoMergeEnabled: 0, threadsResolved: 0, errors: 0,
      },
      prUpdates: [{ prId: 2, patch: { branchDeleted: true } }],
      resolvedThreads: {},
    });

    await runPollCycle();

    const entries = (appendActivity as ReturnType<typeof vi.fn>).mock.calls[0][0] as ActivityEntry[];
    const rebaseEntry = entries.find((e) => e.action === 'rebase');
    const deleteEntry = entries.find((e) => e.action === 'branch_deleted');

    expect(rebaseEntry).toBeDefined();
    expect(rebaseEntry?.prTitle).toBe('Rebase Me');
    expect(rebaseEntry?.result).toBe('success');

    expect(deleteEntry).toBeDefined();
    expect(deleteEntry?.prTitle).toBe('Delete Branch');
    expect(deleteEntry?.result).toBe('success');
    expect(deleteEntry?.branchRef).toBe('feat/x');
  });

  it('storage write failure in appendActivity is non-fatal — cycle completes normally', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );
    (appendActivity as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('quota exceeded')
    );

    // Cycle should complete without throwing.
    await expect(runPollCycle()).resolves.toBeUndefined();
  });

  it('rebase failure is recorded as failed activity entry', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1, title: 'Behind PR' })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'behind' })
    );
    (updateBranch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('HTTP_422: Unprocessable')
    );

    await runPollCycle();

    const entries = (appendActivity as ReturnType<typeof vi.fn>).mock.calls[0][0] as ActivityEntry[];
    const rebaseEntry = entries.find((e) => e.action === 'rebase');
    expect(rebaseEntry?.result).toBe('failed');
    expect(rebaseEntry?.errorMessage).toBeDefined();
  });

  it('no activity entries written when cycle has no write actions', async () => {
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 1, number: 1 })
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 1, number: 1, mergeable_state: 'clean' })
    );

    await runPollCycle();

    // appendActivity is still called with an empty array (no-op inside implementation).
    // Or not called at all — both are acceptable. What matters: no entries written.
    const calls = (appendActivity as ReturnType<typeof vi.fn>).mock.calls;
    const entryCount = calls.reduce(
      (sum: number, call: unknown[]) => sum + ((call[0] as ActivityEntry[]).length ?? 0),
      0
    );
    expect(entryCount).toBe(0);
  });
});
