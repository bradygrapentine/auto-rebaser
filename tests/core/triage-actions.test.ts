import { describe, it, expect } from 'vitest';
import { triageActionFor } from '../../src/core/triage-actions';
import { isPRActionable } from '../../src/core/actionable-pr';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRRecord } from '../../src/core/types';
import type { PRRecordPhaseTwo, AutomationSettings } from '../../src/core/automations-types';

const URL = 'https://github.com/org/r/pull/1';

function pr(overrides: Partial<PRRecord & PRRecordPhaseTwo> = {}): PRRecord & PRRecordPhaseTwo {
  return {
    id: 1,
    number: 1,
    title: 't',
    repo: 'org/r',
    url: URL,
    state: 'current',
    lastUpdated: 0,
    ...overrides,
  } as PRRecord & PRRecordPhaseTwo;
}

const settings = (over: Partial<AutomationSettings> = {}): AutomationSettings => ({
  ...DEFAULT_AUTOMATION_SETTINGS,
  ...over,
});

const staleApproval = { lastApprovedAt: 100, lastPushedAt: 200, approvers: ['alice'] };

describe('triageActionFor — reason→action mapping (hard-literal hrefs)', () => {
  it('staleApproval (checked first, independent of state) → re-request review', () => {
    expect(
      triageActionFor(pr({ state: 'current', staleApproval }), settings({ enablePushSinceApproval: true })),
    ).toEqual({ reason: 'staleApproval', label: 're-request review', href: URL });
  });

  it('conflict → open conflicts (/conflicts deep link)', () => {
    expect(triageActionFor(pr({ state: 'conflict' }), settings())).toEqual({
      reason: 'conflict',
      label: 'open conflicts',
      href: `${URL}/conflicts`,
    });
  });

  it('needs-manual → resolve manually', () => {
    expect(triageActionFor(pr({ state: 'needs-manual' }), settings())).toEqual({
      reason: 'needs-manual',
      label: 'resolve manually',
      href: URL,
    });
  });

  it('rebase-rejected → resolve conflict (/conflicts deep link)', () => {
    expect(triageActionFor(pr({ state: 'rebase-rejected' }), settings())).toEqual({
      reason: 'rebase-rejected',
      label: 'resolve conflict',
      href: `${URL}/conflicts`,
    });
  });

  it('behind + autoRebaseEnabled=false → rebase manually', () => {
    expect(
      triageActionFor(pr({ state: 'behind' }), settings({ autoRebaseEnabled: false })),
    ).toEqual({ reason: 'behind-auto-off', label: 'rebase manually', href: URL });
  });

  it('behind + repo opted out → rebase manually (opt-out branch)', () => {
    expect(
      triageActionFor(pr({ state: 'behind', repo: 'org/r' }), settings({ autoRebaseOptOutRepos: ['org/r'] })),
    ).toEqual({ reason: 'behind-auto-off', label: 'rebase manually', href: URL });
  });

  it('non-actionable PRs → null', () => {
    expect(triageActionFor(pr({ state: 'current' }), settings())).toBeNull();
    // behind + autoRebaseEnabled=true + not opted out → auto-rebase handles it → null
    expect(triageActionFor(pr({ state: 'behind' }), settings())).toBeNull();
  });
});

describe('triageActionFor ↔ isPRActionable one-to-one (cross-module exhaustiveness)', () => {
  // Every isPRActionable-true fixture MUST yield a non-null action, and every
  // false fixture MUST yield null. This is the real cross-module guard (the
  // `never` default only catches a new TriageReason member).
  const cases: Array<{ name: string; pr: PRRecord & PRRecordPhaseTwo; settings: AutomationSettings }> = [
    { name: 'staleApproval', pr: pr({ staleApproval }), settings: settings({ enablePushSinceApproval: true }) },
    { name: 'conflict', pr: pr({ state: 'conflict' }), settings: settings() },
    { name: 'needs-manual', pr: pr({ state: 'needs-manual' }), settings: settings() },
    { name: 'rebase-rejected', pr: pr({ state: 'rebase-rejected' }), settings: settings() },
    { name: 'behind+auto-off', pr: pr({ state: 'behind' }), settings: settings({ autoRebaseEnabled: false }) },
    { name: 'behind+opt-out', pr: pr({ state: 'behind' }), settings: settings({ autoRebaseOptOutRepos: ['org/r'] }) },
    // non-actionable controls
    { name: 'current', pr: pr({ state: 'current' }), settings: settings() },
    { name: 'behind+auto-on', pr: pr({ state: 'behind' }), settings: settings() },
    { name: 'updated', pr: pr({ state: 'updated' }), settings: settings() },
    { name: 'error', pr: pr({ state: 'error' }), settings: settings() },
  ];

  for (const c of cases) {
    it(`${c.name}: triageActionFor non-null iff isPRActionable true`, () => {
      const actionable = isPRActionable(c.pr, c.settings);
      const action = triageActionFor(c.pr, c.settings);
      expect(action !== null).toBe(actionable);
    });
  }
});
