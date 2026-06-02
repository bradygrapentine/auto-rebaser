// Story 2.7 — flip auto-merge on for authored PRs that don't have it set.
// Story 5.4 — pick the first user-preferred method that the repo allows.

import type { PlannedAction } from './planned-action';

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
  /** PR number — carried so `decideEnableAutoMerge` can populate the PlannedAction (PREVIEW-1). */
  number: number;
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

/**
 * PREVIEW-1 — the per-PR enable decision, the SINGLE shared predicate behind both
 * `decideEnableAutoMerge` (preview) and `runEnableAutoMerge` (execute). Pure.
 * `optOut` is the caller's pre-built Set (avoids rebuilding it per PR).
 * Note: previously-unsupported PRs are re-evaluated each poll so that when the
 * underlying condition changes the orchestrator can log the new state.
 */
type EnablePRDecision =
  | { kind: 'skip' }
  | { kind: 'no-method' }
  | { kind: 'enable'; action: Extract<PlannedAction, { kind: 'enable-auto-merge' }> };

function decideEnablePR(pr: EligiblePR, settings: EnableAutoMergeSettings, optOut: Set<string>): EnablePRDecision {
  if (pr.isDraft || pr.mergeableState === 'dirty' || pr.autoMergeEnabled || optOut.has(pr.repo)) {
    return { kind: 'skip' };
  }
  const method = resolveMergeMethod(settings.mergeMethodPreference, pr.allowedMethods);
  if (method === null) return { kind: 'no-method' };
  return {
    kind: 'enable',
    action: { kind: 'enable-auto-merge', prId: pr.id, nodeId: pr.nodeId, repo: pr.repo, number: pr.number, method },
  };
}

/**
 * PREVIEW-1 — pure: the PlannedActions `runEnableAutoMerge` WOULD apply (one per
 * PR that would call `deps.enable`). Skipped + no-allowed-method PRs yield no
 * action. Same per-PR predicate the execute path uses, so the two cannot drift.
 */
export function decideEnableAutoMerge(
  prs: EligiblePR[],
  settings: EnableAutoMergeSettings,
): Array<Extract<PlannedAction, { kind: 'enable-auto-merge' }>> {
  if (!settings.enabled) return [];
  const optOut = new Set(settings.optOutRepos);
  const actions: Array<Extract<PlannedAction, { kind: 'enable-auto-merge' }>> = [];
  for (const pr of prs) {
    const d = decideEnablePR(pr, settings, optOut);
    if (d.kind === 'enable') actions.push(d.action);
  }
  return actions;
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
    const decision = decideEnablePR(pr, settings, optOut);
    if (decision.kind === 'skip') {
      result.skipped++;
      continue;
    }
    if (decision.kind === 'no-method') {
      result.noAllowedMethodPRs.push(pr.id);
      continue;
    }

    const { method } = decision.action;
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
