import type { PRRecord } from '../../core/types';
import type { PRRecordPhaseTwo } from '../../core/automations-types';
import { StatusBadge } from './StatusBadge';
import { formatIdleDays } from '../../core/staleness';

interface Props {
  pr: PRRecord;
  /** Story 5.5 — true when this row is the keyboard-focused one. */
  focused?: boolean;
  /** Story 5.1 — show the `idle Nd` pill. Defaults true when caller passes a stale PR. */
  showStaleBadge?: boolean;
  /**
   * Story 5.1 — when present and the PR has requested reviewers and isn't
   * throttled, render a `ping ↗` action button. Caller is responsible for
   * deciding throttle/visibility.
   */
  pingState?: { canPing: boolean; pingedHoursAgo: number | null };
  /** Story 5.1 — invoked when the user clicks the ping link. */
  onPing?: (pr: PRRecord) => void;
}

export function PRRow({ pr, focused, showStaleBadge, pingState, onPing }: Props) {
  const extended = pr as PRRecord & PRRecordPhaseTwo;
  const noAllowedMethod = extended.autoMergeSkipReason === 'no-allowed-method';
  const staleness = extended.staleness;
  const idleLabel = staleness && showStaleBadge ? formatIdleDays(staleness.idleDays) : null;

  return (
    <div className="pr-row-wrap">
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        className="pr-row"
        data-focused={focused ? 'true' : undefined}
        title={pr.errorMessage}
      >
        <span className="pr-row__num" aria-hidden>#{pr.number}</span>
        <span className="pr-row__title">{pr.title}</span>
        {idleLabel && (
          <span className="pr-row__stale-badge" data-testid="stale-badge">
            {idleLabel}
          </span>
        )}
        {noAllowedMethod && (
          <span
            className="pr-row__skip-badge"
            data-testid="auto-merge-skip-badge"
            title="The repo doesn't allow any of your preferred merge methods."
          >
            auto-merge skipped: no allowed method
          </span>
        )}
        <StatusBadge state={pr.state} />
      </a>
      {pingState && onPing && (pingState.canPing || pingState.pingedHoursAgo != null) && (
        <button
          type="button"
          className="pr-row__ping"
          data-testid="ping-link"
          disabled={!pingState.canPing}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPing(pr);
          }}
        >
          {pingState.pingedHoursAgo != null
            ? `pinged ${pingState.pingedHoursAgo}h ago`
            : 'ping ↗'}
        </button>
      )}
    </div>
  );
}
