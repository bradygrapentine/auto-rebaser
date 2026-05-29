import type { PRRecord, PRState, PRStore, PullRequest } from '../core/types';
import type { AutomationSettings, PRRecordPhaseTwo } from '../core/automations-types';
import { computeIdleDays, resolveThreshold } from '../core/staleness';
import { getAuth, setInstallations } from '../core/auth-store';
import { AccountScope } from '../core/account-scope';
import { suspendedOwners } from '../core/installations-helpers';
import { getUserInstallations } from '../github/endpoints/installations';
import {
  loadStore,
  saveStore,
  upsertPRs,
  pruneStale,
  stampPollTime,
  loadReviewerStore,
  upsertReviewerPRs,
  pruneStaleReviewer,
} from '../core/pr-store';
import {
  getAutomationSettings,
  getResolvedThreads,
  saveResolvedThreads,
  saveAutomationSettings,
} from '../core/automations-store';
import { searchAuthoredPRs, getPR, updateBranch, getAuthenticatedUser } from '../github/endpoints';
import { searchReviewerPRs } from '../github/endpoints/reviewer-search';
import { getPRReviewDecision } from '../github/endpoints/pr-review-decision';
import { evaluateReviewerAutoMergeGate } from '../core/reviewer-auto-merge-gate';
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
import { notify, type NotifEvent } from './notifications';
import { listReviews } from '../github/endpoints/reviews';
import { detectStaleApproval, type StaleApprovalResult } from '../core/stale-approval';
import { recordKnownRepos } from '../core/known-repos-store';
import { listAccountIds } from '../core/storage/multi-account';
import { isPRActionable } from '../core/actionable-pr';

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

/** Flips PRStore.pollInProgress without going through upsert (avoids racing the store).
 *  Threads AccountScope explicitly — no override consulted. */
async function setPollInProgress(value: boolean, scope?: AccountScope): Promise<void> {
  const store = scope ? await scope.loadStore() : await loadStore();
  if (scope) {
    await scope.saveStore({ ...store, pollInProgress: value });
  } else {
    await saveStore({ ...store, pollInProgress: value });
  }
}

export async function runPollCycle(): Promise<void> {
  // Wave B1 — multi-account loop. Iterates every signed-in account, polling
  // each in turn, with per-account error isolation so one account's 401 /
  // rate-limit doesn't take down siblings.
  //
  // An AccountScope is constructed per iteration and passed into
  // runPollCycleInner. The Scope owns the per-account routing — no
  // module-level override is consulted, so SW eviction can't desync the
  // loop's account binding mid-cycle.
  const ids = await listAccountIds();

  // Fresh-install / pre-migration path — no accounts namespace yet. Run once
  // against the v1 fallback (the transition helpers in multi-account.ts do
  // the right thing).
  if (ids.length === 0) {
    clearBadge();
    await setPollInProgress(true);
    try {
      await runPollCycleInner();
    } finally {
      await setPollInProgress(false);
    }
    return;
  }

  clearBadge();
  let totalRebased = 0;
  for (const id of ids) {
    const scope = new AccountScope(id);
    try {
      await setPollInProgress(true, scope);
      try {
        const rebasedThisAccount = await runPollCycleInner(scope);
        totalRebased += rebasedThisAccount;
      } finally {
        await setPollInProgress(false, scope);
      }
    } catch (err) {
      console.warn(`[poll-cycle] account ${id} failed:`, err);
    }
  }
  // Aggregate badge across accounts (B1: total rebased this cycle).
  if (totalRebased > 0) setBadgeCount(totalRebased);
}

