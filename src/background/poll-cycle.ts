import type { PRRecord, PRState, PRStore, PullRequest } from '../core/types';
import type { AutomationSettings, PRRecordPhaseTwo } from '../core/automations-types';
import { computeIdleDays, resolveThreshold } from '../core/staleness';
import { getAuth, setInstallations } from '../core/auth-store';
import { suspendedOwners } from '../core/installations-helpers';
import { getUserInstallations } from '../github/endpoints/installations';
import { loadStore, saveStore, upsertPRs, pruneStale, stampPollTime } from '../core/pr-store';
import { getAutomationSettings, getResolvedThreads, saveResolvedThreads } from '../core/automations-store';
import { searchAuthoredPRs, getPR, updateBranch } from '../github/endpoints';
import { getRepo, getBranchHeadSHA } from '../github/endpoints/repos';
import { deleteRef } from '../github/endpoints/git-refs';
import { enablePullRequestAutoMerge } from '../github/endpoints/auto-merge';
import { mergePR } from '../github/endpoints/merge-pr';
import { listReviewThreads, resolveReviewThread } from '../github/endpoints/review-threads';
import { runAllAutomations, type OrchestratorDeps } from './automations/orchestrator';
import type { PullRequestDetail } from './automations/adapters';
import { clearBadge, setBadgeCount } from './badge';
import { deriveStateFromMergeable, mapUpdateBranchError, parseRepoUrl } from './state-machine';
import { appendActivity } from '../core/activity-log';
import type { ActivityEntry } from '../core/activity-log-types';
import { recordKnownRepos } from '../core/known-repos-store';

const ABORT_ERRORS = new Set(['AUTH_ERROR', 'NOT_AUTHENTICATED', 'RATE_LIMITED']);

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return ABORT_ERRORS.has(err.message);
  }
  return false;
}

/**
 * Story 5.1 — compute the `staleness` patch for a PR. Returns the metadata
 * when the PR is past its repo's threshold; `staleness: undefined` (clearing
 * any stored value) otherwise. Returns {} when staleness can't be computed
 * (no settings loaded, or no `updated_at` on the detail) so the PR's prior
 * staleness (if any) is preserved.
 */
