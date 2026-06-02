// DIGEST-1 — pure aggregation tests. computeDigest is deterministic given an
// injected `now`, so every assertion is against a hard-coded literal (NOT a
// same-codepath rebuild).
import { describe, it, expect } from 'vitest';
import { computeDigest, DEFAULT_DIGEST_WINDOW_DAYS, type ActivityDigest } from '../../src/core/activity-digest';
import type { ActivityAction, ActivityEntry, ActivityResult } from '../../src/core/activity-log-types';

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const SINCE = NOW - DEFAULT_DIGEST_WINDOW_DAYS * DAY; // 7-day window

let seq = 0;
function e(action: ActivityAction, result: ActivityResult, at: number): ActivityEntry {
  return { at, action, result, repo: 'o/r', prNumber: ++seq, prTitle: 't' };
}

describe('computeDigest', () => {
  it('groups in-window entries by action and tallies results (hard literal)', () => {
    const entries = [
      e('rebase', 'success', NOW - DAY),
      e('rebase', 'success', NOW - 2 * DAY),
      e('rebase', 'failed', NOW - 3 * DAY),
      e('branch_deleted', 'success', NOW - DAY),
      e('auto_merge_enabled', 'skipped', NOW - DAY),
      e('auto_merge_enabled', 'success', NOW - DAY),
    ];
    expect(computeDigest(entries, { now: NOW })).toEqual<ActivityDigest>({
      windowDays: 7,
      since: SINCE,
      totalActions: 6,
      // sorted total-desc, then action-asc on the (2,2) tie
      byAction: [
        { action: 'rebase', success: 2, failed: 1, skipped: 0, total: 3 },
        { action: 'auto_merge_enabled', success: 1, failed: 0, skipped: 1, total: 2 },
        { action: 'branch_deleted', success: 1, failed: 0, skipped: 0, total: 1 },
      ],
      rebaseSuccess: 2,
    });
  });

  it('window lower bound is INCLUSIVE: at === since is counted, at === since-1 is excluded', () => {
    const onEdge = computeDigest([e('rebase', 'success', SINCE)], { now: NOW });
    expect(onEdge.totalActions).toBe(1);
    expect(onEdge.rebaseSuccess).toBe(1);

    const justOutside = computeDigest([e('rebase', 'success', SINCE - 1)], { now: NOW });
    expect(justOutside.totalActions).toBe(0);
    expect(justOutside.byAction).toEqual([]);
  });

  it('omits out-of-window entries entirely', () => {
    const entries = [
      e('rebase', 'success', NOW - DAY), // in
      e('rebase', 'success', NOW - 30 * DAY), // out
    ];
    const d = computeDigest(entries, { now: NOW });
    expect(d.totalActions).toBe(1);
    expect(d.byAction).toEqual([{ action: 'rebase', success: 1, failed: 0, skipped: 0, total: 1 }]);
  });

  it('byAction omits zero-count actions and orders total-desc then action-asc', () => {
    const entries = [
      e('thread_resolved', 'success', NOW - DAY),
      e('thread_resolved', 'success', NOW - DAY),
      e('reviewer_pinged', 'success', NOW - DAY),
      e('branch_deleted', 'success', NOW - DAY),
    ];
    const d = computeDigest(entries, { now: NOW });
    // exact ordered literal — NOT set-equality
    expect(d.byAction.map((c) => c.action)).toEqual(['thread_resolved', 'branch_deleted', 'reviewer_pinged']);
  });

  it('empty input → zeroed digest', () => {
    expect(computeDigest([], { now: NOW })).toEqual<ActivityDigest>({
      windowDays: 7,
      since: SINCE,
      totalActions: 0,
      byAction: [],
      rebaseSuccess: 0,
    });
  });

  it('rebaseSuccess counts ONLY rebase + success (not failed rebases or other successes)', () => {
    const entries = [
      e('rebase', 'success', NOW - DAY),
      e('rebase', 'failed', NOW - DAY),
      e('branch_deleted', 'success', NOW - DAY),
    ];
    expect(computeDigest(entries, { now: NOW }).rebaseSuccess).toBe(1);
  });

  it('honors a custom windowDays', () => {
    const entries = [e('rebase', 'success', NOW - 5 * DAY)];
    expect(computeDigest(entries, { now: NOW, windowDays: 3 }).totalActions).toBe(0); // 5d > 3d window
    expect(computeDigest(entries, { now: NOW, windowDays: 7 }).totalActions).toBe(1);
  });
});
