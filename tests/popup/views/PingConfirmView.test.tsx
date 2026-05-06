import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PingConfirmView } from '../../../src/popup/views/PingConfirmView';
import type { PRRecord } from '../../../src/core/types';

vi.mock('../../../src/github/endpoints/issues', () => ({
  postIssueComment: vi.fn(),
}));
vi.mock('../../../src/core/ping-throttle', () => ({
  recordPing: vi.fn(),
}));
vi.mock('../../../src/core/activity-log', () => ({
  appendActivity: vi.fn(),
}));

import { postIssueComment } from '../../../src/github/endpoints/issues';
import { recordPing } from '../../../src/core/ping-throttle';
import { appendActivity } from '../../../src/core/activity-log';

const basePR: PRRecord = {
  id: 1,
  number: 42,
  title: 'Stuck PR',
  repo: 'org/repo',
  url: 'https://github.com/org/repo/pull/42',
  state: 'current',
  lastUpdated: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  (postIssueComment as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 100, html_url: '', body: '',
  });
  (recordPing as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (appendActivity as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('PingConfirmView', () => {
  it('renders the rendered template with @-mentions', () => {
    const pr = { ...basePR, requestedReviewers: ['alice', 'bob'] } as PRRecord;
    render(
      <PingConfirmView
        pr={pr}
        template="nudge {reviewers}"
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByTestId('ping-confirm-body')).toHaveTextContent('nudge @alice @bob');
  });

  it('appends mentions when template lacks {reviewers} placeholder', () => {
    const pr = { ...basePR, requestedReviewers: ['alice'] } as PRRecord;
    render(
      <PingConfirmView pr={pr} template="please review" onCancel={vi.fn()} onSuccess={vi.fn()} />
    );
    expect(screen.getByTestId('ping-confirm-body')).toHaveTextContent('please review @alice');
  });

  it('cancel calls onCancel and does NOT call postIssueComment', () => {
    const onCancel = vi.fn();
    render(
      <PingConfirmView pr={basePR} template="hi" onCancel={onCancel} onSuccess={vi.fn()} />
    );
    fireEvent.click(screen.getAllByText('cancel')[0]);
    expect(onCancel).toHaveBeenCalled();
    expect(postIssueComment).not.toHaveBeenCalled();
  });

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <PingConfirmView pr={basePR} template="hi" onCancel={onCancel} onSuccess={vi.fn()} />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('post comment posts, records ping, logs activity, calls onSuccess', async () => {
    const onSuccess = vi.fn();
    const pr = { ...basePR, requestedReviewers: ['alice'] } as PRRecord;
    render(
      <PingConfirmView pr={pr} template="hi {reviewers}" onCancel={vi.fn()} onSuccess={onSuccess} />
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ping-confirm-post'));
    });
    expect(postIssueComment).toHaveBeenCalledWith('org', 'repo', 42, 'hi @alice');
    expect(recordPing).toHaveBeenCalledWith(1);
    expect(appendActivity).toHaveBeenCalledWith([
      expect.objectContaining({
        action: 'reviewer_pinged',
        repo: 'org/repo',
        prNumber: 42,
        result: 'success',
        reviewers: ['alice'],
      }),
    ]);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('post failure surfaces error and logs failed activity, does not call onSuccess', async () => {
    (postIssueComment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP_403'));
    const onSuccess = vi.fn();
    const pr = { ...basePR, requestedReviewers: ['alice'] } as PRRecord;
    render(
      <PingConfirmView pr={pr} template="hi {reviewers}" onCancel={vi.fn()} onSuccess={onSuccess} />
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('ping-confirm-post'));
    });
    expect(screen.getByTestId('ping-error')).toHaveTextContent('HTTP_403');
    expect(recordPing).not.toHaveBeenCalled();
    expect(appendActivity).toHaveBeenCalledWith([
      expect.objectContaining({ action: 'reviewer_pinged', result: 'failed' }),
    ]);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