async function runPollCycleInner(scope?: AccountScope): Promise<number> {
  // When `scope` is set, all per-account reads/writes route through it;
  // when undefined (fresh-install path, before any account namespace exists)
  // we fall through to the implicit-id helpers. `accountId` is the raw
  // string form needed by GitHub endpoint fns (which aren't on AccountScope).
  const accountId: string | undefined = scope?.id;

  // Load automation settings first — `ignoredRepos` filters BOTH the rebase
  // loop and the orchestrator pass, so it has to be available before either.
  // Failure to load defaults to "no repos ignored", matching current behavior.
  let ignoredRepos = new Set<string>();
  let staleSettings: AutomationSettings | null = null;
  try {
    staleSettings = await (scope ? scope.getAutomationSettings() : getAutomationSettings());
    ignoredRepos = staleSettings.enableIgnoredRepos === false
      ? new Set<string>()
      : new Set(staleSettings.ignoredRepos ?? []);
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
    const auth = await (scope ? scope.getAuth() : getAuth());
    if (auth?.method === 'github_app') {
      try {
        const fresh = await getUserInstallations(accountId);
        await (scope ? scope.setInstallations(fresh) : setInstallations(fresh));
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
    searchResult = await searchAuthoredPRs(accountId);
  } catch (err) {
    // RATE_LIMITED, NOT_AUTHENTICATED, AUTH_ERROR — abort
    return 0;
  }

  // Load store once before loop
  const store = await (scope ? scope.loadStore() : loadStore());
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
      pr = await getPR(owner, repo, item.number, accountId);
      prDetails.set(item.id, pr);
    } catch (err) {
      if (isAbortError(err)) {
        return 0;
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
          baseSHA = await getBranchHeadSHA(owner, repo, pr.base.ref, accountId);
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
        await updateBranch(owner, repo, item.number, accountId);
        updatedCount++;
        // Re-fetch the PR so the post-rebase mergeable_state can override the
        // transient 'updated' label when there's still a real blocker (failing
        // required check, unresolved review threads → 'blocked'/'unstable').
        // Without this, the popup shows '[updated]' on a PR that GitHub
        // refuses to merge, hiding the blocker for one poll cycle. If the
        // re-fetch returns 'unknown' (GitHub still computing post-rebase) or
        // throws, keep 'updated' as a best-effort affirmation.
        let postRebaseState: PRState = 'updated';
        try {
          const postRebasePr = await getPR(owner, repo, item.number, accountId);
          if (postRebasePr.mergeable_state !== 'unknown') {
            const reDerived = deriveStateFromMergeable(
              postRebasePr.mergeable_state,
              'updated',
              postRebasePr.draft === true,
            );
            // Only keep the 'updated' affirmation when the PR is actually
            // mergeable now (clean → reDerived='current'). Any other state
            // (blocked/unstable/dirty/draft) wins so the user sees the real
            // status instead of a misleading "I just helped you" label.
            if (reDerived.nextState !== 'current') {
              postRebaseState = reDerived.nextState;
            }
          }
        } catch {
          // Re-fetch failed (rate limit, network) — fall back to transient 'updated'.
        }
        finalState = postRebaseState;
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
          return 0;
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

    // ── Story 5.2-A — stale-approval detection ──
    let staleApprovalPatch: Partial<PRRecord & PRRecordPhaseTwo> = {};
    if (staleSettings?.enablePushSinceApproval && pr.head?.sha) {
      const newSha = pr.head.sha;
      const cachedSha = phaseTwoCarry.lastSeenHeadSha;
      const cachedStaleApproval = phaseTwoCarry.staleApproval;
      const headChanged = cachedSha !== newSha;
      const cachedChangedAt = phaseTwoCarry.lastHeadShaChangedAt;

      // First observation (no cached SHA): just initialize the carry — do NOT
      // run the detector. Any pre-existing approvals would be reported stale
      // against `now` as the push boundary, badging every approved-and-pushed
      // PR in the user's history. Wait for a real SHA transition to detect.
      if (cachedSha == null) {
        staleApprovalPatch = {
          lastSeenHeadSha: newSha,
          lastHeadShaChangedAt: Date.now(),
          staleApproval: null,
        };
      } else if (!headChanged && cachedStaleApproval !== undefined) {
        // Steady-state: head SHA unchanged AND we already have a verdict
        // (including the explicit `null` negative cache). Carry both forward,
        // no API call.
        staleApprovalPatch = {
          lastSeenHeadSha: newSha,
          ...(cachedChangedAt != null ? { lastHeadShaChangedAt: cachedChangedAt } : {}),
          staleApproval: cachedStaleApproval,
        };
      } else {
        // Either head SHA changed since last cycle, or we have a cached SHA
        // but no verdict yet (rare crash-recovery path). Stamp the cycle
        // wall-clock as the push moment and run the detector.
        const lastHeadShaChangedAt = headChanged ? Date.now() : (cachedChangedAt ?? Date.now());
        let staleApproval: StaleApprovalResult | null = null;
        try {
          const reviews = await listReviews(owner, repo, item.number, accountId);
          staleApproval = detectStaleApproval({
            lastPushedAt: lastHeadShaChangedAt,
            reviews,
          });
        } catch (err) {
          console.warn('[auto-rebaser] listReviews failed:', err);
          // On error, don't poison the cache — leave staleApproval undefined so
          // we retry next cycle.
        }
        staleApprovalPatch = {
          lastSeenHeadSha: newSha,
          lastHeadShaChangedAt,
          staleApproval,
        };
      }
    } else if (!staleSettings?.enablePushSinceApproval) {
      // Toggle OFF — preserve any existing fields verbatim (don't clear; user
      // may toggle back on and we want the cached verdict to still be there).
    }

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
      ...staleApprovalPatch,
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    } as PRRecord);
  }

  // Best-effort: persist the set of repos we saw in this scan.
  try {
    await (scope ? scope.recordKnownRepos([...seenFullNames]) : recordKnownRepos([...seenFullNames]));
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
      detail = await getPR(owner, repo, prev.number, accountId);
      prDetails.set(prev.id, detail);
    } catch (err) {
      if (isAbortError(err)) return 0;
      const msg = err instanceof Error ? err.message : String(err);
      // A 404 on a PR that's ABSENT from the open-authored search is
      // authoritative: the PR is closed/merged or gone. It cannot be a
      // 1000-result search-cap artifact — a cap-dropped *open* PR returns 200
      // on direct fetch, not 404. Stamp it closed so a stale chip (e.g. a
      // legacy `needs-manual` showing as `[manual]`) doesn't freeze forever.
      // Don't downgrade an already-merged record (the pendingDeletion re-fetch
      // path also lands here).
      if (msg.startsWith('HTTP_404') && prev.state !== 'merged' && prev.state !== 'closed') {
        processedPRs.push({
          ...(prev as PRRecord & PRRecordPhaseTwo),
          state: 'closed',
          lastUpdated: Date.now(),
          lastFetchError: undefined,
        } as PRRecord);
        continue;
      }
      // Transient (5xx, network) or ambiguous (403). Preserve the prior record
      // so pruneStale doesn't drop it — Phase-2 work for this PR is incomplete
      // and we want a retry next cycle.
      processedPRs.push({ ...prev, lastUpdated: Date.now() } as PRRecord);
      continue;
    }

    // Only stamp merged/closed when GitHub *affirmatively* says the PR is
    // closed or merged. A malformed/empty detail (e.g. search-1000-cap soft
    // dropout) preserves prior state with a fetch-error flag — without this
    // guard, every search-cap miss flips to [closed] silently.
    const carry = prev as PRRecord & PRRecordPhaseTwo;
    const detailHasState = typeof detail.state === 'string';
    const detailHasMerge = detail.merged === true || detail.merged_at != null;

    if (detail.state === 'open') {
      processedPRs.push({
        ...carry,
        lastUpdated: Date.now(),
        lastFetchError: undefined,
      } as PRRecord);
      continue;
    }

    if (!detailHasState && !detailHasMerge) {
      // Malformed / empty response — preserve prior state, stamp error.
      processedPRs.push({
        ...carry,
        lastUpdated: Date.now(),
        lastFetchError: { at: Date.now(), message: 'detail response missing state field' },
      } as PRRecord);
      continue;
    }

    const merged = detailHasMerge;
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
  await (scope ? scope.upsertPRs(processedPRs) : upsertPRs(processedPRs));
  await (scope ? scope.pruneStale(processedPRs.map((p) => p.id)) : pruneStale(processedPRs.map((p) => p.id)));
  await (scope ? scope.stampPollTime() : stampPollTime());

  // Step 4.4: cross-account action-dot — count actionable PRs and persist
  // under the iteration's accountId. Threaded explicitly, no override.
  if (scope) {
    try {
      const settings = staleSettings ?? (await scope.getAutomationSettings());
      const actionable = processedPRs.filter((p) =>
        isPRActionable(p as PRRecord & Partial<PRRecordPhaseTwo>, settings),
      ).length;
      await scope.setActionableCount(actionable);
    } catch (err) {
      console.warn('[poll-cycle] actionable_count update failed', err);
    }
  }

  // Step 4.5: phase-2 automations (best-effort; never blocks the next poll)
  // Story 4.5 — suspended-installation PRs display but never write. Filter
  // them out before the orchestrator runs.
  const automationCandidates = processedPRs.filter((pr) => {
    const [owner] = pr.repo.split('/');
    return !suspendedOwnerSet.has(owner.toLowerCase());
  });
  // Story 2.4 — newly-idle PR ids: had no staleness on the previous cycle and
  // do on this one. Used by the notification dispatch in runAutomationsPass.
  const newlyIdlePRIds = new Set<number>();
  for (const next of processedPRs) {
    const prev = storeMap.get(next.id) as (PRRecord & PRRecordPhaseTwo) | undefined;
    const prevStale = prev?.staleness;
    const nextStale = (next as PRRecord & PRRecordPhaseTwo).staleness;
    if (!prevStale && nextStale) newlyIdlePRIds.add(next.id);
  }

  await runAutomationsPass(automationCandidates, prDetails, updatedCount, rebaseActivityEntries, newlyIdlePRIds, scope);

  // REVIEWER-AUTOMATIONS — reviewer phase. Gated on the master toggle so
  // existing users stay on the authored-only experience by default.
  if (staleSettings?.enableReviewerTab) {
    try {
      await runReviewerPhase(staleSettings, scope);
    } catch (err) {
      console.warn('[poll-cycle] reviewer phase failed:', err);
    }
  }

  // Step 5: badge — runPollCycle aggregates across accounts and sets the
  // badge once per cycle. For the single-account / fresh-install path,
  // also set the badge here so behavior matches v1.0.x exactly.
  setBadgeCount(updatedCount);
  return updatedCount;
}

