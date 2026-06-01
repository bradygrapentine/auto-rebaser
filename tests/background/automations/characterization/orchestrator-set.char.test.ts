// CHARACTERIZATION WALL (PREVIEW-1 T0) — orchestrator end-to-end set.
//
// Pins the FULL OrchestratorResult (summary tallies + every activity-entry array
// + prUpdates) when all three automations run together over a mixed fixture, as
// hard literals, BEFORE T1's decision/execution split. This is the integration
// guard: the per-module walls pin each decision; this one pins how the
// orchestrator assembles them into the result the poll cycle consumes.
//
// `Date.now()` (summary.ranAt) pinned via fake timers.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAllAutomations, type OrchestratorDeps } from '../../../../src/background/automations/orchestrator';
import type { PullRequestDetail } from '../../../../src/background/automations/adapters';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../../src/core/automations-types';
import type { PRRecord } from '../../../../src/core/types';
import type { PRRecordPhaseTwo } from '../../../../src/core/automations-types';

const NOW = 1_700_000_000_000;

function pr(over: Partial<PRRecord & PRRecordPhaseTwo>): PRRecord {
  return {
    id: 1, number: 1, title: 'PR', repo: 'owner/repo',
    url: 'https://github.com/owner/repo/pull/1', state: 'current', lastUpdated: 0, ...over,
  } as PRRecord;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe('CHAR orchestrator-set — full result assembly across all three automations', () => {
  it('enable + delete-branch + resolve-thread together → exact summary, prUpdates, entry arrays', async () => {
    // PR 1: open clean → auto-merge ENABLED (squash). PR 2: merged → branch DELETED.
    // PR 3: open → has ONE obsolete thread RESOLVED.
    const prs: PRRecord[] = [
      pr({ id: 1, number: 11, repo: 'owner/a' }),
      pr({ id: 2, number: 22, repo: 'owner/b', mergedAt: 999, branchDeleted: false } as Partial<PRRecord & PRRecordPhaseTwo>),
      pr({ id: 3, number: 33, repo: 'owner/c' }),
    ];

    const prDetails = new Map<number, PullRequestDetail>([
      // PR 1: clean, no auto-merge yet → the ONLY auto-merge-enable target.
      [1, { node_id: 'N1', draft: false, auto_merge: null, mergeable_state: 'clean', base: { repo: { full_name: 'owner/a' } }, head: { sha: 's1', ref: 'f1', repo: { full_name: 'owner/a' } } } as unknown as PullRequestDetail],
      // PR 2: already auto-merge-enabled → SKIPPED by enable; it's the delete-branch target (merged).
      [2, { node_id: 'N2', draft: false, auto_merge: { enabled: true }, mergeable_state: 'clean', base: { repo: { full_name: 'owner/b' } }, head: { sha: 's2', ref: 'feature-2', repo: { full_name: 'owner/b' } } } as unknown as PullRequestDetail],
      // PR 3: draft → SKIPPED by enable; it's the resolve-thread target.
      [3, { node_id: 'N3', draft: true, auto_merge: null, mergeable_state: 'clean', base: { repo: { full_name: 'owner/c' } }, head: { sha: 's3', ref: 'f3', repo: { full_name: 'owner/c' } } } as unknown as PullRequestDetail],
    ]);

    const github: OrchestratorDeps = {
      getRepo: vi.fn().mockResolvedValue({ delete_branch_on_merge: false, allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true }),
      deleteRef: vi.fn().mockResolvedValue('deleted'),
      enableAutoMerge: vi.fn().mockResolvedValue({ enabled: true, unsupported: false }),
      listThreads: vi.fn(async (_o, _r, num) =>
        num === 33 ? [{ id: 'TH', isResolved: false, isOutdated: true, line: null }] : [],
      ),
      resolveThread: vi.fn().mockResolvedValue(undefined),
      mergePR: vi.fn(),
    };

    const result = await runAllAutomations({
      prs,
      prDetails,
      settings: {
        ...DEFAULT_AUTOMATION_SETTINGS,
        autoEnableAutoMerge: true,
        mergeCleanPRsImmediately: false,
        autoDeleteMergedBranch: true,
        autoResolveOutdatedThreads: true,
        mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
      },
      resolvedThreads: {},
      github,
    });

    // Summary tallies — the headline literal.
    expect(result.summary).toEqual({ ranAt: NOW, rebased: 0, branchesDeleted: 1, autoMergeEnabled: 1, threadsResolved: 1, errors: 0 });

    // Auto-merge: enabled patch + method map.
    expect(result.prUpdates).toContainEqual({ prId: 1, patch: { autoMergeEnabled: true } });
    expect(result.autoMergeMethodByPRId).toEqual({ 1: 'SQUASH' });

    // Delete-branch: only the merged PR (2) had its branch deleted.
    expect(result.prUpdates).toContainEqual({ prId: 2, patch: { branchDeleted: true } });
    expect(github.deleteRef).toHaveBeenCalledWith('owner', 'b', 'feature-2');

    // Resolve-thread: PR 3's obsolete thread.
    expect(result.resolvedThreadEntries).toEqual([{ threadId: 'TH', repo: 'owner/c', prNumber: 33 }]);
    expect(result.resolvedThreads).toEqual({ TH: NOW });

    // No failures anywhere.
    expect(result.failedAutoMergeEntries).toEqual([]);
    expect(result.failedThreadEntries).toEqual([]);
    expect(result.mergedNowEntries).toEqual([]);
    expect(result.skippedAutoMergeEntries).toEqual([]);
  });

  it('all automations OFF → empty result, no deps called, summary all-zero (default-mode behavior)', async () => {
    const github: OrchestratorDeps = {
      getRepo: vi.fn(), deleteRef: vi.fn(), enableAutoMerge: vi.fn(),
      listThreads: vi.fn(), resolveThread: vi.fn(), mergePR: vi.fn(),
    };
    const result = await runAllAutomations({
      prs: [pr({ id: 1 })],
      prDetails: new Map(),
      settings: { ...DEFAULT_AUTOMATION_SETTINGS, autoEnableAutoMerge: false, autoDeleteMergedBranch: false, autoResolveOutdatedThreads: false },
      resolvedThreads: {},
      github,
    });

    expect(result.summary).toEqual({ ranAt: NOW, rebased: 0, branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 });
    expect(result.prUpdates).toEqual([]);
    expect(github.getRepo).not.toHaveBeenCalled();
    expect(github.listThreads).not.toHaveBeenCalled();
  });
});
