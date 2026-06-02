import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useKnownLabels } from '../../../src/popup/hooks/useKnownLabels';
import type { PRStore } from '../../../src/core/types';

vi.mock('../../../src/popup/hooks/usePRStore', () => ({
  usePRStore: vi.fn(),
}));

import { usePRStore } from '../../../src/popup/hooks/usePRStore';

function store(prs: unknown[]): PRStore {
  return { prs, lastPollAt: null } as PRStore;
}

describe('useKnownLabels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns distinct trimmed label names sorted A–Z', () => {
    vi.mocked(usePRStore).mockReturnValue(
      store([
        { id: 1, labels: [{ name: 'bug' }, { name: 'p1' }] },
        { id: 2, labels: [{ name: 'docs' }] },
      ]),
    );
    const { result } = renderHook(() => useKnownLabels());
    expect(result.current).toEqual(['bug', 'docs', 'p1']);
  });

  it('dedupes case-insensitively, keeping first-seen casing', () => {
    vi.mocked(usePRStore).mockReturnValue(
      store([
        { id: 1, labels: [{ name: 'Bug' }] },
        { id: 2, labels: [{ name: 'bug' }, { name: 'BUG' }] },
      ]),
    );
    const { result } = renderHook(() => useKnownLabels());
    expect(result.current).toEqual(['Bug']);
  });

  it('omits empty/whitespace names', () => {
    vi.mocked(usePRStore).mockReturnValue(
      store([{ id: 1, labels: [{ name: '  ' }, { name: '' }, { name: 'real' }] }]),
    );
    const { result } = renderHook(() => useKnownLabels());
    expect(result.current).toEqual(['real']);
  });

  it('returns [] for PRs with no labels or an empty store', () => {
    vi.mocked(usePRStore).mockReturnValue(store([{ id: 1 }, { id: 2, labels: [] }]));
    expect(renderHook(() => useKnownLabels()).result.current).toEqual([]);
    vi.mocked(usePRStore).mockReturnValue(store([]));
    expect(renderHook(() => useKnownLabels()).result.current).toEqual([]);
  });
});
