import { useEffect, useState } from 'react';
import {
  getPingedStore,
  hoursSinceLastPing,
  isThrottled,
  PING_THROTTLE_KEY,
  type PingedStore,
} from '../../core/ping-throttle';
import { STORAGE_KEYS_V2 } from '../../core/storage/multi-account';

interface UsePingedStoreResult {
  /** Latest snapshot of the throttle store. */
  store: PingedStore;
  /** True iff the PR is within the 24h throttle window. */
  isThrottled: (prId: number) => boolean;
  /** Hours since last ping for the PR, or null if never pinged. */
  hoursSince: (prId: number) => number | null;
}

export function usePingedStore(): UsePingedStoreResult {
  const [store, setStore] = useState<PingedStore>({});

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      getPingedStore().then((s) => {
        if (!cancelled) setStore(s);
      }).catch(() => {});
    };
    refresh();
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (area !== 'local') return;
      // v1 shape — top-level pingedPRs key.
      const change = changes[PING_THROTTLE_KEY];
      if (change) {
        setStore((change.newValue as PingedStore) ?? {});
        return;
      }
      // v2 shape — pingedPRs nested under accounts.<id>.
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
    hoursSince: (prId) => hoursSinceLastPing(store, prId),
  };
}
