import { useEffect, useState, useCallback } from 'react';
import type { ActivityEntry } from '../../core/activity-log-types';
import { ACTIVITY_STORAGE_KEY } from '../../core/activity-log-types';
import { loadActivity, clearActivity } from '../../core/activity-log';
import { STORAGE_KEYS_V2 } from '../../core/storage/multi-account';

interface UseActivityLog {
  entries: ActivityEntry[];
  loading: boolean;
  clear: () => Promise<void>;
}

export function useActivityLog(): UseActivityLog {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadActivity().then((rows) => {
      if (!cancelled) {
        setEntries(rows);
        setLoading(false);
      }
    });

    const refresh = () => {
      void loadActivity().then((rows) => {
        if (!cancelled) setEntries(rows);
      });
    };

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (ACTIVITY_STORAGE_KEY in changes) {
        const next = changes[ACTIVITY_STORAGE_KEY]?.newValue as
          | { entries: ActivityEntry[] }
          | undefined;
        setEntries(next?.entries ?? []);
        return;
      }
      // v2 shape — activity nested under accounts.<id>.
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

  const clear = useCallback(async () => {
    await clearActivity();
    setEntries([]);
  }, []);

  return { entries, loading, clear };
}
