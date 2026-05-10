import { useState, useEffect } from 'react';
import type { PRStore } from '../../core/types';
import { loadReviewerStore } from '../../core/pr-store';
import { STORAGE_KEYS_V2 } from '../../core/storage/multi-account';

const DEFAULT: PRStore = { prs: [], lastPollAt: null };

export function useReviewerPRStore(): PRStore {
  const [store, setStore] = useState<PRStore>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void loadReviewerStore().then((val) => {
        if (!cancelled) setStore(val);
      });
    };
    refresh();

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if ('reviewerPRs' in changes) {
        setStore((changes['reviewerPRs']?.newValue as PRStore) ?? DEFAULT);
        return;
      }
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
