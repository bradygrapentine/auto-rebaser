// PREVIEW-1 (T1) — the shared decision/execution seam.
//
// A pure, DOM-free, dependency-free type module. Placement is load-bearing: it
// lives in `src/background/automations/` (NOT `src/core/`) and imports
// `MergeMethod` from `./enable-auto-merge`. `src/core` must not depend on
// `src/background`, so a core placement would force a forbidden core→background
// import for `MergeMethod`.
//
// `decide*` predicates return `PlannedAction[]` (the thing that WOULD happen);
// the `run*`/orchestrator execute path applies them. Preview mode collects them
// and renders them without firing any mutation.

import type { MergeMethod } from './enable-auto-merge';

export type PlannedAction =
  | { kind: 'enable-auto-merge'; prId: number; nodeId: string; repo: string; number: number; method: MergeMethod }
  | { kind: 'direct-merge'; prId: number; owner: string; name: string; number: number; sha: string; method: MergeMethod; repo: string }
  | { kind: 'delete-branch'; prId: number; owner: string; name: string; headRef: string; repo: string; number: number }
  | { kind: 'resolve-thread'; threadId: string; repo: string; prNumber: number };

export type PlannedActionKind = PlannedAction['kind'];

/**
 * Emitted by `decideDeleteMergedBranch` for the `delete_branch_on_merge:true`
 * case: GitHub will auto-delete the branch, so NO `deleteRef` action is planned —
 * but the execute wrapper still pushes `branchDeletedPRs` and increments
 * `skipped`. This marker preserves that bookkeeping WITHOUT over-reporting a
 * planned delete in preview. NOT a PlannedAction (no row in the projection).
 *
 * THIRD case (no variant — intentional): a fork PR (`!sameRepo`) or opt-out-repo
 * PR is dropped by the predicate BEFORE the getRepo gate and yields NO
 * DecideDeleteOutcome at all. The `skipped++` those PRs increment stays in the
 * `run*` wrapper, not the predicate.
 */
export type DecideDeleteOutcome =
  | { kind: 'delete-branch'; action: Extract<PlannedAction, { kind: 'delete-branch' }> }
  | { kind: 'already-handled'; prId: number };

/** Which kinds the popup labels DESTRUCTIVE (irreversible) so a cautious user sees the risk. */
export const DESTRUCTIVE_KINDS = ['direct-merge', 'delete-branch'] as const;

/** What the popup shows in preview mode. One row per PlannedAction, grouped by kind. */
export interface PreviewProjection {
  /**
   * The previewable actions. In `mode:'preview'` this NEVER contains a
   * `direct-merge` action — direct-merge eligibility (clean-status) is only
   * knowable by firing the enable-auto-merge mutation, which preview is
   * forbidden to do. It may contain `enable-auto-merge` / `delete-branch` /
   * `resolve-thread` actions.
   */
  actions: PlannedAction[];
  /** Per-automation count for the summary header; 0 when its toggle is off. */
  counts: Record<PlannedActionKind, number>;
  /**
   * Direct-merge honesty marker. `false` whenever `mergeCleanPRsImmediately` is
   * on but preview could not determine clean-status (always the case in
   * `mode:'preview'`). When `false`, the popup renders a "cannot be previewed
   * without contacting GitHub" notice instead of direct-merge rows.
   */
  directMergePreviewable: boolean;
  /**
   * The PR ids that ENTER the auto-merge-enable set this cycle. A deliberate
   * SUPERSET of the PRs that would actually direct-merge (the true set is this
   * narrowed by cleanIds / mergeCleanSkipSet / headSha / owner-split, all
   * unknowable read-only). Popup copy must say "up to N candidate(s)", never
   * "N will direct-merge". Empty when `mergeCleanPRsImmediately` is off.
   */
  directMergeCandidatePRIds: number[];
  generatedAt: number;
}
