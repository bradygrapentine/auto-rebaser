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

    act(() => {
      listener(
        {
          knownRepos: {
            newValue: [
              { fullName: 'x/y', lastSeenAt: 10 },
              { fullName: 'p/q', lastSeenAt: 5 },
            ],
          },
        },
        'local',
      );
    });

    await waitFor(() => {
      expect(result.current).toEqual(['x/y', 'p/q']);
    });
  });
});
