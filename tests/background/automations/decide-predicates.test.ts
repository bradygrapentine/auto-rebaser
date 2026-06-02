// PREVIEW-1 (T1) — direct unit tests of the four `decide*` predicates. These are
// the SHARED predicates the execute path applies and preview mode collects; the
// T0 char wall proves the execute path is byte-identical, this proves the
// predicates return the right PlannedAction[] for preview.
import { describe, it, expect, vi } from 'vitest';
import { decideEnableAutoMerge, type EligiblePR } from '../../../src/background/automations/enable-auto-merge';
import { decideDeleteMergedBranch, type MergedPRInput } from '../../../src/background/automations/delete-merged-branch';
import { decideResolveObsoleteThreads, type ReviewThread, type PRRef } from '../../../src/background/automations/resolve-obsolete-threads';
import { decideDirectMerge } from '../../../src/background/automations/merge-clean';
import type { PullRequestDetail } from '../../../src/background/automations/adapters';

const ALL = { squash: true, merge: true, rebase: true };

describe('decideEnableAutoMerge → enable-auto-merge actions', () => {
  const pr = (o: Partial<EligiblePR> = {}): EligiblePR => ({
    id: 1, number: 1, nodeId: 'N1', repo: 'o/r', isDraft: false, mergeableState: 'clean',
    autoMergeEnabled: false, unsupported: false, allowedMethods: ALL, ...o,
  });

  it('emits one action per would-enable PR with the resolved method', () => {
    expect(decideEnableAutoMerge([pr({ id: 5, number: 50, nodeId: 'N5' })], {
      enabled: true, mergeMethodPreference: ['REBASE', 'SQUASH'], optOutRepos: [],
    })).toEqual([{ kind: 'enable-auto-merge', prId: 5, nodeId: 'N5', repo: 'o/r', number: 50, method: 'REBASE' }]);
  });

  it('omits skipped (draft/dirty/enabled/opt-out) and no-allowed-method PRs', () => {
    const out = decideEnableAutoMerge([
      pr({ id: 1, isDraft: true }),
      pr({ id: 2, mergeableState: 'dirty' }),
      pr({ id: 3, autoMergeEnabled: true }),
      pr({ id: 4, repo: 'o/skip' }),
      pr({ id: 5, allowedMethods: { squash: false, merge: false, rebase: true } }), // no method for [SQUASH]
    ], { enabled: true, mergeMethodPreference: ['SQUASH'], optOutRepos: ['o/skip'] });
    expect(out).toEqual([]);
  });

  it('disabled → []', () => {
    expect(decideEnableAutoMerge([pr()], { enabled: false, mergeMethodPreference: ['SQUASH'], optOutRepos: [] })).toEqual([]);
  });
});

describe('decideDeleteMergedBranch → DecideDeleteOutcome[]', () => {
  const pr = (o: Partial<MergedPRInput> = {}): MergedPRInput => ({ id: 1, number: 1, repo: 'o/r', headRef: 'h', sameRepo: true, ...o });

  it('delete-branch outcome when repo does not auto-delete; already-handled when it does', async () => {
    const getRepo = vi.fn(async (_o: string, name: string) => ({ delete_branch_on_merge: name === 'auto' }));
    const out = await decideDeleteMergedBranch(
      [pr({ id: 1, repo: 'o/manual', headRef: 'f1', number: 11 }), pr({ id: 2, repo: 'o/auto' })],
      { enabled: true, optOutRepos: [] },
      { getRepo },
    );
    expect(out).toEqual([
      { kind: 'delete-branch', action: { kind: 'delete-branch', prId: 1, owner: 'o', name: 'manual', headRef: 'f1', repo: 'o/manual', number: 11 } },
      { kind: 'already-handled', prId: 2 },
    ]);
  });

  it('fork/opt-out yield NO outcome; getRepo failure omits that PR (preview undeterminable)', async () => {
    const getRepo = vi.fn(async (_o: string, name: string) => {
      if (name === 'boom') throw new Error('x');
      return { delete_branch_on_merge: false };
    });
    const out = await decideDeleteMergedBranch(
      [pr({ id: 1, repo: 'o/fork', sameRepo: false }), pr({ id: 2, repo: 'o/opt' }), pr({ id: 3, repo: 'o/boom' }), pr({ id: 4, repo: 'o/ok', headRef: 'h4', number: 4 })],
      { enabled: true, optOutRepos: ['o/opt'] },
      { getRepo },
    );
    expect(out).toEqual([
      { kind: 'delete-branch', action: { kind: 'delete-branch', prId: 4, owner: 'o', name: 'ok', headRef: 'h4', repo: 'o/ok', number: 4 } },
    ]);
  });
});

