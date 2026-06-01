// CHARACTERIZATION WALL (PREVIEW-1 T0) — merge-clean (MERGE-2 direct-merge).
//
// THE CENTRAL DIVERGENCE GUARD. The MERGE-2 decision lives INLINE in
// orchestrator.ts:179-325 (no module yet) — T1 extracts it into
// `decideDirectMerge`. This wall pins the EXACT mutation tuples + bookkeeping the
// inline path performs today, as hard literals, by driving the REAL
// `runAllAutomations` end-to-end.
//
// CRITICAL fixture requirement (plan §3 T0): MERGE-2 is reachable ONLY when the
// stubbed `enableAutoMerge` dep returns the `/clean status/i` rejection so
// `cleanIds` is populated. Each fixture names that return value explicitly — without
// it the whole matrix is unexercised and the wall pins nothing.
//
// `Date.now()` (orchestrator.ts:255-256 merge-success patch; :414 summary.ranAt) is
// pinned via fake timers so `mergedAt`/`lastUpdated`/`ranAt` are deterministic literals.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAllAutomations, type OrchestratorDeps } from '../../../../src/background/automations/orchestrator';
import type { PullRequestDetail } from '../../../../src/background/automations/adapters';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../../src/core/automations-types';
import type { AutomationSettings, PRRecordPhaseTwo } from '../../../../src/core/automations-types';
import type { PRRecord } from '../../../../src/core/types';

const NOW = 1_700_000_000_000;

// Isolate MERGE-2: auto-merge ON + merge-clean ON, the other two automations OFF.
function settings(over: Partial<AutomationSettings> = {}): AutomationSettings {
  return {
    ...DEFAULT_AUTOMATION_SETTINGS,
    autoEnableAutoMerge: true,
    mergeCleanPRsImmediately: true,
    autoDeleteMergedBranch: false,
    autoResolveOutdatedThreads: false,
    mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
    ...over,
  };
}

function pr(over: Partial<PRRecord & PRRecordPhaseTwo> = {}): PRRecord {
  return {
    id: 1,
    number: 10,
    title: 'PR',
    repo: 'owner/repo',
    url: 'https://github.com/owner/repo/pull/10',
    state: 'current',
    lastUpdated: 0,
    ...over,
  } as PRRecord;
}

// Minimal PullRequestDetail — only the fields the orchestrator/adapters read.
// `missingSha` is an explicit flag (NOT `sha: undefined`, which would trip
// destructuring-default and re-supply the sha).
function detail(over: { sha?: string; nodeId?: string; mergeable_state?: string; missingSha?: boolean } = {}): PullRequestDetail {
  const { sha = 'sha-abc', nodeId = 'NODE', mergeable_state = 'clean', missingSha = false } = over;
  return {
    node_id: nodeId,
    draft: false,
    auto_merge: null,
    mergeable_state,
    base: { repo: { full_name: 'owner/repo' } },
    head: missingSha ? {} : { sha, ref: 'feature', repo: { full_name: 'owner/repo' } },
  } as unknown as PullRequestDetail;
}

// A repo that allows all methods (so SQUASH resolves first per the preference list).
const REPO_ALL = { delete_branch_on_merge: false, allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true };

// enableAutoMerge that DRIVES the clean-status rejection → populates `cleanIds`.
const cleanStatusReject = vi.fn().mockResolvedValue({ enabled: false, unsupported: true, reason: 'Pull request is in clean status' });

