import { useMemo } from 'react';
import type { PRRecord } from '../../core/types';

export interface PRGroup {
  /** "owner/repo". */
  repo: string;
  prs: PRRecord[];
  /** True when at least one PR in the group is in a non-current state. */
  hasAttention: boolean;
}

const ATTENTION_STATES = new Set(['behind', 'updating', 'updated', 'conflict', 'needs-manual', 'error', 'merged', 'closed']);

/**
 * Groups a flat list of PRRecords by repo. Repos are returned alphabetically.
 * Within each group, PRs are sorted by PR number descending (newest first).
 * `hasAttention` is true when at least one PR is in a non-`current` state — it
 * drives whether the group auto-expands on first render.
 */
export function useGroupedPRs(prs: PRRecord[]): PRGroup[] {
  return useMemo(() => {
    const byRepo = new Map<string, PRRecord[]>();
    for (const pr of prs) {
      const list = byRepo.get(pr.repo);
      if (list) list.push(pr);
      else byRepo.set(pr.repo, [pr]);
    }

    const groups: PRGroup[] = [];
    for (const [repo, list] of byRepo) {
      const sorted = [...list].sort((a, b) => b.number - a.number);
      groups.push({
        repo,
        prs: sorted,
        hasAttention: sorted.some((p) => ATTENTION_STATES.has(p.state)),
      });
    }
    groups.sort((a, b) => a.repo.localeCompare(b.repo));
    return groups;
  }, [prs]);
}
