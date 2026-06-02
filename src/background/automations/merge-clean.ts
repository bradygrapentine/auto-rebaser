// PREVIEW-1 (T1) — MERGE-2 direct-merge decision, extracted from the inline
// orchestrator block (orchestrator.ts:179-325) so preview and execute share ONE
// predicate. PURE: no GitHub mutation; `cleanIds` (the set of PR ids GitHub
// flagged `/clean status/i`) is computed by the EXECUTE path from the live
// enable-auto-merge response and passed IN — this predicate never re-derives it.
//
// Preview passes `cleanIds = new Set()`, so it returns [] and the preview branch
// never calls this (a read-only preview cannot know clean-status); it sets
// `directMergePreviewable: false` instead. See the plan §0 CRITICAL CONSTRAINT.

import type { AutomationSettings } from '../../core/automations-types';
import { resolveMergeMethod, type EligiblePR } from './enable-auto-merge';
import type { PullRequestDetail } from './adapters';
import type { PlannedAction } from './planned-action';

type DirectMergeAction = Extract<PlannedAction, { kind: 'direct-merge' }>;

/**
 * The PRs that WOULD direct-merge this cycle, with the method they'd use. A PR is
 * a direct-merge action iff: it is in `cleanIds`, its repo is not in
 * `mergeCleanPRsOptOutRepos`, it has a head SHA, its repo splits to owner/name,
 * AND a merge method resolves from the preference list. (The PR `number` rides on
 * `eligible` — populated by `toEligiblePR` at adapters.ts:78 — so no `prs` lookup
 * is needed; `eligible` was itself built from a `prs` member.)
 *
 * The method ALWAYS resolves here for a cleanIds member: cleanIds membership
 * implies the same `resolveMergeMethod(preference, allowedMethods)` was non-null
 * in runEnableAutoMerge (else the PR went to noAllowedMethodPRs and never reached
 * the enable call that produces the clean-status reason). So the null-method case
 * is unreachable — pinned by merge-clean.char's no-allowed-method test.
 */
export function decideDirectMerge(
  eligiblePRs: EligiblePR[],
  prDetails: Map<number, PullRequestDetail>,
  settings: Pick<AutomationSettings, 'mergeMethodPreference' | 'mergeCleanPRsOptOutRepos'>,
  cleanIds: Set<number>,
): DirectMergeAction[] {
  const actions: DirectMergeAction[] = [];
  const mergeCleanSkipSet = new Set(settings.mergeCleanPRsOptOutRepos ?? []);

  for (const eligible of eligiblePRs) {
    if (!cleanIds.has(eligible.id)) continue;
    if (mergeCleanSkipSet.has(eligible.repo)) continue;
    const detail = prDetails.get(eligible.id);
    const headSha = detail?.head?.sha;
    if (!headSha) continue;
    const [owner, name] = eligible.repo.split('/');
    if (!owner || !name) continue;

    const chosenMethod = resolveMergeMethod(settings.mergeMethodPreference, eligible.allowedMethods);
    if (chosenMethod === null) continue; // unreachable for cleanIds members (see doc)

    actions.push({
      kind: 'direct-merge',
      prId: eligible.id,
      owner,
      name,
      number: eligible.number,
      sha: headSha,
      method: chosenMethod,
      repo: eligible.repo,
    });
  }

  return actions;
}
