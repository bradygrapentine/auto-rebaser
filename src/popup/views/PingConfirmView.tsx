import { useState } from 'react';
import type { PRRecord } from '../../core/types';
import type { PRRecordPhaseTwo } from '../../core/automations-types';
import { postIssueComment } from '../../github/endpoints/issues';
import { recordPing } from '../../core/ping-throttle';
import { appendActivity } from '../../core/activity-log';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface Props {
  pr: PRRecord;
  template: string;
  onCancel: () => void;
  /** Called after a successful POST. The host re-renders so the row shows
   *  "pinged 0h ago" via the throttle store. */
  onSuccess: () => void;
}

function renderTemplate(template: string, reviewers: string[]): string {
  const mentions = reviewers.map((r) => `@${r}`).join(' ');
  return template.includes('{reviewers}')
    ? template.replace('{reviewers}', mentions)
    : `${template}${mentions ? ' ' + mentions : ''}`;
}

export function PingConfirmView({ pr, template, onCancel, onSuccess }: Props) {
  const extended = pr as PRRecord & PRRecordPhaseTwo;
  const reviewers = extended.requestedReviewers ?? [];
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = renderTemplate(template, reviewers);

  useKeyboardShortcuts({
    enabled: true,
    bindings: { Escape: onCancel },
  });

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      const [owner, repo] = pr.repo.split('/');
      if (!owner || !repo) throw new Error('Invalid repo');
      await postIssueComment(owner, repo, pr.number, body);
      await recordPing(pr.id);
      await appendActivity([{
        at: Date.now(),
        action: 'reviewer_pinged',
        repo: pr.repo,
        prNumber: pr.number,
        prTitle: pr.title,
        result: 'success',
        ...(reviewers.length > 0 ? { reviewers } : {}),
      }]);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      await appendActivity([{
        at: Date.now(),
        action: 'reviewer_pinged',
        repo: pr.repo,
        prNumber: pr.number,
        prTitle: pr.title,
        result: 'failed',
        errorMessage: message,
        ...(reviewers.length > 0 ? { reviewers } : {}),
      }]);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="popup-root" data-testid="ping-confirm-view">
      <header className="view-header">
        <button type="button" className="btn" onClick={onCancel}>cancel</button>
        <h2 className="view-header__title">ping reviewers</h2>
      </header>
      <div className="view-body">
        <p className="ping-confirm__line">
          <span className="muted">PR:</span> {pr.repo}#{pr.number} {pr.title}
        </p>
        <p className="ping-confirm__line">
          <span className="muted">Reviewers:</span>{' '}
          {reviewers.length === 0 ? <em>(none)</em> : reviewers.map((r) => `@${r}`).join(' ')}
        </p>
        <p className="muted" style={{ marginTop: 8 }}>Comment body:</p>
        <pre className="ping-confirm__body" data-testid="ping-confirm-body">{body}</pre>
        {error && <p className="ping-confirm__error" data-testid="ping-error">{error}</p>}
        <div className="ping-confirm__actions">
          <button type="button" className="btn" onClick={onCancel} disabled={posting}>
            cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePost}
            disabled={posting}
            data-testid="ping-confirm-post"
          >
            {posting ? 'posting…' : 'post comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