function deps(over: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  return {
    getRepo: vi.fn().mockResolvedValue(REPO_ALL),
    deleteRef: vi.fn(),
    enableAutoMerge: cleanStatusReject,
    listThreads: vi.fn().mockResolvedValue([]),
    resolveThread: vi.fn(),
    mergePR: vi.fn().mockResolvedValue({ merged: true, sha: 'sha-abc' }),
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  cleanStatusReject.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('CHAR merge-clean (MERGE-2) — direct-merge mutation + bookkeeping literals', () => {
  it('clean PR, allowed method → mergePR(SQUASH) fires; mergedNowEntries success + merge patch literal', async () => {
    const d = deps();
    const result = await runAllAutomations({
      prs: [pr({ id: 1, number: 10, repo: 'owner/repo' })],
      prDetails: new Map([[1, detail()]]),
      settings: settings(),
      resolvedThreads: {},
      github: d,
    });

    expect(d.mergePR).toHaveBeenCalledWith('owner', 'repo', 10, { sha: 'sha-abc', merge_method: 'squash' });
    expect(result.mergedNowEntries).toEqual([{ prId: 1, method: 'SQUASH', result: 'success' }]);
    // The merge-success prUpdate patch (orchestrator.ts:251-261), pinned literal incl. Date.now-stamped fields.
    expect(result.prUpdates).toContainEqual({
      prId: 1,
      patch: {
        state: 'merged',
        mergedAt: NOW,
        lastUpdated: NOW,
        autoMergeUnsupported: false,
        autoMergeUnsupportedReason: undefined,
        lastDirectMergeFailure: undefined,
      },
    });
    // E3: the `already_clean` skip entry is suppressed once the PR is consumed by the fall-through.
    expect(result.skippedAutoMergeEntries).toEqual([]);
    expect(result.summary.ranAt).toBe(NOW);
    expect(result.summary.errors).toBe(0);
  });

  it('clean PR in mergeCleanPRsOptOutRepos → NO mergePR; already_clean skip entry SURVIVES (not consumed)', async () => {
    const d = deps();
    const result = await runAllAutomations({
      prs: [pr({ id: 2, number: 11, repo: 'owner/skip' })],
      prDetails: new Map([[2, detail()]]),
      settings: settings({ mergeCleanPRsOptOutRepos: ['owner/skip'] }),
      resolvedThreads: {},
      github: d,
    });

    expect(d.mergePR).not.toHaveBeenCalled();
    expect(result.mergedNowEntries).toEqual([]);
    expect(result.skippedAutoMergeEntries).toEqual([{ prId: 2, skipReason: 'already_clean' }]);
  });

  it('no allowed method → caught in runEnableAutoMerge as noAllowedMethodPRs (never reaches MERGE-2); autoMergeSkipReason patch, NO merge, NO error', async () => {
    // resolveMergeMethod is the SAME for both the enable filter and the MERGE-2 loop, so a
    // no-allowed-method PR is dropped to noAllowedMethodPRs BEFORE `enable` is called — it is
    // never in `cleanIds`, so the MERGE-2 `chosenMethod===null` branch is unreachable in real flow.
    const d = deps({ getRepo: vi.fn().mockResolvedValue({ ...REPO_ALL, allow_squash_merge: false, allow_merge_commit: false, allow_rebase_merge: false }) });
    const result = await runAllAutomations({
      prs: [pr({ id: 3, number: 12 })],
      prDetails: new Map([[3, detail()]]),
      settings: settings(),
      resolvedThreads: {},
      github: d,
    });

    expect(d.enableAutoMerge).not.toHaveBeenCalled(); // dropped before the enable call
    expect(d.mergePR).not.toHaveBeenCalled();
    expect(result.mergedNowEntries).toEqual([]);
    expect(result.prUpdates).toContainEqual({ prId: 3, patch: { autoMergeSkipReason: 'no-allowed-method' } });
    expect(result.summary.errors).toBe(0); // no-allowed-method is a badge, not an error
  });

  it('missing headSha → MERGE-2 skips the PR (no mergePR), already_clean skip survives', async () => {
    const d = deps();
    const result = await runAllAutomations({
      prs: [pr({ id: 4, number: 13 })],
      prDetails: new Map([[4, detail({ missingSha: true })]]),
      settings: settings(),
      resolvedThreads: {},
      github: d,
    });

    expect(d.mergePR).not.toHaveBeenCalled();
    expect(result.mergedNowEntries).toEqual([]);
    expect(result.skippedAutoMergeEntries).toEqual([{ prId: 4, skipReason: 'already_clean' }]);
  });

  it('mergePR resolves { merged:false } → NOT_MERGED failure branch + lastDirectMergeFailure patch', async () => {
    const d = deps({ mergePR: vi.fn().mockResolvedValue({ merged: false, sha: 'sha-abc' }) });
    const result = await runAllAutomations({
      prs: [pr({ id: 5, number: 14 })],
      prDetails: new Map([[5, detail()]]),
      settings: settings(),
      resolvedThreads: {},
      github: d,
    });

    expect(result.mergedNowEntries).toEqual([{ prId: 5, method: 'SQUASH', result: 'failed', error: 'NOT_MERGED' }]);
    expect(result.prUpdates).toContainEqual({
      prId: 5,
      patch: { autoMergeUnsupported: false, autoMergeUnsupportedReason: undefined, lastDirectMergeFailure: { sha: 'sha-abc', error: 'NOT_MERGED', method: 'SQUASH' } },
    });
    expect(result.summary.errors).toBe(1);
  });

  it('mergePR throws → caught, failure branch records thrown message, errors++', async () => {
    const d = deps({ mergePR: vi.fn().mockRejectedValue(new Error('SHA_MISMATCH')) });
    const result = await runAllAutomations({
      prs: [pr({ id: 6, number: 15 })],
      prDetails: new Map([[6, detail()]]),
      settings: settings(),
      resolvedThreads: {},
      github: d,
    });

    expect(result.mergedNowEntries).toEqual([{ prId: 6, method: 'SQUASH', result: 'failed', error: 'SHA_MISMATCH' }]);
    expect(result.summary.errors).toBe(1);
  });

  it('dedup: unchanged lastDirectMergeFailure { sha, method, error } → NO new mergedNowEntries, errors still ++', async () => {
    const d = deps({ mergePR: vi.fn().mockRejectedValue(new Error('SHA_MISMATCH')) });
    const result = await runAllAutomations({
      prs: [pr({ id: 7, number: 16, lastDirectMergeFailure: { sha: 'sha-abc', error: 'SHA_MISMATCH', method: 'SQUASH' } })],
      prDetails: new Map([[7, detail()]]),
      settings: settings(),
      resolvedThreads: {},
      github: d,
    });

    // Same failure as the persisted one → deduped: no fresh activity entry, but the wire failure still counts.
    expect(result.mergedNowEntries).toEqual([]);
    expect(result.summary.errors).toBe(1);
  });
});
