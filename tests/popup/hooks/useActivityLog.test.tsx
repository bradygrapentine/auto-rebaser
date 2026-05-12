import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useActivityLog } from '../../../src/popup/hooks/useActivityLog';
import type { ActivityEntry } from '../../../src/core/activity-log-types';

const e = (over: Partial<ActivityEntry>): ActivityEntry => ({
  at: 1,
  action: 'rebase',
  repo: 'a/b',
  prNumber: 1,
  prTitle: 't',
  result: 'success',
  ...over,
});

describe('useActivityLog', () => {
  beforeEach(() => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({});
  });

  it('starts loading and resolves to empty when storage has no entries', async () => {
    const { result } = renderHook(() => useActivityLog());
    expect(result.current.loading).toBe(true);
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.entries).toEqual([]);
  });

  it('returns stored entries on mount', async () => {
    const entries = [e({ prNumber: 1 }), e({ prNumber: 2 })];
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      activity: { entries },
    });
    const { result } = renderHook(() => useActivityLog());
    await act(async () => {});
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[1].prNumber).toBe(2);
  });

  it('updates state when onChanged fires with new activity entries', async () => {
    let listener: ((changes: Record<string, { newValue?: unknown }>) => void) | undefined;
    (chrome.storage.local.onChanged.addListener as ReturnType<typeof Object>).mockImplementation(
      (fn: typeof listener) => {
        listener = fn;
      },
    );
    const { result } = renderHook(() => useActivityLog());
    await act(async () => {});
    const fresh = [e({ prNumber: 99 })];
    await act(async () => {
      listener?.({ activity: { newValue: { entries: fresh } } });
    });
    expect(result.current.entries[0].prNumber).toBe(99);
  });

  it('falls back to empty when onChanged fires with undefined newValue', async () => {
    let listener: ((changes: Record<string, { newValue?: unknown }>) => void) | undefined;
    (chrome.storage.local.onChanged.addListener as ReturnType<typeof Object>).mockImplementation(
      (fn: typeof listener) => {
        listener = fn;
      },
    );
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      activity: { entries: [e({})] },
    });
    const { result } = renderHook(() => useActivityLog());
    await act(async () => {});
    expect(result.current.entries).toHaveLength(1);
    await act(async () => {
      listener?.({ activity: {} });
    });
    expect(result.current.entries).toEqual([]);
  });

  it('clear() empties state and calls storage.set', async () => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      activity: { entries: [e({})] },
    });
    (chrome.storage.local.set as ReturnType<typeof Object>).mockResolvedValue(undefined);
    const { result } = renderHook(() => useActivityLog());
    await act(async () => {});
    expect(result.current.entries).toHaveLength(1);
    await act(async () => {
      await result.current.clear();
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ activity: { entries: [] } });
    expect(result.current.entries).toEqual([]);
  });

  it('removes the listener on unmount', async () => {
    const { unmount } = renderHook(() => useActivityLog());
    await act(async () => {});
    unmount();
    expect(chrome.storage.local.onChanged.removeListener).toHaveBeenCalled();
  });

  it('scope="all" merges entries from every account namespace', async () => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockImplementation(async (key: unknown) => {
      if (key === 'accounts') {
        return {
          accounts: {
            gh_octocat: { activity: { entries: [e({ prNumber: 1, accountId: 'gh_octocat' })] } },
            gh_acme:    { activity: { entries: [e({ prNumber: 2, accountId: 'gh_acme' })] } },
          },
        };
      }
      return {};
    });
    const { result } = renderHook(() => useActivityLog({ scope: 'all' }));
    await act(async () => {});
    expect(result.current.entries).toHaveLength(2);
    const prNumbers = result.current.entries.map((row) => row.prNumber).sort();
    expect(prNumbers).toEqual([1, 2]);
  });

  it('refresh() runs when v2 accounts key changes', async () => {
    let listener: ((changes: Record<string, { newValue?: unknown }>) => void) | undefined;
    (chrome.storage.local.onChanged.addListener as ReturnType<typeof Object>).mockImplementation(
      (fn: typeof listener) => {
        listener = fn;
      },
    );
    let entries: ActivityEntry[] = [];
    (chrome.storage.local.get as ReturnType<typeof Object>).mockImplementation(async () => ({
      activity: { entries },
    }));
    const { result } = renderHook(() => useActivityLog());
    await act(async () => {});
    expect(result.current.entries).toEqual([]);
    entries = [e({ prNumber: 7 })];
    await act(async () => {
      listener?.({ accounts: { newValue: {} } });
    });
    expect(result.current.entries[0].prNumber).toBe(7);
  });

  it('ignores changes for unrelated keys', async () => {
    let listener: ((changes: Record<string, { newValue?: unknown }>) => void) | undefined;
    (chrome.storage.local.onChanged.addListener as ReturnType<typeof Object>).mockImplementation(
      (fn: typeof listener) => {
        listener = fn;
      },
    );
    const { result } = renderHook(() => useActivityLog());
    await act(async () => {});
    await act(async () => {
      listener?.({ pr_store: { newValue: {} } });
    });
    expect(result.current.entries).toEqual([]);
  });
});
