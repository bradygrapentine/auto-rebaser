// CHARACTERIZATION WALL (PREVIEW-1 T0) — delete-merged-branch.
//
// Pins the EXACT decision + bookkeeping of `runDeleteMergedBranch` against the
// current inline logic, as hard-coded LITERAL assertions, BEFORE T1 factors the
// decision out into `decideDeleteMergedBranch`. If T1 changes any decision or any
// tally (`deleted`/`skipped`/`branchDeletedPRs`/`failed`), these go red. The T1
// refactor must keep these literals byte-identical (git-show byte-identity gate).
//
// Drives the REAL module (no mocks of the unit under test); only the injected
// deps (`getRepo`/`deleteRef`) are spies, recording the actual call tuples.
import { describe, it, expect, vi } from 'vitest';
import {
  runDeleteMergedBranch,
  type MergedPRInput,
  type DeleteMergedBranchDeps,
} from '../../../../src/background/automations/delete-merged-branch';

function pr(over: Partial<MergedPRInput> = {}): MergedPRInput {
  return { id: 1, number: 10, repo: 'owner/repo', headRef: 'feature', sameRepo: true, ...over };
}

describe('CHAR delete-merged-branch — decision + bookkeeping literals', () => {
  it('fork PR (!sameRepo) is skipped before any getRepo read — skipped++ stays in the wrapper', async () => {
    const getRepo = vi.fn();
    const deleteRef = vi.fn();
    const deps: DeleteMergedBranchDeps = { getRepo, deleteRef };

    const result = await runDeleteMergedBranch(
      [pr({ id: 1, sameRepo: false })],
      { enabled: true, optOutRepos: [] },
      deps,
    );

    expect(result).toEqual({ deleted: 0, skipped: 1, failed: [], branchDeletedPRs: [] });
    expect(getRepo).not.toHaveBeenCalled();
    expect(deleteRef).not.toHaveBeenCalled();
  });

  it('opt-out repo is skipped before any getRepo read', async () => {
    const getRepo = vi.fn();
    const deleteRef = vi.fn();
    const result = await runDeleteMergedBranch(
      [pr({ id: 2, repo: 'owner/optout' })],
      { enabled: true, optOutRepos: ['owner/optout'] },
      { getRepo, deleteRef },
    );

    expect(result).toEqual({ deleted: 0, skipped: 1, failed: [], branchDeletedPRs: [] });
    expect(getRepo).not.toHaveBeenCalled();
    expect(deleteRef).not.toHaveBeenCalled();
  });

  it('delete_branch_on_merge:true → terminal skip++ AND branchDeletedPRs push, NO deleteRef', async () => {
    const getRepo = vi.fn().mockResolvedValue({ delete_branch_on_merge: true });
    const deleteRef = vi.fn();
    const result = await runDeleteMergedBranch(
      [pr({ id: 3, repo: 'owner/auto', headRef: 'h' })],
      { enabled: true, optOutRepos: [] },
      { getRepo, deleteRef },
    );

    // Both bookkeeping effects fire for this case — this is the §1a `already-handled` contract.
    expect(result).toEqual({ deleted: 0, skipped: 1, failed: [], branchDeletedPRs: [3] });
    expect(getRepo).toHaveBeenCalledWith('owner', 'auto');
    expect(deleteRef).not.toHaveBeenCalled();
  });

  it('repo does NOT auto-delete + deleteRef "deleted" → deleted++ + branchDeletedPRs push', async () => {
    const getRepo = vi.fn().mockResolvedValue({ delete_branch_on_merge: false });
    const deleteRef = vi.fn().mockResolvedValue('deleted');
    const result = await runDeleteMergedBranch(
      [pr({ id: 4, repo: 'owner/manual', headRef: 'feat-x' })],
      { enabled: true, optOutRepos: [] },
      { getRepo, deleteRef },
    );

    expect(result).toEqual({ deleted: 1, skipped: 0, failed: [], branchDeletedPRs: [4] });
    expect(deleteRef).toHaveBeenCalledWith('owner', 'manual', 'feat-x');
  });

  it('deleteRef "already-gone" still counts as deleted++ + branchDeletedPRs push', async () => {
    const getRepo = vi.fn().mockResolvedValue({ delete_branch_on_merge: false });
    const deleteRef = vi.fn().mockResolvedValue('already-gone');
    const result = await runDeleteMergedBranch(
      [pr({ id: 5 })],
      { enabled: true, optOutRepos: [] },
      { getRepo, deleteRef },
    );

    expect(result).toEqual({ deleted: 1, skipped: 0, failed: [], branchDeletedPRs: [5] });
  });

  it('deleteRef throws → failed entry with the error message, no deleted/branchDeletedPRs', async () => {
    const getRepo = vi.fn().mockResolvedValue({ delete_branch_on_merge: false });
    const deleteRef = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await runDeleteMergedBranch(
      [pr({ id: 6 })],
      { enabled: true, optOutRepos: [] },
      { getRepo, deleteRef },
    );

    expect(result).toEqual({ deleted: 0, skipped: 0, failed: [{ prId: 6, error: 'boom' }], branchDeletedPRs: [] });
  });

  it('disabled → every PR counted as skipped, no deps called', async () => {
    const getRepo = vi.fn();
    const deleteRef = vi.fn();
    const result = await runDeleteMergedBranch(
      [pr({ id: 7 }), pr({ id: 8 })],
      { enabled: false, optOutRepos: [] },
      { getRepo, deleteRef },
    );

    expect(result).toEqual({ deleted: 0, skipped: 2, failed: [], branchDeletedPRs: [] });
    expect(getRepo).not.toHaveBeenCalled();
  });

  it('mixed batch — exact tally + branchDeletedPRs ORDER literal across fork/auto/manual/throw', async () => {
    const getRepo = vi.fn(async (_o: string, name: string) =>
      name === 'auto' ? { delete_branch_on_merge: true } : { delete_branch_on_merge: false },
    );
    const deleteRef = vi.fn(async (_o: string, name: string) => {
      if (name === 'boom') throw new Error('E');
      return 'deleted' as const;
    });
    const result = await runDeleteMergedBranch(
      [
        pr({ id: 1, repo: 'o/fork', sameRepo: false }),
        pr({ id: 2, repo: 'o/auto' }),
        pr({ id: 3, repo: 'o/manual' }),
        pr({ id: 4, repo: 'o/boom' }),
      ],
      { enabled: true, optOutRepos: [] },
      { getRepo, deleteRef },
    );

    expect(result).toEqual({
      deleted: 1,
      skipped: 2, // fork + auto
      failed: [{ prId: 4, error: 'E' }],
      branchDeletedPRs: [2, 3], // auto (already-handled) THEN manual (deleted) — insertion order
    });
  });
});
