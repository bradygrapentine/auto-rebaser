// Story 2.6 — auto-delete merged-PR branches when the repo doesn't already.
//
// Pure logic with dependency injection. The wiring layer (Wave 4) supplies the
// real PR store, settings, and GitHub client. Local types deliberately do NOT
// import from v1's core/types — folded together at merge.

import type { DecideDeleteOutcome } from './planned-action';

export interface DeleteMergedBranchSettings {
  enabled: boolean;
  /** "owner/repo" repos that should NOT have branches auto-deleted. */
  optOutRepos: string[];
}

/** Minimal shape needed from a freshly-merged authored PR. */
export interface MergedPRInput {
  id: number;
  number: number;
  /** "owner/repo" */
  repo: string;
  headRef: string;
  /** False when the head branch lives in a fork. */
  sameRepo: boolean;
}

export interface DeleteMergedBranchDeps {
  getRepo(
    owner: string,
    repo: string
  ): Promise<{ delete_branch_on_merge: boolean } | null>;
  deleteRef(
    owner: string,
    repo: string,
    branch: string
  ): Promise<'deleted' | 'already-gone'>;
}

export interface DeleteMergedBranchResult {
  deleted: number;
  skipped: number;
  failed: Array<{ prId: number; error: string }>;
  /** PR ids whose branch is now gone — caller persists `branchDeleted: true`. */
  branchDeletedPRs: number[];
}

/**
 * PREVIEW-1 — the per-PR delete decision GIVEN the repo's auto-delete setting.
 * Does the async `getRepo` read (may throw — callers wrap per-PR). The SINGLE
 * shared predicate behind both `decideDeleteMergedBranch` (preview) and the
 * `runDeleteMergedBranch` apply loop (execute). Assumes the fork/opt-out gate
 * already passed (those PRs are dropped before this call by both callers).
 */
async function decideDeleteOne(
  pr: MergedPRInput,
  owner: string,
  name: string,
  getRepo: DeleteMergedBranchDeps['getRepo'],
): Promise<DecideDeleteOutcome> {
  const repoMeta = await getRepo(owner, name);
  if (repoMeta?.delete_branch_on_merge) {
    // GitHub already deletes (or will) — terminal, no deleteRef planned.
    return { kind: 'already-handled', prId: pr.id };
  }
  return {
    kind: 'delete-branch',
    action: { kind: 'delete-branch', prId: pr.id, owner, name, headRef: pr.headRef, repo: pr.repo, number: pr.number },
  };
}

/**
 * PREVIEW-1 — read-only (`getRepo` only): the delete outcomes the execute path
 * WOULD produce. Fork/opt-out PRs yield no outcome (their `skipped++` lives in the
 * run wrapper). A getRepo failure means preview cannot determine the outcome → that
 * PR is silently omitted (execute records it as `failed`).
 */
export async function decideDeleteMergedBranch(
  prs: MergedPRInput[],
  settings: DeleteMergedBranchSettings,
  deps: Pick<DeleteMergedBranchDeps, 'getRepo'>,
): Promise<DecideDeleteOutcome[]> {
  if (!settings.enabled) return [];
  const optOut = new Set(settings.optOutRepos);
  const outcomes: DecideDeleteOutcome[] = [];
  for (const pr of prs) {
    if (!pr.sameRepo || optOut.has(pr.repo)) continue;
    const [owner, name] = pr.repo.split('/');
    try {
      outcomes.push(await decideDeleteOne(pr, owner, name, deps.getRepo));
    } catch {
      // preview: undeterminable → omit (execute would surface this as failed)
    }
  }
  return outcomes;
}

export async function runDeleteMergedBranch(
  prs: MergedPRInput[],
  settings: DeleteMergedBranchSettings,
  deps: DeleteMergedBranchDeps
): Promise<DeleteMergedBranchResult> {
  const result: DeleteMergedBranchResult = {
    deleted: 0,
    skipped: 0,
    failed: [],
    branchDeletedPRs: [],
  };

  if (!settings.enabled) {
    result.skipped = prs.length;
    return result;
  }

  const optOut = new Set(settings.optOutRepos);

  for (const pr of prs) {
    if (!pr.sameRepo || optOut.has(pr.repo)) {
      result.skipped++;
      continue;
    }

    const [owner, name] = pr.repo.split('/');
    try {
      // Decision (shared with preview's decideDeleteMergedBranch); apply below.
      const decision = await decideDeleteOne(pr, owner, name, deps.getRepo);
      if (decision.kind === 'already-handled') {
        // GitHub already deleted (or will). Terminal: skip the deleteRef, but
        // both bookkeeping effects (skipped++ AND branchDeletedPRs) still fire.
        result.skipped++;
        result.branchDeletedPRs.push(pr.id);
        continue;
      }

      const outcome = await deps.deleteRef(owner, name, decision.action.headRef);
      if (outcome === 'deleted' || outcome === 'already-gone') {
        result.deleted++;
        result.branchDeletedPRs.push(pr.id);
      }
    } catch (err) {
      result.failed.push({
        prId: pr.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
