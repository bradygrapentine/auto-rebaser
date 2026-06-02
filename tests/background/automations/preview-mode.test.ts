// PREVIEW-1 (T2) — the orchestrator preview branch.
//
// Drives the REAL `runAllAutomations` (no module mocks) so the shared `decide*`
// predicates run for real. Proves three things:
//   1. Read-only — preview fires NO mutation (the 4 mutating deps throw + are
//      asserted never-called) and persists nothing (all activity arrays empty).
//   2. Equivalence — for the PREVIEWABLE kinds, preview's action set maps 1:1 to
//      the execute path's actual mutation tuples (via a normalizer).
//   3. Direct-merge honesty — never previewable read-only; flagged + candidate
//      ids listed as a SUPERSET of the true execute direct-merge set.
import { describe, it, expect, vi } from 'vitest';
import { runAllAutomations, type OrchestratorDeps } from '../../../src/background/automations/orchestrator';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';
import type { AutomationSettings } from '../../../src/core/automations-types';
import type { PRRecord } from '../../../src/core/types';
import type { PullRequestDetail } from '../../../src/background/automations/adapters';
import type { PlannedAction } from '../../../src/background/automations/planned-action';

function settings(over: Partial<AutomationSettings> = {}): AutomationSettings {
  return { ...DEFAULT_AUTOMATION_SETTINGS, ...over };
}

function makePR(over: Partial<PRRecord & { mergedAt?: number; branchDeleted?: boolean }> = {}): PRRecord {
  return {
    id: 1, number: 1, title: 'PR', repo: 'o/r', url: 'https://x/1',
    state: 'current', lastUpdated: 0, ...over,
  } as PRRecord;
}

function makeDetail(over: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    id: 1, number: 1, title: 'PR', html_url: 'https://x/1',
    mergeable_state: 'clean', base: { repo: { full_name: 'o/r' } },
    node_id: 'N1', draft: false, auto_merge: null,
    head: { ref: 'f', sha: 'sha', repo: { full_name: 'o/r' } },
    ...over,
  };
}

const REPO_OK = { delete_branch_on_merge: false, allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true };

/** Mutating deps that THROW — used in preview mode to prove read-only. Reads (getRepo/listThreads) still answer. */
function throwingDeps(listThreads: OrchestratorDeps['listThreads']): OrchestratorDeps {
  return {
    getRepo: vi.fn().mockResolvedValue(REPO_OK),
    listThreads,
    deleteRef: vi.fn(() => { throw new Error('MUTATION: deleteRef'); }),
    enableAutoMerge: vi.fn(() => { throw new Error('MUTATION: enableAutoMerge'); }),
    resolveThread: vi.fn(() => { throw new Error('MUTATION: resolveThread'); }),
    mergePR: vi.fn(() => { throw new Error('MUTATION: mergePR'); }),
  };
}

describe('preview mode — read-only', () => {
  it('runs decide* predicates, fires NO mutation, persists nothing', async () => {
    const prs = [
      makePR({ id: 1, number: 101, repo: 'o/a' }),                                          // enable
      makePR({ id: 2, number: 102, repo: 'o/b', state: 'merged', mergedAt: 9, branchDeleted: false }), // delete
      makePR({ id: 3, number: 103, repo: 'o/c' }),                                          // resolve
    ];
    const prDetails = new Map<number, PullRequestDetail>([
      [1, makeDetail({ id: 1, number: 101, node_id: 'N1', base: { repo: { full_name: 'o/a' } }, head: { ref: 'fa', sha: 's1', repo: { full_name: 'o/a' } } })],
      [2, makeDetail({ id: 2, number: 102, node_id: 'N2', auto_merge: { enabled: true }, base: { repo: { full_name: 'o/b' } }, head: { ref: 'fb', sha: 's2', repo: { full_name: 'o/b' } } })],
      [3, makeDetail({ id: 3, number: 103, node_id: 'N3', draft: true, base: { repo: { full_name: 'o/c' } }, head: { ref: 'fc', sha: 's3', repo: { full_name: 'o/c' } } })],
    ]);
    const listThreads = vi.fn(async (_o: string, _n: string, num: number) =>
      num === 103 ? [{ id: 'tC', isResolved: false, isOutdated: true, line: null }] : [],
    );
    const github = throwingDeps(listThreads);

    const result = await runAllAutomations({
      prs, prDetails,
      settings: settings({ autoEnableAutoMerge: true, autoDeleteMergedBranch: true, autoResolveOutdatedThreads: true }),
      resolvedThreads: {}, github, mode: 'preview',
    });

    // ── Read-only: the four mutating deps were never called ──
    expect(github.enableAutoMerge).not.toHaveBeenCalled();
    expect(github.deleteRef).not.toHaveBeenCalled();
    expect(github.resolveThread).not.toHaveBeenCalled();
    expect(github.mergePR).not.toHaveBeenCalled();

    // ── Persists nothing: prUpdates empty, summary all 0, every activity array empty ──
    expect(result.prUpdates).toEqual([]);
    expect(result.summary).toEqual({ ranAt: expect.any(Number), rebased: 0, branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0, errors: 0 });
    expect(result.mergedNowEntries).toEqual([]);
    expect(result.failedAutoMergeEntries).toEqual([]);
    expect(result.skippedAutoMergeEntries).toEqual([]);
    expect(result.resolvedThreadEntries).toEqual([]);
    expect(result.failedThreadEntries).toEqual([]);
    expect(result.autoMergeMethodByPRId).toEqual({});

    // ── Projection has exactly the three previewable actions ──
    const p = result.preview!;
    expect(p).toBeDefined();
    expect(p.directMergePreviewable).toBe(false);
    const kinds = p.actions.map((a) => a.kind).sort();
    expect(kinds).toEqual(['delete-branch', 'enable-auto-merge', 'resolve-thread']);
    expect(p.counts).toEqual({ 'enable-auto-merge': 1, 'direct-merge': 0, 'delete-branch': 1, 'resolve-thread': 1 });
  });

  it('mode defaults to execute — no mode ⇒ preview undefined', async () => {
    const result = await runAllAutomations({
      prs: [], prDetails: new Map(), settings: settings(), resolvedThreads: {},
      github: throwingDeps(vi.fn().mockResolvedValue([])),
    });
    expect(result.preview).toBeUndefined();
  });
});

