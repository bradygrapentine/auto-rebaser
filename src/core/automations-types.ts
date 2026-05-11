// src/core/automations-types.ts (Part A creates)

export type MergeMethod = 'SQUASH' | 'MERGE' | 'REBASE';

export interface AutomationSettings {
  /**
   * Repos to ignore globally. PRs from these repos never appear in the popup
   * and are never touched by any automation (rebase, branch-delete, auto-merge,
   * thread-resolve, notification-dismiss). Format: "owner/repo".
   */
  ignoredRepos: string[];

  /**
   * REBASE-OPT-OUT — global kill-switch for the auto-rebase action. Default ON
   * (the core feature). Turning OFF leaves PRs in `behind` state visibly so
   * users can rebase manually, useful for testing state transitions or for
   * sensitive repos where the user wants to control the timing.
   */
  autoRebaseEnabled: boolean;
  /** Per-automation skip list. Repos here are NOT auto-rebased; PRs in those repos sit in `behind` state until manually rebased. */
  autoRebaseOptOutRepos: string[];

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
  /** Per-automation skip list for the merge-clean-immediately fall-through. Repos here participate in auto-merge enable but are NOT direct-merged on the clean fall-through. */
  mergeCleanPRsOptOutRepos: string[];

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

  /**
   * Story 2.5 — display-only filter applied to the popup PR list. Empty array
   * means no filter; non-empty means show only PRs whose `repo` is in the set.
   * Persists per-account (lives outside the global keys hoisted by B2). Does
   * NOT change polling — every signed-in account still polls every repo.
   */
  repoFilter: string[];

  // ── Story 5.2-A — Push-since-approval ──
  /** Show a `! re-review` badge when the latest push post-dates every current approval. Default ON. */
  enablePushSinceApproval: boolean;
  /** When ON, clicking the badge opens a confirm modal that re-requests review. Default OFF. */
  enableRequestRereview: boolean;

  // ── REVIEWER-AUTOMATIONS — reviewer dashboard tab + opt-in auto-merge ──
  /**
   * Master toggle. When true the popup shows a Reviewer tab and the poll cycle
   * runs an extra search query for `review-requested:@me OR assignee:@me`.
   * Default false to keep existing users on the authored-only experience.
   */
  enableReviewerTab: boolean;
  /**
   * Sub-toggle: when true AND `enableReviewerTab` is true AND the PR's repo is
   * in `autoMergeReviewerOptInRepos`, fire enableAutoMerge once the user is
   * the last required gate. Default false.
   */
  enableReviewerAutoMerge: boolean;
  /**
   * Per-repo allowlist for reviewer auto-merge. Empty list disables the
   * automation even when both toggles are on. Format: "owner/repo".
   */
  autoMergeReviewerOptInRepos: string[];

  // ── Story 2.4 — Desktop notifications ──
  /** Master gate. Requires the runtime `notifications` permission to actually fire. Default OFF. */
  notificationsEnabled: boolean;
  notifyOnRebased: boolean;
  notifyOnConflicted: boolean;
  notifyOnMerged: boolean;
  notifyOnIdle: boolean;
  notifyOnPingConfirmed: boolean;
}

export type StaleThresholdDays = 3 | 7 | 14 | 30 | 60;

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  ignoredRepos: [],
  autoRebaseEnabled: true,                // ON — core feature
  autoRebaseOptOutRepos: [],
  autoDeleteMergedBranch: true,           // safe default per backlog 2.6
  autoDeleteOptOutRepos: [],
  autoEnableAutoMerge: false,             // opt-in per backlog 2.7
  mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
  autoMergeOptOutRepos: [],
  mergeCleanPRsImmediately: false,         // opt-in — guards against surprise-merge of brand-new clean PRs
  mergeCleanPRsOptOutRepos: [],
  autoResolveOutdatedThreads: false,      // opt-in per backlog 2.8
  autoResolveOptOutRepos: [],
  enableKeyboardShortcuts: true,
  enableStaleBadge: true,
  staleThresholdDays: 14,
  staleThresholdOverrides: {},
  staleCountsAsAttention: false,
  enablePingReviewers: false,             // opt-in — never write to PRs without explicit toggle
  pingTemplate: 'Friendly nudge — could you take a look when you have a moment? {reviewers}',
  repoFilter: [],
  enablePushSinceApproval: true,
  enableRequestRereview: false,
  enableReviewerTab: false,
  enableReviewerAutoMerge: false,
  autoMergeReviewerOptInRepos: [],
  notificationsEnabled: false,
  notifyOnRebased: false,
  notifyOnConflicted: false,
  notifyOnMerged: false,
  notifyOnIdle: false,
  notifyOnPingConfirmed: false,
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
  /**
   * MERGE-2 — last direct-merge failure signature (SHA + method + error).
   * Used to dedupe `auto_merged_now · failed` activity entries when the
   * same failure keeps recurring across polls; suppresses log-flooding
   * without preventing the network retry from happening. New SHA, new
   * attempted method, new error class, or success clears the entry.
   * Mirrors the `autoMergeUnsupportedReason` dedup pattern.
   */
  lastDirectMergeFailure?: { sha: string; method: MergeMethod; error: string };
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

  /**
   * Story 5.2-A — stale-approval state. `null` is the negative cache: detector
   * ran and found no stale-approval condition. Populated object describes the
   * current approvers and the cycle wall-clock at which the head SHA was last
   * observed to change. `undefined` means the detector hasn't run yet (e.g.
   * when `enablePushSinceApproval=false` or for newly-discovered PRs before
   * the first review fetch).
   */
  staleApproval?: { lastApprovedAt: number; lastPushedAt: number; approvers: string[] } | null;
  /** Last `head.sha` we saw for this PR. Compared across cycles to detect a push. */
  lastSeenHeadSha?: string;
  /** Wall-clock (`Date.now()`) at which `lastSeenHeadSha` was first observed to differ from the cached value. Used as `lastPushedAt` by the stale-approval detector. */
  lastHeadShaChangedAt?: number;

  // ── REVIEWER-AUTOMATIONS ──
  /**
   * Per-PR cache so the reviewer auto-merge gate doesn't re-fire the
   * enableAutoMerge mutation every poll cycle. Set when the gate fires;
   * cleared when the head SHA changes (re-review needed) so a fresh
   * approval re-arms the gate.
   */
  reviewerAutoMergeArmed?: { at: number };
  /**
   * The signed-in user's latest decisive review state on a reviewer-tab PR.
   * Computed in the reviewer phase using the same latest-decisive-per-login
   * filter as Story 5.2-A's stale-approval detector. Drives the row state
   * chip on the Reviewer tab.
   */
  myReviewState?: 'AWAITING' | 'APPROVED' | 'CHANGES_REQUESTED';

  /**
   * Set when the most recent `getPR` for this PR returned a malformed/empty
   * detail (e.g. GitHub search-1000-cap soft dropout). Prior state is
   * preserved on the record; next poll retries. Cleared on the next
   * successful detail fetch (state==='open' branch). UI may surface a
   * subtle "last fetch failed" indicator but should otherwise treat the
   * PR as still in its prior state.
   */
  lastFetchError?: { at: number; message: string };
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