/**
 * REVIEWER-AUTOMATIONS — reviewer phase. Search for PRs the user is reviewing,
 * fetch detail + reviews + reviewDecision, run the 4-gate detector, and fire
 * `enablePullRequestAutoMerge` when all gates pass. Writes the per-PR cache
 * (including `reviewerAutoMergeArmed` and `lastSeenHeadSha`) so subsequent
 * cycles don't re-fire and so a new push correctly re-opens the gate.
 */
async function runReviewerPhase(settings: AutomationSettings, scope?: AccountScope): Promise<void> {
  const accountId: string | undefined = scope?.id;
  let me: { login: string };
  try {
    me = await getAuthenticatedUser(accountId);
  } catch (err) {
    console.warn('[reviewer-phase] could not resolve current user; skipping cycle', err);
    return;
  }

  let search;
  try {
    search = await searchReviewerPRs(accountId);
  } catch (err) {
    console.warn('[reviewer-phase] search failed; skipping cycle', err);
    return;
  }

  const existing = (await (scope ? scope.loadReviewerStore() : loadReviewerStore()))
    .prs as Array<PRRecord & PRRecordPhaseTwo>;
  const existingById = new Map(existing.map((p) => [p.id, p]));
  const processed: Array<PRRecord & PRRecordPhaseTwo> = [];

  for (const item of search.items) {
    let owner: string, repo: string, fullName: string;
    try {
      ({ owner, repo, fullName } = parseRepoUrl(item.repository_url));
    } catch (err) {
      console.warn('[reviewer-phase] bad repository_url, skipping:', item.repository_url, err);
      continue;
    }

    let pr: PullRequest;
    try {
      pr = await getPR(owner, repo, item.number, accountId);
    } catch (err) {
      console.warn(`[reviewer-phase] getPR ${fullName}#${item.number} failed; skipping`, err);
      continue;
    }

    const cached = existingById.get(item.id);
    const headSha = pr.head?.sha;
    const headChanged = cached?.lastSeenHeadSha != null && cached.lastSeenHeadSha !== headSha;
    const carryArmed = !headChanged && cached?.reviewerAutoMergeArmed;

    // Compute my latest decisive review for the chip + gate input.
    let reviewsForGate: Array<{ login: string; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED' | 'COMMENTED' | 'PENDING'; submittedAt: string }> = [];
    let myReviewState: 'AWAITING' | 'APPROVED' | 'CHANGES_REQUESTED' = 'AWAITING';
    let myApprovedCommitId: string | undefined;
    try {
      const reviews = await listReviews(owner, repo, item.number, accountId);
      reviewsForGate = reviews.map((r) => ({
        login: r.login,
        state: r.state,
        submittedAt: new Date(r.submittedAt).toISOString(),
      }));
      // Decisive reviews only. Comparator includes a stable tiebreak on
      // commitId so two reviews with identical submittedAt resolve
      // deterministically across runtimes (GitHub returns reviews in
      // chronological order but Array.prototype.sort's stability is
      // implementation-defined in older runtimes).
      const myLatest = reviews
        .filter((r) => r.login === me.login && r.state !== 'COMMENTED' && r.state !== 'PENDING')
        .sort((a, b) => (b.submittedAt - a.submittedAt) || ((b.commitId ?? '') > (a.commitId ?? '') ? 1 : -1))[0];
      if (myLatest?.state === 'APPROVED') {
        myReviewState = 'APPROVED';
        myApprovedCommitId = myLatest.commitId;
      } else if (myLatest?.state === 'CHANGES_REQUESTED') {
        myReviewState = 'CHANGES_REQUESTED';
      }
    } catch (err) {
      console.warn(`[reviewer-phase] listReviews ${fullName}#${item.number} failed; proceeding without review data`, err);
    }

    // T2 — push-since-approval: derived per-poll from GitHub's review.commit_id
    // (the SHA the user actually approved). NOT persisted; re-approve cycles
    // naturally clear the flag because the latest APPROVED review's commit_id
    // moves to the new head sha. Omit when false so absence == no-op.
    const pushSinceApproval =
      myReviewState === 'APPROVED'
      && myApprovedCommitId != null
      && headSha != null
      && myApprovedCommitId !== headSha;

    // Build base PR record (without arm metadata — added below if we fire or carry).
    const baseRecord: PRRecord & PRRecordPhaseTwo = {
      id: item.id,
      number: pr.number,
      title: pr.title,
      repo: fullName,
      url: pr.html_url,
      state: deriveStateFromMergeable(pr.mergeable_state, 'current', pr.draft === true).nextState,
      lastUpdated: Date.now(),
      ...(headSha ? { lastSeenHeadSha: headSha } : {}),
      myReviewState,
      ...(pushSinceApproval ? { pushSinceApproval: true } : {}),
    };

    // Skip the gate evaluation when arming cache is still valid — covers both
    // the idempotent "already-armed" path and the SHA-change clear (when
    // headChanged is true, carryArmed is false and we re-enter the gate).
    if (carryArmed) {
      processed.push({ ...baseRecord, reviewerAutoMergeArmed: cached!.reviewerAutoMergeArmed });
      continue;
    }

    // reviewDecision: only fetch when we actually intend to evaluate the
    // last-gate check (i.e. the toggles + allowlist are on). Saves a GraphQL
    // call per PR when the user is only using the dashboard, not auto-merge.
    let reviewDecision: 'APPROVED' | 'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | null = null;
    if (settings.enableReviewerAutoMerge && settings.autoMergeReviewerOptInRepos.includes(fullName) && pr.node_id) {
      try {
        reviewDecision = await getPRReviewDecision(pr.node_id, accountId);
      } catch (err) {
        console.warn(`[reviewer-phase] getPRReviewDecision ${fullName}#${item.number} failed; treating as REVIEW_REQUIRED`, err);
      }
    }

    const gate = evaluateReviewerAutoMergeGate({
      currentUserLogin: me.login,
      prRepo: fullName,
      reviews: reviewsForGate,
      requestedReviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
      reviewDecision,
      enableReviewerTab: settings.enableReviewerTab,
      enableReviewerAutoMerge: settings.enableReviewerAutoMerge,
      autoMergeReviewerOptInRepos: settings.autoMergeReviewerOptInRepos,
      alreadyArmed: false,
    });

    if (!gate.fire) {
      processed.push(baseRecord);
      continue;
    }

    // All gates passed — fire enableAutoMerge.
    if (!pr.node_id) {
      processed.push(baseRecord);
      continue;
    }
    const method = settings.mergeMethodPreference?.[0] ?? 'SQUASH';
    let armed = false;
    try {
      const result = await enablePullRequestAutoMerge(pr.node_id, method, accountId);
      if (result.enabled) {
        armed = true;
        const entry: ActivityEntry = {
          at: Date.now(),
          action: 'reviewer_auto_merge_armed',
          repo: fullName,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.html_url,
          result: 'success',
          mergeMethod: method,
        };
        await (scope ? scope.appendActivity([entry]) : appendActivity([entry]));
      } else if (result.unsupported && result.reason && /not allowed|not enabled|does not support/i.test(result.reason)) {
        // Repo doesn't allow auto-merge for this user — quietly revoke the
        // allowlist entry so we don't bang on the mutation each cycle.
        const next = settings.autoMergeReviewerOptInRepos.filter((r) => r !== fullName);
        if (next.length !== settings.autoMergeReviewerOptInRepos.length) {
          await saveAutomationSettings({ ...settings, autoMergeReviewerOptInRepos: next });
        }
      }
      // 'clean status' / 'closed' / 'already merged' — log and skip without
      // arming, without revoking; the next cycle will retry if state changes.
    } catch (err) {
      console.warn(`[reviewer-phase] enableAutoMerge ${fullName}#${pr.number} failed`, err);
    }

    processed.push({
      ...baseRecord,
      ...(armed ? { reviewerAutoMergeArmed: { at: Date.now() } } : {}),
    });
  }

  // ── Transition detection: reviewer PRs open last poll, absent from search now.
  // Mirrors the authored phase. Without this the reviewer store was additive-
  // only (no transition, no prune), so a reviewer-tracked PR merged/closed
  // manually kept its stale chip forever. Re-fetch search-absent PRs to stamp
  // merged/closed (carry one cycle); already-terminal records are dropped by
  // the prune below.
  const currentIds = new Set(search.items.map((i) => i.id));
  const transitioned: Array<PRRecord & PRRecordPhaseTwo> = [];
  for (const prev of existing) {
    if (currentIds.has(prev.id)) continue; // still open → handled by the loop above
    if (prev.state === 'merged' || prev.state === 'closed') continue; // terminal + gone → prune
    const [owner, repo] = prev.repo.split('/');
    if (!owner || !repo) continue;
    try {
      const detail = await getPR(owner, repo, prev.number, accountId);
      if (detail.state === 'open') {
        // Absent from the reviewer search but still open (e.g. review no longer
        // requested). Preserve so it isn't pruned out from under an in-flight arm.
        transitioned.push({ ...prev, lastUpdated: Date.now() });
        continue;
      }
      const merged = detail.merged === true || detail.merged_at != null;
      transitioned.push({ ...prev, state: merged ? 'merged' : 'closed', lastUpdated: Date.now() });
    } catch (err) {
      if (isAbortError(err)) return;
      const msg = err instanceof Error ? err.message : String(err);
      // A 404 on a search-absent PR is authoritative (see the authored phase):
      // the PR is closed/gone — stamp closed. Transient 5xx / ambiguous 403
      // preserve for next-cycle retry.
      if (msg.startsWith('HTTP_404')) {
        transitioned.push({ ...prev, state: 'closed', lastUpdated: Date.now() });
      } else {
        transitioned.push({ ...prev, lastUpdated: Date.now() });
      }
    }
  }

  const finalReviewer = [...processed, ...transitioned];
  await (scope ? scope.upsertReviewerPRs(finalReviewer) : upsertReviewerPRs(finalReviewer));
  await (scope
    ? scope.pruneStaleReviewer(finalReviewer.map((p) => p.id))
    : pruneStaleReviewer(finalReviewer.map((p) => p.id)));
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
  newlyIdlePRIds: Set<number> = new Set(),
  scope?: AccountScope,
): Promise<void> {
  const accountId: string | undefined = scope?.id;
  try {
    const settings = await (scope ? scope.getAutomationSettings() : getAutomationSettings());
    const resolvedThreads = await (scope ? scope.getResolvedThreads() : getResolvedThreads());

    // Wrap each endpoint to inject accountId. When accountId is undefined,
    // the endpoints fall back to the implicit-id path via undefined.
    const deps: OrchestratorDeps = {
      getRepo: (owner, repo) => getRepo(owner, repo, accountId),
      deleteRef: (owner, repo, ref) => deleteRef(owner, repo, ref, accountId),
      enableAutoMerge: (prNodeId, method) =>
        enablePullRequestAutoMerge(prNodeId, method, accountId),
      listThreads: (owner, repo, number) =>
        listReviewThreads(owner, repo, number, accountId),
      resolveThread: (threadId) => resolveReviewThread(threadId, accountId),
      mergePR: (owner, repo, number, opts) =>
        mergePR(owner, repo, number, opts, accountId),
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
      await (scope ? scope.upsertPRs(patched) : upsertPRs(patched));
    }

    // Persist resolvedThreads (only if changed — orchestrator returns same ref when untouched).
    if (result.resolvedThreads !== resolvedThreads) {
      await (scope ? scope.saveResolvedThreads(result.resolvedThreads) : saveResolvedThreads(result.resolvedThreads));
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
    const store = await (scope ? scope.loadStore() : loadStore());
    const next: PRStore = {
      ...store,
      lastPollSummary: { ...result.summary, rebased: rebasedCount },
      ...(lastDeletedBranch !== undefined ? { lastDeletedBranch } : {}),
    };
    await (scope ? scope.saveStore(next) : saveStore(next));

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
    await (scope ? scope.appendActivity(cycleEntries) : appendActivity(cycleEntries));

    // Story 2.4 — dispatch desktop notifications for the events the user
    // opted in to. Best-effort: failures are swallowed inside `notify`.
    try {
      for (const e of cycleEntries) {
        let event: NotifEvent | undefined;
        if (e.action === 'rebase' && e.result === 'success') event = 'rebased';
        else if (e.action === 'rebase' && e.result === 'failed') event = 'conflicted';
        else if (e.action === 'auto_merged_now' && e.result === 'success') event = 'merged';
        if (!event) continue;
        await notify(
          { event, repo: e.repo, prNumber: e.prNumber, prTitle: e.prTitle },
          settings,
        );
      }
      for (const id of newlyIdlePRIds) {
        const pr = prMap.get(id);
        if (!pr) continue;
        await notify(
          { event: 'idle', repo: pr.repo, prNumber: pr.number, prTitle: pr.title },
          settings,
        );
      }
    } catch (err) {
      console.warn('[poll-cycle] notification dispatch failed:', err);
    }
  } catch (err) {
    console.error('[poll-cycle] automation pass failed:', err);
    // Swallow — next cycle will retry.
  }
}
