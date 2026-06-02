// PREVIEW-1 (T2) — the named, scoped, READ-ONLY data source for popup preview.
//
// `gatherPreviewInputs` assembles the orchestrator opts for the active account
// using the SAME standalone building blocks the poll cycle imports — but it
// fires NO mutation and never imports the poll cycle module itself (which stays
// in the alarm path; preview must be structurally clear of the PERF-1 storm).
//
// The candidate set it produces MUST equal the execute path's
// `automationCandidates`, so it routes the SAME `processedPRs`-equivalent
// (open-search ∪ store-merged-pending-deletion, minus ignored repos) through the
// ONE shared `selectAutomationCandidates` definition (no second filter copy).
//
// Two divergence directions are closed here:
//  - OVER-report: ignored-repo / suspended-owner / `evaluateAutoActionFilter`
//    suppression are applied (via the shared helper) so preview never lists a PR
//    execute structurally suppresses.
//  - UNDER-report: `searchAuthoredPRs` is OPEN-only, so the persisted-store PRs
//    with `state==='merged' && !branchDeleted` (the delete-branch targets) are
//    re-included from the store, exactly as the poll cycle reprocesses them.

import type { PRRecord } from '../../core/types';
import type {
  AutomationSettings,
  PRRecordPhaseTwo,
  ResolvedThreadsStore,
} from '../../core/automations-types';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../core/automations-types';
import { selectAutomationCandidates } from '../../core/automations-filter';
import { suspendedOwners } from '../../core/installations-helpers';
import { getActiveAccountId } from '../../core/storage/multi-account';
import { AccountScope } from '../../core/account-scope';
import { getAuth } from '../../core/auth-store';
import { loadStore } from '../../core/pr-store';
import { getAutomationSettings, getResolvedThreads } from '../../core/automations-store';
import { searchAuthoredPRs, getPR } from '../../github/endpoints';
import { getRepo } from '../../github/endpoints/repos';
import { deleteRef } from '../../github/endpoints/git-refs';
import { enablePullRequestAutoMerge } from '../../github/endpoints/auto-merge';
import { listReviewThreads, resolveReviewThread } from '../../github/endpoints/review-threads';
import { mergePR } from '../../github/endpoints/merge-pr';
import type { OrchestratorDeps } from './orchestrator';
import type { PullRequestDetail } from './adapters';

export interface PreviewInputs {
  prs: PRRecord[];
  prDetails: Map<number, PullRequestDetail>;
  settings: AutomationSettings;
  resolvedThreads: ResolvedThreadsStore;
  github: OrchestratorDeps;
}

/**
 * Build the read-only orchestrator opts for the active account's preview. Only
 * GET reads (`searchAuthoredPRs`/`getPR`/store loads); fires NO mutation and does
 * NOT run the rebase/reviewer phases. The returned `github` deps wrapper carries
 * the mutating endpoints (for type-compatibility with execute) but preview mode
 * in `runAllAutomations` never invokes them.
 */
export async function gatherPreviewInputs(): Promise<PreviewInputs> {
  // Resolve the active account. Null → fresh-install / single-account implicit
  // path (scope undefined, endpoint fns fall back via accountId=undefined),
  // mirroring the poll cycle's `scope ? scope.X() : X()` discipline.
  const accountId = await getActiveAccountId();
  const scope = accountId ? new AccountScope(accountId) : undefined;
  const acct = accountId ?? undefined;

  // Settings (drives ignored-repo filtering + the candidate filter). Fail open
  // to DEFAULT_AUTOMATION_SETTINGS, matching the poll cycle.
  let settings: AutomationSettings;
  try {
    settings = await (scope ? scope.getAutomationSettings() : getAutomationSettings());
  } catch {
    settings = DEFAULT_AUTOMATION_SETTINGS;
  }
  const ignoredRepos = settings.enableIgnoredRepos === false
    ? new Set<string>()
    : new Set(settings.ignoredRepos ?? []);

  // Suspended-owner set — READ-ONLY: use the CACHED installations off auth (the
  // poll cycle additionally refreshes + persists, which is a write; preview must
  // not). Best-effort: any failure treats all owners as active.
  let suspendedOwnerSet = new Set<string>();
  try {
    const auth = await (scope ? scope.getAuth() : getAuth());
    if (auth?.method === 'github_app') {
      suspendedOwnerSet = suspendedOwners(auth.installations);
    }
  } catch {
    // treat all owners as active
  }

  // Live open-authored search (ETag-cached GET) gives membership of still-open
  // PRs; the persisted store holds the full PRRecords (with phase-2 fields).
  const search = await searchAuthoredPRs(acct);
  const openIds = new Set(search.items.map((i) => i.id));
  const store = await (scope ? scope.loadStore() : loadStore());

  // processedPRs-equivalent: open cohort (store records still present in search)
  // ∪ merged-pending-deletion cohort (store `merged && !branchDeleted`). Both
  // pre-filtered by ignoredRepos — exactly the poll cycle's two reprocess cohorts.
  const openCohort = store.prs.filter((p) =>
    p.state !== 'merged' && p.state !== 'closed'
    && openIds.has(p.id)
    && !ignoredRepos.has(p.repo),
  );
  const mergedCohort = store.prs.filter((p) =>
    p.state === 'merged'
    && !(p as PRRecord & PRRecordPhaseTwo).branchDeleted
    && !ignoredRepos.has(p.repo),
  );
  const processedPRs: PRRecord[] = [...openCohort, ...mergedCohort];

  // The ONE shared candidate filter (suspended-owner + evaluateAutoActionFilter
  // suppression) — identical to the execute path so the sets cannot drift.
  const candidates = selectAutomationCandidates(processedPRs, { suspendedOwnerSet, settings });

  // Populate prDetails ONLY for surviving candidates (same membership the execute
  // path's automation pass carries). A failed GET just omits that PR's detail —
  // the decide predicates skip a PR with no detail; still read-only.
  const prDetails = new Map<number, PullRequestDetail>();
  for (const pr of candidates) {
    const [owner, repo] = pr.repo.split('/');
    if (!owner || !repo) continue;
    try {
      prDetails.set(pr.id, await getPR(owner, repo, pr.number, acct));
    } catch {
      // omit detail for this PR; read-only
    }
  }

  const resolvedThreads = await (scope ? scope.getResolvedThreads() : getResolvedThreads());

  // Same deps wrapper shape as `runAutomationsPass` — required for type parity
  // with execute. Preview mode never invokes the mutating members.
  const github: OrchestratorDeps = {
    getRepo: (owner, repo) => getRepo(owner, repo, acct),
    deleteRef: (owner, repo, ref) => deleteRef(owner, repo, ref, acct),
    enableAutoMerge: (prNodeId, method) => enablePullRequestAutoMerge(prNodeId, method, acct),
    listThreads: (owner, repo, number) => listReviewThreads(owner, repo, number, acct),
    resolveThread: (threadId) => resolveReviewThread(threadId, acct),
    mergePR: (owner, repo, number, opts) => mergePR(owner, repo, number, opts, acct),
  };

  return { prs: candidates, prDetails, settings, resolvedThreads, github };
}
