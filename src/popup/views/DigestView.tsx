// DIGEST-1 — the "this week" activity digest. Aggregates the existing
// activity-log store into per-action counts over a rolling window (default 7
// days). Read-only, visibility-only; mirrors the PreviewView/HelpView shape.

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useDigest } from '../hooks/useDigest';
import type { ActivityAction } from '../../core/activity-log-types';

interface Props {
  onBack: () => void;
}

const ACTION_LABEL: Record<ActivityAction, string> = {
  rebase: 'rebased',
  branch_deleted: 'branches deleted',
  auto_merge_enabled: 'auto-merge enabled',
  auto_merged_now: 'direct-merged',
  thread_resolved: 'threads resolved',
  reviewer_pinged: 'reviewers pinged',
  rerequest_review: 're-reviews requested',
  reviewer_auto_merge_armed: 'reviewer auto-merge armed',
};

function pl(n: number, unit = 'PR'): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function DigestView({ onBack }: Props) {
  const { digest, loading } = useDigest();
  useKeyboardShortcuts({ enabled: true, bindings: { Escape: onBack } });

  return (
    <div className="popup-root" data-testid="digest-view">
      <header className="popup-header">
        <button type="button" aria-label="Back" onClick={onBack} className="btn">
          ← back
        </button>
        <span className="popup-header__title" style={{ marginLeft: 4 }}>
          this week
        </span>
      </header>

      <div className="view-body digest-view">
        {loading && <p className="digest-status" data-testid="digest-loading">loading…</p>}

        {!loading && digest.totalActions === 0 && (
          <p className="digest-status" data-testid="digest-empty">
            No automation activity in the last {digest.windowDays} days.
          </p>
        )}

        {!loading && digest.totalActions > 0 && (
          <>
            <div className="digest-headline" role="status" data-testid="digest-headline">
              Auto-rebased {pl(digest.rebaseSuccess)} this week
              <span className="digest-headline__sub">
                {pl(digest.totalActions, 'automation action')} in the last {digest.windowDays} days
              </span>
            </div>

            <ul className="digest-list">
              {digest.byAction.map((c) => (
                <li key={c.action} className="digest-row" data-testid={`digest-row-${c.action}`}>
                  <span className="digest-row__label">{ACTION_LABEL[c.action]}</span>
                  <span className="digest-row__counts">
                    <span className="digest-row__total">{c.total}</span>
                    {c.failed > 0 && (
                      <span className="digest-row__failed" data-testid={`digest-failed-${c.action}`}>
                        {c.failed} failed
                      </span>
                    )}
                    {c.skipped > 0 && (
                      <span className="digest-row__skipped">{c.skipped} skipped</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
