// CT-3 Track 2 — the pure auto-action filter predicate.
//
// Hard-literal expected verdicts (NOT derived through the same path). Precedence
// repo > draft > label. Case-insensitive on repo and labels. Defaults inert.

import { describe, it, expect } from 'vitest';
import { evaluateAutoActionFilter } from '../../src/core/automations-filter';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { AutomationSettings } from '../../src/core/automations-types';

type FilterSettings = Pick<
  AutomationSettings,
  'allowRepos' | 'denyRepos' | 'skipDraftPRs' | 'includeLabels' | 'excludeLabels'
>;

const S = (over: Partial<FilterSettings> = {}): FilterSettings => ({
  allowRepos: [],
  denyRepos: [],
  skipDraftPRs: false,
  includeLabels: [],
  excludeLabels: [],
  ...over,
});

const lbl = (...names: string[]) => names.map((name) => ({ name }));

describe('evaluateAutoActionFilter', () => {
  it('empty allow + empty deny → not suppressed', () => {
    expect(evaluateAutoActionFilter({ repo: 'o/r' }, S())).toEqual({ suppressed: false, reason: null });
  });

  it('allowlist mode: repo not on a non-empty allow-list → suppressed (repo)', () => {
    expect(evaluateAutoActionFilter({ repo: 'o/other' }, S({ allowRepos: ['o/keep'] }))).toEqual({
      suppressed: true,
      reason: 'repo',
    });
  });

  it('allowlist mode: repo on the allow-list → not suppressed', () => {
    expect(evaluateAutoActionFilter({ repo: 'o/keep' }, S({ allowRepos: ['o/keep'] }))).toEqual({
      suppressed: false,
      reason: null,
    });
  });

  it('deny: repo on the deny-list (allow empty) → suppressed (repo)', () => {
    expect(evaluateAutoActionFilter({ repo: 'o/x' }, S({ denyRepos: ['o/x'] }))).toEqual({
      suppressed: true,
      reason: 'repo',
    });
  });

  it('deny wins: repo in BOTH allow and deny → suppressed (repo)', () => {
    expect(
      evaluateAutoActionFilter({ repo: 'o/x' }, S({ allowRepos: ['o/x'], denyRepos: ['o/x'] })),
    ).toEqual({ suppressed: true, reason: 'repo' });
  });

  it('repo compare is case-insensitive', () => {
    expect(evaluateAutoActionFilter({ repo: 'Org/Repo' }, S({ denyRepos: ['org/repo'] }))).toEqual({
      suppressed: true,
      reason: 'repo',
    });
  });

  it('skip-drafts: draft + skipDraftPRs:true → suppressed (draft)', () => {
    expect(evaluateAutoActionFilter({ repo: 'o/r', draft: true }, S({ skipDraftPRs: true }))).toEqual({
      suppressed: true,
      reason: 'draft',
    });
  });

  it('skip-drafts: draft + skipDraftPRs:false → not suppressed', () => {
    expect(evaluateAutoActionFilter({ repo: 'o/r', draft: true }, S({ skipDraftPRs: false }))).toEqual({
      suppressed: false,
      reason: null,
    });
  });

  it('skip-drafts: non-draft + skipDraftPRs:true → not suppressed', () => {
    expect(evaluateAutoActionFilter({ repo: 'o/r', draft: false }, S({ skipDraftPRs: true }))).toEqual({
      suppressed: false,
      reason: null,
    });
  });

  it('include-labels: PR carries a required label (case-insensitive) → not suppressed', () => {
    expect(
      evaluateAutoActionFilter({ repo: 'o/r', labels: lbl('ready') }, S({ includeLabels: ['Ready'] })),
    ).toEqual({ suppressed: false, reason: null });
  });

  it('include-labels: PR lacks all required labels → suppressed (label)', () => {
    expect(
      evaluateAutoActionFilter({ repo: 'o/r', labels: lbl('bug') }, S({ includeLabels: ['feature'] })),
    ).toEqual({ suppressed: true, reason: 'label' });
  });

  it('exclude-labels: PR carries an excluded label → suppressed (label)', () => {
    expect(
      evaluateAutoActionFilter({ repo: 'o/r', labels: lbl('do-not-merge') }, S({ excludeLabels: ['do-not-merge'] })),
    ).toEqual({ suppressed: true, reason: 'label' });
  });

  it('exclude-labels: PR lacks the excluded label → not suppressed', () => {
    expect(
      evaluateAutoActionFilter({ repo: 'o/r', labels: lbl('ok') }, S({ excludeLabels: ['do-not-merge'] })),
    ).toEqual({ suppressed: false, reason: null });
  });

  it('exclude compare is case-insensitive', () => {
    expect(
      evaluateAutoActionFilter({ repo: 'o/r', labels: lbl('Do-Not-Merge') }, S({ excludeLabels: ['do-not-merge'] })),
    ).toEqual({ suppressed: true, reason: 'label' });
  });

  it('precedence: repo-denied AND draft AND label-excluded → reason is repo', () => {
    expect(
      evaluateAutoActionFilter(
        { repo: 'o/x', draft: true, labels: lbl('do-not-merge') },
        S({ denyRepos: ['o/x'], skipDraftPRs: true, excludeLabels: ['do-not-merge'] }),
      ),
    ).toEqual({ suppressed: true, reason: 'repo' });
  });

  it('undefined labels + non-empty include → suppressed (label), no crash', () => {
    expect(
      evaluateAutoActionFilter({ repo: 'o/r', labels: undefined }, S({ includeLabels: ['x'] })),
    ).toEqual({ suppressed: true, reason: 'label' });
  });

  it('default settings inert: a labeled DRAFT PR → not suppressed', () => {
    expect(
      evaluateAutoActionFilter(
        { repo: 'o/r', draft: true, labels: lbl('do-not-merge', 'bug') },
        DEFAULT_AUTOMATION_SETTINGS,
      ),
    ).toEqual({ suppressed: false, reason: null });
  });
});
