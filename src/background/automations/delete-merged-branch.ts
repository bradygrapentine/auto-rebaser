// Story 2.6 — auto-delete merged-PR branches when the repo doesn't already.
//
// Pure logic with dependency injection. The wiring layer (Wave 4) supplies the
// real PR store, settings, and GitHub client. Local types deliberately do NOT
// import from v1's core/types — folded together at merge.

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
      const repoMeta = await deps.getRepo(owner, name);
      if (repoMeta?.delete_branch_on_merge) {
        // GitHub already deleted (or will). Treat as terminal success.
        result.skipped++;
        result.branchDeletedPRs.push(pr.id);
        continue;
      }

      const outcome = await deps.deleteRef(owner, name, pr.headRef);
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
