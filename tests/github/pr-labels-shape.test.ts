// CT-3 Track 1 — pin the real GitHub PR-detail `labels` shape.
//
// Fixture is a VERBATIM capture (2026-06-01) of `gh api repos/cli/cli/pulls/13558
// --jq '.labels'` — a real labeled PR. The automation filter (Track 2) reads only
// `labels[].name`; this test proves `name` is a top-level string on each entry and
// that the typed `PullRequest.labels` projection reads it. Hard-literal expected
// names (NOT a same-path round-trip) per the plan-hygiene rule.

import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/github-pr-labels.json';
import type { PullRequest } from '../../src/core/types';

describe('GitHub PR-detail labels shape (CT-3 T1)', () => {
  it('the captured fixture is a non-empty array of {name: string, ...}', () => {
    expect(Array.isArray(fixture)).toBe(true);
    expect(fixture.length).toBeGreaterThanOrEqual(1);
    for (const label of fixture) {
      expect(typeof label.name).toBe('string');
    }
  });

  it('exposes the exact captured label names (hard literal)', () => {
    expect(fixture.map((l) => l.name)).toEqual(['needs-triage', 'external']);
  });

  it('the typed PullRequest.labels projection reads name from the real shape', () => {
    // Constructing a PullRequest from the fixture must typecheck and read name.
    const pr = {
      id: 1,
      number: 13558,
      title: 'captured',
      html_url: 'https://github.com/cli/cli/pull/13558',
      mergeable_state: 'clean',
      base: { repo: { full_name: 'cli/cli' } },
      labels: fixture, // wider GitHub shape is structurally compatible with {name}[]
    } satisfies PullRequest;

    expect(pr.labels?.[0]?.name).toBe('needs-triage');
    expect(pr.labels?.map((l) => l.name)).toEqual(['needs-triage', 'external']);
  });
});
