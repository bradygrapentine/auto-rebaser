// CHARACTERIZATION WALL (PREVIEW-1 T0) — enable-auto-merge.
//
// Pins the EXACT skip predicate + method resolution + bookkeeping of
// `runEnableAutoMerge` (and `resolveMergeMethod`) as hard literals, BEFORE T1
// factors the decision into `decideEnableAutoMerge`. Drives the REAL module; only
// the injected `enable` dep is a spy. NO Date.now in this module — fully pure
// given deps.
import { describe, it, expect, vi } from 'vitest';
import {
  runEnableAutoMerge,
  resolveMergeMethod,
  type EligiblePR,
  type RepoAllowedMethods,
} from '../../../../src/background/automations/enable-auto-merge';

const ALL: RepoAllowedMethods = { squash: true, merge: true, rebase: true };

function pr(over: Partial<EligiblePR> = {}): EligiblePR {
  return {
    id: 1,
    nodeId: 'node1',
    repo: 'owner/repo',
    isDraft: false,
    mergeableState: 'clean',
    autoMergeEnabled: false,
    unsupported: false,
    allowedMethods: ALL,
    ...over,
  };
}

describe('CHAR resolveMergeMethod — first-allowed-in-preference literals', () => {
  it('picks the first preference whose repo flag is true', () => {
    expect(resolveMergeMethod(['SQUASH', 'MERGE'], ALL)).toBe('SQUASH');
    expect(resolveMergeMethod(['MERGE', 'SQUASH'], ALL)).toBe('MERGE');
    expect(resolveMergeMethod(['REBASE', 'SQUASH'], { squash: true, merge: false, rebase: false })).toBe('SQUASH');
    expect(resolveMergeMethod(['MERGE'], { squash: true, merge: false, rebase: true })).toBeNull();
    expect(resolveMergeMethod([], ALL)).toBeNull();
  });
});

describe('CHAR enable-auto-merge — skip predicate + outcome bookkeeping literals', () => {
  it('draft / dirty / already-enabled / opt-out are each skipped (no enable call)', async () => {
    const enable = vi.fn();
    const result = await runEnableAutoMerge(
      [
        pr({ id: 1, isDraft: true }),
        pr({ id: 2, mergeableState: 'dirty' }),
        pr({ id: 3, autoMergeEnabled: true }),
        pr({ id: 4, repo: 'owner/optout' }),
      ],
      { enabled: true, mergeMethodPreference: ['SQUASH'], optOutRepos: ['owner/optout'] },
      { enable },
    );

    expect(result).toEqual({
      enabled: 0,
      skipped: 4,
      unsupportedPRs: [],
      unsupportedReasons: {},
      noAllowedMethodPRs: [],
      enabledPRs: [],
      failed: [],
    });
    expect(enable).not.toHaveBeenCalled();
  });

  it('no allowed method (preference unsatisfiable) → noAllowedMethodPRs, enable not called', async () => {
    const enable = vi.fn();
    const result = await runEnableAutoMerge(
      [pr({ id: 9, allowedMethods: { squash: false, merge: false, rebase: true } })],
      { enabled: true, mergeMethodPreference: ['SQUASH', 'MERGE'], optOutRepos: [] },
      { enable },
    );

    expect(result).toEqual({
      enabled: 0,
      skipped: 0,
      unsupportedPRs: [],
      unsupportedReasons: {},
      noAllowedMethodPRs: [9],
      enabledPRs: [],
      failed: [],
    });
    expect(enable).not.toHaveBeenCalled();
  });

  it('enabled success → enabled++ + enabledPRs with the resolved method; enable called with nodeId+method', async () => {
    const enable = vi.fn().mockResolvedValue({ enabled: true, unsupported: false });
    const result = await runEnableAutoMerge(
      [pr({ id: 5, nodeId: 'N5' })],
      { enabled: true, mergeMethodPreference: ['REBASE', 'SQUASH'], optOutRepos: [] },
      { enable },
    );

    expect(result).toEqual({
      enabled: 1,
      skipped: 0,
      unsupportedPRs: [],
      unsupportedReasons: {},
      noAllowedMethodPRs: [],
      enabledPRs: [{ prId: 5, method: 'REBASE' }],
      failed: [],
    });
    expect(enable).toHaveBeenCalledWith('N5', 'REBASE');
  });

  it('unsupported response → unsupportedPRs + unsupportedReasons (reason captured only when present)', async () => {
    const enable = vi
      .fn()
      .mockResolvedValueOnce({ enabled: false, unsupported: true, reason: 'Pull request is in clean status' })
      .mockResolvedValueOnce({ enabled: false, unsupported: true }); // no reason
    const result = await runEnableAutoMerge(
      [pr({ id: 6 }), pr({ id: 7 })],
      { enabled: true, mergeMethodPreference: ['SQUASH'], optOutRepos: [] },
      { enable },
    );

    expect(result).toEqual({
      enabled: 0,
      skipped: 0,
      unsupportedPRs: [6, 7],
      unsupportedReasons: { 6: 'Pull request is in clean status' },
      noAllowedMethodPRs: [],
      enabledPRs: [],
      failed: [],
    });
  });

  it('enable throws → failed entry with the message', async () => {
    const enable = vi.fn().mockRejectedValue(new Error('graphql-boom'));
    const result = await runEnableAutoMerge(
      [pr({ id: 8 })],
      { enabled: true, mergeMethodPreference: ['SQUASH'], optOutRepos: [] },
      { enable },
    );

    expect(result).toEqual({
      enabled: 0,
      skipped: 0,
      unsupportedPRs: [],
      unsupportedReasons: {},
      noAllowedMethodPRs: [],
      enabledPRs: [],
      failed: [{ prId: 8, error: 'graphql-boom' }],
    });
  });

  it('disabled → all counted skipped, enable untouched', async () => {
    const enable = vi.fn();
    const result = await runEnableAutoMerge(
      [pr({ id: 1 }), pr({ id: 2 })],
      { enabled: false, mergeMethodPreference: ['SQUASH'], optOutRepos: [] },
      { enable },
    );
    expect(result.skipped).toBe(2);
    expect(result.enabled).toBe(0);
    expect(enable).not.toHaveBeenCalled();
  });
});
