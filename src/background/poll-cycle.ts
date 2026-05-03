import type { PRRecord, PRState, PRStore, PullRequest } from '../core/types';
import type { PRRecordPhaseTwo } from '../core/automations-types';
import { loadStore, saveStore, upsertPRs, pruneStale, stampPollTime } from '../core/pr-store';
import { getAutomationSettings, getResolvedThreads, saveResolvedThreads } from '../core/automations-store';
import { searchAuthoredPRs, getPR, updateBranch } from '../github/endpoints';
import { getRepo } from '../github/endpoints/repos';
import { deleteRef } from '../github/endpoints/git-refs';
import { enablePullRequestAutoMerge } from '../github/endpoints/auto-merge';
import { listReviewThreads, resolveReviewThread } from '../github/endpoints/review-threads';
import {
  listNotifications as listNotificationThreads,
  markThreadRead,
  unsubscribeThread,
} from '../github/endpoints/notifications';
import { runAllAutomations, type OrchestratorDeps } from './automations/orchestrator';
import type { PullRequestDetail } from './automations/adapters';
import { clearBadge, setBadgeCount } from './badge';
import { deriveStateFromMergeable, mapUpdateBranchError, parseRepoUrl } from './state-machine';
import { appendActivity } from '../core/activity-log';
import type { ActivityEntry } from '../core/activity-log-types';

const ABORT_ERRORS = new Set(['AUTH_ERROR', 'NOT_AUTHENTICATED', 'RATE_LIMITED']);

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return ABORT_ERRORS.has(err.message);
  }
  return false;
}

/** Flips PRStore.pollInProgress without going through upsert (avoids racing the store). */
async function setPollInProgress(value: boolean): Promise<void> {
  const store = await loadStore();
  await saveStore({ ...store, pollInProgress: value });
}

export async function runPollCycle(): Promise<void> {
  clearBadge();
  await setPollInProgress(true);

  try {
    return await runPollCycleInner();
  } finally {
    await setPollInProgress(false);
  }
}

