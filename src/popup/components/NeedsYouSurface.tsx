// TRIAGE-1 — "Needs you" surface: a flat, first-class index of the PRs that need
// the user's action (the auto-rebaser can't self-resolve them), each with the ONE
// next action as a deep link. Read-only; derives entirely from already-persisted
// records + the same predicate the poll cycle gates on.

import type { PRRecord } from '../../core/types';
import type { PRRecordPhaseTwo, AutomationSettings } from '../../core/automations-types';
import { triageActionFor } from '../../core/triage-actions';
import { StatusBadge } from './StatusBadge';

interface Props {
  prs: Array<PRRecord & Partial<PRRecordPhaseTwo>>;
  settings: AutomationSettings;
}

/** Per-row cap on rendered failing-check names (distinct from the ≤5 storage
 *  bound in T2) so a wide PR doesn't blow out the surface. */
const MAX_RENDERED_CI_NAMES = 2;

export function NeedsYouSurface({ prs, settings }: Props) {
  // Explicit typed build (NOT `.filter(Boolean) as T[]`) — triageActionFor
  // returns null for non-actionable PRs, so map+filter into a typed array.
  const items: Array<{ pr: PRRecord & Partial<PRRecordPhaseTwo>; action: ReturnType<typeof triageActionFor> & object }> = [];
  for (const pr of prs) {
    const action = triageActionFor(pr, settings);
    if (action) items.push({ pr, action });
  }

  if (items.length === 0) return null;

  return (
    <div className="needs-you" data-testid="needs-you-surface">
      <div className="needs-you__heading">Needs you ({items.length})</div>
      <ul className="needs-you__list">
        {items.map(({ pr, action }) => {
          const ciNames = pr.ciFailures?.map((c) => c.name) ?? [];
          const shownCi = ciNames.slice(0, MAX_RENDERED_CI_NAMES);
          const extraCi = ciNames.length - shownCi.length;
          return (
            <li key={pr.id} className="needs-you__item" data-testid="needs-you-item">
              <StatusBadge state={pr.state} />
              <span className="needs-you__num">#{pr.number}</span>
              <span className="needs-you__title" title={pr.title}>{pr.title}</span>
              {shownCi.length > 0 && (
                <span className="needs-you__ci" data-testid="needs-you-ci">
                  {shownCi.join(', ')}{extraCi > 0 ? ` +${extraCi} more` : ''}
                </span>
              )}
              <a
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="needs-you__action"
                data-testid="needs-you-action"
              >
                {action.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
