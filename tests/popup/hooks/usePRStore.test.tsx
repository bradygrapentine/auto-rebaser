import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePRStore } from '../../../src/popup/hooks/usePRStore';
import type { PRStore } from '../../../src/core/types';

describe('usePRStore', () => {
  beforeEach(() => {
    // chrome mock resets via setup.ts afterEach, but we set up defaults here
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('returns default empty store on mount', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { result } = renderHook(() => usePRStore());
    await act(async () => {});
    expect(result.current.prs).toEqual([]);
    expect(result.current.lastPollAt).toBeNull();
  });

  it('returns stored data when pr_store exists', async () => {
    const stored: PRStore = {
      prs: [{ id: 1, number: 1, title: 'Test', repo: 'r/r', url: 'http://x', state: 'current', lastUpdated: 0 }],
      lastPollAt: 12345,
    };
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ pr_store: stored });
    const { result } = renderHook(() => usePRStore());
    await act(async () => {});
    expect(result.current.prs).toHaveLength(1);
    expect(result.current.lastPollAt).toBe(12345);
  });

  it('updates state when onChanged fires with new pr_store', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    let listener: ((changes: Record<string, { newValue?: unknown }>) => void) | undefined;
    (chrome.storage.local.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (changes: Record<string, { newValue?: unknown }>) => void) => { listener = fn; }
    );

    const { result } = renderHook(() => usePRStore());
    await act(async () => {});

    const newStore: PRStore = { prs: [], lastPollAt: 99999 };
    await act(async () => {
      listener?.({ pr_store: { newValue: newStore } });
    });

    expect(result.current.lastPollAt).toBe(99999);
  });

  it('falls back to DEFAULT when onChanged fires with undefined newValue', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      pr_store: { prs: [], lastPollAt: 1 } as PRStore,
    });
    let listener: ((changes: Record<string, { newValue?: unknown }>) => void) | undefined;
    (chrome.storage.local.onChanged.addListener as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (changes: Record<string, { newValue?: unknown }>) => void) => { listener = fn; }
    );

    const { result } = renderHook(() => usePRStore());
    await act(async () => {});
    expect(result.current.lastPollAt).toBe(1);

    await act(async () => {
      listener?.({ pr_store: {} });
    });
    expect(result.current.lastPollAt).toBeNull();
    expect(result.current.prs).toEqual([]);
  });

  it('calls removeListener on unmount', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { unmount } = renderHook(() => usePRStore());
    await act(async () => {});
    unmount();
    expect(chrome.storage.local.onChanged.removeListener).toHaveBeenCalled();
  });
});
