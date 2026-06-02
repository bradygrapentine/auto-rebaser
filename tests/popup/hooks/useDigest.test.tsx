// DIGEST-1 — useDigest: thin hook over useActivityLog + computeDigest. Mocks
// useActivityLog so the test exercises the real digest computation at the
// Date.now() boundary.
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActivityEntry } from '../../../src/core/activity-log-types';

const mockUseActivityLog = vi.fn();
vi.mock('../../../src/popup/hooks/useActivityLog', () => ({
  useActivityLog: (opts?: unknown) => mockUseActivityLog(opts),
}));

import { useDigest } from '../../../src/popup/hooks/useDigest';

const recent = (over: Partial<ActivityEntry>): ActivityEntry => ({
  at: Date.now(), action: 'rebase', repo: 'a/b', prNumber: 1, prTitle: 't', result: 'success', ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('useDigest', () => {
  it('reads the account-scoped activity log', () => {
    mockUseActivityLog.mockReturnValue({ entries: [], loading: false });
    renderHook(() => useDigest());
    expect(mockUseActivityLog).toHaveBeenCalledWith({ scope: 'account' });
  });

  it('computes the digest from the activity entries and threads loading through', () => {
    mockUseActivityLog.mockReturnValue({
      entries: [
        recent({ action: 'rebase', result: 'success', prNumber: 1 }),
        recent({ action: 'rebase', result: 'failed', prNumber: 2 }),
        recent({ action: 'branch_deleted', result: 'success', prNumber: 3 }),
      ],
      loading: false,
    });
    const { result } = renderHook(() => useDigest());
    expect(result.current.loading).toBe(false);
    expect(result.current.digest.totalActions).toBe(3);
    expect(result.current.digest.rebaseSuccess).toBe(1);
    expect(result.current.digest.byAction.map((c) => c.action)).toEqual(['rebase', 'branch_deleted']);
  });

  it('returns a zeroed digest for an empty log', () => {
    mockUseActivityLog.mockReturnValue({ entries: [], loading: true });
    const { result } = renderHook(() => useDigest());
    expect(result.current.loading).toBe(true);
    expect(result.current.digest).toMatchObject({ totalActions: 0, byAction: [], rebaseSuccess: 0 });
  });
});
