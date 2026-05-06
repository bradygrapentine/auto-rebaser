import { useMemo } from 'react';
import type { PRRecord } from '../../core/types';
import type { PRRecordPhaseTwo } from '../../core/automations-types';

export interface PRGroup {
  /** "owner/repo". */
  repo: string;
  prs: PRRecord[];
  /** True when at least one PR in the group is in a non-current state. */
  hasAttention: boolean;
}

const ATTENTION_STATES = new Set(['behind', 'updating', 'updated', 'conflict', 'needs-manual', 'error', 'merged', 'closed']);

interface Options {
  /** Story 5.1 — when true, a stale PR contributes to `hasAttention`. */
  staleCountsAsAttention?: boolean;
}

/**
 * Groups a flat list of PRRecords by repo. Repos are returned alphabetically.
 * Within each group, PRs are sorted by PR number descending (newest first).
 * `hasAttention` drives whether the group auto-expands on first render.
 */
export function useGroupedPRs(prs: PRRecord[], options: Options = {}): PRGroup[] {
  const { staleCountsAsAttention } = options;
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
      const hasAttention = sorted.some((p) => {
        if (ATTENTION_STATES.has(p.state)) return true;
        if (staleCountsAsAttention) {
          const ext = p as PRRecord & PRRecordPhaseTwo;
          if (ext.staleness) return true;
        }
        return false;
      });
      groups.push({ repo, prs: sorted, hasAttention });
    }
    groups.sort((a, b) => a.repo.localeCompare(b.repo));
    return groups;
  }, [prs, staleCountsAsAttention]);
}
