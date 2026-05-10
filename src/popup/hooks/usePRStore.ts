import { useState, useEffect } from 'react';
import type { PRStore } from '../../core/types';
import { loadStore } from '../../core/pr-store';
import { STORAGE_KEYS_V2 } from '../../core/storage/multi-account';

const DEFAULT: PRStore = { prs: [], lastPollAt: null };

export function usePRStore(): PRStore {
  const [store, setStore] = useState<PRStore>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadStore().then((val) => {
        if (!cancelled) setStore(val);
      });
    };
    refresh();

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      // v1 shape — direct pr_store key updates (pre-migration / tests).
      if ('pr_store' in changes) {
        setStore((changes['pr_store']?.newValue as PRStore) ?? DEFAULT);
        return;
      }
      // v2 shape — pr_store nested under accounts.<id>. Re-read via loadStore
      // which resolves the active account.
      if (STORAGE_KEYS_V2.accounts in changes || STORAGE_KEYS_V2.activeAccountId in changes) {
        refresh();
      }
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.local.onChanged.removeListener(listener);
    };
  }, []);

  return store;
}
