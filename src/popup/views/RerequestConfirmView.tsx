// Story 5.2-A — confirm modal for re-requesting review on a stale-approved PR.
// Mirrors PingConfirmView shape.

import { useState } from 'react';
import type { PRRecord } from '../../core/types';
import { requestReviewers } from '../../github/endpoints/reviews';
import { recordRerequest } from '../../core/rerequest-throttle';
import { appendActivity } from '../../core/activity-log';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface Props {
  pr: PRRecord;
  approvers: string[];
  onCancel: () => void;
  onSuccess: () => void;
}

export function RerequestConfirmView({ pr, approvers, onCancel, onSuccess }: Props) {
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useKeyboardShortcuts({ enabled: true, bindings: { Escape: onCancel } });

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      const [owner, repo] = pr.repo.split('/');
      if (!owner || !repo) throw new Error('Invalid repo');
      const result = await requestReviewers(owner, repo, pr.number, approvers);
      // Both success and "alreadyRequested" count as success — the user's
      // intent ("re-request review") is satisfied either way, and the throttle
      // should record so the badge doesn't immediately re-arm.
      if (result.ok) {
        await recordRerequest(pr.id);
        await appendActivity([{
          at: Date.now(),
          action: 'rerequest_review',
          repo: pr.repo,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.url,
          result: 'success',
          ...(approvers.length > 0 ? { reviewers: approvers } : {}),
        }]);
        onSuccess();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      await appendActivity([{
        at: Date.now(),
        action: 'rerequest_review',
        repo: pr.repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        result: 'failed',
        errorMessage: message,
        ...(approvers.length > 0 ? { reviewers: approvers } : {}),
      }]);
    } finally {
      setPosting(false);
    }
  };

  const mentions = approvers.map((a) => `@${a}`).join(' ');

  return (
    <div className="popup-root" data-testid="rerequest-confirm-view">
      <header className="view-header">
        <button type="button" className="btn" onClick={onCancel}>cancel</button>
        <h2 className="view-header__title">re-request review</h2>
      </header>
      <div className="view-body">
        <p className="ping-confirm__line">
          <span className="muted">PR:</span> {pr.repo}#{pr.number} {pr.title}
        </p>
        <p className="ping-confirm__line">
          <span className="muted">Approvers:</span>{' '}
          {approvers.length === 0 ? <em>(none)</em> : mentions}
        </p>
        <p className="muted" style={{ marginTop: 8 }}>This will re-request review from:</p>
        <pre className="ping-confirm__body" data-testid="rerequest-confirm-body">{mentions}</pre>
        {error && <p className="ping-confirm__error" data-testid="rerequest-error">{error}</p>}
        <div className="ping-confirm__actions">
          <button type="button" className="btn" onClick={onCancel} disabled={posting}>
            cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePost}
            disabled={posting}
            data-testid="rerequest-confirm-post"
          >
            {posting ? 'posting…' : 're-request'}
          </button>
        </div>
      </div>
    </div>
  );
}