// ── Equivalence normalizer: project BOTH a PlannedAction and a raw mutation spy
// arg-tuple into ONE canonical tuple keyed by the fields each side genuinely
// shares. (Enable is keyed by nodeId — the identifier the mutation actually
// carries — not prNumber; the spy only receives nodeId+method.) direct-merge →
// null on both sides (preview never emits it; execute's mergePR is dropped).
type Canon = { kind: string; a?: string; b?: string; c?: string } | null;

function normalizeFromPlannedAction(x: PlannedAction): Canon {
  switch (x.kind) {
    case 'enable-auto-merge': return { kind: x.kind, a: x.nodeId, b: x.method };
    case 'delete-branch': return { kind: x.kind, a: x.owner, b: x.name, c: x.headRef };
    case 'resolve-thread': return { kind: x.kind, a: x.threadId };
    case 'direct-merge': return null;
  }
}

type SpyKind = 'enable-auto-merge' | 'delete-branch' | 'resolve-thread' | 'direct-merge';
function normalizeFromSpyArgs(kind: SpyKind, args: unknown[]): Canon {
  switch (kind) {
    case 'enable-auto-merge': return { kind, a: args[0] as string, b: args[1] as string };
    case 'delete-branch': return { kind, a: args[0] as string, b: args[1] as string, c: args[2] as string };
    case 'resolve-thread': return { kind, a: args[0] as string };
    case 'direct-merge': return null;
  }
}

const sortKey = (c: Canon) => JSON.stringify(c);

describe('preview ≡ execute for the previewable kinds (normalized)', () => {
  it('normalizer is non-trivial: same canonical tuple from an action and its spy args', () => {
    expect(normalizeFromPlannedAction({ kind: 'enable-auto-merge', prId: 9, nodeId: 'N9', repo: 'o/a', number: 90, method: 'SQUASH' }))
      .toEqual(normalizeFromSpyArgs('enable-auto-merge', ['N9', 'SQUASH']));
  });

  it('preview action set maps 1:1 to execute mutation tuples', async () => {
    const prs = [
      makePR({ id: 1, number: 101, repo: 'o/a' }),
      makePR({ id: 2, number: 102, repo: 'o/b', state: 'merged', mergedAt: 9, branchDeleted: false }),
      makePR({ id: 3, number: 103, repo: 'o/c' }),
    ];
    const prDetails = new Map<number, PullRequestDetail>([
      [1, makeDetail({ id: 1, number: 101, node_id: 'N1', base: { repo: { full_name: 'o/a' } }, head: { ref: 'fa', sha: 's1', repo: { full_name: 'o/a' } } })],
      [2, makeDetail({ id: 2, number: 102, node_id: 'N2', auto_merge: { enabled: true }, base: { repo: { full_name: 'o/b' } }, head: { ref: 'fb', sha: 's2', repo: { full_name: 'o/b' } } })],
      [3, makeDetail({ id: 3, number: 103, node_id: 'N3', draft: true, base: { repo: { full_name: 'o/c' } }, head: { ref: 'fc', sha: 's3', repo: { full_name: 'o/c' } } })],
    ]);
    const listThreads = vi.fn(async (_o: string, _n: string, num: number) =>
      num === 103 ? [{ id: 'tC', isResolved: false, isOutdated: true, line: null }] : [],
    );
    const st = settings({ autoEnableAutoMerge: true, autoDeleteMergedBranch: true, autoResolveOutdatedThreads: true });

    // ── Execute: real run* with recording spy deps ──
    const exec: OrchestratorDeps = {
      getRepo: vi.fn().mockResolvedValue(REPO_OK),
      listThreads,
      enableAutoMerge: vi.fn().mockResolvedValue({ enabled: true, unsupported: false }),
      deleteRef: vi.fn().mockResolvedValue('deleted'),
      resolveThread: vi.fn().mockResolvedValue(undefined),
      mergePR: vi.fn().mockResolvedValue({ merged: true, sha: 'x' }),
    };
    await runAllAutomations({ prs, prDetails, settings: st, resolvedThreads: {}, github: exec });

    const executeTuples = [
      ...vi.mocked(exec.enableAutoMerge).mock.calls.map((c) => normalizeFromSpyArgs('enable-auto-merge', c)),
      ...vi.mocked(exec.deleteRef).mock.calls.map((c) => normalizeFromSpyArgs('delete-branch', c)),
      ...vi.mocked(exec.resolveThread).mock.calls.map((c) => normalizeFromSpyArgs('resolve-thread', c)),
      ...vi.mocked(exec.mergePR).mock.calls.map((c) => normalizeFromSpyArgs('direct-merge', c)),
    ].filter((c): c is Exclude<Canon, null> => c !== null).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    // ── Preview: real decide* via the preview branch ──
    const prev = await runAllAutomations({ prs, prDetails, settings: st, resolvedThreads: {}, github: throwingDeps(listThreads), mode: 'preview' });
    const previewableTuples = prev.preview!.actions
      .map(normalizeFromPlannedAction)
      .filter((c): c is Exclude<Canon, null> => c !== null)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    expect(previewableTuples).toEqual(executeTuples);
    // Spot the three expected canonical tuples explicitly.
    expect(previewableTuples).toEqual([
      { kind: 'delete-branch', a: 'o', b: 'b', c: 'fb' },
      { kind: 'enable-auto-merge', a: 'N1', b: 'SQUASH' },
      { kind: 'resolve-thread', a: 'tC' },
    ]);
  });
});

