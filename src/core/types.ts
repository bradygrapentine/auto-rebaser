// Shared types used across all modules. No DOM, no chrome API references.

export type PRState =
  | 'current'
  | 'behind'
  | 'updating'
  | 'updated'
  | 'conflict'
  | 'needs-manual'
  | 'error'
  /** PR was open last poll, now closed-and-merged on GitHub. Carried for one cycle so Phase 2 automations (2.6, 2.9) can run against it before pruning. */
  | 'merged'
  /** PR was open last poll, now closed-without-merge on GitHub. Carried for one cycle so 2.9 can dismiss its notification before pruning. */
  | 'closed';

export interface PRRecord {
  id: number;
  number: number;
  title: string;
  /** "owner/repo" — denormalized for display. */
  repo: string;
  url: string;
  state: PRState;
  /** Epoch milliseconds of the last state change. */
  lastUpdated: number;
  errorMessage?: string;
}

export interface PRStore {
  prs: PRRecord[];
  /** Epoch milliseconds. Null until first poll completes. */
  lastPollAt: number | null;
  /**
   * Phase 2 — last cycle's automation summary. Read by the popup's PollSummaryFooter.
   * Optional so v1-only state files keep loading without migration.
   */
  lastPollSummary?: import('./automations-types').PollSummary;
  /**
   * Set true at the start of a poll cycle, cleared on completion (or error).
   * Drives the spinning refresh icon in the popup header.
   */
  pollInProgress?: boolean;
  /**
   * Most recent successful branch deletion. Persisted across cycles so the
   * popup can show "Last deleted: org/repo `branch-name`" as long-lived
   * status without a separate counter.
   */
  lastDeletedBranch?: {
    repo: string;
    ref: string;
    /** Epoch ms when the deletion succeeded. */
    deletedAt: number;
  };
}

export type IntervalMinutes = 1 | 2 | 5 | 10 | 15 | 30 | 60 | 120 | 240;

export interface Settings {
  intervalMinutes: IntervalMinutes;
}

// GitHub API response types — keep here so non-github modules don't need to import from src/github/.

export interface SearchPRItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  /** Format: "https://api.github.com/repos/{owner}/{repo}". */
  repository_url: string;
}

export interface SearchResult {
  items: SearchPRItem[];
}

/**
 * GitHub returns `mergeable_state` as one of: behind, dirty, clean, blocked,
 * draft, has_hooks, unstable, unknown. We type it as a string union plus
 * `string` fallback in case GitHub adds new values.
 */
export type MergeableState =
  | 'behind'
  | 'dirty'
  | 'clean'
  | 'blocked'
  | 'draft'
  | 'has_hooks'
  | 'unstable'
  | 'unknown'
  | (string & {});

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  mergeable_state: MergeableState;
  base: { repo: { full_name: string } };
  /** Open vs closed. Returned by GitHub on every PR detail. */
  state?: 'open' | 'closed';
  /** True when a closed PR was merged. */
  merged?: boolean;
  /** ISO timestamp when the PR was merged, or null/undefined. */
  merged_at?: string | null;
  /** ISO timestamp of the most recent activity (commits, comments, reviews). Story 5.1. */
  updated_at?: string;
  /** Reviewers requested but not yet reviewing. Story 5.1 — needed to know whom to @-mention on ping. */
  requested_reviewers?: Array<{ login: string }>;
  /** GraphQL node_id — needed for Story 2.7 (enable auto-merge). */
  node_id?: string;
  draft?: boolean;
  auto_merge?: { enabled?: boolean } | null;
  head?: {
    ref?: string;
    repo?: { full_name?: string } | null;
  };
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

// Message types for chrome.runtime.sendMessage.

export type RuntimeMessage =
  | { type: 'POLL_NOW' }
  | { type: 'SET_INTERVAL'; intervalMinutes: IntervalMinutes }
  | { type: 'REAUTH'; scopes?: string[] };

export interface RuntimeResponse {
  ok: boolean;
  error?: string;
}

// HTTP error sentinel codes thrown by github/http.ts and consumed by background/state-machine.ts.

export type HttpErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'AUTH_ERROR'        // 401 / 403
  | 'RATE_LIMITED'      // 429
  | 'HTTP_409'
  | 'HTTP_422'
  | `HTTP_${number}`;
