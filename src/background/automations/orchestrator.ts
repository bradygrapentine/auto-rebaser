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

export interface OrchestratorDeps {
  getRepo: (owner: string, repo: string) => Promise<{ delete_branch_on_merge: boolean } | null>;
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
}

export async function runAllAutomations(opts: OrchestratorOpts): Promise<OrchestratorResult> {
  const { prs, prDetails, settings, github } = opts;

  const prUpdates: Array<{ prId: number; patch: Partial<PRRecord & PRRecordPhaseTwo> }> = [];
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
      const eligiblePRs = prs.map(pr => {
        const detail = prDetails.get(pr.id);
        return detail ? toEligiblePR(pr, detail) : null;
      }).filter((x): x is NonNullable<typeof x> => x !== null);

      const result = await runEnableAutoMerge(
        eligiblePRs,
        {
          enabled: true,
          mergeMethod: settings.autoMergeMethod,
          optOutRepos: settings.autoMergeOptOutRepos,
        },
        { enable: github.enableAutoMerge },
      );

      autoMergeEnabled += result.enabled;
      errors += result.failed.length;
      for (const prId of result.enabledPRs) {
        prUpdates.push({ prId, patch: { autoMergeEnabled: true } });
      }
      for (const prId of result.unsupportedPRs) {
        prUpdates.push({ prId, patch: { autoMergeUnsupported: true } });
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

  return { summary, prUpdates, resolvedThreads };
}
