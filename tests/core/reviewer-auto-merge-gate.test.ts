import { describe, it, expect } from 'vitest';
import { evaluateReviewerAutoMergeGate, type GateInput } from '../../src/core/reviewer-auto-merge-gate';

const base: GateInput = {
  currentUserLogin: 'alice',
  prRepo: 'org/api',
  reviews: [{ login: 'alice', state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' }],
  requestedReviewers: [],
  reviewDecision: 'APPROVED',
  enableReviewerTab: true,
  enableReviewerAutoMerge: true,
  autoMergeReviewerOptInRepos: ['org/api'],
  alreadyArmed: false,
};

describe('evaluateReviewerAutoMergeGate', () => {
  it('fires when all 4 gates pass', () => {
    expect(evaluateReviewerAutoMergeGate(base)).toEqual({ fire: true });
  });

  it('blocks when master toggle is off', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, enableReviewerTab: false })).toEqual({ fire: false, reason: 'master-off' });
  });

  it('blocks when auto-merge sub-toggle is off', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, enableReviewerAutoMerge: false })).toEqual({ fire: false, reason: 'submodule-off' });
  });

  it('blocks when repo not on allowlist', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, autoMergeReviewerOptInRepos: ['org/other'] })).toEqual({ fire: false, reason: 'not-allowlisted' });
  });

  it('blocks when user has not approved', () => {
    const input: GateInput = { ...base, reviews: [{ login: 'alice', state: 'COMMENTED', submittedAt: '2026-01-01T00:00:00Z' }] };
    expect(evaluateReviewerAutoMergeGate(input)).toEqual({ fire: false, reason: 'not-approved' });
  });

  it('blocks when user requested changes most recently (decisive state)', () => {
    const input: GateInput = {
      ...base,
      reviews: [
        { login: 'alice', state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' },
        { login: 'alice', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-02T00:00:00Z' },
      ],
    };
    expect(evaluateReviewerAutoMergeGate(input)).toEqual({ fire: false, reason: 'not-approved' });
  });

  it('blocks when reviewDecision is not APPROVED (other gates still pending)', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, reviewDecision: 'REVIEW_REQUIRED' })).toEqual({ fire: false, reason: 'not-last-gate' });
  });

  it('blocks when requested_reviewers is non-empty', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, requestedReviewers: ['bob'] })).toEqual({ fire: false, reason: 'not-last-gate' });
  });

  it('blocks when already armed (idempotent suppression)', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, alreadyArmed: true })).toEqual({ fire: false, reason: 'already-armed' });
  });

  it('ignores COMMENTED reviews when picking decisive state', () => {
    const input: GateInput = {
      ...base,
      reviews: [
        { login: 'alice', state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' },
        { login: 'alice', state: 'COMMENTED', submittedAt: '2026-01-02T00:00:00Z' },
      ],
    };
    expect(evaluateReviewerAutoMergeGate(input)).toEqual({ fire: true });
  });
});
