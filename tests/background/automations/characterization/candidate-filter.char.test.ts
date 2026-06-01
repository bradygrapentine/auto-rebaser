// CHARACTERIZATION WALL (PREVIEW-1) — candidate-selection filter.
//
// Pins the automation-candidate set (suspended-owner drop + evaluateAutoActionFilter
// suppression) as HARD LITERALS. Authored test-first in T1 alongside the
// `selectAutomationCandidates` extraction it guards (it could not exist at T0 —
// the helper did not exist yet). Both the poll cycle and the preview gatherer call
// THIS one helper, so a green wall here proves the two paths select the same set.
import { describe, it, expect } from 'vitest';
import { selectAutomationCandidates } from '../../../../src/core/automations-filter';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../../src/core/automations-types';
import type { AutomationSettings } from '../../../../src/core/automations-types';

type Candidate = { id: number; repo: string; isDraft?: boolean; labels?: Array<{ name: string }> };

function settings(over: Partial<AutomationSettings> = {}): AutomationSettings {
  return { ...DEFAULT_AUTOMATION_SETTINGS, ...over };
}

describe('CHAR selectAutomationCandidates — survivor-set literals', () => {
  it('drops suspended-owner PRs (case-insensitive owner match), keeps the rest', () => {
    const prs: Candidate[] = [
      { id: 1, repo: 'Alice/repo' }, // owner 'alice' suspended
      { id: 2, repo: 'bob/repo' },
    ];
    const out = selectAutomationCandidates(prs, {
      suspendedOwnerSet: new Set(['alice']),
      settings: settings(),
    });
    expect(out.map((p) => p.id)).toEqual([2]);
  });

  it('drops deny-repo + allow-list-miss + draft(skipDraftPRs) + exclude-label; keeps genuinely-eligible', () => {
    const prs: Candidate[] = [
      { id: 1, repo: 'org/denied' }, // deny
      { id: 2, repo: 'org/notallowed' }, // allow-list configured, not on it
      { id: 3, repo: 'org/ok', isDraft: true }, // draft + skipDraftPRs
      { id: 4, repo: 'org/ok', labels: [{ name: 'wip' }] }, // exclude label
      { id: 5, repo: 'org/ok', labels: [{ name: 'ready' }] }, // eligible
      { id: 6, repo: 'org/ok' }, // eligible
    ];
    const out = selectAutomationCandidates(prs, {
      suspendedOwnerSet: new Set(),
      settings: settings({
        denyRepos: ['org/denied'],
        allowRepos: ['org/ok'],
        skipDraftPRs: true,
        excludeLabels: ['wip'],
      }),
    });
    expect(out.map((p) => p.id)).toEqual([5, 6]);
  });

  it('include-label filter: keeps only PRs carrying an included label', () => {
    const prs: Candidate[] = [
      { id: 1, repo: 'org/r', labels: [{ name: 'auto' }] },
      { id: 2, repo: 'org/r', labels: [{ name: 'other' }] },
      { id: 3, repo: 'org/r' }, // no labels → not included
    ];
    const out = selectAutomationCandidates(prs, {
      suspendedOwnerSet: new Set(),
      settings: settings({ includeLabels: ['auto'] }),
    });
    expect(out.map((p) => p.id)).toEqual([1]);
  });

  it('default settings + no suspensions → every PR survives (identity)', () => {
    const prs: Candidate[] = [
      { id: 1, repo: 'a/b' },
      { id: 2, repo: 'c/d', isDraft: true },
      { id: 3, repo: 'e/f', labels: [{ name: 'x' }] },
    ];
    const out = selectAutomationCandidates(prs, { suspendedOwnerSet: new Set(), settings: settings() });
    expect(out.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('preserves input element order and identity (returns the same objects, filtered)', () => {
    const a = { id: 1, repo: 'o/a' };
    const b = { id: 2, repo: 'o/b' };
    const out = selectAutomationCandidates([a, b], { suspendedOwnerSet: new Set(), settings: settings() });
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
  });
});
