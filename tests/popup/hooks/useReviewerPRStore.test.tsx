import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReviewerPRStore } from '../../../src/popup/hooks/useReviewerPRStore';
import type { PRStore } from '../../../src/core/types';

describe('useReviewerPRStore', () => {
  beforeEach(() => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('returns default empty store on mount', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { result } = renderHook(() => useReviewerPRStore());
    await act(async () => {});
    expect(result.current.prs).toEqual([]);
    expect(result.current.lastPollAt).toBeNull();
  });

  it('returns stored data when reviewerPRs exists', async () => {
    const stored: PRStore = {
      prs: [{ id: 1, number: 1, title: 'Test', repo: 'r/r', url: 'http://x', state: 'current', lastUpdated: 0 }],
      lastPollAt: 12345,
    };
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ reviewerPRs: stored });
    const { result } = renderHook(() => useReviewerPRStore());
    await act(async () => {});
    expect(result.current.prs).toHaveLength(1);
    expect(result.current.lastPollAt).toBe(12345);
  });

  it('updates state when onChanged fires with new reviewerPRs', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    let listener: ((changes: Record<string, { newValue?: unknown }>) => void) | undefined;
    (chrome.storage.local.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (changes: Record<string, { newValue?: unknown }>) => void) => { listener = fn; }
    );

    const { result } = renderHook(() => useReviewerPRStore());
    await act(async () => {});

    const next: PRStore = { prs: [], lastPollAt: 99999 };
    await act(async () => {
      listener?.({ reviewerPRs: { newValue: next } });
    });

    expect(result.current.lastPollAt).toBe(99999);
  });

  it('calls removeListener on unmount', async () => {
    const { unmount } = renderHook(() => useReviewerPRStore());
    await act(async () => {});
    unmount();
    expect(chrome.storage.local.onChanged.removeListener).toHaveBeenCalled();
  });
});
