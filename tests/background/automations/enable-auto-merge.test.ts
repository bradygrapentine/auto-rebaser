import { describe, it, expect, vi } from 'vitest';
import {
  runEnableAutoMerge,
  resolveMergeMethod,
  type EligiblePR,
  type EnableAutoMergeSettings,
  type EnableAutoMergeDeps,
} from '../../../src/background/automations/enable-auto-merge';

const onSettings: EnableAutoMergeSettings = {
  enabled: true,
  mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
  optOutRepos: [],
};

const allAllowed = { squash: true, merge: true, rebase: true };

function makeDeps(
  overrides: Partial<EnableAutoMergeDeps> = {}
): EnableAutoMergeDeps {
  return {
    enable: vi.fn().mockResolvedValue({ enabled: true, unsupported: false }),
    ...overrides,
  };
}

const pr = (over: Partial<EligiblePR> = {}): EligiblePR => ({
  id: 1,
  nodeId: 'PR_1',
  repo: 'octo/r',
  isDraft: false,
  mergeableState: 'clean',
  autoMergeEnabled: false,
  unsupported: false,
  allowedMethods: allAllowed,
  ...over,
});

describe('runEnableAutoMerge', () => {
  it('happy path enables auto-merge', async () => {
    const deps = makeDeps();
    const r = await runEnableAutoMerge([pr()], onSettings, deps);
    expect(r.enabled).toBe(1);
    expect(r.enabledPRs).toEqual([{ prId: 1, method: 'SQUASH' }]);
    expect(deps.enable).toHaveBeenCalledWith('PR_1', 'SQUASH');
  });

  it('kill-switch off: no calls', async () => {
    const deps = makeDeps();
    const r = await runEnableAutoMerge([pr()], { ...onSettings, enabled: false }, deps);
    expect(r.skipped).toBe(1);
    expect(deps.enable).not.toHaveBeenCalled();
  });

  it('draft PR skipped', async () => {
    const deps = makeDeps();
    await runEnableAutoMerge([pr({ isDraft: true })], onSettings, deps);
    expect(deps.enable).not.toHaveBeenCalled();
  });

  it('dirty (conflict) PR skipped', async () => {
    const deps = makeDeps();
    await runEnableAutoMerge([pr({ mergeableState: 'dirty' })], onSettings, deps);
    expect(deps.enable).not.toHaveBeenCalled();
  });

  it('already-enabled PR skipped (idempotent)', async () => {
    const deps = makeDeps();
    await runEnableAutoMerge([pr({ autoMergeEnabled: true })], onSettings, deps);
    expect(deps.enable).not.toHaveBeenCalled();
  });

  it('previously-unsupported PR skipped', async () => {
    const deps = makeDeps();
    await runEnableAutoMerge([pr({ unsupported: true })], onSettings, deps);
    expect(deps.enable).not.toHaveBeenCalled();
  });

  it('unsupported result records PR id and does not count as enabled', async () => {
    const deps = makeDeps({
      enable: vi.fn().mockResolvedValue({ enabled: false, unsupported: true }),
    });
    const r = await runEnableAutoMerge([pr()], onSettings, deps);
    expect(r.enabled).toBe(0);
    expect(r.unsupportedPRs).toEqual([1]);
  });

  it('error → failed entry, others still processed', async () => {
    const deps = makeDeps({
      enable: vi
        .fn()
        .mockRejectedValueOnce(new Error('RATE_LIMITED'))
        .mockResolvedValue({ enabled: true, unsupported: false }),
    });
    const r = await runEnableAutoMerge([pr({ id: 1 }), pr({ id: 2 })], onSettings, deps);
    expect(r.failed).toEqual([{ prId: 1, error: 'RATE_LIMITED' }]);
    expect(r.enabledPRs).toEqual([{ prId: 2, method: 'SQUASH' }]);
  });

  it('uses first preference that the repo allows', async () => {
    const deps = makeDeps();
    const onlyRebase = { squash: false, merge: false, rebase: true };
    await runEnableAutoMerge(
      [pr({ allowedMethods: onlyRebase })],
      { ...onSettings, mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'] },
      deps,
    );
    expect(deps.enable).toHaveBeenCalledWith('PR_1', 'REBASE');
  });

  it('respects user preference order over default', async () => {
    const deps = makeDeps();
    await runEnableAutoMerge(
      [pr()],
      { ...onSettings, mergeMethodPreference: ['MERGE', 'SQUASH', 'REBASE'] },
      deps,
    );
    expect(deps.enable).toHaveBeenCalledWith('PR_1', 'MERGE');
  });

  it('records noAllowedMethodPRs when no preferred method is allowed', async () => {
    const deps = makeDeps();
    const onlySquash = { squash: true, merge: false, rebase: false };
    const r = await runEnableAutoMerge(
      [pr({ id: 7, allowedMethods: onlySquash })],
      { ...onSettings, mergeMethodPreference: ['REBASE', 'MERGE'] },
      deps,
    );
    expect(r.noAllowedMethodPRs).toEqual([7]);
    expect(r.enabled).toBe(0);
    expect(deps.enable).not.toHaveBeenCalled();
  });

  it('empty preference list = no auto-merge for any PR', async () => {
    const deps = makeDeps();
    const r = await runEnableAutoMerge(
      [pr({ id: 1 }), pr({ id: 2 })],
      { ...onSettings, mergeMethodPreference: [] },
      deps,
    );
    expect(r.noAllowedMethodPRs).toEqual([1, 2]);
    expect(deps.enable).not.toHaveBeenCalled();
  });
});

describe('resolveMergeMethod', () => {
  it('returns first preference that the repo allows', () => {
    expect(
      resolveMergeMethod(['SQUASH', 'REBASE', 'MERGE'], { squash: true, merge: true, rebase: true }),
    ).toBe('SQUASH');
  });
  it('skips disallowed methods until it finds an allowed one', () => {
    expect(
      resolveMergeMethod(['SQUASH', 'REBASE', 'MERGE'], { squash: false, merge: true, rebase: false }),
    ).toBe('MERGE');
  });
  it('returns null when no preference matches', () => {
    expect(
      resolveMergeMethod(['SQUASH'], { squash: false, merge: true, rebase: true }),
    ).toBeNull();
  });
  it('returns null on empty preference', () => {
    expect(resolveMergeMethod([], { squash: true, merge: true, rebase: true })).toBeNull();
  });
});
