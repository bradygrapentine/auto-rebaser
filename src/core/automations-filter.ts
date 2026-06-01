// CT-3 — the global auto-action filter predicate.
//
// A single pure function the poll cycle consults to decide whether an
// automation should be suppressed for a PR. It is bound WHERE automations act
// (rebase / auto-merge / delete-branch etc.), never inside the per-automation
// logic — so a `suppressed` verdict short-circuits all of them uniformly.
//
// Precedence is fixed: repo > draft > label. The first matching layer wins and
// names the reason. All repo and label comparisons are case-insensitive.

import type { AutomationSettings } from './automations-types';

export type FilterReason = 'repo' | 'draft' | 'label';

export interface FilterVerdict {
  suppressed: boolean;
  reason: FilterReason | null;
}

export type FilterSettings = Pick<
  AutomationSettings,
  'allowRepos' | 'denyRepos' | 'skipDraftPRs' | 'includeLabels' | 'excludeLabels'
>;

const NOT_SUPPRESSED: FilterVerdict = { suppressed: false, reason: null };

const lower = (s: string): string => s.toLowerCase();

export function evaluateAutoActionFilter(
  input: { repo: string; draft?: boolean; labels?: Array<{ name: string }> },
  settings: FilterSettings,
): FilterVerdict {
  const repo = lower(input.repo);

  // ── Layer 1: repo (highest precedence) ──
  // Deny wins outright. Then, if an allow-list is configured (non-empty), the
  // repo must appear on it — otherwise the automation is suppressed.
  const deny = settings.denyRepos.map(lower);
  if (deny.includes(repo)) return { suppressed: true, reason: 'repo' };

  const allow = settings.allowRepos.map(lower);
  if (allow.length > 0 && !allow.includes(repo)) {
    return { suppressed: true, reason: 'repo' };
  }

  // ── Layer 2: draft ──
  if (settings.skipDraftPRs && input.draft) {
    return { suppressed: true, reason: 'draft' };
  }

  // ── Layer 3: labels ──
  // `undefined` labels are treated as the empty set (no labels present).
  const labels = (input.labels ?? []).map((l) => lower(l.name));

  const include = settings.includeLabels.map(lower);
  if (include.length > 0 && !include.some((l) => labels.includes(l))) {
    return { suppressed: true, reason: 'label' };
  }

  const exclude = settings.excludeLabels.map(lower);
  if (exclude.length > 0 && exclude.some((l) => labels.includes(l))) {
    return { suppressed: true, reason: 'label' };
  }

  return NOT_SUPPRESSED;
}

/**
 * PREVIEW-1 (T1) — the candidate-selection seam. A verbatim lift of the inline
 * `automationCandidates` filter that lived in `poll-cycle.ts` (suspended-owner
 * drop + `evaluateAutoActionFilter` suppression), extracted so BOTH the poll
 * cycle and the preview gatherer select the SAME automation-candidate set from a
 * `processedPRs` list — a single shared definition the two paths cannot drift
 * apart on. Behavior-preserving: adds nothing, only relocates the predicate.
 *
 * Ignored-repo filtering is applied by callers BEFORE this helper (poll-cycle's
 * per-PR `continue`; the preview gather's explicit pre-filter), so the input
 * `processedPRs` already excludes ignored repos. Generic over the PR shape to
 * avoid coupling to PRRecord; reads only `repo`/`isDraft`/`labels`.
 */
export function selectAutomationCandidates<
  T extends { repo: string; isDraft?: boolean; labels?: Array<{ name: string }> },
>(
  processedPRs: T[],
  ctx: { suspendedOwnerSet: Set<string>; settings: FilterSettings },
): T[] {
  return processedPRs.filter((pr) => {
    const [owner] = pr.repo.split('/');
    if (ctx.suspendedOwnerSet.has(owner.toLowerCase())) return false;
    return !evaluateAutoActionFilter(
      { repo: pr.repo, draft: pr.isDraft, labels: pr.labels },
      ctx.settings,
    ).suppressed;
  });
}
