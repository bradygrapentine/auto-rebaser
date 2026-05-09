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
  /**
   * Ordered preference list. Auto-merge picks the first method the repo's
   * GitHub settings allow. Empty list disables auto-merge for every repo.
   * Story 5.4 — replaces the previous single `autoMergeMethod` field.
   */
  mergeMethodPreference: MergeMethod[];
  /** Per-automation skip list. Repos here do NOT get auto-merge enabled. */
  autoMergeOptOutRepos: string[];
  /**
   * MERGE-2 — when ON and a PR is already in `clean` state (so GitHub refuses
   * to enable auto-merge with "Pull request is in clean status"), fall through
   * to a direct REST merge using `mergeMethodPreference`. Default OFF: opt-in
   * gate against the surprise-merge case for brand-new clean PRs.
   */
  mergeCleanPRsImmediately: boolean;

  autoResolveOutdatedThreads: boolean;
  /** Per-automation skip list. Repos here do NOT get outdated review threads resolved. */
  autoResolveOptOutRepos: string[];

  /** Story 5.5 — popup keyboard shortcuts (r/s/?/j/k/Enter/Esc). Default ON. */
  enableKeyboardShortcuts: boolean;

  // ── Story 5.1 — stale-PR badge + ping reviewers ──
  /** Show an `idle Nd` pill on rows whose PR has not been updated within the threshold. */
  enableStaleBadge: boolean;
  /** Days of inactivity before a PR is considered idle. */
  staleThresholdDays: StaleThresholdDays;
  /** Per-repo override of the stale threshold. Format: { "owner/repo": days }. */
  staleThresholdOverrides: Record<string, StaleThresholdDays>;
  /** When true, an idle PR triggers the orange "needs attention" repo-group dot. Default off. */
  staleCountsAsAttention: boolean;
  /** Show a `ping ↗` link on stale PR rows that have requested reviewers. */
  enablePingReviewers: boolean;
  /** Comment body posted when the user confirms a ping. `{reviewers}` is replaced with `@user1 @user2`. */
  pingTemplate: string;
}

export type StaleThresholdDays = 3 | 7 | 14 | 30 | 60;

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  ignoredRepos: [],
  autoDeleteMergedBranch: true,           // safe default per backlog 2.6
  autoDeleteOptOutRepos: [],
  autoEnableAutoMerge: false,             // opt-in per backlog 2.7
  mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
  autoMergeOptOutRepos: [],
  mergeCleanPRsImmediately: false,         // opt-in — guards against surprise-merge of brand-new clean PRs
  autoResolveOutdatedThreads: false,      // opt-in per backlog 2.8
  autoResolveOptOutRepos: [],
  enableKeyboardShortcuts: true,
  enableStaleBadge: true,
  staleThresholdDays: 14,
  staleThresholdOverrides: {},
  staleCountsAsAttention: false,
  enablePingReviewers: false,             // opt-in — never write to PRs without explicit toggle
  pingTemplate: 'Friendly nudge — could you take a look when you have a moment? {reviewers}',
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
  /** Last GraphQL reason text when autoMergeUnsupported flipped. Used to
   * suppress duplicate activity entries until the reason changes. */
  autoMergeUnsupportedReason?: string;
  /**
   * Story 5.4 — set when no method in the user's `mergeMethodPreference` is
   * allowed by the repo. Surfaces an inline badge; not retried until settings
   * or repo permissions change.
   */
  autoMergeSkipReason?: 'no-allowed-method';
  /** PR head branch name — needed for Story 2.6. */
  headRef?: string;
  /** True when head and base repos are identical (not a fork). */
  sameRepo?: boolean;
  /** Most recent merged_at from GitHub. Used to detect open→merged transitions. */
  mergedAt?: number;
  /** PR draft status, needed for Story 2.7. */
  isDraft?: boolean;

  /**
   * Story 5.1 — staleness metadata computed each poll. Additive — does NOT
   * affect the existing PR state machine. Cleared when the PR comes back
   * within threshold.
   */
  staleness?: {
    /** Whole-day count since `lastActivityAt`. */
    idleDays: number;
    /** Epoch ms of `pull_request.updated_at` at the time it was computed. */
    lastActivityAt: number;
  };

  /** Reviewers requested on the PR — needed for the ping confirmation view. */
  requestedReviewers?: string[];
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
  errors: number;
}
