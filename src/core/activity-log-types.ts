// Story 5.6 — Activity log types.
// Exported for use by poll-cycle, popup, and future automations (5.1 reviewer ping).

export type ActivityAction =
  | 'rebase'
  | 'branch_deleted'
  | 'auto_merge_enabled'
  | 'thread_resolved'
  | 'notification_dismissed'
  | 'reviewer_pinged';

export type ActivityEntry = {
  at: number;           // epoch ms
  action: ActivityAction;
  repo: string;         // "owner/repo"
  prNumber: number;
  prTitle: string;      // captured at action time (titles change)
  result: 'success' | 'failed';
  errorMessage?: string;
  branchRef?: string;                         // for branch_deleted
  mergeMethod?: 'SQUASH' | 'MERGE' | 'REBASE'; // for auto_merge_enabled
  threadId?: string;                          // for thread_resolved
  reviewers?: string[];                       // for reviewer_pinged (Track 2C)
  prUrl?: string;                             // absolute URL to the PR; entry row links to this
};

export type ActivityStore = { entries: ActivityEntry[] };

/** Storage key for chrome.storage.local. */
export const ACTIVITY_STORAGE_KEY = 'activity';

/** Max entries to retain in storage. */
export const ACTIVITY_MAX_ENTRIES = 200;

/** Max age in milliseconds (30 days). */
export const ACTIVITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
