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
  /**
   * Story 5.2-A — when present, the row shows a `! re-review` badge keyed off
   * the PR's `staleApproval`. `actionable` controls whether the badge is a
   * clickable button (true) or a passive label (false). The PRListView decides
   * both based on the `enablePushSinceApproval` / `enableRequestRereview` toggles.
   */
  rerequestState?: { actionable: boolean };
  /** Story 5.2-A — invoked when the user clicks the actionable badge. */
  onRerequest?: (pr: PRRecord) => void;
  /** Install URL surfaced when the row's error suggests a missing App install. */
  installRequestUrl?: string;
  /**
   * REVIEWER-AUTOMATIONS — when present (i.e. row is in the Reviewer tab),
   * render a chip reflecting the user's review state on this PR + whether the
   * 4-gate auto-merge has been armed this cycle.
   */
  reviewerChip?: {
    myReviewState?: 'AWAITING' | 'APPROVED' | 'CHANGES_REQUESTED';
    autoMergeArmed: boolean;
    /** T2 — author pushed new commits after my latest APPROVED review.
     *  Renders an extra yellow chip alongside `i approved`. */
    pushSinceApproval?: boolean;
  };
  /** Per-row attention indicator — true when the PR is in an actionable state
   *  per `isPRActionable`. Renders a small dot at the start of the row. */
  actionable?: boolean;
}

const APP_NOT_INSTALLED_HINT = 'Auto Rebaser App not installed for this repo';

export function PRRow({ pr, focused, showStaleBadge, pingState, onPing, rerequestState, onRerequest, installRequestUrl, reviewerChip, actionable }: Props) {
  const extended = pr as PRRecord & PRRecordPhaseTwo;
  const noAllowedMethod = extended.autoMergeSkipReason === 'no-allowed-method';
  const directMergeFailure = extended.lastDirectMergeFailure;
  const staleness = extended.staleness;
  const showRerequestBadge =
    rerequestState != null
    && extended.staleApproval != null
    && extended.staleApproval.approvers.length > 0;
  const idleLabel = staleness && showStaleBadge ? formatIdleDays(staleness.idleDays) : null;
  const showError = pr.state === 'error' && pr.errorMessage;
  const isAppNotInstalled = pr.errorMessage === APP_NOT_INSTALLED_HINT;

  return (
    <div className="pr-row-wrap">
      <a
        href={pr.url}
        target="_blank"
        rel="noopener noreferrer"
        className="pr-row"
        data-focused={focused ? 'true' : undefined}
        title={pr.errorMessage}
      >
        {actionable && (
          <span
            className="pr-row__attention-dot"
            data-testid="pr-row-attention-dot"
            aria-label="needs attention"
            title="Needs attention"
          />
        )}
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
                    rel="noopener noreferrer"
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
        {reviewerChip && (
          reviewerChip.autoMergeArmed ? (
            <span className="pr-row__reviewer-chip pr-row__reviewer-chip--armed" data-testid="reviewer-chip-armed">
              auto-merge armed
            </span>
          ) : reviewerChip.myReviewState === 'APPROVED' ? (
            <>
              <span className="pr-row__reviewer-chip pr-row__reviewer-chip--approved" data-testid="reviewer-chip-approved">
                i approved
              </span>
              {reviewerChip.pushSinceApproval && (
                <span
                  className="pr-row__reviewer-chip pr-row__reviewer-chip--stale-push"
                  data-testid="reviewer-chip-stale-push"
                  title="The author pushed new commits since your approval."
                >
                  stale push
                </span>
              )}
            </>
          ) : reviewerChip.myReviewState === 'CHANGES_REQUESTED' ? (
            <span className="pr-row__reviewer-chip pr-row__reviewer-chip--changes" data-testid="reviewer-chip-changes">
              i requested changes
            </span>
          ) : (
            <span className="pr-row__reviewer-chip pr-row__reviewer-chip--awaiting" data-testid="reviewer-chip-awaiting">
              awaiting review
            </span>
          )
        )}
        {pr.state === 'rebase-rejected' && (
          <a
            href={`${pr.url}/conflicts`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="pr-row__conflict-chip"
            data-testid="rebase-rejected-chip"
            title="GitHub refused the rebase — open the conflict-resolution UI."
          >
            ! conflict
          </a>
        )}
        {directMergeFailure && !noAllowedMethod && (
          <span
            className="pr-row__skip-badge"
            data-testid="direct-merge-failure-badge"
            title={`Direct merge (${directMergeFailure.method.toLowerCase()}) failed: ${directMergeFailure.error}`}
          >
            merge failed: {directMergeFailure.error}
          </span>
        )}
      </a>
      {showRerequestBadge && rerequestState!.actionable && onRerequest ? (
        <button
          type="button"
          className="pr-row__rerequest"
          data-testid="rerequest-badge"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRerequest(pr);
          }}
        >
          re-review
        </button>
      ) : showRerequestBadge ? (
        <span className="pr-row__rerequest pr-row__rerequest--passive" data-testid="rerequest-badge" aria-disabled="true">
          re-review
        </span>
      ) : null}
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
