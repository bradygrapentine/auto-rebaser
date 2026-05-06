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
  /** Install URL surfaced when the row's error suggests a missing App install. */
  installRequestUrl?: string;
}

const APP_NOT_INSTALLED_HINT = 'Auto Rebaser App not installed for this repo';

export function PRRow({ pr, focused, showStaleBadge, pingState, onPing, installRequestUrl }: Props) {
  const extended = pr as PRRecord & PRRecordPhaseTwo;
  const noAllowedMethod = extended.autoMergeSkipReason === 'no-allowed-method';
  const staleness = extended.staleness;
  const idleLabel = staleness && showStaleBadge ? formatIdleDays(staleness.idleDays) : null;
  const showError = pr.state === 'error' && pr.errorMessage;
  const isAppNotInstalled = pr.errorMessage === APP_NOT_INSTALLED_HINT;

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
        <StatusBadge state={pr.state} />
        <span className="pr-row__num" aria-hidden>#{pr.number}</span>
        <div className="pr-row__title-wrap">
          <span className="pr-row__title">{pr.title}</span>
          {showError && (
            <span className="pr-row__error-hint" data-testid="pr-error-hint">
              {pr.errorMessage}
              {isAppNotInstalled && installRequestUrl && (
                <>
                  {' — '}
                  <a
                    href={installRequestUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="pr-row__error-fix"
                  >
                    install
                  </a>
                </>
              )}
            </span>
          )}
        </div>
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
