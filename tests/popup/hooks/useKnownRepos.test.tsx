import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useKnownRepos } from '../../../src/popup/hooks/useKnownRepos';

vi.mock('../../../src/core/known-repos-store', () => ({
  KNOWN_REPOS_KEY: 'knownRepos',
  getKnownRepos: vi.fn(),
}));

import { getKnownRepos } from '../../../src/core/known-repos-store';

describe('useKnownRepos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns repos sorted by lastSeenAt descending', async () => {
    (getKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fullName: 'a/b', lastSeenAt: 1 },
      { fullName: 'c/d', lastSeenAt: 2 },
    ]);

    const { result } = renderHook(() => useKnownRepos());

    await waitFor(() => {
      expect(result.current).toEqual(['c/d', 'a/b']);
    });
  });

  it('returns [] when storage is empty', async () => {
    (getKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { result } = renderHook(() => useKnownRepos());

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });
  });

  it('sends POLL_NOW message when cache is empty', async () => {
    (getKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderHook(() => useKnownRepos());

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
    });
  });

  it('does NOT send POLL_NOW when cache is non-empty', async () => {
    (getKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fullName: 'a/b', lastSeenAt: 1 },
    ]);

    renderHook(() => useKnownRepos());

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });

  // PERF-1: the poll cycle's own stampPollTime writes the accounts container,
  // which fires onChanged → refresh → still-empty → POLL_NOW → poll → ... a
  // self-sustaining loop for zero-PR accounts. POLL_NOW must fire at most once
  // per mount; later self-induced storage writes refresh the list but never
  // re-trigger a poll.
  it('sends POLL_NOW at most once per mount even when onChanged re-fires on still-empty repos', async () => {
    (getKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderHook(() => useKnownRepos());

    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);

    // Simulate the poll cycle's own storage write re-triggering the listener
    // while repos are still empty (the loop condition).
    const addListenerMock = chrome.storage.onChanged
      .addListener as ReturnType<typeof vi.fn>;
    const listener = addListenerMock.mock.calls[0][0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;

    act(() => {
      listener({ knownRepos: { newValue: [] } }, 'local');
    });

    // The re-triggered refresh must run (getKnownRepos called again)...
    await waitFor(() => {
      expect(getKnownRepos).toHaveBeenCalledTimes(2);
    });
    // ...but POLL_NOW must NOT be sent a second time.
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('updates when chrome.storage.onChanged fires', async () => {
    (getKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { result } = renderHook(() => useKnownRepos());

    await waitFor(() => {
      expect(result.current).toEqual([]);
    });

    // Extract the listener registered with chrome.storage.onChanged.addListener
    const addListenerMock = chrome.storage.onChanged.addListener as ReturnType<typeof vi.fn>;
    const listener = addListenerMock.mock.calls[0][0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;

    // Per-account model: the hook refetches via getKnownRepos when any of
    // (knownRepos / accounts / active_account_id) keys change.
    (getKnownRepos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { fullName: 'x/y', lastSeenAt: 10 },
      { fullName: 'p/q', lastSeenAt: 5 },
    ]);

    act(() => {
      listener({ knownRepos: { newValue: [] } }, 'local');
    });

    await waitFor(() => {
      expect(result.current).toEqual(['x/y', 'p/q']);
    });
  });
});
