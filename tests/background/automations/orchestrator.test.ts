import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PRRecord } from '../../../src/core/types';
import type { AutomationSettings } from '../../../src/core/automations-types';
import type { OrchestratorDeps, OrchestratorOpts } from '../../../src/background/automations/orchestrator';
import type { PullRequestDetail } from '../../../src/background/automations/adapters';

// Mock the four automation modules
vi.mock('../../../src/background/automations/enable-auto-merge', () => ({
  runEnableAutoMerge: vi.fn(),
}));
vi.mock('../../../src/background/automations/delete-merged-branch', () => ({
  runDeleteMergedBranch: vi.fn(),
}));
vi.mock('../../../src/background/automations/resolve-obsolete-threads', () => ({
  runResolveObsoleteThreads: vi.fn(),
}));

import { runAllAutomations } from '../../../src/background/automations/orchestrator';
import { runEnableAutoMerge } from '../../../src/background/automations/enable-auto-merge';
import { runDeleteMergedBranch } from '../../../src/background/automations/delete-merged-branch';
import { runResolveObsoleteThreads } from '../../../src/background/automations/resolve-obsolete-threads';

const mockEnableAutoMerge = vi.mocked(runEnableAutoMerge);
const mockDeleteMergedBranch = vi.mocked(runDeleteMergedBranch);
const mockResolveObsoleteThreads = vi.mocked(runResolveObsoleteThreads);

function makePR(overrides: Partial<PRRecord & { mergedAt?: number; branchDeleted?: boolean }> = {}): PRRecord {
  return {
    id: 1,
    number: 42,
    title: 'Test PR',
    repo: 'owner/repo',
    url: 'https://github.com/owner/repo/pull/42',
    state: 'current',
    lastUpdated: 1000,
    ...overrides,
  } as PRRecord;
}

function makeDetail(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    id: 1,
    number: 42,
    title: 'Test PR',
    html_url: 'https://github.com/owner/repo/pull/42',
    mergeable_state: 'clean',
    base: { repo: { full_name: 'owner/repo' } },
    node_id: 'node1',
    draft: false,
    auto_merge: null,
    head: { ref: 'feature/test', repo: { full_name: 'owner/repo' } },
    ...overrides,
  };
}

const ALL_ON_SETTINGS: AutomationSettings = {
  ignoredRepos: [],
  autoDeleteMergedBranch: true,
  autoDeleteOptOutRepos: [],
  autoEnableAutoMerge: true,
  mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
  autoMergeOptOutRepos: [],
  autoResolveOutdatedThreads: true,
  autoResolveOptOutRepos: [],
  enableKeyboardShortcuts: true,
  enableStaleBadge: true,
  staleThresholdDays: 14,
  staleThresholdOverrides: {},
  staleCountsAsAttention: false,
  enablePingReviewers: false,
  mergeCleanPRsImmediately: false,
  pingTemplate: 'nudge {reviewers}',
};

