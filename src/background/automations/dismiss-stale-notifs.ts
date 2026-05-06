// Story 2.9 — mark PR notifications read once the PR is closed/merged.

export interface DismissStaleNotifsSettings {
  enabled: boolean;
  unsubscribe: boolean;
  /** Set false when the OAuth token lacks the `notifications` scope. */
  scopeGranted: boolean;
  /** "owner/repo" repos whose notifications should NOT be auto-dismissed. */
  optOutRepos: string[];
}

export interface NotificationInput {
  threadId: string;
  /** API URL like https://api.github.com/repos/{o}/{r}/pulls/{n}, or null. */
  prApiUrl: string | null;
  subjectType: string;
}

/** Map "owner/repo#number" → PR state, derived from caller's PR store. */
export type PRStateMap = Record<string, 'open' | 'closed' | 'merged'>;

export interface DismissStaleNotifsDeps {
  markRead(threadId: string): Promise<void>;
  unsubscribe(threadId: string): Promise<void>;
}

export interface DismissStaleNotifsResult {
  dismissed: number;
  unsubscribed: number;
  skipped: number;
  failed: Array<{ threadId: string; error: string }>;
  scopeMissing: boolean;
  /** Per-notification detail for activity-log entries. */
  dismissedEntries: Array<{ threadId: string; repo: string; prNumber: number; unsubscribed: boolean }>;
  /** Per-notification failure detail for activity-log entries. */
  failedEntries: Array<{ threadId: string; repo: string; prNumber: number; error: string }>;
}

const PR_URL_RE =
  /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/;

export async function runDismissStaleNotifs(
  notifications: NotificationInput[],
  settings: DismissStaleNotifsSettings,
  prStates: PRStateMap,
  deps: DismissStaleNotifsDeps
): Promise<DismissStaleNotifsResult> {
  const result: DismissStaleNotifsResult = {
    dismissed: 0,
    unsubscribed: 0,
    skipped: 0,
    failed: [],
    scopeMissing: false,
    dismissedEntries: [],
    failedEntries: [],
  };

  if (!settings.enabled) return result;
  if (!settings.scopeGranted) {
    result.scopeMissing = true;
    return result;
  }

  const optOut = new Set(settings.optOutRepos);

  for (const n of notifications) {
    if (n.subjectType !== 'PullRequest' || !n.prApiUrl) {
      result.skipped++;
      continue;
    }
    const m = PR_URL_RE.exec(n.prApiUrl);
    if (!m) {
      result.skipped++;
      continue;
    }
    if (optOut.has(`${m[1]}/${m[2]}`)) {
      result.skipped++;
      continue;
    }
    const key = `${m[1]}/${m[2]}#${m[3]}`;
    const state = prStates[key];
    if (state !== 'closed' && state !== 'merged') {
      // Either still open, or not in the user's authored set — never touch.
      result.skipped++;
      continue;
    }

    try {
      await deps.markRead(n.threadId);
      result.dismissed++;
      let didUnsubscribe = false;
      if (settings.unsubscribe) {
        try {
          await deps.unsubscribe(n.threadId);
          result.unsubscribed++;
          didUnsubscribe = true;
        } catch (err) {
          const errorMsg = `unsubscribe: ${err instanceof Error ? err.message : String(err)}`;
          result.failed.push({ threadId: n.threadId, error: errorMsg });
          result.failedEntries.push({
            threadId: n.threadId,
            repo: `${m[1]}/${m[2]}`,
            prNumber: Number(m[3]),
            error: errorMsg,
          });
        }
      }
      result.dismissedEntries.push({
        threadId: n.threadId,
        repo: `${m[1]}/${m[2]}`,
        prNumber: Number(m[3]),
        unsubscribed: didUnsubscribe,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      result.failed.push({ threadId: n.threadId, error: errorMsg });
      result.failedEntries.push({
        threadId: n.threadId,
        repo: `${m[1]}/${m[2]}`,
        prNumber: Number(m[3]),
        error: errorMsg,
      });
    }
  }

  return result;
}