describe('direct-merge is not previewable (honest carve-out + superset)', () => {
  it('execute direct-merges D; preview flags it undeterminable and lists D+E as candidates', async () => {
    // D direct-merges (clean-status rejection + mergeCleanPRsImmediately); E would-enable but does NOT direct-merge.
    const prs = [
      makePR({ id: 10, number: 110, repo: 'o/d' }),
      makePR({ id: 11, number: 111, repo: 'o/e' }),
    ];
    const prDetails = new Map<number, PullRequestDetail>([
      [10, makeDetail({ id: 10, number: 110, node_id: 'ND', base: { repo: { full_name: 'o/d' } }, head: { ref: 'fd', sha: 'shaD', repo: { full_name: 'o/d' } } })],
      [11, makeDetail({ id: 11, number: 111, node_id: 'NE', base: { repo: { full_name: 'o/e' } }, head: { ref: 'fe', sha: 'shaE', repo: { full_name: 'o/e' } } })],
    ]);
    const st = settings({ autoEnableAutoMerge: true, mergeCleanPRsImmediately: true });

    const exec: OrchestratorDeps = {
      getRepo: vi.fn().mockResolvedValue(REPO_OK),
      listThreads: vi.fn().mockResolvedValue([]),
      enableAutoMerge: vi.fn(async (nodeId: string) =>
        nodeId === 'ND'
          ? { enabled: false, unsupported: true, reason: 'Pull request is in clean status' }
          : { enabled: true, unsupported: false },
      ),
      deleteRef: vi.fn().mockResolvedValue('deleted'),
      resolveThread: vi.fn().mockResolvedValue(undefined),
      mergePR: vi.fn().mockResolvedValue({ merged: true, sha: 'shaD' }),
    };
    const execResult = await runAllAutomations({ prs, prDetails, settings: st, resolvedThreads: {}, github: exec });

    // (a) execute really fired the direct merge on D (number 110)
    expect(exec.mergePR).toHaveBeenCalledWith('o', 'd', 110, expect.objectContaining({ sha: 'shaD', merge_method: 'squash' }));
    const executeDirectMergeIds = execResult.mergedNowEntries.filter((e) => e.result === 'success').map((e) => e.prId);
    expect(executeDirectMergeIds).toContain(10);
    expect(executeDirectMergeIds).not.toContain(11);

    // (b)+(c)+(d) preview: undeterminable, no direct-merge row, candidates are a SUPERSET incl E
    const prev = await runAllAutomations({ prs, prDetails, settings: st, resolvedThreads: {}, github: throwingDeps(vi.fn().mockResolvedValue([])), mode: 'preview' });
    const p = prev.preview!;
    expect(p.directMergePreviewable).toBe(false);
    expect(p.actions.some((a) => a.kind === 'direct-merge')).toBe(false);
    expect(executeDirectMergeIds.every((id) => p.directMergeCandidatePRIds.includes(id))).toBe(true); // subset
    expect(p.directMergeCandidatePRIds).toContain(11); // over-count allowed: E is a candidate, never direct-merges
    expect(p.directMergeCandidatePRIds.sort()).toEqual([10, 11]);
  });
});
