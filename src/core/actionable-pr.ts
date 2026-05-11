// Cross-account action-dot — predicate for "this PR needs the user's
// attention now and won't self-resolve."
//
// Used by the poll cycle (computed per account, persisted via storage)
// and tested in isolation here. Kept stateless so the popup can also
// call it if a future feature needs per-PR actionable highlighting.

import type { PRRecord } from './types';
import type { PRRecordPhaseTwo, AutomationSettings } from './automations-types';

export function isPRActionable(
  pr: PRRecord & Partial<PRRecordPhaseTwo>,
  settings: AutomationSettings,
): boolean {
  // Story 5.2-A — staleApproval is the source of truth for "push happened
  // after the latest approval." Field is `staleApproval?: {...} | null` on
  // PRRecordPhaseTwo. Independent of state — applies even to `current` PRs.
  if (pr.staleApproval && settings.enablePushSinceApproval) return true;

  switch (pr.state) {
    case 'conflict':
    case 'needs-manual':
      return true;
    case 'behind': {
      const repoOptedOut = settings.autoRebaseOptOutRepos.includes(pr.repo);
      return !settings.autoRebaseEnabled || repoOptedOut;
    }
    default:
      return false;
  }
}
