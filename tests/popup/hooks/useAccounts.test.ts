import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAccounts } from '../../../src/popup/hooks/useAccounts';
import { STORAGE_KEYS_V2 } from '../../../src/core/storage/multi-account';

function makeStorage() {
  const data: Record<string, unknown> = {};
  const listeners = new Set<(changes: Record<string, { newValue?: unknown }>) => void>();
  return {
    data,
    listeners,
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys == null) return { ...data };
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (k in data) out[k] = data[k];
      return out;
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      const changes: Record<string, { newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { newValue: v };
        data[k] = v;
      }
      listeners.forEach((l) => l(changes));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      const changes: Record<string, { newValue?: unknown }> = {};
      for (const k of arr) {
        changes[k] = { newValue: undefined };
        delete data[k];
      }
      listeners.forEach((l) => l(changes));
    }),
  };
}

let local: ReturnType<typeof makeStorage>;

beforeEach(() => {
  local = makeStorage();
  chrome.storage.local.get = local.get as unknown as typeof chrome.storage.local.get;
  chrome.storage.local.set = local.set as unknown as typeof chrome.storage.local.set;
  chrome.storage.local.remove = local.remove as unknown as typeof chrome.storage.local.remove;
  chrome.storage.local.onChanged = {
    addListener: vi.fn((l: (changes: Record<string, { newValue?: unknown }>) => void) => {
      local.listeners.add(l);
    }),
    removeListener: vi.fn((l: (changes: Record<string, { newValue?: unknown }>) => void) => {
      local.listeners.delete(l);
    }),
  } as unknown as typeof chrome.storage.local.onChanged;
  chrome.storage.sync.get = vi.fn().mockResolvedValue({});
  chrome.storage.sync.set = vi.fn().mockResolvedValue(undefined);
  chrome.storage.sync.remove = vi.fn().mockResolvedValue(undefined);
});

describe('useAccounts', () => {
  it('returns empty list on fresh install', async () => {
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toEqual([]);
    expect(result.current.activeId).toBeNull();
  });

  it('lists signed-in accounts in insertion order', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_octocat: { auth: { method: 'pat', token: 'a' } },
      gh_acme: { auth: { method: 'pat', token: 'b' } },
    };
    local.data[STORAGE_KEYS_V2.activeAccountId] = 'gh_octocat';
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts.map((a) => a.id)).toEqual(['gh_octocat', 'gh_acme']);
    expect(result.current.activeId).toBe('gh_octocat');
  });

  it('switchTo writes active_account_id and re-renders', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_a: { auth: { method: 'pat', token: 'a' } },
      gh_b: { auth: { method: 'pat', token: 'b' } },
    };
    local.data[STORAGE_KEYS_V2.activeAccountId] = 'gh_a';
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.switchTo('gh_b');
    });
    expect(result.current.activeId).toBe('gh_b');
  });

  it('signOut removes the account namespace', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_a: { auth: { method: 'pat', token: 'a' } },
      gh_b: { auth: { method: 'pat', token: 'b' } },
    };
    local.data[STORAGE_KEYS_V2.activeAccountId] = 'gh_a';
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut('gh_b');
    });
    await waitFor(() => expect(result.current.accounts.map((a) => a.id)).toEqual(['gh_a']));
  });

  it('signOut on the active account flips active to first remaining', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_a: { auth: { method: 'pat', token: 'a' } },
      gh_b: { auth: { method: 'pat', token: 'b' } },
    };
    local.data[STORAGE_KEYS_V2.activeAccountId] = 'gh_a';
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut('gh_a');
    });
    await waitFor(() => expect(result.current.activeId).toBe('gh_b'));
  });

  it('signOutAll clears every account', async () => {
    local.data[STORAGE_KEYS_V2.accounts] = {
      gh_a: { auth: { method: 'pat', token: 'a' } },
      gh_b: { auth: { method: 'pat', token: 'b' } },
    };
    local.data[STORAGE_KEYS_V2.activeAccountId] = 'gh_a';
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOutAll();
    });
    await waitFor(() => {
      expect(result.current.accounts).toEqual([]);
      expect(result.current.activeId).toBeNull();
    });
  });

  it('storage onChanged for accounts triggers re-read', async () => {
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toEqual([]);
    await act(async () => {
      await chrome.storage.local.set({
        [STORAGE_KEYS_V2.accounts]: { gh_late: { auth: { method: 'pat', token: 'p' } } },
      });
    });
    await waitFor(() =>
      expect(result.current.accounts.map((a) => a.id)).toEqual(['gh_late']),
    );
  });
});
