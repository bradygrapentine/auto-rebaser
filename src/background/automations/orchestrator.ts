import type { PRRecord } from '../../core/types';
import type {
  AutomationSettings,
  ResolvedThreadsStore,
  PRRecordPhaseTwo,
  PollSummary,
} from '../../core/automations-types';
import { runEnableAutoMerge, type MergeMethod } from './enable-auto-merge';
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

      // MERGE-2 — fall-through direct merge for `already_clean` skips when
      // the user has opted in. Suppresses the upstream skipped entry on
      // success (E3); failures are surfaced as `auto_merged_now · failed`.
      if (settings.mergeCleanPRsImmediately) {
        const cleanIds = new Set(
          skippedAutoMergeEntries
            .filter((s) => s.skipReason === 'already_clean')
            .map((s) => s.prId),
        );
        const consumedSkipIds = new Set<number>();
        for (const eligible of eligiblePRs) {
          if (!cleanIds.has(eligible.id)) continue;
          const detail = prDetails.get(eligible.id);
          const headSha = detail?.head?.sha;
          if (!headSha) continue;
          const [owner, name] = eligible.repo.split('/');
          if (!owner || !name) continue;
          const pr = prs.find((p) => p.id === eligible.id);
          if (!pr) continue;

          let merged = false;
          let lastError: string | undefined;
          let usedMethod: MergeMethod | null = null;
          for (const method of settings.mergeMethodPreference) {
            const restMethod = method.toLowerCase() as 'squash' | 'rebase' | 'merge';
            try {
              await github.mergePR(owner, name, pr.number, {
                sha: headSha,
                merge_method: restMethod,
              });
              merged = true;
              usedMethod = method;
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (msg === 'METHOD_NOT_ALLOWED') continue;
              lastError = msg;
              break;
            }
          }

          if (merged && usedMethod) {
            mergedNowEntries.push({ prId: eligible.id, method: usedMethod, result: 'success' });
            consumedSkipIds.add(eligible.id);
            // Clear the upstream `autoMergeUnsupported` flag we just set —
            // the PR is now actually merged, not unsupported.
            prUpdates.push({
              prId: eligible.id,
              patch: { autoMergeUnsupported: false, autoMergeUnsupportedReason: undefined },
            });
          } else {
            mergedNowEntries.push({
              prId: eligible.id,
              method: settings.mergeMethodPreference[0] ?? 'SQUASH',
              result: 'failed',
              error: lastError ?? 'NO_ALLOWED_MERGE_METHOD',
            });
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
