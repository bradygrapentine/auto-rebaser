import type { PRRecord } from '../../core/types';
import type { PRRecordPhaseTwo } from '../../core/automations-types';
import { usePRStore } from './usePRStore';

/**
 * CT-3c — distinct label names seen across the current account's PR store, for
 * the `<datalist>` autocomplete on the include/exclude label filters. Mirrors
 * `useKnownRepos` (repo suggestions), but sources from the local PR store rather
 * than a dedicated known-store: CT-3 persists name-only `labels` onto each PR
 * record (`PRRecordPhaseTwo.labels`), so no new endpoint/permission is needed.
 *
 * Labels live on `PRRecordPhaseTwo`, not the base `PRRecord` that `usePRStore`
 * types its array as — widen with the codebase's standard
 * `pr as PRRecord & PRRecordPhaseTwo` idiom to reach `.labels`.
 *
 * Trim + dedupe case-insensitively (first-seen casing wins), sorted A–Z.
 */
export function useKnownLabels(): string[] {
  const store = usePRStore();
  const seen = new Map<string, string>(); // lowercased key → first-seen casing
  for (const pr of store.prs) {
    const labels = (pr as PRRecord & PRRecordPhaseTwo).labels;
    if (!labels) continue;
    for (const { name } of labels) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
