// PREVIEW-1 (T2) — gatherPreviewInputs: read-only assembly + input-set PARITY.
//
// Proves (a) gather issues only GET reads and returns well-formed opts, and
// (b) the gathered candidate set equals the execute path's
// selectAutomationCandidates over the SAME combined processedPRs (open search ∪
// store-merged) — closing the input divergence in BOTH directions:
//   over-report  → ignored-repo / suspended-owner / draft-suppressed PRs absent
//   under-report → the store-only merged-pending-deletion PR PRESENT and driving
//                  a delete-branch action.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/core/storage/multi-account', () => ({ getActiveAccountId: vi.fn().mockResolvedValue(null) }));
vi.mock('../../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  getResolvedThreads: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../src/core/auth-store', () => ({ getAuth: vi.fn() }));
vi.mock('../../../src/core/pr-store', () => ({ loadStore: vi.fn() }));
vi.mock('../../../src/github/endpoints', () => ({ searchAuthoredPRs: vi.fn(), getPR: vi.fn() }));
vi.mock('../../../src/github/endpoints/repos', () => ({ getRepo: vi.fn() }));
// Mutating endpoints — gather wraps them into the deps object for type parity
// but must NEVER invoke them. Mock so the no-mutation test can assert that.
vi.mock('../../../src/github/endpoints/git-refs', () => ({ deleteRef: vi.fn() }));
vi.mock('../../../src/github/endpoints/auto-merge', () => ({ enablePullRequestAutoMerge: vi.fn() }));
vi.mock('../../../src/github/endpoints/review-threads', () => ({ listReviewThreads: vi.fn(), resolveReviewThread: vi.fn() }));
vi.mock('../../../src/github/endpoints/merge-pr', () => ({ mergePR: vi.fn() }));

import { gatherPreviewInputs } from '../../../src/background/automations/preview-gather';
import { runAllAutomations } from '../../../src/background/automations/orchestrator';
import { selectAutomationCandidates } from '../../../src/core/automations-filter';
import { suspendedOwners } from '../../../src/core/installations-helpers';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';
import type { AutomationSettings } from '../../../src/core/automations-types';
import type { PRRecord } from '../../../src/core/types';
import { getActiveAccountId } from '../../../src/core/storage/multi-account';
import { getAutomationSettings, getResolvedThreads } from '../../../src/core/automations-store';
import { getAuth } from '../../../src/core/auth-store';
import { loadStore } from '../../../src/core/pr-store';
import { searchAuthoredPRs, getPR } from '../../../src/github/endpoints';
import { getRepo } from '../../../src/github/endpoints/repos';
import { deleteRef } from '../../../src/github/endpoints/git-refs';
import { enablePullRequestAutoMerge } from '../../../src/github/endpoints/auto-merge';
import { resolveReviewThread } from '../../../src/github/endpoints/review-threads';
import { mergePR } from '../../../src/github/endpoints/merge-pr';

const pr = (o: Partial<PRRecord & { mergedAt?: number; branchDeleted?: boolean; isDraft?: boolean; headRef?: string }>): PRRecord =>
  ({ id: 0, number: 0, title: 't', repo: 'o/r', url: 'u', state: 'current', lastUpdated: 0, ...o } as PRRecord);

const detail = (number: number, repo: string, extra: Record<string, unknown> = {}) => ({
  id: number, number, title: 't', html_url: 'u', mergeable_state: 'clean',
  base: { repo: { full_name: repo } }, node_id: `N${number}`, draft: false, auto_merge: null,
  head: { ref: `f${number}`, sha: `s${number}`, repo: { full_name: repo } }, ...extra,
});

function settings(over: Partial<AutomationSettings> = {}): AutomationSettings {
  return { ...DEFAULT_AUTOMATION_SETTINGS, ...over };
}

// github_app auth whose 'suspendedowner' installation is suspended.
const suspendedAuth = {
  method: 'github_app',
  installations: [{ id: 1, account: { login: 'suspendedowner', type: 'Organization' }, repository_selection: 'all', target_type: 'Organization', suspended_at: '2026-01-01T00:00:00Z' }],
} as unknown as Awaited<ReturnType<typeof getAuth>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getActiveAccountId).mockResolvedValue(null);
  vi.mocked(getResolvedThreads).mockResolvedValue({});
  vi.mocked(getRepo).mockResolvedValue({ delete_branch_on_merge: false, allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true } as never);
});

describe('gatherPreviewInputs — read-only assembly', () => {
  it('issues only GET reads, returns well-formed opts with populated prDetails', async () => {
    vi.mocked(getAuth).mockResolvedValue(null);
    vi.mocked(getAutomationSettings).mockResolvedValue(settings());
    vi.mocked(loadStore).mockResolvedValue({ prs: [pr({ id: 1, number: 11, repo: 'o/a' }), pr({ id: 2, number: 12, repo: 'o/b' })] } as never);
    vi.mocked(searchAuthoredPRs).mockResolvedValue({ items: [{ id: 1, number: 11, title: 't', html_url: 'u', repository_url: 'https://api.github.com/repos/o/a' }, { id: 2, number: 12, title: 't', html_url: 'u', repository_url: 'https://api.github.com/repos/o/b' }] } as never);
    vi.mocked(getPR).mockImplementation(async (_o: string, _r: string, n: number) => detail(n, n === 11 ? 'o/a' : 'o/b') as never);

    const got = await gatherPreviewInputs();

    expect(searchAuthoredPRs).toHaveBeenCalledOnce();
    expect(getPR).toHaveBeenCalledTimes(2);
    expect(got.prs.map((p) => p.id).sort()).toEqual([1, 2]);
    expect([...got.prDetails.keys()].sort()).toEqual([1, 2]);
    expect(got.resolvedThreads).toEqual({});
    // The deps wrapper carries all six members (mutating ones present for type
    // parity but never invoked during gather).
    expect(Object.keys(got.github).sort()).toEqual(
      ['deleteRef', 'enableAutoMerge', 'getRepo', 'listThreads', 'mergePR', 'resolveThread'].sort(),
    );
  });
});

