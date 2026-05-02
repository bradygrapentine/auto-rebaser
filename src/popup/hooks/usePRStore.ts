import { useState, useEffect } from 'react';
import type { PRStore } from '../../core/types';

const DEFAULT: PRStore = { prs: [], lastPollAt: null };

export function usePRStore(): PRStore {
  const [store, setStore] = useState<PRStore>(DEFAULT);

  useEffect(() => {
    chrome.storage.local.get('pr_store').then((result) => {
      const val = result['pr_store'] as PRStore | undefined;
      setStore(val ?? DEFAULT);
    });

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if ('pr_store' in changes) {
        setStore((changes['pr_store']?.newValue as PRStore) ?? DEFAULT);
      }
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => {
      chrome.storage.local.onChanged.removeListener(listener);
    };
  }, []);

  return store;
}