function makeGithubDeps(): OrchestratorDeps {
  return {
    getRepo: vi.fn().mockResolvedValue({
      delete_branch_on_merge: false,
      allow_squash_merge: true,
      allow_merge_commit: true,
      allow_rebase_merge: true,
    }),
    deleteRef: vi.fn().mockResolvedValue('deleted'),
    enableAutoMerge: vi.fn().mockResolvedValue({ enabled: true, unsupported: false }),
    listThreads: vi.fn().mockResolvedValue([]),
    resolveThread: vi.fn().mockResolvedValue(undefined),
    mergePR: vi.fn().mockResolvedValue({ merged: true, sha: 'abc' }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations
  mockEnableAutoMerge.mockResolvedValue({
    enabled: 2,
    skipped: 0,
    unsupportedPRs: [], unsupportedReasons: {},
    noAllowedMethodPRs: [],
    enabledPRs: [{ prId: 1, method: 'SQUASH' }],
    failed: [],
  });
  mockDeleteMergedBranch.mockResolvedValue({
    deleted: 1,
    skipped: 0,
    failed: [],
    branchDeletedPRs: [1],
  });
  mockResolveObsoleteThreads.mockResolvedValue({
    resolved: 3,
    skipped: 0,
    failed: [],
    resolvedStore: { t1: 1000 },
    resolvedEntries: [], failedEntries: [],
  });
});

describe('runAllAutomations', () => {
  it('happy path: all 4 automations enabled, all succeed; summary counts match', async () => {
    const mergedPR = makePR({ id: 1, mergedAt: 1000 } as Parameters<typeof makePR>[0]);
    const opts: OrchestratorOpts = {
      prs: [mergedPR],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(mockEnableAutoMerge).toHaveBeenCalledOnce();
    expect(mockDeleteMergedBranch).toHaveBeenCalledOnce();
    expect(mockResolveObsoleteThreads).toHaveBeenCalledOnce();

    expect(result.summary.autoMergeEnabled).toBe(2);
    expect(result.summary.branchesDeleted).toBe(1);
    expect(result.summary.threadsResolved).toBe(3);
    expect(result.summary.errors).toBe(0);
  });

  it('prUpdates accumulated: enabledPRs and branchDeletedPRs create patches', async () => {
    const mergedPR = makePR({ id: 1, mergedAt: 1000 } as Parameters<typeof makePR>[0]);
    const opts: OrchestratorOpts = {
      prs: [mergedPR],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    const autoMergePatch = result.prUpdates.find(u => u.patch.autoMergeEnabled === true);
    expect(autoMergePatch).toBeDefined();
    const branchPatch = result.prUpdates.find(u => u.patch.branchDeleted === true);
    expect(branchPatch).toBeDefined();
  });

  it('enableAutoMerge throws — others still run, error count increments', async () => {
    mockEnableAutoMerge.mockRejectedValue(new Error('enable failed'));

    const mergedPR = makePR({ id: 1, mergedAt: 1000 } as Parameters<typeof makePR>[0]);
    const opts: OrchestratorOpts = {
      prs: [mergedPR],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(result.summary.errors).toBe(1);
    expect(mockDeleteMergedBranch).toHaveBeenCalledOnce();
    expect(mockResolveObsoleteThreads).toHaveBeenCalledOnce();
  });

  it('deleteMergedBranch throws — others still run, error count increments', async () => {
    mockDeleteMergedBranch.mockRejectedValue(new Error('delete failed'));

    const mergedPR = makePR({ id: 1, mergedAt: 1000 } as Parameters<typeof makePR>[0]);
    const opts: OrchestratorOpts = {
      prs: [mergedPR],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(result.summary.errors).toBe(1);
    expect(mockEnableAutoMerge).toHaveBeenCalledOnce();
    expect(mockResolveObsoleteThreads).toHaveBeenCalledOnce();
  });

  it('resolveObsoleteThreads throws — others still run', async () => {
    mockResolveObsoleteThreads.mockRejectedValue(new Error('resolve failed'));

    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(result.summary.errors).toBe(1);
  });

  it('kill-switch autoEnableAutoMerge=false: step 1 skipped, no error', async () => {
    const settings = { ...ALL_ON_SETTINGS, autoEnableAutoMerge: false };
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(mockEnableAutoMerge).not.toHaveBeenCalled();
    expect(result.summary.errors).toBe(0);
    expect(result.summary.autoMergeEnabled).toBe(0);
  });

  it('kill-switch autoDeleteMergedBranch=false: step 2 skipped', async () => {
    const settings = { ...ALL_ON_SETTINGS, autoDeleteMergedBranch: false };
    const mergedPR = makePR({ id: 1, mergedAt: 1000 } as Parameters<typeof makePR>[0]);
    const opts: OrchestratorOpts = {
      prs: [mergedPR],
      prDetails: new Map([[1, makeDetail()]]),
      settings,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(mockDeleteMergedBranch).not.toHaveBeenCalled();
    expect(result.summary.errors).toBe(0);
  });

  it('kill-switch autoResolveOutdatedThreads=false: step 3 skipped', async () => {
    const settings = { ...ALL_ON_SETTINGS, autoResolveOutdatedThreads: false };
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(mockResolveObsoleteThreads).not.toHaveBeenCalled();
    expect(result.summary.errors).toBe(0);
  });

  it('ordering: steps called in sequence 1→2→3', async () => {
    const callOrder: string[] = [];
    mockEnableAutoMerge.mockImplementation(async () => {
      callOrder.push('enableAutoMerge');
      return { enabled: 0, skipped: 0, unsupportedPRs: [], unsupportedReasons: {}, noAllowedMethodPRs: [], enabledPRs: [], failed: [] };
    });
    mockDeleteMergedBranch.mockImplementation(async () => {
      callOrder.push('deleteMergedBranch');
      return { deleted: 0, skipped: 0, failed: [], branchDeletedPRs: [] };
    });
    mockResolveObsoleteThreads.mockImplementation(async () => {
      callOrder.push('resolveObsoleteThreads');
      return { resolved: 0, skipped: 0, failed: [], resolvedStore: {}, resolvedEntries: [], failedEntries: [] };
    });

    const mergedPR = makePR({ id: 1, mergedAt: 1000 } as Parameters<typeof makePR>[0]);
    const opts: OrchestratorOpts = {
      prs: [mergedPR],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    await runAllAutomations(opts);

    expect(callOrder).toEqual([
      'enableAutoMerge',
      'deleteMergedBranch',
      'resolveObsoleteThreads',
    ]);
  });

  // Audit B4 / Story 5.4 — when a previously-flagged PR resolves to an
  // allowed method on a subsequent cycle, the inline badge must clear.
  it('clears autoMergeSkipReason when noAllowedMethodPRs no longer reports the PR', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 1,
      skipped: 0,
      unsupportedPRs: [], unsupportedReasons: {},
      noAllowedMethodPRs: [],
      enabledPRs: [{ prId: 1, method: 'SQUASH' }],
      failed: [],
    });

    // Previous cycle marked PR id=1 with the skip reason.
    const previouslySkipped = makePR();
    (previouslySkipped as PRRecord & { autoMergeSkipReason?: string }).autoMergeSkipReason = 'no-allowed-method';

    const result = await runAllAutomations({
      prs: [previouslySkipped],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    });

    const clearPatch = result.prUpdates.find(
      (u) => u.prId === 1 && Object.prototype.hasOwnProperty.call(u.patch, 'autoMergeSkipReason')
        && u.patch.autoMergeSkipReason === undefined,
    );
    expect(clearPatch).toBeDefined();
  });

  it('routes "in clean status" reason to skippedAutoMergeEntries (already_clean)', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 0, skipped: 0,
      unsupportedPRs: [1],
      unsupportedReasons: { 1: 'Pull request is in clean status' },
      noAllowedMethodPRs: [],
      enabledPRs: [], failed: [],
    });
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };
    const result = await runAllAutomations(opts);
    expect(result.skippedAutoMergeEntries).toEqual([{ prId: 1, skipReason: 'already_clean' }]);
    expect(result.failedAutoMergeEntries).toEqual([]);
  });

  it('routes "is already merged" reason to skippedAutoMergeEntries (already_merged)', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 0, skipped: 0,
      unsupportedPRs: [1],
      unsupportedReasons: { 1: 'Pull request is already merged' },
      noAllowedMethodPRs: [],
      enabledPRs: [], failed: [],
    });
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };
    const result = await runAllAutomations(opts);
    expect(result.skippedAutoMergeEntries).toEqual([{ prId: 1, skipReason: 'already_merged' }]);
    expect(result.failedAutoMergeEntries).toEqual([]);
  });

  it('keeps "not allowed for this repository" as failed (legitimate problem)', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 0, skipped: 0,
      unsupportedPRs: [1],
      unsupportedReasons: { 1: 'Auto merge is not allowed for this repository' },
      noAllowedMethodPRs: [],
      enabledPRs: [], failed: [],
    });
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };
    const result = await runAllAutomations(opts);
    expect(result.skippedAutoMergeEntries).toEqual([]);
    expect(result.failedAutoMergeEntries).toHaveLength(1);
  });

  it('falls through to direct merge when toggle ON and PR is in clean status', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 0, skipped: 0,
      unsupportedPRs: [1],
      unsupportedReasons: { 1: 'Pull request is in clean status' },
      noAllowedMethodPRs: [],
      enabledPRs: [], failed: [],
    });
    const github = makeGithubDeps();
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail({ head: { ref: 'feature/x', sha: 'sha-deadbeef', repo: { full_name: 'owner/repo' } } } as Parameters<typeof makeDetail>[0])]]),
      settings: { ...ALL_ON_SETTINGS, mergeCleanPRsImmediately: true },
      resolvedThreads: {},
      github,
    };
    const result = await runAllAutomations(opts);

    expect(github.mergePR).toHaveBeenCalledWith(
      'owner', 'repo', 42,
      { sha: 'sha-deadbeef', merge_method: 'squash' },
    );
    expect(result.mergedNowEntries).toEqual([
      { prId: 1, method: 'SQUASH', result: 'success' },
    ]);
    // E3 — the upstream skipped entry was suppressed.
    expect(result.skippedAutoMergeEntries).toEqual([]);
  });

  it('falls through to next method on METHOD_NOT_ALLOWED', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 0, skipped: 0,
      unsupportedPRs: [1],
      unsupportedReasons: { 1: 'Pull request is in clean status' },
      noAllowedMethodPRs: [],
      enabledPRs: [], failed: [],
    });
    const github = makeGithubDeps();
    (github.mergePR as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('METHOD_NOT_ALLOWED'))
      .mockResolvedValueOnce({ merged: true, sha: 'abc' });

    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail({ head: { ref: 'f', sha: 's', repo: { full_name: 'owner/repo' } } } as Parameters<typeof makeDetail>[0])]]),
      settings: { ...ALL_ON_SETTINGS, mergeCleanPRsImmediately: true, mergeMethodPreference: ['REBASE', 'SQUASH'] },
      resolvedThreads: {},
      github,
    };
    const result = await runAllAutomations(opts);

    expect(github.mergePR).toHaveBeenCalledTimes(2);
    expect(result.mergedNowEntries).toEqual([
      { prId: 1, method: 'SQUASH', result: 'success' },
    ]);
  });

  it('records failed mergedNowEntry when SHA mismatch', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 0, skipped: 0,
      unsupportedPRs: [1],
      unsupportedReasons: { 1: 'Pull request is in clean status' },
      noAllowedMethodPRs: [],
      enabledPRs: [], failed: [],
    });
    const github = makeGithubDeps();
    (github.mergePR as ReturnType<typeof vi.fn>)
      .mockRejectedValue(new Error('SHA_MISMATCH'));

    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail({ head: { ref: 'f', sha: 's', repo: { full_name: 'owner/repo' } } } as Parameters<typeof makeDetail>[0])]]),
      settings: { ...ALL_ON_SETTINGS, mergeCleanPRsImmediately: true },
      resolvedThreads: {},
      github,
    };
    const result = await runAllAutomations(opts);

    expect(result.mergedNowEntries).toEqual([
      { prId: 1, method: 'SQUASH', result: 'failed', error: 'SHA_MISMATCH' },
    ]);
  });

  it('does NOT call mergePR when toggle OFF; logs skipped entry instead', async () => {
    mockEnableAutoMerge.mockResolvedValue({
      enabled: 0, skipped: 0,
      unsupportedPRs: [1],
      unsupportedReasons: { 1: 'Pull request is in clean status' },
      noAllowedMethodPRs: [],
      enabledPRs: [], failed: [],
    });
    const github = makeGithubDeps();
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings: { ...ALL_ON_SETTINGS, mergeCleanPRsImmediately: false },
      resolvedThreads: {},
      github,
    };
    const result = await runAllAutomations(opts);

    expect(github.mergePR).not.toHaveBeenCalled();
    expect(result.mergedNowEntries).toEqual([]);
    expect(result.skippedAutoMergeEntries).toEqual([
      { prId: 1, skipReason: 'already_clean' },
    ]);
  });

  it('resolvedThreads from resolveObsoleteThreads is returned', async () => {
    const updatedStore = { 'thread-1': 9999 };
    mockResolveObsoleteThreads.mockResolvedValue({
      resolved: 1,
      skipped: 0,
      failed: [],
      resolvedStore: updatedStore,
      resolvedEntries: [], failedEntries: [],
    });

    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(result.resolvedThreads).toEqual(updatedStore);
  });
});
