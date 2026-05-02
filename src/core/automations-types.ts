// src/core/automations-types.ts (Part A creates)

export type MergeMethod = 'SQUASH' | 'MERGE' | 'REBASE';

export interface AutomationSettings {
  /**
   * Repos to ignore globally. PRs from these repos never appear in the popup
   * and are never touched by any automation (rebase, branch-delete, auto-merge,
   * thread-resolve, notification-dismiss). Format: "owner/repo".
   */
  ignoredRepos: string[];

  autoDeleteMergedBranch: boolean;
  /** Per-automation skip list. Repos here are NOT branch-deleted on merge. */
  autoDeleteOptOutRepos: string[];

  autoEnableAutoMerge: boolean;
  autoMergeMethod: MergeMethod;
  /** Per-automation skip list. Repos here do NOT get auto-merge enabled. */
  autoMergeOptOutRepos: string[];

  autoResolveOutdatedThreads: boolean;
  /** Per-automation skip list. Repos here do NOT get outdated review threads resolved. */
  autoResolveOptOutRepos: string[];

  autoDismissStaleNotifications: boolean;
  unsubscribeStalePRNotifications: boolean;
  /** Per-automation skip list. Repos here do NOT get notifications dismissed. */
  autoDismissOptOutRepos: string[];
  /** True when the OAuth token was minted with the `notifications` scope. */
  notificationsScopeGranted: boolean;
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  ignoredRepos: [],
  autoDeleteMergedBranch: true,           // safe default per backlog 2.6
  autoDeleteOptOutRepos: [],
  autoEnableAutoMerge: false,             // opt-in per backlog 2.7
  autoMergeMethod: 'SQUASH',
  autoMergeOptOutRepos: [],
  autoResolveOutdatedThreads: false,      // opt-in per backlog 2.8
  autoResolveOptOutRepos: [],
  autoDismissStaleNotifications: false,   // opt-in per backlog 2.9
  unsubscribeStalePRNotifications: false,
  autoDismissOptOutRepos: [],
  notificationsScopeGranted: false,
};

export type PhaseTwoPRState =
  | 'branch-deleted'
  | 'delete-failed'
  | 'automerge-unsupported';

export interface PRRecordPhaseTwo {
  /** GraphQL node_id for GraphQL mutations. Populated when poll fetches PR detail. */
  nodeId?: string;
  /** True after Story 2.6 successfully deletes the head branch. */
  branchDeleted?: boolean;
  /** True after Story 2.7 successfully enables auto-merge on this PR. */
  autoMergeEnabled?: boolean;
  /** True after Story 2.7 records that the repo rejected the merge method. */
  autoMergeUnsupported?: boolean;
  /** PR head branch name — needed for Story 2.6. */
  headRef?: string;
  /** True when head and base repos are identical (not a fork). */
  sameRepo?: boolean;
  /** Most recent merged_at from GitHub. Used to detect open→merged transitions. */
  mergedAt?: number;
  /** PR draft status, needed for Story 2.7. */
  isDraft?: boolean;
}

/** threadId → epoch ms when we auto-resolved it. Skip if already in this map. */
export type ResolvedThreadsStore = Record<string, number>;

/** The shape persisted in `pr_store.lastPollSummary` after each poll cycle. Part A produces it; Part B reads it. */
export interface PollSummary {
  /** Epoch ms of the cycle that produced this summary. */
  ranAt: number;
  rebased: number;
  branchesDeleted: number;
  autoMergeEnabled: number;
  threadsResolved: number;
  notificationsDismissed: number;
  errors: number;
}
