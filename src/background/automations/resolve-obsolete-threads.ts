// Story 2.8 — resolve review threads whose anchor line no longer exists.

export interface ResolveObsoleteThreadsSettings {
  enabled: boolean;
  /** "owner/repo" repos that should NOT have outdated threads auto-resolved. */
  optOutRepos: string[];
}

export interface PRRef {
  /** "owner/repo" */
  repo: string;
  number: number;
}

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  line: number | null;
}

export interface ResolveObsoleteThreadsDeps {
  listThreads(owner: string, repo: string, number: number): Promise<ReviewThread[]>;
  resolveThread(threadId: string): Promise<void>;
}

/** threadId → epoch ms when we auto-resolved it. */
export type ResolvedThreadsStore = Record<string, number>;

export interface ResolveObsoleteThreadsResult {
  resolved: number;
  skipped: number;
  failed: Array<{ threadId: string; error: string }>;
  /** Updated store — caller persists. */
  resolvedStore: ResolvedThreadsStore;
  /** Per-thread detail for activity-log entries. */
  resolvedEntries: Array<{ threadId: string; repo: string; prNumber: number }>;
}

export async function runResolveObsoleteThreads(
  prs: PRRef[],
  settings: ResolveObsoleteThreadsSettings,
  store: ResolvedThreadsStore,
  deps: ResolveObsoleteThreadsDeps,
  now: () => number = Date.now
): Promise<ResolveObsoleteThreadsResult> {
  const result: ResolveObsoleteThreadsResult = {
    resolved: 0,
    skipped: 0,
    failed: [],
    resolvedStore: { ...store },
    resolvedEntries: [],
  };

  if (!settings.enabled) return result;

  const optOut = new Set(settings.optOutRepos);

  for (const pr of prs) {
    if (optOut.has(pr.repo)) continue;
    const [owner, name] = pr.repo.split('/');
    let threads: ReviewThread[];
    try {
      threads = await deps.listThreads(owner, name, pr.number);
    } catch (err) {
      result.failed.push({
        threadId: `${pr.repo}#${pr.number}`,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const t of threads) {
      const obsolete =
        !t.isResolved && t.isOutdated && t.line === null && !result.resolvedStore[t.id];
      if (!obsolete) {
        result.skipped++;
        continue;
      }
      try {
        await deps.resolveThread(t.id);
        result.resolved++;
        result.resolvedStore[t.id] = now();
        result.resolvedEntries.push({ threadId: t.id, repo: pr.repo, prNumber: pr.number });
      } catch (err) {
        result.failed.push({
          threadId: t.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return result;
}
