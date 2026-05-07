// Story 2.7 — flip auto-merge on for authored PRs that don't have it set.
// Story 5.4 — pick the first user-preferred method that the repo allows.

export type MergeMethod = 'SQUASH' | 'MERGE' | 'REBASE';

export interface RepoAllowedMethods {
  squash: boolean;
  merge: boolean;
  rebase: boolean;
}

export interface EnableAutoMergeSettings {
  enabled: boolean;
  /**
   * Ordered preference list. The first method whose corresponding repo flag
   * is true is used. Empty list = no PR ever gets auto-merge.
   */
  mergeMethodPreference: MergeMethod[];
  /** "owner/repo" repos that should NOT have auto-merge enabled. */
  optOutRepos: string[];
}

/** Minimal shape — the wiring layer derives these from PRRecord + raw API data. */
export interface EligiblePR {
  id: number;
  /** GraphQL node_id */
  nodeId: string;
  repo: string;
  isDraft: boolean;
  mergeableState: string;
  autoMergeEnabled: boolean;
  /** True when the repo has previously rejected the chosen merge method. */
  unsupported: boolean;
  /** Per-repo allowed-merge-method flags from `GET /repos/{owner}/{repo}`. */
  allowedMethods: RepoAllowedMethods;
}

export interface EnableAutoMergeDeps {
  enable(
    prNodeId: string,
    method: MergeMethod
  ): Promise<{ enabled: boolean; unsupported: boolean; reason?: string }>;
}

export interface EnableAutoMergeResult {
  enabled: number;
  skipped: number;
  /** PRs that should be marked `automerge-unsupported` and not retried. */
  unsupportedPRs: number[];
  /** Per-PR reason text for `unsupportedPRs` (GraphQL error message). */
  unsupportedReasons: Record<number, string>;
  /**
   * PRs whose preference list had no method allowed by the repo. Surfaced as
   * an inline badge on the PR row; not retried until settings or repo change.
   */
  noAllowedMethodPRs: number[];
  /** Per-PR record of what was enabled — caller uses this for activity log. */
  enabledPRs: Array<{ prId: number; method: MergeMethod }>;
  failed: Array<{ prId: number; error: string }>;
}

/**
 * Pick the first method in `preference` that the repo allows. Returns null
 * when no preferred method is allowed (or preference is empty).
 */
export function resolveMergeMethod(
  preference: MergeMethod[],
  allowed: RepoAllowedMethods,
): MergeMethod | null {
  for (const method of preference) {
    if (method === 'SQUASH' && allowed.squash) return 'SQUASH';
    if (method === 'MERGE' && allowed.merge) return 'MERGE';
    if (method === 'REBASE' && allowed.rebase) return 'REBASE';
  }
  return null;
}

export async function runEnableAutoMerge(
  prs: EligiblePR[],
  settings: EnableAutoMergeSettings,
  deps: EnableAutoMergeDeps
): Promise<EnableAutoMergeResult> {
  const result: EnableAutoMergeResult = {
    enabled: 0,
    skipped: 0,
    unsupportedPRs: [],
    unsupportedReasons: {},
    noAllowedMethodPRs: [],
    enabledPRs: [],
    failed: [],
  };

  if (!settings.enabled) {
    result.skipped = prs.length;
    return result;
  }

  const optOut = new Set(settings.optOutRepos);

  for (const pr of prs) {
    if (
      pr.isDraft ||
      pr.mergeableState === 'dirty' ||
      pr.autoMergeEnabled ||
      optOut.has(pr.repo)
    ) {
      result.skipped++;
      continue;
    }
    // Note: previously-unsupported PRs are re-evaluated each poll so that
    // when the underlying condition changes (repo settings flipped, PR no
    // longer in clean status, etc.) the orchestrator can log the new state.
    // The orchestrator uses `autoMergeUnsupportedReason` to suppress dup
    // activity entries when the reason text is unchanged.

    const method = resolveMergeMethod(settings.mergeMethodPreference, pr.allowedMethods);
    if (method === null) {
      result.noAllowedMethodPRs.push(pr.id);
      continue;
    }

    try {
      const out = await deps.enable(pr.nodeId, method);
      if (out.unsupported) {
        result.unsupportedPRs.push(pr.id);
        if (out.reason) result.unsupportedReasons[pr.id] = out.reason;
      } else if (out.enabled) {
        result.enabled++;
        result.enabledPRs.push({ prId: pr.id, method });
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
