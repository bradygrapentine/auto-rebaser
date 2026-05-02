import { describe, it, expect, vi } from 'vitest';
import {
  runDeleteMergedBranch,
  type MergedPRInput,
  type DeleteMergedBranchSettings,
  type DeleteMergedBranchDeps,
} from '../../../src/background/automations/delete-merged-branch';

const onSettings: DeleteMergedBranchSettings = { enabled: true, optOutRepos: [] };

function makeDeps(overrides: Partial<DeleteMergedBranchDeps> = {}): DeleteMergedBranchDeps {
  return {
    getRepo: vi.fn().mockResolvedValue({ delete_branch_on_merge: false }),
    deleteRef: vi.fn().mockResolvedValue('deleted'),
    ...overrides,
  };
}

const pr = (over: Partial<MergedPRInput> = {}): MergedPRInput => ({
  id: 1,
  number: 10,
  repo: 'octo/r',
  headRef: 'feat/x',
  sameRepo: true,
  ...over,
});

describe('runDeleteMergedBranch', () => {
  it('happy path: deletes branch and reports id', async () => {
    const deps = makeDeps();
    const r = await runDeleteMergedBranch([pr()], onSettings, deps);
    expect(r.deleted).toBe(1);
    expect(r.branchDeletedPRs).toEqual([1]);
    expect(deps.deleteRef).toHaveBeenCalledWith('octo', 'r', 'feat/x');
  });

  it('kill-switch off: no API calls, all skipped', async () => {
    const deps = makeDeps();
    const r = await runDeleteMergedBranch(
      [pr(), pr({ id: 2 })],
      { enabled: false, optOutRepos: [] },
      deps
    );
    expect(r.skipped).toBe(2);
    expect(r.deleted).toBe(0);
    expect(deps.getRepo).not.toHaveBeenCalled();
    expect(deps.deleteRef).not.toHaveBeenCalled();
  });

  it('repo with delete_branch_on_merge=true → skipped, branch counted as gone', async () => {
    const deps = makeDeps({
      getRepo: vi.fn().mockResolvedValue({ delete_branch_on_merge: true }),
    });
    const r = await runDeleteMergedBranch([pr()], onSettings, deps);
    expect(r.skipped).toBe(1);
    expect(r.deleted).toBe(0);
    expect(r.branchDeletedPRs).toEqual([1]);
    expect(deps.deleteRef).not.toHaveBeenCalled();
  });

  it('fork PR (sameRepo=false) is never deleted', async () => {
    const deps = makeDeps();
    const r = await runDeleteMergedBranch(
      [pr({ sameRepo: false })],
      onSettings,
      deps
    );
    expect(r.skipped).toBe(1);
    expect(deps.deleteRef).not.toHaveBeenCalled();
  });

  it('already-gone outcome is treated as success', async () => {
    const deps = makeDeps({
      deleteRef: vi.fn().mockResolvedValue('already-gone'),
    });
    const r = await runDeleteMergedBranch([pr()], onSettings, deps);
    expect(r.deleted).toBe(1);
    expect(r.branchDeletedPRs).toEqual([1]);
  });

  it('transient error → failed entry, other PRs still processed', async () => {
    const deps = makeDeps({
      deleteRef: vi
        .fn()
        .mockRejectedValueOnce(new Error('HTTP_500'))
        .mockResolvedValue('deleted'),
    });
    const r = await runDeleteMergedBranch(
      [pr({ id: 1 }), pr({ id: 2 })],
      onSettings,
      deps
    );
    expect(r.deleted).toBe(1);
    expect(r.failed).toEqual([{ prId: 1, error: 'HTTP_500' }]);
    expect(r.branchDeletedPRs).toEqual([2]);
  });

  it('null repo metadata falls through to deleteRef', async () => {
    const deps = makeDeps({ getRepo: vi.fn().mockResolvedValue(null) });
    const r = await runDeleteMergedBranch([pr()], onSettings, deps);
    expect(r.deleted).toBe(1);
    expect(deps.deleteRef).toHaveBeenCalled();
  });

  it('non-Error rejection is stringified into the failed entry', async () => {
    const deps = makeDeps({
      deleteRef: vi.fn().mockRejectedValue('weird-string'),
    });
    const r = await runDeleteMergedBranch([pr()], onSettings, deps);
    expect(r.failed).toEqual([{ prId: 1, error: 'weird-string' }]);
  });
});