function computeStalenessPatch(
  detail: PullRequest,
  fullName: string,
  settings: AutomationSettings | null,
): Partial<PRRecordPhaseTwo> {
  if (!settings || !detail.updated_at) return {};
  const lastActivityAt = Date.parse(detail.updated_at);
  if (Number.isNaN(lastActivityAt)) return {};
  const idleDays = computeIdleDays(lastActivityAt);
  const threshold = resolveThreshold(fullName, settings);
  if (idleDays < threshold) {
    return { staleness: undefined };
  }
  return { staleness: { idleDays, lastActivityAt } };
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
  let staleSettings: AutomationSettings | null = null;
  try {
    staleSettings = await getAutomationSettings();
    ignoredRepos = new Set(staleSettings.ignoredRepos ?? []);
  } catch (err) {
    console.warn('[poll-cycle] could not read automation settings; ignoring repo-ignore list', err);
  }

  // Story 4.5 — owners whose GitHub App installation is suspended. PRs in
  // these repos still display in the popup but DON'T get rebased / merged /
  // branch-deleted until the org admin re-approves the install.
  //
  // Audit B2 — refresh the installations list each poll so re-approval picks
  // up without forcing the user to sign out / sign in. Best-effort: a failed
  // fetch falls back to the cached list, treating its (possibly stale) state
  // as the current truth rather than blocking the cycle.
  let suspendedOwnerSet = new Set<string>();
  try {
    const auth = await getAuth();
    if (auth?.method === 'github_app') {
      try {
        const fresh = await getUserInstallations();
        await setInstallations(fresh);
        suspendedOwnerSet = suspendedOwners(fresh);
      } catch (err) {
        // Network / auth error — fall back to whatever we have stored.
        suspendedOwnerSet = suspendedOwners(auth.installations);
        console.warn('[poll-cycle] installations refresh failed; using cached list', err);
      }
    }
  } catch (err) {
    console.warn('[poll-cycle] could not read installations; treating all as active', err);
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
  const seenFullNames = new Set<string>();
  // BEHIND-1: per-cycle cache of base-branch HEAD SHAs keyed by
  // "owner/repo#branch". Multiple PRs sharing a base branch share one
  // network call (304 after the first via ETag).
  const baseHeadSHACache = new Map<string, string | null>();

  for (const item of searchResult.items) {
    // Parse repo
    let owner: string, repo: string, fullName: string;
    try {
      ({ owner, repo, fullName } = parseRepoUrl(item.repository_url));
    } catch (err) {
      console.error('Failed to parse repository_url:', item.repository_url, err);
      continue;
    }

    seenFullNames.add(fullName);

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
      // Same translation as mapUpdateBranchError: 403/404 on getPR is
      // overwhelmingly "App not installed on this repo".
      const friendly = msg.startsWith('HTTP_403') || msg.startsWith('HTTP_404')
        ? 'Auto Rebaser App not installed for this repo'
        : msg;
      processedPRs.push({
        id: item.id,
        number: item.number,
        title: item.title,
        repo: fullName,
        url: item.html_url,
        state: 'error',
        lastUpdated: Date.now(),
        errorMessage: friendly,
      });
      continue;
    }

    // Story 4.5 — installation suspended → never write. We still fetch PR
    // detail (so the popup can display state) but force the state machine
    // into a no-op.
    const ownerIsSuspended = suspendedOwnerSet.has(owner.toLowerCase());
    let derived = ownerIsSuspended
      ? { action: 'noop' as const, nextState: previousState }
      : deriveStateFromMergeable(pr.mergeable_state, previousState, pr.draft === true);

    // BEHIND-1: GitHub returns mergeable_state='blocked' or 'unstable' when
    // checks/reviews are pending, which masks a separately-true "behind base"
    // condition (see carelog #417). When the derivation lands us in 'pending',
    // independently check pr.base.sha against the live base branch HEAD; if
    // they differ, treat as behind and trigger a rebase.
    if (
      !ownerIsSuspended
      && derived.nextState === 'pending'
      && pr.base?.ref
      && pr.base.sha
    ) {
      const cacheKey = `${fullName}#${pr.base.ref}`;
      let baseSHA = baseHeadSHACache.get(cacheKey);
      if (baseSHA === undefined) {
        try {
          baseSHA = await getBranchHeadSHA(owner, repo, pr.base.ref);
        } catch {
          // Network/auth error fetching base branch — leave state as pending;
          // a rebase miss this cycle is preferable to surfacing a noisy error.
          baseSHA = null;
        }
        baseHeadSHACache.set(cacheKey, baseSHA);
      }
      if (baseSHA && baseSHA !== pr.base.sha) {
        derived = { action: 'rebase', nextState: 'behind' };
      }
    }

    const { action, nextState } = derived;

    let finalState: PRState = nextState;
    let errorMessage: string | undefined;

    // REBASE-OPT-OUT: skip the rebase API call when the global toggle is off
    // OR the repo is in the per-automation skip list. PR remains in 'behind'
    // state so the popup surfaces it visibly without our extension acting.
    const rebaseSkipped =
      action === 'rebase'
      && (
        staleSettings?.autoRebaseEnabled === false
        || (staleSettings?.autoRebaseOptOutRepos ?? []).includes(fullName)
      );

    if (action === 'rebase' && !rebaseSkipped) {
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
          prUrl: item.html_url,
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
          prUrl: item.html_url,
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
      ...computeStalenessPatch(pr, fullName, staleSettings),
      ...(pr.requested_reviewers !== undefined
        ? { requestedReviewers: pr.requested_reviewers.map((r) => r.login) }
        : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    } as PRRecord);
  }

  // Best-effort: persist the set of repos we saw in this scan.
  try {
    await recordKnownRepos([...seenFullNames]);
  } catch (err) {
    console.warn('[auto-rebaser] failed to record known repos', err);
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
  // Story 4.5 — suspended-installation PRs display but never write. Filter
  // them out before the orchestrator runs.
  const automationCandidates = processedPRs.filter((pr) => {
    const [owner] = pr.repo.split('/');
    return !suspendedOwnerSet.has(owner.toLowerCase());
  });
  await runAutomationsPass(automationCandidates, prDetails, updatedCount, rebaseActivityEntries);

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
      mergePR,
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
          prUrl: pr.url,
          result: 'success',
          ...(extended.headRef ? { branchRef: extended.headRef } : {}),
        });
      }

      if (patch.autoMergeEnabled === true) {
        const chosen = result.autoMergeMethodByPRId?.[prId];
        cycleEntries.push({
          at: now,
          action: 'auto_merge_enabled',
          repo: pr.repo,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.url,
          result: 'success',
          ...(chosen ? { mergeMethod: chosen } : {}),
        });
      }
    }

    // Story 2.7 — auto_merge_enabled failure entries.
    // Collapse duplicates within a single cycle: when multiple PRs in the
    // same repo hit the same error (e.g. "Auto merge is not allowed for
    // this repository"), emit one entry per (repo, errorMessage) using the
    // lowest-numbered PR as the representative. The link still goes to a
    // real PR; the message conveys the repo-wide condition.
    const autoMergeFailKeys = new Set<string>();
    const sortedFailures = [...(result.failedAutoMergeEntries ?? [])]
      .map((f) => ({ f, pr: prMap.get(f.prId) }))
      .filter((x): x is { f: typeof x.f; pr: PRRecord } => !!x.pr)
      .sort((a, b) => a.pr.number - b.pr.number);
    for (const { f, pr } of sortedFailures) {
      const key = `${pr.repo}|${f.error}`;
      if (autoMergeFailKeys.has(key)) continue;
      autoMergeFailKeys.add(key);
      cycleEntries.push({
        at: now,
        action: 'auto_merge_enabled',
        repo: pr.repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        result: 'failed',
        errorMessage: f.error,
      });
    }

    // MERGE-1 — auto_merge_enabled skipped entries (no-op responses from GitHub).
    for (const s of result.skippedAutoMergeEntries ?? []) {
      const pr = prMap.get(s.prId);
      if (!pr) continue;
      cycleEntries.push({
        at: now,
        action: 'auto_merge_enabled',
        repo: pr.repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        result: 'skipped',
        skipReason: s.skipReason,
      });
    }

    // MERGE-2 — auto_merged_now entries (fall-through direct merges).
    for (const m of result.mergedNowEntries ?? []) {
      const pr = prMap.get(m.prId);
      if (!pr) continue;
      cycleEntries.push({
        at: now,
        action: 'auto_merged_now',
        repo: pr.repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        result: m.result,
        mergeMethod: m.method,
        ...(m.error ? { errorMessage: m.error } : {}),
      });
    }

    // Story 2.8 — thread_resolved entries.
    const prByRepoNumber = new Map<string, PRRecord>(
      processedPRs.map((p) => [`${p.repo}#${p.number}`, p]),
    );
    for (const t of result.resolvedThreadEntries ?? []) {
      const pr = prByRepoNumber.get(`${t.repo}#${t.prNumber}`);
      cycleEntries.push({
        at: now,
        action: 'thread_resolved',
        repo: t.repo,
        prNumber: t.prNumber,
        prTitle: pr?.title ?? '',
        ...(pr?.url ? { prUrl: pr.url } : {}),
        result: 'success',
        threadId: t.threadId,
      });
    }
    for (const t of result.failedThreadEntries ?? []) {
      const pr = prByRepoNumber.get(`${t.repo}#${t.prNumber}`);
      cycleEntries.push({
        at: now,
        action: 'thread_resolved',
        repo: t.repo,
        prNumber: t.prNumber,
        prTitle: pr?.title ?? '',
        ...(pr?.url ? { prUrl: pr.url } : {}),
        result: 'failed',
        threadId: t.threadId,
        errorMessage: t.error,
      });
    }

    // Write all this cycle's entries in one storage call.
    await appendActivity(cycleEntries);
  } catch (err) {
    console.error('[poll-cycle] automation pass failed:', err);
    // Swallow — next cycle will retry.
  }
}
