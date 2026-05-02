import { describe, it, expect, vi } from 'vitest';
import {
  runEnableAutoMerge,
  type EligiblePR,
  type EnableAutoMergeSettings,
  type EnableAutoMergeDeps,
} from '../../../src/background/automations/enable-auto-merge';

const onSettings: EnableAutoMergeSettings = {
  enabled: true,
  mergeMethod: 'SQUASH',
  optOutRepos: [],
};

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
  ...over,
});

describe('runEnableAutoMerge', () => {
  it('happy path enables auto-merge', async () => {
    const deps = makeDeps();
    const r = await runEnableAutoMerge([pr()], onSettings, deps);
    expect(r.enabled).toBe(1);
    expect(r.enabledPRs).toEqual([1]);
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
    expect(r.enabledPRs).toEqual([2]);
  });

  it('passes configured merge method', async () => {
    const deps = makeDeps();
    await runEnableAutoMerge([pr()], { ...onSettings, mergeMethod: 'REBASE' }, deps);
    expect(deps.enable).toHaveBeenCalledWith('PR_1', 'REBASE');
  });
});
