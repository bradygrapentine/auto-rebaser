import { describe, it, expect } from 'vitest';
import { buildPollSummary } from '../../src/background/poll-summary';

describe('buildPollSummary', () => {
  it('produces correct counts from non-zero inputs', () => {
    const results = {
      branchesDeleted: 3,
      autoMergeEnabled: 2,
      threadsResolved: 5,
    };
    const summary = buildPollSummary(4, results, 1);
    expect(summary.rebased).toBe(4);
    expect(summary.branchesDeleted).toBe(3);
    expect(summary.autoMergeEnabled).toBe(2);
    expect(summary.threadsResolved).toBe(5);
    expect(summary.errors).toBe(1);
  });

  it('ranAt is within 100ms of call time', () => {
    const before = Date.now();
    const summary = buildPollSummary(0, { branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0 }, 0);
    const after = Date.now();
    expect(summary.ranAt).toBeGreaterThanOrEqual(before);
    expect(summary.ranAt).toBeLessThanOrEqual(after + 100);
  });

  it('all-zero inputs produce all-zero summary (except ranAt)', () => {
    const summary = buildPollSummary(0, { branchesDeleted: 0, autoMergeEnabled: 0, threadsResolved: 0 }, 0);
    expect(summary.rebased).toBe(0);
    expect(summary.branchesDeleted).toBe(0);
    expect(summary.autoMergeEnabled).toBe(0);
    expect(summary.threadsResolved).toBe(0);
    expect(summary.errors).toBe(0);
    expect(typeof summary.ranAt).toBe('number');
  });

  it('errors=0 still produces a valid summary', () => {
    const summary = buildPollSummary(1, { branchesDeleted: 1, autoMergeEnabled: 1, threadsResolved: 1 }, 0);
    expect(summary.errors).toBe(0);
    expect(summary.rebased).toBe(1);
  });
});
