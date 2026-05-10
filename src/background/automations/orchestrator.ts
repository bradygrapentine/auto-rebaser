import type { PRRecord } from '../../core/types';
import type {
  AutomationSettings,
  ResolvedThreadsStore,
  PRRecordPhaseTwo,
  PollSummary,
} from '../../core/automations-types';
import { runEnableAutoMerge, resolveMergeMethod, type MergeMethod } from './enable-auto-merge';
import { runDeleteMergedBranch } from './delete-merged-branch';
import { runResolveObsoleteThreads } from './resolve-obsolete-threads';
import {
  toEligiblePR,
  toMergedPRInput,
  toPRRef,
  type PullRequestDetail,
} from './adapters';

export interface OrchestratorRepoInfo {
  delete_branch_on_merge: boolean;
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
}

export interface OrchestratorDeps {
  getRepo: (owner: string, repo: string) => Promise<OrchestratorRepoInfo | null>;
  deleteRef: (owner: string, repo: string, ref: string) => Promise<'deleted' | 'already-gone'>;
  enableAutoMerge: (prNodeId: string, method: MergeMethod) => Promise<{ enabled: boolean; unsupported: boolean }>;
  listThreads: (owner: string, repo: string, number: number) => Promise<Array<{ id: string; isResolved: boolean; isOutdated: boolean; line: number | null }>>;
  resolveThread: (threadId: string) => Promise<void>;
  /**
   * MERGE-2 — direct REST merge for clean PRs when auto-merge can't apply.
   * Throws `METHOD_NOT_ALLOWED` (405) for fall-through to next method, or
   * `SHA_MISMATCH` (409) when the head moved since snapshot.
   */
  mergePR: (
    owner: string,
    repo: string,
    number: number,
    opts: { sha: string; merge_method: 'squash' | 'rebase' | 'merge' },
  ) => Promise<{ merged: boolean; sha: string }>;
}

export interface OrchestratorOpts {
  prs: PRRecord[];
  prDetails: Map<number, PullRequestDetail>;
  settings: AutomationSettings;
  resolvedThreads: ResolvedThreadsStore;
  github: OrchestratorDeps;
}

export interface OrchestratorResult {
  summary: PollSummary;
  prUpdates: Array<{ prId: number; patch: Partial<PRRecord & PRRecordPhaseTwo> }>;
  resolvedThreads: ResolvedThreadsStore;
  /**
   * Story 5.4 — for every PR auto-merge was enabled on this cycle, the
   * resolved method (from the repo's allowed methods + user preference list).
   * Poll-cycle reads this to mint the activity log entry.
   */
  autoMergeMethodByPRId: Record<number, MergeMethod>;
  /** Story 2.7 — per-PR auto-merge failure detail for activity-log entries. */
  failedAutoMergeEntries: Array<{ prId: number; error: string }>;
  /**
   * MERGE-1 — per-PR no-op outcomes from auto-merge enablement. These come
   * back from GitHub when the PR is already mergeable (clean) or already
   * merged. They are not failures and should render as neutral skips in the
   * activity log.
   */
  skippedAutoMergeEntries: Array<{ prId: number; skipReason: 'already_clean' | 'already_merged' }>;
  /**
   * MERGE-2 — PRs that fell through to direct merge (toggle on, PR was clean).
   * One entry per PR regardless of method-fallback iterations.
   */
  mergedNowEntries: Array<{
    prId: number;
    method: MergeMethod;
    result: 'success' | 'failed';
    error?: string;
  }>;
  /** Story 2.8 — per-thread detail for activity-log entries. */
  resolvedThreadEntries: Array<{ threadId: string; repo: string; prNumber: number }>;
  /** Story 2.8 — per-thread failure detail for activity-log entries. */
  failedThreadEntries: Array<{ threadId: string; repo: string; prNumber: number; error: string }>;
}