async function runPollCycleInner(): Promise<void> {
  // Load automation settings first — `ignoredRepos` filters BOTH the rebase
  // loop and the orchestrator pass, so it has to be available before either.
  // Failure to load defaults to "no repos ignored", matching current behavior.
  let ignoredRepos = new Set<string>();
  try {
    const settings = await getAutomationSettings();
    ignoredRepos = new Set(settings.ignoredRepos ?? []);
  } catch (err) {
    console.warn('[poll-cycle] could not read automation settings; ignoring repo-ignore list', err);
  }

  // Step 2: search
  let searchResult;
  try {
    searchResult = await searchAuthoredPRs();
  } catch (err) {
    // RATE_LIMITED, NOT_AUTHENTICATED, AUTH_ERROR — abort
    return;
  }

  // Load store once before loop
  const store = await loadStore();
  const storeMap = new Map(store.prs.map((pr) => [pr.id, pr]));

  const processedPRs: PRRecord[] = [];
  const prDetails = new Map<number, PullRequest>();
  let updatedCount = 0;
  // Collect per-PR rebase activity entries for the activity log.
  const rebaseActivityEntries: ActivityEntry[] = [];

  for (const item of searchResult.items) {
    // Parse repo
    let owner: string, repo: string, fullName: string;
    try {
      ({ owner, repo, fullName } = parseRepoUrl(item.repository_url));
    } catch (err) {
      console.error('Failed to parse repository_url:', item.repository_url, err);
      continue;
    }

    // Globally ignored repo → drop entirely. PR will not enter the store, will
    // not be displayed in the popup, will not be rebased, and (since it never
    // makes it into processedPRs) will be evicted from the store by pruneStale.
    if (ignoredRepos.has(fullName)) continue;

    const previousState: PRState = storeMap.get(item.id)?.state ?? 'current';

    // Fetch PR
    let pr: PullRequest;
    try {
      pr = await getPR(owner, repo, item.number);
      prDetails.set(item.id, pr);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      processedPRs.push({
        id: item.id,
        number: item.number,
        title: item.title,
        repo: fullName,
        url: item.html_url,
        state: 'error',
        lastUpdated: Date.now(),
        errorMessage: msg,
      });
      continue;
    }

    const { action, nextState } = deriveStateFromMergeable(pr.mergeable_state, previousState);

    let finalState: PRState = nextState;
    let errorMessage: string | undefined;

    if (action === 'rebase') {
      try {
        await updateBranch(owner, repo, item.number);
        finalState = 'updated';
        updatedCount++;
        rebaseActivityEntries.push({
          at: Date.now(),
          action: 'rebase',
          repo: fullName,
          prNumber: item.number,
          prTitle: item.title,
          result: 'success',
        });
      } catch (err) {
        let mapped;
        try {
          mapped = mapUpdateBranchError(err);
        } catch (rethrown) {
          // AUTH_ERROR or RATE_LIMITED re-thrown — abort cycle
          return;
        }
        finalState = mapped.state;
        errorMessage = mapped.errorMessage;
        rebaseActivityEntries.push({
          at: Date.now(),
          action: 'rebase',
          repo: fullName,
          prNumber: item.number,
          prTitle: item.title,
          result: 'failed',
          errorMessage: mapped.errorMessage,
        });
      }
    }

    // Carry forward Phase-2 fields (branchDeleted, autoMergeEnabled, nodeId, …)
    // from the prior record so the orchestrator can gate on them next cycle.
    // Drop the prior v1 fields that this loop owns (state/lastUpdated/errorMessage).
    const carriedPhaseTwo: Partial<PRRecord & PRRecordPhaseTwo> = storeMap.get(item.id) ?? {};
    const { state: _s, lastUpdated: _u, errorMessage: _e, id: _i, number: _n,
            title: _t, repo: _r, url: _ur, ...phaseTwoCarry } = carriedPhaseTwo;

    processedPRs.push({
      ...phaseTwoCarry,
      id: item.id,
      number: item.number,
      title: item.title,
      repo: fullName,
      url: item.html_url,
      state: finalState,
      lastUpdated: Date.now(),
      // Pull Phase-2 fields the detail can refresh.
      ...(pr.node_id !== undefined ? { nodeId: pr.node_id } : {}),
      ...(pr.head?.ref !== undefined ? { headRef: pr.head.ref } : {}),
      ...(pr.head?.repo?.full_name !== undefined
        ? { sameRepo: pr.head.repo.full_name === fullName }
        : {}),
      ...(pr.draft !== undefined ? { isDraft: pr.draft } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    } as PRRecord);
  }

  // ── Transition detection: PRs open last poll, absent from search now ────────
  // searchAuthoredPRs() now paginates the entire result set, so the previous
  // "skip if 100+ items" guard is no longer needed: any PR not in the full
  // aggregated search has genuinely transitioned (or hit the GitHub 1000-result
  // cap, which is not addressable here).
  const currentSearchIds = new Set(searchResult.items.map(i => i.id));

  // Two retransition cohorts:
  //  1. New transitions: was open last cycle, absent from search now.
  //  2. Pending deletions: previously detected as 'merged' but branch deletion
  //     hasn't yet succeeded — re-fetch and re-feed orchestrator until it does.
  //     Without this, a transient deleteRef 5xx becomes permanent failure.
  const transitionedFromOpen = store.prs.filter(p =>
    p.state !== 'merged' && p.state !== 'closed' && !currentSearchIds.has(p.id)
      && !ignoredRepos.has(p.repo)
  );
  const pendingDeletion = store.prs.filter(p =>
    p.state === 'merged' && !(p as PRRecord & PRRecordPhaseTwo).branchDeleted
      && !ignoredRepos.has(p.repo)
  );
  const toReprocess = [...transitionedFromOpen, ...pendingDeletion];

  for (const prev of toReprocess) {
    const [owner, repo] = prev.repo.split('/');
    if (!owner || !repo) continue;

    let detail: PullRequest;
    try {
      detail = await getPR(owner, repo, prev.number);
      prDetails.set(prev.id, detail);
    } catch (err) {
      if (isAbortError(err)) return;
      // Transient (5xx, network) or 404. Either way, preserve the prior
      // record so pruneStale doesn't drop it — Phase-2 work for this PR
      // is incomplete and we want a retry next cycle. Genuinely-deleted
      // PRs (404) will be handled by GitHub eventually returning a deleted
      // sentinel or falling out of the prior store organically.
      processedPRs.push({ ...prev, lastUpdated: Date.now() } as PRRecord);
      continue;
    }

    // Only stamp merged/closed when GitHub agrees the PR is actually closed.
    // If detail.state is 'open', the PR is still open and was just hidden from
    // search (e.g., GitHub Search API's 1000-result cap). Preserve the prior
    // open record — pruneStale won't drop it now that we re-pushed it.
    const carry = prev as PRRecord & PRRecordPhaseTwo;

    if (detail.state === 'open') {
      processedPRs.push({ ...carry, lastUpdated: Date.now() } as PRRecord);
      continue;
    }

    const merged = detail.merged === true || detail.merged_at != null;
    const mergedAtMs = detail.merged_at ? Date.parse(detail.merged_at) : carry.mergedAt;

    processedPRs.push({
      ...carry,
      state: merged ? 'merged' : 'closed',
      lastUpdated: Date.now(),
      ...(merged && mergedAtMs ? { mergedAt: mergedAtMs } : {}),
      ...(detail.head?.ref !== undefined ? { headRef: detail.head.ref } : {}),
      ...(detail.head?.repo?.full_name !== undefined
        ? { sameRepo: detail.head.repo.full_name === prev.repo }
        : {}),
    } as PRRecord);
  }

  // Step 4: persist v1 rebase results
  await upsertPRs(processedPRs);
  await pruneStale(processedPRs.map((p) => p.id));
  await stampPollTime();

  // Step 4.5: phase-2 automations (best-effort; never blocks the next poll)
  await runAutomationsPass(processedPRs, prDetails, updatedCount, rebaseActivityEntries);

  // Step 5: badge
  setBadgeCount(updatedCount);
}

/**
 * Phase 2 automation pass. Runs after the rebase pass has persisted PR state.
 * Wraps the entire orchestrator call in a try/catch — if it throws unexpectedly,
 * we log and let the next poll cycle retry. Never block the v1 rebase loop.
 */
async function runAutomationsPass(
  processedPRs: PRRecord[],
  prDetails: Map<number, PullRequest>,
  rebasedCount: number,
  rebaseActivityEntries: ActivityEntry[] = [],
): Promise<void> {
  try {
    const settings = await getAutomationSettings();
    const resolvedThreads = await getResolvedThreads();

    const deps: OrchestratorDeps = {
      getRepo,
      deleteRef,
      enableAutoMerge: enablePullRequestAutoMerge,
      listThreads: listReviewThreads,
      resolveThread: resolveReviewThread,
      listNotifications: async () => {
        const threads = await listNotificationThreads();
        return threads.map((t) => ({
          threadId: t.id,
          prApiUrl: t.subject.url,
          subjectType: t.subject.type,
        }));
      },
      markRead: markThreadRead,
      unsubscribe: unsubscribeThread,
    };

    const result = await runAllAutomations({
      prs: processedPRs,
      prDetails: prDetails as Map<number, PullRequestDetail>,
      settings,
      resolvedThreads,
      github: deps,
    });

    // Apply prUpdates: merge each patch into its corresponding PR record.
    if (result.prUpdates.length > 0) {
      const patches = new Map<number, Partial<PRRecord & PRRecordPhaseTwo>>();
      for (const { prId, patch } of result.prUpdates) {
        patches.set(prId, { ...(patches.get(prId) ?? {}), ...patch });
      }
      const patched: PRRecord[] = processedPRs.map((pr) => {
        const patch = patches.get(pr.id);
        return patch ? ({ ...pr, ...patch } as PRRecord) : pr;
      });
      await upsertPRs(patched);
    }

    // Persist resolvedThreads (only if changed — orchestrator returns same ref when untouched).
    if (result.resolvedThreads !== resolvedThreads) {
      await saveResolvedThreads(result.resolvedThreads);
    }

    // Capture the most-recently-deleted branch (if any) for the popup footer.
    let lastDeletedBranch: PRStore['lastDeletedBranch'] | undefined;
    const branchDeletes = result.prUpdates.filter((u) => u.patch.branchDeleted === true);
    if (branchDeletes.length > 0) {
      const last = branchDeletes[branchDeletes.length - 1];
      const lastPR = processedPRs.find((p) => p.id === last.prId) as
        | (PRRecord & PRRecordPhaseTwo)
        | undefined;
      if (lastPR?.headRef) {
        lastDeletedBranch = {
          repo: lastPR.repo,
          ref: lastPR.headRef,
          deletedAt: Date.now(),
        };
      }
    }

    // Persist the summary, stamping in the rebase count from this cycle.
    const store = await loadStore();
    const next: PRStore = {
      ...store,
      lastPollSummary: { ...result.summary, rebased: rebasedCount },
      ...(lastDeletedBranch !== undefined ? { lastDeletedBranch } : {}),
    };
    await saveStore(next);

    console.log('automations: ran', { ...next.lastPollSummary, errors: result.summary.errors });

    // ── Mint ActivityEntry[] from this cycle's results (one write per cycle) ──
    const prMap = new Map<number, PRRecord>(processedPRs.map((p) => [p.id, p]));
    const now = Date.now();
    const cycleEntries: ActivityEntry[] = [...rebaseActivityEntries];

    // Track 1C will replace `autoMergeMethod` with `mergeMethodPreference`.
    // Until then, read the existing single-value setting.
    const autoMergeMethod: ActivityEntry['mergeMethod'] | undefined =
      settings.autoMergeMethod;

    for (const { prId, patch } of result.prUpdates) {
      const pr = prMap.get(prId);
      if (!pr) continue;

      if (patch.branchDeleted === true) {
        const extended = pr as PRRecord & PRRecordPhaseTwo;
        cycleEntries.push({
          at: now,
          action: 'branch_deleted',
          repo: pr.repo,
          prNumber: pr.number,
          prTitle: pr.title,
          result: 'success',
          ...(extended.headRef ? { branchRef: extended.headRef } : {}),
        });
      }

      if (patch.autoMergeEnabled === true) {
        cycleEntries.push({
          at: now,
          action: 'auto_merge_enabled',
          repo: pr.repo,
          prNumber: pr.number,
          prTitle: pr.title,
          result: 'success',
          ...(autoMergeMethod ? { mergeMethod: autoMergeMethod } : {}),
        });
      }
    }

    // Write all this cycle's entries in one storage call.
    await appendActivity(cycleEntries);
  } catch (err) {
    console.error('[poll-cycle] automation pass failed:', err);
    // Swallow — next cycle will retry.
  }
}
