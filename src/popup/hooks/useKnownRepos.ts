import { useEffect, useState } from 'react';
import {
  KNOWN_REPOS_KEY,
  type KnownRepo,
  getKnownRepos,
} from '../../core/known-repos-store';
import { STORAGE_KEYS_V2 } from '../../core/storage/multi-account';

export function useKnownRepos(): string[] {
  const [repos, setRepos] = useState<KnownRepo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getKnownRepos().then((r) => {
        if (cancelled) return;
        setRepos(r);
        if (r.length === 0) {
          chrome.runtime.sendMessage({ type: 'POLL_NOW' })?.catch(() => {
            // best-effort
          });
        }
      });
    };
    refresh();

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return;
      // Per-account writes land inside the accounts container; refetch on any
      // accounts/active change. Legacy global writes still touch the flat key.
      if (
        KNOWN_REPOS_KEY in changes ||
        STORAGE_KEYS_V2.accounts in changes ||
        STORAGE_KEYS_V2.activeAccountId in changes
      ) {
        refresh();
      }
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return repos
    .slice()
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .map((r) => r.fullName);
}