export async function runAllAutomations(opts: OrchestratorOpts): Promise<OrchestratorResult> {
  const { prs, prDetails, settings, github } = opts;

  const prUpdates: Array<{ prId: number; patch: Partial<PRRecord & PRRecordPhaseTwo> }> = [];
  const autoMergeMethodByPRId: Record<number, MergeMethod> = {};
  const failedAutoMergeEntries: OrchestratorResult['failedAutoMergeEntries'] = [];
  const skippedAutoMergeEntries: OrchestratorResult['skippedAutoMergeEntries'] = [];
  const mergedNowEntries: OrchestratorResult['mergedNowEntries'] = [];
  const resolvedThreadEntries: OrchestratorResult['resolvedThreadEntries'] = [];
  const failedThreadEntries: OrchestratorResult['failedThreadEntries'] = [];
  let resolvedThreads: ResolvedThreadsStore = { ...opts.resolvedThreads };
  let errors = 0;

  // Tallies
  let autoMergeEnabled = 0;
  let branchesDeleted = 0;
  let threadsResolved = 0;

  // ── Step 1: enableAutoMerge ─────────────────────────────────────────────────
  if (settings.autoEnableAutoMerge) {
    try {
      // Fetch each PR's repo (cached) so we know which merge methods are allowed.
      const eligiblePRs = (
        await Promise.all(
          prs.map(async (pr) => {
            const detail = prDetails.get(pr.id);
            if (!detail) return null;
            const [owner, name] = pr.repo.split('/');
            if (!owner || !name) return null;
            const repoInfo = await github.getRepo(owner, name);
            if (!repoInfo) return null;
            return toEligiblePR(pr, detail, {
              squash: repoInfo.allow_squash_merge,
              merge: repoInfo.allow_merge_commit,
              rebase: repoInfo.allow_rebase_merge,
            });
          }),
        )
      ).filter((x): x is NonNullable<typeof x> => x !== null);

      const result = await runEnableAutoMerge(
        eligiblePRs,
        {
          enabled: true,
          mergeMethodPreference: settings.mergeMethodPreference,
          optOutRepos: settings.autoMergeOptOutRepos,
        },
        { enable: github.enableAutoMerge },
      );

      autoMergeEnabled += result.enabled;
      errors += result.failed.length;
      for (const f of result.failed) {
        failedAutoMergeEntries.push({ prId: f.prId, error: f.error });
      }
      for (const { prId, method } of result.enabledPRs) {
        prUpdates.push({ prId, patch: { autoMergeEnabled: true } });
        autoMergeMethodByPRId[prId] = method;
      }
      for (const prId of result.unsupportedPRs) {
        const reason = result.unsupportedReasons[prId] ?? 'auto-merge unsupported';
        prUpdates.push({
          prId,
          patch: { autoMergeUnsupported: true, autoMergeUnsupportedReason: reason },
        });
        // Log only when the reason text changes (or first time). Suppresses
        // duplicate entries on repeat polls when nothing has changed.
        const prevReason = (prs.find((p) => p.id === prId) as
          | (PRRecord & PRRecordPhaseTwo)
          | undefined)?.autoMergeUnsupportedReason;
        if (prevReason !== reason) {
          // MERGE-1: classify the two no-op responses as skipped, not failed.
          // GitHub returns these when the PR is already mergeable (no auto-
          // merge possible) or already merged (race with the merge landing).
          if (/clean status/i.test(reason)) {
            skippedAutoMergeEntries.push({ prId, skipReason: 'already_clean' });
          } else if (/is already merged/i.test(reason)) {
            skippedAutoMergeEntries.push({ prId, skipReason: 'already_merged' });
          } else {
            failedAutoMergeEntries.push({ prId, error: reason });
          }
        }
      }

      // MERGE-2 — fall-through direct merge for clean-status rejections when
      // the user has opted in. Eligibility is evaluated against the FRESH
      // `unsupportedReasons` from this cycle (not against the dedup'd
      // `skippedAutoMergeEntries`), so:
      //   - toggling the setting on after a prior poll already cached the
      //     reason still triggers a merge attempt on the next poll
      //   - a transient SHA_MISMATCH retries on the next poll
      // The skipped-log dedup remains separate (handled above).
      if (settings.mergeCleanPRsImmediately) {
        const cleanIds = new Set<number>();
        for (const prId of result.unsupportedPRs) {
          const reason = result.unsupportedReasons[prId] ?? '';
          if (/clean status/i.test(reason)) cleanIds.add(prId);
        }
        const mergeCleanSkipSet = new Set(settings.mergeCleanPRsOptOutRepos ?? []);
        const consumedSkipIds = new Set<number>();
        for (const eligible of eligiblePRs) {
          if (!cleanIds.has(eligible.id)) continue;
          if (mergeCleanSkipSet.has(eligible.repo)) continue;
          const detail = prDetails.get(eligible.id);
          const headSha = detail?.head?.sha;
          if (!headSha) continue;
          const [owner, name] = eligible.repo.split('/');
          if (!owner || !name) continue;
          const pr = prs.find((p) => p.id === eligible.id);
          if (!pr) continue;

          // No execution-side cooldown: the REST `mergePR` helper maps 405
          // generically (not "this merge method specifically"), so a 405
          // can mask a transient repo/branch-protection condition that
          // resolves later. Skipping based on a prior failed SHA would
          // strand the PR indefinitely. Re-attempt every poll; log dedup
          // (if needed) belongs at the activity-entry layer, not here.
          //
          // Pick a SINGLE method up-front from the repo's allowed-methods
          // intersected with the user's preference list. If we used the
          // raw preference and let 405 cascade to the next method, a
          // transient generic 405 ("merge cannot be performed right now")
          // would silently shift the user to a lower-preference method
          // on the next attempt — irreversible once it lands. Mirror the
          // upstream `resolveMergeMethod` discipline: one method per
          // attempt, fail loudly if it errors.
          const chosenMethod = resolveMergeMethod(
            settings.mergeMethodPreference,
            eligible.allowedMethods,
          );

          let merged = false;
          let lastError: string | undefined;
          let usedMethod: MergeMethod | null = null;
          if (chosenMethod === null) {
            lastError = 'NO_ALLOWED_MERGE_METHOD';
          } else {
            const restMethod = chosenMethod.toLowerCase() as 'squash' | 'rebase' | 'merge';
            try {
              const apiResult = await github.mergePR(owner, name, pr.number, {
                sha: headSha,
                merge_method: restMethod,
              });
              // GitHub's PUT /merge can resolve with 200 + `merged: false` for
              // edge cases (e.g. unstable branch protection check). Trust the
              // payload, not just the absence of a thrown error.
              if (apiResult.merged === true) {
                merged = true;
                usedMethod = chosenMethod;
              } else {
                lastError = 'NOT_MERGED';
              }
            } catch (err) {
              lastError = err instanceof Error ? err.message : String(err);
            }
          }

          if (merged && usedMethod) {
            mergedNowEntries.push({ prId: eligible.id, method: usedMethod, result: 'success' });
            consumedSkipIds.add(eligible.id);
            // Update local PR state to reflect the merge: clear the
            // unsupported flag + dedup marker, mark merged, stamp
            // mergedAt. Same-cycle branch-delete cleanup is a known
            // follow-up.
            prUpdates.push({
              prId: eligible.id,
              patch: {
                state: 'merged',
                mergedAt: Date.now(),
                lastUpdated: Date.now(),
                autoMergeUnsupported: false,
                autoMergeUnsupportedReason: undefined,
                lastDirectMergeFailure: undefined,
              },
            });
          } else {
            const failureReason = lastError ?? 'NO_ALLOWED_MERGE_METHOD';
            // The activity log records the method we ACTUALLY attempted
            // (or the resolved-but-errored choice). When the preference
            // list yielded no allowed method, fall back to the first
            // preference for display purposes only.
            const reportedMethod: MergeMethod =
              chosenMethod ?? settings.mergeMethodPreference[0] ?? 'SQUASH';
            // Log dedup keyed on { sha, method, error } so a different
            // failure mode (different status, or different attempted
            // method after a settings change) emits a fresh entry.
            // Network retry still runs every poll; aggregate error count
            // still increments. Mirrors autoMergeUnsupportedReason dedup.
            const prev = (pr as PRRecord & PRRecordPhaseTwo).lastDirectMergeFailure;
            const isNewFailure =
              prev?.sha !== headSha ||
              prev?.error !== failureReason ||
              prev?.method !== reportedMethod;
            if (isNewFailure) {
              mergedNowEntries.push({
                prId: eligible.id,
                method: reportedMethod,
                result: 'failed',
                error: failureReason,
              });
              // Clear the upstream `autoMergeUnsupported` flag set above.
              // The PR is clean + direct-merge-failed, not "auto-merge
              // unsupported" — the latter would render a misleading badge
              // in PRRow. The actual failure mode is now expressed via
              // `lastDirectMergeFailure` + its dedicated badge.
              prUpdates.push({
                prId: eligible.id,
                patch: {
                  autoMergeUnsupported: false,
                  autoMergeUnsupportedReason: undefined,
                  lastDirectMergeFailure: {
                    sha: headSha,
                    error: failureReason,
                    method: reportedMethod,
                  },
                },
              });
            }
            // Always surface failed direct merges in the cycle's aggregate
            // error count, even when the activity entry was deduped — the
            // failure still happened on the wire and the summary should
            // reflect it.
            errors++;
            consumedSkipIds.add(eligible.id);
          }
        }

        // E3 — suppress the now-redundant `already_clean` skip entries for
        // PRs we attempted to fall through (success or fail; the merged_now
        // entry is the canonical signal).
        if (consumedSkipIds.size > 0) {
          for (let i = skippedAutoMergeEntries.length - 1; i >= 0; i--) {
            const e = skippedAutoMergeEntries[i];
            if (e.skipReason === 'already_clean' && consumedSkipIds.has(e.prId)) {
              skippedAutoMergeEntries.splice(i, 1);
            }
          }
        }
      }
      const noAllowedSet = new Set(result.noAllowedMethodPRs);
      for (const prId of result.noAllowedMethodPRs) {
        prUpdates.push({ prId, patch: { autoMergeSkipReason: 'no-allowed-method' } });
      }
      // Audit B4 / Story 5.4 — when a previously-flagged PR resolves to an
      // allowed method (settings changed OR repo flipped on a method), clear
      // the inline badge. We only see "evaluated" PRs in step 1, so this is
      // safe: any PR not in noAllowedSet that we DID consider should be
      // un-flagged.
      const consideredIds = new Set(eligiblePRs.map((p) => p.id));
      for (const pr of prs) {
        const ext = pr as PRRecord & PRRecordPhaseTwo;
        if (ext.autoMergeSkipReason === 'no-allowed-method'
          && consideredIds.has(pr.id)
          && !noAllowedSet.has(pr.id)) {
          prUpdates.push({ prId: pr.id, patch: { autoMergeSkipReason: undefined } });
        }
      }
    } catch (err) {
      errors++;
      console.error('[orchestrator] enableAutoMerge threw:', err);
    }
  }

  // ── Step 2: deleteMergedBranch ──────────────────────────────────────────────
  if (settings.autoDeleteMergedBranch) {
    try {
      // Only PRs whose state transitioned to merged this cycle.
      // We use PRRecord state: 'branch-deleted' means already done; we target
      // those that have mergedAt set but branchDeleted not yet set.
      const mergedPRs = prs
        .filter(pr => {
          const extended = pr as PRRecord & PRRecordPhaseTwo;
          return extended.mergedAt != null && !extended.branchDeleted;
        })
        .map(pr => {
          const detail = prDetails.get(pr.id);
          return detail ? toMergedPRInput(pr, detail) : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const result = await runDeleteMergedBranch(
        mergedPRs,
        { enabled: true, optOutRepos: settings.autoDeleteOptOutRepos },
        {
          getRepo: github.getRepo,
          deleteRef: github.deleteRef,
        },
      );

      branchesDeleted += result.deleted;
      errors += result.failed.length;
      for (const prId of result.branchDeletedPRs) {
        prUpdates.push({ prId, patch: { branchDeleted: true } });
      }
    } catch (err) {
      errors++;
      console.error('[orchestrator] deleteMergedBranch threw:', err);
    }
  }

  // ── Step 3: resolveObsoleteThreads ──────────────────────────────────────────
  if (settings.autoResolveOutdatedThreads) {
    try {
      const prRefs = prs.map(toPRRef);

      const result = await runResolveObsoleteThreads(
        prRefs,
        { enabled: true, optOutRepos: settings.autoResolveOptOutRepos },
        resolvedThreads,
        {
          listThreads: github.listThreads,
          resolveThread: github.resolveThread,
        },
      );

      threadsResolved += result.resolved;
      errors += result.failed.length;
      resolvedThreads = result.resolvedStore;
      resolvedThreadEntries.push(...result.resolvedEntries);
      failedThreadEntries.push(...result.failedEntries);
    } catch (err) {
      errors++;
      console.error('[orchestrator] resolveObsoleteThreads threw:', err);
    }
  }

  const summary: PollSummary = {
    ranAt: Date.now(),
    rebased: 0, // caller sets rebased count; orchestrator doesn't know
    branchesDeleted,
    autoMergeEnabled,
    threadsResolved,
    errors,
  };

  return {
    summary,
    prUpdates,
    resolvedThreads,
    autoMergeMethodByPRId,
    failedAutoMergeEntries,
    skippedAutoMergeEntries,
    mergedNowEntries,
    resolvedThreadEntries,
    failedThreadEntries,
  };
}