describe('gather/execute input-set PARITY (both divergence directions)', () => {
  it('over-report suppressed PRs absent; under-report store-merged PR present and drives delete-branch', async () => {
    vi.mocked(getAuth).mockResolvedValue(suspendedAuth);
    const st = settings({
      enableIgnoredRepos: true, ignoredRepos: ['ignored/repo'],
      skipDraftPRs: true, autoDeleteMergedBranch: true,
    });
    vi.mocked(getAutomationSettings).mockResolvedValue(st);

    const storePRs = [
      pr({ id: 1, number: 11, repo: 'ok/open1' }),                                  // eligible open
      pr({ id: 2, number: 12, repo: 'ok/open2' }),                                  // eligible open
      pr({ id: 3, number: 13, repo: 'ignored/repo' }),                             // ignored-repo → pre-filtered
      pr({ id: 4, number: 14, repo: 'suspendedowner/x' }),                         // suspended-owner → selectAutomationCandidates drop
      pr({ id: 5, number: 15, repo: 'ok/draft', isDraft: true }),                  // draft-suppressed → drop
      pr({ id: 6, number: 16, repo: 'ok/merged', state: 'merged', mergedAt: 5, branchDeleted: false, headRef: 'fm' }), // store-only merged
    ];
    vi.mocked(loadStore).mockResolvedValue({ prs: storePRs } as never);
    // Live search returns the OPEN cohort only (1–5); the merged PR (6) is NOT here.
    vi.mocked(searchAuthoredPRs).mockResolvedValue({
      items: [11, 12, 13, 14, 15].map((n, i) => ({ id: i + 1, number: n, title: 't', html_url: 'u', repository_url: `https://api.github.com/repos/x/${n}` })),
    } as never);
    vi.mocked(getPR).mockImplementation(async (_o: string, _r: string, n: number) =>
      detail(n, n === 16 ? 'ok/merged' : 'ok/x') as never,
    );

    const got = await gatherPreviewInputs();

    // ── gathered.prs equals selectAutomationCandidates over the SAME combined input ──
    const suspendedOwnerSet = suspendedOwners(suspendedAuth?.method === 'github_app' ? suspendedAuth.installations : []);
    const executeProcessedPRs = storePRs.filter((p) => p.repo !== 'ignored/repo'); // ignored pre-filtered by both paths
    const expectedIds = selectAutomationCandidates(executeProcessedPRs, { suspendedOwnerSet, settings: st }).map((p) => p.id).sort();
    expect(got.prs.map((p) => p.id).sort()).toEqual(expectedIds);
    expect(expectedIds).toEqual([1, 2, 6]);

    // ── over-report: the three suppressed PRs (ignored/suspended/draft) are absent ──
    const gotIds = got.prs.map((p) => p.id);
    expect(gotIds).not.toContain(3);
    expect(gotIds).not.toContain(4);
    expect(gotIds).not.toContain(5);

    // ── under-report: the store-only merged PR (6) is present, carries phase-2 fields,
    //    and drives a delete-branch action in the resulting preview projection ──
    const merged = got.prs.find((p) => p.id === 6) as (PRRecord & { mergedAt?: number; branchDeleted?: boolean }) | undefined;
    expect(merged?.mergedAt).toBe(5);
    expect(merged?.branchDeleted).toBe(false);

    const result = await runAllAutomations({ ...got, mode: 'preview' });
    const deletes = result.preview!.actions.filter((a) => a.kind === 'delete-branch');
    expect(deletes.map((a) => (a.kind === 'delete-branch' ? a.prId : -1))).toContain(6);
  });
});

describe('gatherPreviewInputs — fires NO mutation', () => {
  it('never invokes any mutating endpoint while assembling the opts', async () => {
    vi.mocked(getAuth).mockResolvedValue(null);
    vi.mocked(getAutomationSettings).mockResolvedValue(settings());
    vi.mocked(loadStore).mockResolvedValue({ prs: [pr({ id: 1, number: 11, repo: 'o/a' })] } as never);
    vi.mocked(searchAuthoredPRs).mockResolvedValue({ items: [{ id: 1, number: 11, title: 't', html_url: 'u', repository_url: 'https://api.github.com/repos/o/a' }] } as never);
    vi.mocked(getPR).mockImplementation(async (_o: string, _r: string, n: number) => detail(n, 'o/a') as never);

    await gatherPreviewInputs();

    // The deps wrapper carries these for type parity with execute, but gather
    // assembles read-only — none may be called.
    expect(deleteRef).not.toHaveBeenCalled();
    expect(enablePullRequestAutoMerge).not.toHaveBeenCalled();
    expect(resolveReviewThread).not.toHaveBeenCalled();
    expect(mergePR).not.toHaveBeenCalled();
  });
});
