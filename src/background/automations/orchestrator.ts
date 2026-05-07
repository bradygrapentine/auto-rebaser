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
import { runDismissStaleNotifs } from './dismiss-stale-notifs';
import {
  toEligiblePR,
  toMergedPRInput,
  toPRRef,
  toPRStateMap,
  type PullRequestDetail,
} from './adapters';
import type { NotificationInput } from './dismiss-stale-notifs';

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
  listNotifications: () => Promise<NotificationInput[]>;
  markRead: (threadId: string) => Promise<void>;
  unsubscribe: (threadId: string) => Promise<void>;
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
  /** Story 2.8 — per-thread detail for activity-log entries. */
  resolvedThreadEntries: Array<{ threadId: string; repo: string; prNumber: number }>;
  /** Story 2.8 — per-thread failure detail for activity-log entries. */
  failedThreadEntries: Array<{ threadId: string; repo: string; prNumber: number; error: string }>;
  /** Story 2.9 — per-notification detail for activity-log entries. */
  dismissedNotifEntries: Array<{ threadId: string; repo: string; prNumber: number; unsubscribed: boolean }>;
  /** Story 2.9 — per-notification failure detail for activity-log entries. */
  failedNotifEntries: Array<{ threadId: string; repo: string; prNumber: number; error: string }>;
}

export async function runAllAutomations(opts: OrchestratorOpts): Promise<OrchestratorResult> {
  const { prs, prDetails, settings, github } = opts;

  const prUpdates: Array<{ prId: number; patch: Partial<PRRecord & PRRecordPhaseTwo> }> = [];
  const autoMergeMethodByPRId: Record<number, MergeMethod> = {};
  const failedAutoMergeEntries: OrchestratorResult['failedAutoMergeEntries'] = [];
  const resolvedThreadEntries: OrchestratorResult['resolvedThreadEntries'] = [];
  const failedThreadEntries: OrchestratorResult['failedThreadEntries'] = [];
  const dismissedNotifEntries: OrchestratorResult['dismissedNotifEntries'] = [];
  const failedNotifEntries: OrchestratorResult['failedNotifEntries'] = [];
  let resolvedThreads: ResolvedThreadsStore = { ...opts.resolvedThreads };
  let errors = 0;

  // Tallies
  let autoMergeEnabled = 0;
  let branchesDeleted = 0;
  let threadsResolved = 0;
  let notificationsDismissed = 0;

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
          failedAutoMergeEntries.push({ prId, error: reason });
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

  // ── Step 4: dismissStaleNotifs ──────────────────────────────────────────────
  if (settings.autoDismissStaleNotifications && settings.notificationsScopeGranted) {
    try {
      const notifications = await github.listNotifications();
      const prStateMap = toPRStateMap(prs);

      const result = await runDismissStaleNotifs(
        notifications,
        {
          enabled: true,
          unsubscribe: settings.unsubscribeStalePRNotifications,
          scopeGranted: true,
          optOutRepos: settings.autoDismissOptOutRepos,
        },
        prStateMap,
        {
          markRead: github.markRead,
          unsubscribe: github.unsubscribe,
        },
      );

      notificationsDismissed += result.dismissed;
      errors += result.failed.length;
      dismissedNotifEntries.push(...result.dismissedEntries);
      failedNotifEntries.push(...result.failedEntries);
    } catch (err) {
      errors++;
      console.error('[orchestrator] dismissStaleNotifs threw:', err);
    }
  }

  const summary: PollSummary = {
    ranAt: Date.now(),
    rebased: 0, // caller sets rebased count; orchestrator doesn't know
    branchesDeleted,
    autoMergeEnabled,
    threadsResolved,
    notificationsDismissed,
    errors,
  };

  return {
    summary,
    prUpdates,
    resolvedThreads,
    autoMergeMethodByPRId,
    failedAutoMergeEntries,
    resolvedThreadEntries,
    failedThreadEntries,
    dismissedNotifEntries,
    failedNotifEntries,
  };
}