describe('decideResolveObsoleteThreads → resolve-thread actions', () => {
  const ref: PRRef = { repo: 'o/r', number: 7 };
  const t = (o: Partial<ReviewThread> = {}): ReviewThread => ({ id: 'T', isResolved: false, isOutdated: true, line: null, ...o });

  it('emits an action per obsolete thread; skips non-obsolete + store-seen', async () => {
    const listThreads = vi.fn().mockResolvedValue([t({ id: 'A' }), t({ id: 'B', isResolved: true }), t({ id: 'C', line: 3 }), t({ id: 'D' })]);
    const out = await decideResolveObsoleteThreads([ref], { enabled: true, optOutRepos: [] }, { D: 123 }, { listThreads });
    expect(out).toEqual([{ kind: 'resolve-thread', threadId: 'A', repo: 'o/r', prNumber: 7 }]);
  });

  it('opt-out + listThreads failure → omit', async () => {
    const listThreads = vi.fn().mockRejectedValue(new Error('x'));
    expect(await decideResolveObsoleteThreads([ref], { enabled: true, optOutRepos: [] }, {}, { listThreads })).toEqual([]);
    const listOk = vi.fn().mockResolvedValue([t()]);
    expect(await decideResolveObsoleteThreads([{ repo: 'o/opt', number: 1 }], { enabled: true, optOutRepos: ['o/opt'] }, {}, { listThreads: listOk })).toEqual([]);
  });
});

describe('decideDirectMerge → direct-merge actions (cleanIds is load-bearing)', () => {
  const eligible = (o: Partial<EligiblePR> = {}): EligiblePR => ({
    id: 1, number: 10, nodeId: 'N', repo: 'o/r', isDraft: false, mergeableState: 'clean',
    autoMergeEnabled: false, unsupported: false, allowedMethods: ALL, ...o,
  });
  const detail = (sha = 's1'): PullRequestDetail => ({ head: { sha } } as unknown as PullRequestDetail);
  const settings = { mergeMethodPreference: ['SQUASH' as const], mergeCleanPRsOptOutRepos: [] };

  it('PR in cleanIds → a direct-merge action with the resolved method + head sha', () => {
    // Distinctive number 77 pins that the action.number is read from
    // `eligible.number` (PREVIEW-7 dropped the redundant `prs` param) — a
    // regression in that derivation would surface here, not pass silently.
    const out = decideDirectMerge([eligible({ id: 1, number: 77 })], new Map([[1, detail('SHA')]]), settings, new Set([1]));
    expect(out).toEqual([{ kind: 'direct-merge', prId: 1, owner: 'o', name: 'r', number: 77, sha: 'SHA', method: 'SQUASH', repo: 'o/r' }]);
  });

  it('SAME fixture but empty cleanIds → [] (proves cleanIds gates the decision)', () => {
    const out = decideDirectMerge([eligible({ id: 1, number: 10 })], new Map([[1, detail('SHA')]]), settings, new Set());
    expect(out).toEqual([]);
  });

  it('opt-out repo / missing head sha → omitted', () => {
    const noSha = { head: {} } as unknown as PullRequestDetail;
    expect(decideDirectMerge([eligible({ id: 1 })], new Map([[1, noSha]]), settings, new Set([1]))).toEqual([]);
    expect(decideDirectMerge([eligible({ id: 1 })], new Map([[1, detail()]]), { ...settings, mergeCleanPRsOptOutRepos: ['o/r'] }, new Set([1]))).toEqual([]);
  });
});
