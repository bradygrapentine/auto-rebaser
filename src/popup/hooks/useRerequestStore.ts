import { useEffect, useState } from 'react';
import {
  getRerequestStore,
  hoursSinceLastRerequest,
  isThrottled,
  RE_REQUEST_THROTTLE_KEY,
  type RerequestStore,
} from '../../core/rerequest-throttle';
import { STORAGE_KEYS_V2 } from '../../core/storage/multi-account';

interface UseRerequestStoreResult {
  store: RerequestStore;
  isThrottled: (prId: number) => boolean;
  hoursSince: (prId: number) => number | null;
}

export function useRerequestStore(): UseRerequestStoreResult {
  const [store, setStore] = useState<RerequestStore>({});

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getRerequestStore().then((s) => {
        if (!cancelled) setStore(s);
      }).catch(() => {});
    };
    refresh();
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (area !== 'local') return;
      const change = changes[RE_REQUEST_THROTTLE_KEY];
      if (change) {
        setStore((change.newValue as RerequestStore) ?? {});
        return;
      }
      if (STORAGE_KEYS_V2.accounts in changes || STORAGE_KEYS_V2.activeAccountId in changes) {
        refresh();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  return {
    store,
    isThrottled: (prId) => isThrottled(store, prId),
    hoursSince: (prId) => hoursSinceLastRerequest(store, prId),
  };
}
