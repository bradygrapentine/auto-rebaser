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

type FilterSettings = Pick<
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
