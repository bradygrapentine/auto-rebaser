/**
 * Pure converter functions from v1 PRRecord + GitHub PullRequest API response
 * into the input shapes the four automation modules expect.
 *
 * NOTE: v1's PullRequest type (src/core/types.ts) does NOT include `head`,
 * `node_id`, `draft`, or `auto_merge` fields. Those are present in the real
 * GitHub REST response but not typed. We access them via type-cast on an
 * extended interface. When Task A3 wires the poll cycle, it should extend
 * PullRequest (or use a new PullRequestDetail type) to carry these fields.
 * Until then, adapters access them via `PullRequestDetail` which extends the
 * base type.
 *
 * sameRepo: derived from detail.base.repo.full_name vs detail.head?.repo?.full_name.
 * If detail.head is absent (type gap), sameRepo is set to `undefined`.
 */

import type { PRRecord } from '../../core/types';
import type { PullRequest } from '../../core/types';
import type { MergedPRInput } from './delete-merged-branch';
import type { EligiblePR } from './enable-auto-merge';
import type { PRRef } from './resolve-obsolete-threads';
import type { PRStateMap } from './dismiss-stale-notifs';

/**
 * Extended PullRequest shape that carries the extra fields the GitHub REST API
 * returns but v1 didn't type. Adapters accept this extended shape.
 */
export interface PullRequestDetail extends PullRequest {
  /** GraphQL node_id — needed for GraphQL mutations. */
  node_id?: string;
  draft?: boolean;
  auto_merge?: { enabled?: boolean } | null;
  head?: {
    ref?: string;
    repo?: {
      full_name?: string;
    } | null;
  };
}

/**
 * Convert a PRRecord + its GitHub detail into the shape `runDeleteMergedBranch` expects.
 *
 * sameRepo: if detail.head.repo.full_name is present, compare to base repo.
 * If absent (v1 type gap), sameRepo is `undefined` — callers should treat
 * undefined as unknown/skip (conservative).
 */
export function toMergedPRInput(pr: PRRecord, detail: PullRequestDetail): MergedPRInput {
  const baseRepo = detail.base?.repo?.full_name ?? pr.repo;
  const headRepoName = detail.head?.repo?.full_name;
  const sameRepo = headRepoName !== undefined ? headRepoName === baseRepo : false;

  return {
    id: pr.id,
    number: pr.number,
    repo: pr.repo,
    headRef: detail.head?.ref ?? '',
    sameRepo,
  };
}

/**
 * Convert a PRRecord + its GitHub detail into the shape `runEnableAutoMerge` expects.
 *
 * nodeId: from detail.node_id (may be undefined if v1 type gap).
 * autoMergeEnabled: from detail.auto_merge presence.
 * unsupported: derived from PRRecord's phase-two state (cast).
 */
export function toEligiblePR(pr: PRRecord, detail: PullRequestDetail): EligiblePR {
  const extended = pr as PRRecord & { autoMergeUnsupported?: boolean; autoMergeEnabled?: boolean };
  return {
    id: pr.id,
    nodeId: detail.node_id ?? '',
    repo: pr.repo,
    isDraft: detail.draft ?? false,
    mergeableState: detail.mergeable_state,
    autoMergeEnabled: detail.auto_merge != null ? true : (extended.autoMergeEnabled ?? false),
    unsupported: extended.autoMergeUnsupported ?? false,
  };
}

/**
 * Convert a PRRecord into the minimal PRRef shape `runResolveObsoleteThreads` expects.
 */
export function toPRRef(pr: PRRecord): PRRef {
  return {
    repo: pr.repo,
    number: pr.number,
  };
}

/**
 * Build the PRStateMap used by `runDismissStaleNotifs`.
 * Key format: "owner/repo#number" → state mapped to 'open' | 'closed' | 'merged'.
 *
 * Mapping:
 *   'merged' → 'merged' (poll-cycle stamps this when a PR disappears merged)
 *   'closed' → 'closed' (poll-cycle stamps this when a PR disappears non-merged)
 *   'branch-deleted' / 'delete-failed' → 'merged' (Story 2.6 already ran)
 *   anything else → 'open'
 */
export function toPRStateMap(prs: PRRecord[]): PRStateMap {
  const map: PRStateMap = {};
  for (const pr of prs) {
    const key = `${pr.repo}#${pr.number}`;
    const s = pr.state as string;
    let mapped: 'open' | 'closed' | 'merged';
    if (s === 'merged' || s === 'branch-deleted' || s === 'delete-failed') {
      mapped = 'merged';
    } else if (s === 'closed') {
      mapped = 'closed';
    } else {
      mapped = 'open';
    }
    map[key] = mapped;
  }
  return map;
}
