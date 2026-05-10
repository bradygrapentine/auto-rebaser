import { describe, it, expect } from 'vitest';
import { detectStaleApproval, type StaleApprovalInput } from '../../src/core/stale-approval';

const r = (over: Partial<StaleApprovalInput['reviews'][number]>): StaleApprovalInput['reviews'][number] => ({
  login: 'alice',
  state: 'APPROVED',
  submittedAt: 1_000,
  ...over,
});

describe('detectStaleApproval', () => {
  it('returns null when reviews list is empty', () => {
    expect(detectStaleApproval({ lastPushedAt: 5_000, reviews: [] })).toBeNull();
  });

  it('returns null when lastPushedAt is null', () => {
    expect(
      detectStaleApproval({
        lastPushedAt: null,
        reviews: [r({ submittedAt: 1_000 })],
      }),
    ).toBeNull();
  });

  it('returns null when at least one current approver approved AFTER the push', () => {
    const out = detectStaleApproval({
      lastPushedAt: 5_000,
      reviews: [
        r({ login: 'alice', submittedAt: 4_000 }),
        r({ login: 'bob', submittedAt: 6_000 }), // after push
      ],
    });
    expect(out).toBeNull();
  });

  it('returns stale=true when every current approver approved before the push', () => {
    const out = detectStaleApproval({
      lastPushedAt: 5_000,
      reviews: [
        r({ login: 'alice', submittedAt: 3_000 }),
        r({ login: 'bob', submittedAt: 4_000 }),
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.stale).toBe(true);
    expect(out!.approvers.sort()).toEqual(['alice', 'bob']);
    expect(out!.lastApprovedAt).toBe(4_000);
    expect(out!.lastPushedAt).toBe(5_000);
  });

  it('collapses multiple reviews from the same reviewer to the latest decisive state', () => {
    // Alice approved at 1000, then commented at 2000, then re-approved at 4000.
    // Latest decisive state for alice is APPROVED at 4000.
    const out = detectStaleApproval({
      lastPushedAt: 5_000,
      reviews: [
        r({ login: 'alice', state: 'APPROVED', submittedAt: 1_000 }),
        r({ login: 'alice', state: 'COMMENTED', submittedAt: 2_000 }),
        r({ login: 'alice', state: 'APPROVED', submittedAt: 4_000 }),
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.lastApprovedAt).toBe(4_000);
  });

  it('returns null when an APPROVED review was later overridden by CHANGES_REQUESTED', () => {
    // Alice approved at 3000 (before push), then requested changes at 4000.
    // She is no longer a current approver.
    const out = detectStaleApproval({
      lastPushedAt: 5_000,
      reviews: [
        r({ login: 'alice', state: 'APPROVED', submittedAt: 3_000 }),
        r({ login: 'alice', state: 'CHANGES_REQUESTED', submittedAt: 4_000 }),
      ],
    });
    expect(out).toBeNull();
  });

  it('returns null when an APPROVED review was later DISMISSED (e.g. by branch protection)', () => {
    const out = detectStaleApproval({
      lastPushedAt: 5_000,
      reviews: [
        r({ login: 'alice', state: 'APPROVED', submittedAt: 3_000 }),
        r({ login: 'alice', state: 'DISMISSED', submittedAt: 4_500 }),
      ],
    });
    expect(out).toBeNull();
  });

  it('ignores COMMENTED reviews entirely', () => {
    // No decisive reviews → null.
    const out = detectStaleApproval({
      lastPushedAt: 5_000,
      reviews: [
        r({ login: 'alice', state: 'COMMENTED', submittedAt: 1_000 }),
        r({ login: 'bob', state: 'COMMENTED', submittedAt: 2_000 }),
      ],
    });
    expect(out).toBeNull();
  });

  it('lastApprovedAt is the latest current-approver timestamp, not the earliest or a dismissed one', () => {
    const out = detectStaleApproval({
      lastPushedAt: 10_000,
      reviews: [
        // alice's path: approved → dismissed (no longer counts)
        r({ login: 'alice', state: 'APPROVED', submittedAt: 1_000 }),
        r({ login: 'alice', state: 'DISMISSED', submittedAt: 2_000 }),
        // bob: approved at 3000 (current)
        r({ login: 'bob', state: 'APPROVED', submittedAt: 3_000 }),
        // carol: approved at 5000 (current)
        r({ login: 'carol', state: 'APPROVED', submittedAt: 5_000 }),
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.approvers.sort()).toEqual(['bob', 'carol']);
    expect(out!.lastApprovedAt).toBe(5_000);
  });

  it('treats a bot reviewer as a regular approver (current scope; future polish PR may filter)', () => {
    // Pin the in-scope behavior: bots count.
    const out = detectStaleApproval({
      lastPushedAt: 5_000,
      reviews: [r({ login: 'renovate-bot', submittedAt: 3_000 })],
    });
    expect(out).not.toBeNull();
    expect(out!.approvers).toEqual(['renovate-bot']);
  });
});
