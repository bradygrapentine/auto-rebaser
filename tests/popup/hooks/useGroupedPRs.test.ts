import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useGroupedPRs } from '../../../src/popup/hooks/useGroupedPRs';
import type { PRRecord, PRState } from '../../../src/core/types';

function pr(overrides: Partial<PRRecord> & { id: number; repo: string; number: number; state: PRState }): PRRecord {
  return {
    title: `PR ${overrides.number}`,
    url: `https://github.com/${overrides.repo}/pull/${overrides.number}`,
    lastUpdated: 0,
    ...overrides,
  };
}

describe('useGroupedPRs', () => {
  it('returns empty array for empty input', () => {
    const { result } = renderHook(() => useGroupedPRs([]));
    expect(result.current).toEqual([]);
  });

  it('groups by repo', () => {
    const { result } = renderHook(() =>
      useGroupedPRs([
        pr({ id: 1, repo: 'a/x', number: 1, state: 'current' }),
        pr({ id: 2, repo: 'a/x', number: 2, state: 'current' }),
        pr({ id: 3, repo: 'b/y', number: 5, state: 'behind' }),
      ]),
    );
    expect(result.current).toHaveLength(2);
    expect(result.current[0].repo).toBe('a/x');
    expect(result.current[0].prs).toHaveLength(2);
    expect(result.current[1].repo).toBe('b/y');
  });

  it('sorts repos alphabetically', () => {
    const { result } = renderHook(() =>
      useGroupedPRs([
        pr({ id: 1, repo: 'zzz/a', number: 1, state: 'current' }),
        pr({ id: 2, repo: 'aaa/z', number: 1, state: 'current' }),
        pr({ id: 3, repo: 'mmm/m', number: 1, state: 'current' }),
      ]),
    );
    expect(result.current.map((g) => g.repo)).toEqual(['aaa/z', 'mmm/m', 'zzz/a']);
  });

  it('sorts PRs within a group by number descending', () => {
    const { result } = renderHook(() =>
      useGroupedPRs([
        pr({ id: 1, repo: 'a/x', number: 5, state: 'current' }),
        pr({ id: 2, repo: 'a/x', number: 100, state: 'current' }),
        pr({ id: 3, repo: 'a/x', number: 50, state: 'current' }),
      ]),
    );
    expect(result.current[0].prs.map((p) => p.number)).toEqual([100, 50, 5]);
  });

  it('marks hasAttention=true when any PR is in a non-current state', () => {
    const { result } = renderHook(() =>
      useGroupedPRs([
        pr({ id: 1, repo: 'a/x', number: 1, state: 'current' }),
        pr({ id: 2, repo: 'a/x', number: 2, state: 'conflict' }),
      ]),
    );
    expect(result.current[0].hasAttention).toBe(true);
  });

  it('marks hasAttention=false when all PRs are current', () => {
    const { result } = renderHook(() =>
      useGroupedPRs([
        pr({ id: 1, repo: 'a/x', number: 1, state: 'current' }),
        pr({ id: 2, repo: 'a/x', number: 2, state: 'current' }),
      ]),
    );
    expect(result.current[0].hasAttention).toBe(false);
  });

  it.each<[PRState, boolean]>([
    ['current', false],
    ['pending', false],
    ['draft', false],
    ['behind', true],
    ['updated', true],
    ['conflict', true],
    ['needs-manual', true],
    ['error', true],
    ['merged', true],
    ['closed', true],
  ])('treats state "%s" as attention=%s', (state, expected) => {
    const { result } = renderHook(() =>
      useGroupedPRs([pr({ id: 1, repo: 'a/x', number: 1, state })]),
    );
    expect(result.current[0].hasAttention).toBe(expected);
  });
});
