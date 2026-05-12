import type { PRGroup } from '../hooks/useGroupedPRs';
import type { PRRecord } from '../../core/types';
import { PRRow } from './PRRow';

interface Props {
  group: PRGroup;
  /** Controlled expansion. */
  expanded: boolean;
  /** Toggle handler. */
  onToggle: () => void;
  /** Logged-in user; when the repo owner matches, the owner prefix is stripped. */
  userLogin?: string;
  /** Story 5.5 — id of the keyboard-focused PR (if any). */
  focusedPRId?: number | null;
  /** Story 5.1 — render the `idle Nd` pill on stale rows. */
  showStaleBadges?: boolean;
  /**
   * Story 5.1 — when provided, the row renders a ping link gated by the
   * returned `canPing` / `pingedHoursAgo`.
   */
  pingStateFor?: (pr: PRRecord) => { canPing: boolean; pingedHoursAgo: number | null } | null;
  /** Story 5.1 — invoked when the user clicks the ping link. */
  onPing?: (pr: PRRecord) => void;
  /** Story 5.2-A — when provided, PRs with `staleApproval` get a `! re-review` badge. */
  rerequestStateFor?: (pr: PRRecord) => { actionable: boolean } | null;
  /** Story 5.2-A — invoked when the user clicks the actionable re-review badge. */
  onRerequest?: (pr: PRRecord) => void;
  /** Story 4.5 — installation coverage for this repo (App auth only). */
  coverage?: 'active' | 'suspended' | 'not-installed';
  /** Forwarded to PRRow so error rows can offer an "install" link. */
  installRequestUrl?: string;
  /** REVIEWER-AUTOMATIONS — when provided, each row renders the reviewer chip. */
  reviewerChipFor?: (pr: PRRecord) => { myReviewState?: 'AWAITING' | 'APPROVED' | 'CHANGES_REQUESTED'; autoMergeArmed: boolean } | null;
  /** When provided, returns whether a PR is in an actionable state (per
   *  isPRActionable). PRRow renders a small attention dot when true. */
  actionableFor?: (pr: PRRecord) => boolean;
}

export function RepoGroup({
  group, expanded, onToggle, userLogin: _userLogin, focusedPRId,
  showStaleBadges, pingStateFor, onPing, rerequestStateFor, onRerequest, coverage, installRequestUrl, reviewerChipFor, actionableFor,
}: Props) {
  // Always show just the repo name on the main popup. The owner appears
  // in the activity log where cross-account / cross-owner attribution
  // matters; in the PR list, the active account scopes everything.
  const [, ...rest] = group.repo.split('/');
  const displayName = rest.join('/') || group.repo;

  return (
    <div className="repo-group">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`group-${group.repo}`}
        className="repo-group__header"
      >
        <span className="repo-group__chevron" aria-hidden>{expanded ? '▾' : '▸'}</span>
        <span className="repo-group__name">{displayName}</span>
        <span className="repo-group__count">{group.prs.length}</span>
        {group.hasAttention && !expanded && (
          <span aria-label="needs attention" className="repo-group__attention-dot">●</span>
        )}
        {coverage === 'not-installed' && (
          <span
            className="repo-group__coverage-badge"
            data-testid="coverage-not-installed"
            title={`Auto Rebaser App not installed in ${group.repo.split('/')[0]}`}
          >
            App not installed
          </span>
        )}
        {coverage === 'suspended' && (
          <span
            className="repo-group__coverage-badge repo-group__coverage-badge--suspended"
            data-testid="coverage-suspended"
            title="Installation suspended — re-approval required"
          >
            suspended
          </span>
        )}
      </button>
      {expanded && (
        <div id={`group-${group.repo}`} className="repo-group__list">
          {group.prs.map((pr) => (
            <PRRow
              key={pr.id}
              pr={pr}
              focused={pr.id === focusedPRId}
              showStaleBadge={showStaleBadges}
              pingState={pingStateFor?.(pr) ?? undefined}
              onPing={onPing}
              rerequestState={rerequestStateFor?.(pr) ?? undefined}
              onRerequest={onRerequest}
              installRequestUrl={installRequestUrl}
              reviewerChip={reviewerChipFor?.(pr) ?? undefined}
              actionable={actionableFor?.(pr)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
