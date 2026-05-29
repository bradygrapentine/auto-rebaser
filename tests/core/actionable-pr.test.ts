import { describe, it, expect } from 'vitest';
import { isPRActionable } from '../../src/core/actionable-pr';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRRecord } from '../../src/core/types';
import type { PRRecordPhaseTwo } from '../../src/core/automations-types';

function pr(overrides: Partial<PRRecord & PRRecordPhaseTwo> = {}): PRRecord & PRRecordPhaseTwo {
  return {
    id: 1,
    number: 1,
    title: 't',
    repo: 'org/r',
    url: 'u',
    state: 'current',
    lastUpdated: 0,
    ...overrides,
  } as PRRecord & PRRecordPhaseTwo;
}

describe('isPRActionable', () => {
  const settings = { ...DEFAULT_AUTOMATION_SETTINGS };

  it('current/updated/draft/merged/closed/error/pending → not actionable', () => {
    for (const state of ['current', 'updated', 'draft', 'merged', 'closed', 'error', 'pending'] as const) {
      expect(isPRActionable(pr({ state }), settings)).toBe(false);
    }
  });

  it('conflict → actionable', () => {
    expect(isPRActionable(pr({ state: 'conflict' }), settings)).toBe(true);
  });

  it('needs-manual → actionable', () => {
    expect(isPRActionable(pr({ state: 'needs-manual' }), settings)).toBe(true);
  });

  it('behind + autoRebaseEnabled=true + repo not opted out → NOT actionable (auto-rebase handles it)', () => {
    expect(isPRActionable(pr({ state: 'behind' }), settings)).toBe(false);
  });

  it('behind + autoRebaseEnabled=false → actionable', () => {
    expect(isPRActionable(pr({ state: 'behind' }), { ...settings, autoRebaseEnabled: false })).toBe(true);
  });

  it('behind + repo in autoRebaseOptOutRepos → actionable', () => {
    expect(
      isPRActionable(pr({ state: 'behind', repo: 'org/r' }), {
        ...settings,
        autoRebaseOptOutRepos: ['org/r'],
      }),
    ).toBe(true);
  });

  const staleApproval = { lastApprovedAt: 100, lastPushedAt: 200, approvers: ['alice'] };

  it('staleApproval set + enablePushSinceApproval=true → actionable', () => {
    expect(
      isPRActionable(pr({ state: 'current', staleApproval }), {
        ...settings,
        enablePushSinceApproval: true,
      }),
    ).toBe(true);
  });

  it('staleApproval set + enablePushSinceApproval=false → NOT actionable', () => {
    expect(
      isPRActionable(pr({ state: 'current', staleApproval }), {
        ...settings,
        enablePushSinceApproval: false,
      }),
    ).toBe(false);
  });

  it('staleApproval=null → NOT actionable (null means computed-and-cleared)', () => {
    expect(
      isPRActionable(pr({ state: 'current', staleApproval: null }), {
        ...settings,
        enablePushSinceApproval: true,
      }),
    ).toBe(false);
  });
});

// OPS-1 gate probe — intentional failure, DO NOT MERGE.
import { test as _opsProbe, expect as _opsExpect } from 'vitest';
_opsProbe('OPS-1 required-check probe (intentional fail)', () => { _opsExpect(1).toBe(2); });
