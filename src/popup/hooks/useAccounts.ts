// Wave B1 — Popup-side multi-account state hook.
//
// Wraps the multi-account facade for components: returns the current
// account list + active id, exposes switch / sign-out / sign-out-all
// imperatives. Subscribes to storage.onChanged so the popup re-reads
// when the SW poll cycle adds an account or migration writes one.

import { useCallback, useEffect, useState } from 'react';
import {
  getActiveAccountId,
  setActiveAccountId,
  removeAccount,
  STORAGE_KEYS_V2,
} from '../../core/storage/multi-account';
import {
  getAccountSummaries,
  type AccountSummary,
} from '../../core/storage/account-summary';

export interface UseAccountsResult {
  accounts: AccountSummary[];
  activeId: string | null;
  loading: boolean;
  switchTo: (id: string) => Promise<void>;
  signOut: (id: string) => Promise<void>;
  signOutAll: () => Promise<void>;
}

export function useAccounts(): UseAccountsResult {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [list, id] = await Promise.all([getAccountSummaries(), getActiveAccountId()]);
    setAccounts(list);
    setActiveIdState(id);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh().catch(() => {
      if (!cancelled) setLoading(false);
    });

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (
        STORAGE_KEYS_V2.accounts in changes ||
        STORAGE_KEYS_V2.activeAccountId in changes
      ) {
        void refresh();
      }
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.local.onChanged.removeListener(listener);
    };
  }, [refresh]);

  const switchTo = useCallback(
    async (id: string) => {
      await setActiveAccountId(id);
      // refresh is also triggered by onChanged, but call it directly so
      // tests don't depend on the listener firing.
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(
    async (id: string) => {
      await removeAccount(id);
      await refresh();
    },
    [refresh],
  );

  const signOutAll = useCallback(async () => {
    const list = await getAccountSummaries();
    for (const a of list) await removeAccount(a.id);
    await refresh();
  }, [refresh]);

  return { accounts, activeId, loading, switchTo, signOut, signOutAll };
}
