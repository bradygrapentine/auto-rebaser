// Story 2.7 — flip auto-merge on for authored PRs that don't have it set.

export type MergeMethod = 'SQUASH' | 'MERGE' | 'REBASE';

export interface EnableAutoMergeSettings {
  enabled: boolean;
  mergeMethod: MergeMethod;
  /** "owner/repo" repos that should NOT have auto-merge enabled. */
  optOutRepos: string[];
}

/** Minimal shape — the wiring layer will derive these from PRRecord + raw API data. */
export interface EligiblePR {
  id: number;
  /** GraphQL node_id */
  nodeId: string;
  repo: string;
  isDraft: boolean;
  mergeableState: string;
  autoMergeEnabled: boolean;
  /** True when the repo has previously rejected this merge method. */
  unsupported: boolean;
}

export interface EnableAutoMergeDeps {
  enable(
    prNodeId: string,
    method: MergeMethod
  ): Promise<{ enabled: boolean; unsupported: boolean }>;
}

export interface EnableAutoMergeResult {
  enabled: number;
  skipped: number;
  /** PRs that should be marked `automerge-unsupported` and not retried. */
  unsupportedPRs: number[];
  /** PRs whose `autoMergeEnabled` flag should be set true. */
  enabledPRs: number[];
  failed: Array<{ prId: number; error: string }>;
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
      pr.unsupported ||
      optOut.has(pr.repo)
    ) {
      result.skipped++;
      continue;
    }

    try {
      const out = await deps.enable(pr.nodeId, settings.mergeMethod);
      if (out.unsupported) {
        result.unsupportedPRs.push(pr.id);
      } else if (out.enabled) {
        result.enabled++;
        result.enabledPRs.push(pr.id);
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
