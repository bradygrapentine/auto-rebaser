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
vi.mock('../../../src/background/automations/dismiss-stale-notifs', () => ({
  runDismissStaleNotifs: vi.fn(),
}));

import { runAllAutomations } from '../../../src/background/automations/orchestrator';
import { runEnableAutoMerge } from '../../../src/background/automations/enable-auto-merge';
import { runDeleteMergedBranch } from '../../../src/background/automations/delete-merged-branch';
import { runResolveObsoleteThreads } from '../../../src/background/automations/resolve-obsolete-threads';
import { runDismissStaleNotifs } from '../../../src/background/automations/dismiss-stale-notifs';

const mockEnableAutoMerge = vi.mocked(runEnableAutoMerge);
const mockDeleteMergedBranch = vi.mocked(runDeleteMergedBranch);
const mockResolveObsoleteThreads = vi.mocked(runResolveObsoleteThreads);
const mockDismissStaleNotifs = vi.mocked(runDismissStaleNotifs);

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
  autoDismissStaleNotifications: true,
  unsubscribeStalePRNotifications: false,
  autoDismissOptOutRepos: [],
  notificationsScopeGranted: true,
  enableKeyboardShortcuts: true,
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
    listNotifications: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations
  mockEnableAutoMerge.mockResolvedValue({
    enabled: 2,
    skipped: 0,
    unsupportedPRs: [],
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
  });
  mockDismissStaleNotifs.mockResolvedValue({
    dismissed: 4,
    unsubscribed: 0,
    skipped: 0,
    failed: [],
    scopeMissing: false,
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
    expect(mockDismissStaleNotifs).toHaveBeenCalledOnce();

    expect(result.summary.autoMergeEnabled).toBe(2);
    expect(result.summary.branchesDeleted).toBe(1);
    expect(result.summary.threadsResolved).toBe(3);
    expect(result.summary.notificationsDismissed).toBe(4);
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
    expect(mockDismissStaleNotifs).toHaveBeenCalledOnce();
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
    expect(mockDismissStaleNotifs).toHaveBeenCalledOnce();
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
    expect(mockDismissStaleNotifs).toHaveBeenCalledOnce();
  });

  it('dismissStaleNotifs throws — error count increments, summary still returned', async () => {
    mockDismissStaleNotifs.mockRejectedValue(new Error('notif failed'));

    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings: ALL_ON_SETTINGS,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(result.summary.errors).toBe(1);
    expect(result.summary.threadsResolved).toBe(3);
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

  it('kill-switch notificationsScopeGranted=false + autoDismissStaleNotifications=true: step 4 skipped', async () => {
    const settings = {
      ...ALL_ON_SETTINGS,
      autoDismissStaleNotifications: true,
      notificationsScopeGranted: false,
    };
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    const result = await runAllAutomations(opts);

    expect(mockDismissStaleNotifs).not.toHaveBeenCalled();
    expect(result.summary.errors).toBe(0);
  });

  it('kill-switch autoDismissStaleNotifications=false: step 4 skipped even when scope granted', async () => {
    const settings = {
      ...ALL_ON_SETTINGS,
      autoDismissStaleNotifications: false,
      notificationsScopeGranted: true,
    };
    const opts: OrchestratorOpts = {
      prs: [makePR()],
      prDetails: new Map([[1, makeDetail()]]),
      settings,
      resolvedThreads: {},
      github: makeGithubDeps(),
    };

    await runAllAutomations(opts);

    expect(mockDismissStaleNotifs).not.toHaveBeenCalled();
  });

  it('ordering: steps called in sequence 1→2→3→4', async () => {
    const callOrder: string[] = [];
    mockEnableAutoMerge.mockImplementation(async () => {
      callOrder.push('enableAutoMerge');
      return { enabled: 0, skipped: 0, unsupportedPRs: [], noAllowedMethodPRs: [], enabledPRs: [], failed: [] };
    });
    mockDeleteMergedBranch.mockImplementation(async () => {
      callOrder.push('deleteMergedBranch');
      return { deleted: 0, skipped: 0, failed: [], branchDeletedPRs: [] };
    });
    mockResolveObsoleteThreads.mockImplementation(async () => {
      callOrder.push('resolveObsoleteThreads');
      return { resolved: 0, skipped: 0, failed: [], resolvedStore: {} };
    });
    mockDismissStaleNotifs.mockImplementation(async () => {
      callOrder.push('dismissStaleNotifs');
      return { dismissed: 0, unsubscribed: 0, skipped: 0, failed: [], scopeMissing: false };
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
      'dismissStaleNotifs',
    ]);
  });

  it('resolvedThreads from resolveObsoleteThreads is returned', async () => {
    const updatedStore = { 'thread-1': 9999 };
    mockResolveObsoleteThreads.mockResolvedValue({
      resolved: 1,
      skipped: 0,
      failed: [],
      resolvedStore: updatedStore,
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
