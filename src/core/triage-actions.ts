// TRIAGE-1 — pure reason→next-action mapping for the "Needs you" surface.
//
// MUST stay in lock-step with `isPRActionable` (actionable-pr.ts): every PR that
// predicate calls actionable yields a non-null action here, and vice versa. The
// branch ORDER is identical (staleApproval checked FIRST, independent of state,
// then the state switch) so the two never disagree on which PRs are surfaced.
//
// All hrefs derive from `pr.url` (the github.com PR page — a trusted origin), so
// NO `isSafeExternalUrl` guard is needed here. That guard exists only for T2's
// API-sourced check-run URLs (detailsUrl/targetUrl); do not flag this as a
// SEC-11 gap.

import type { PRRecord } from './types';
import type { PRRecordPhaseTwo, AutomationSettings } from './automations-types';

export type TriageReason =
  | 'staleApproval'
  | 'conflict'
  | 'needs-manual'
  | 'rebase-rejected'
  | 'behind-auto-off';

export interface TriageAction {
  reason: TriageReason;
  /** The single next action the user should take. */
  label: string;
  /** Deep link, always derived from `pr.url` (trusted origin). */
  href: string;
}

/** Mirror of `isPRActionable`'s branch order. Returns null for non-actionable PRs. */
function reasonFor(
  pr: PRRecord & Partial<PRRecordPhaseTwo>,
  settings: AutomationSettings,
): TriageReason | null {
  // staleApproval is checked FIRST, independent of state (mirrors isPRActionable:18).
  if (pr.staleApproval && settings.enablePushSinceApproval) return 'staleApproval';

  switch (pr.state) {
    case 'conflict':
      return 'conflict';
    case 'needs-manual':
      return 'needs-manual';
    case 'rebase-rejected':
      return 'rebase-rejected';
    case 'behind': {
      const repoOptedOut = settings.autoRebaseOptOutRepos.includes(pr.repo);
      return !settings.autoRebaseEnabled || repoOptedOut ? 'behind-auto-off' : null;
    }
    default:
      return null;
  }
}

/**
 * Returns the single triage action for a PR, or null when the PR is not
 * actionable. The reason→action `switch` ends in a `never`-typed default, so
 * adding a new `TriageReason` member without a mapped action is a COMPILE error.
 * NOTE: that compile guard only covers new `TriageReason` members — the
 * cross-module invariant (every `isPRActionable`-true PR yields an action) is
 * enforced by the one-to-one runtime fixture test, not by `never`.
 */
export function triageActionFor(
  pr: PRRecord & Partial<PRRecordPhaseTwo>,
  settings: AutomationSettings,
): TriageAction | null {
  const reason = reasonFor(pr, settings);
  if (reason === null) return null;

  switch (reason) {
    case 'staleApproval':
      return { reason, label: 're-request review', href: pr.url };
    // Link to the PR page (not `${pr.url}/conflicts`): the `/conflicts` web
    // editor is only reachable for web-resolvable conflicts and otherwise
    // 404s/redirects. The PR page natively surfaces the "Resolve conflicts" CTA.
    case 'conflict':
      return { reason, label: 'open conflicts', href: pr.url };
    case 'needs-manual':
      return { reason, label: 'resolve manually', href: pr.url };
    case 'rebase-rejected':
      return { reason, label: 'resolve conflict', href: pr.url };
    case 'behind-auto-off':
      return { reason, label: 'rebase manually', href: pr.url };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}
