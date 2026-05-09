import { useEffect, useState } from 'react';
import {
  KNOWN_REPOS_KEY,
  type KnownRepo,
  getKnownRepos,
} from '../../core/known-repos-store';

export function useKnownRepos(): string[] {
  const [repos, setRepos] = useState<KnownRepo[]>([]);

  useEffect(() => {
    let cancelled = false;
    getKnownRepos().then((r) => {
      if (cancelled) return;
      setRepos(r);
      if (r.length === 0) {
        chrome.runtime.sendMessage({ type: 'POLL_NOW' })?.catch(() => {
          // best-effort
        });
      }
    });

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local' || !(KNOWN_REPOS_KEY in changes)) return;
      const next = changes[KNOWN_REPOS_KEY].newValue as KnownRepo[] | undefined;
      setRepos(Array.isArray(next) ? next : []);
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
