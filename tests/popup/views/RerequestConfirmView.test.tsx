import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RerequestConfirmView } from '../../../src/popup/views/RerequestConfirmView';
import type { PRRecord } from '../../../src/core/types';

vi.mock('../../../src/github/endpoints/reviews', () => ({
  requestReviewers: vi.fn(),
}));
vi.mock('../../../src/core/rerequest-throttle', () => ({
  recordRerequest: vi.fn(),
}));
vi.mock('../../../src/core/activity-log', () => ({
  appendActivity: vi.fn(),
}));

import { requestReviewers } from '../../../src/github/endpoints/reviews';
import { recordRerequest } from '../../../src/core/rerequest-throttle';
import { appendActivity } from '../../../src/core/activity-log';

const basePR: PRRecord = {
  id: 1,
  number: 42,
  title: 'Stale-approval PR',
  repo: 'org/repo',
  url: 'https://github.com/org/repo/pull/42',
  state: 'current',
  lastUpdated: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  (requestReviewers as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (recordRerequest as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (appendActivity as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('RerequestConfirmView', () => {
  it('renders the approver list with @-mentions', () => {
    render(
      <RerequestConfirmView
        pr={basePR}
        approvers={['alice', 'bob']}
        onCancel={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    const body = screen.getByTestId('rerequest-confirm-body');
    expect(body).toHaveTextContent('@alice');
    expect(body).toHaveTextContent('@bob');
  });

  it('cancel calls onCancel and does NOT call requestReviewers', () => {
    const onCancel = vi.fn();
    render(
      <RerequestConfirmView pr={basePR} approvers={['alice']} onCancel={onCancel} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getAllByText(/cancel/i)[0]);
    expect(onCancel).toHaveBeenCalled();
    expect(requestReviewers).not.toHaveBeenCalled();
  });

  it('Escape calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <RerequestConfirmView pr={basePR} approvers={['alice']} onCancel={onCancel} onSuccess={vi.fn()} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('confirm posts the request, records throttle, logs success, calls onSuccess', async () => {
    const onSuccess = vi.fn();
    render(
      <RerequestConfirmView
        pr={basePR}
        approvers={['alice', 'bob']}
        onCancel={vi.fn()}
        onSuccess={onSuccess}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('rerequest-confirm-post'));
    });
    expect(requestReviewers).toHaveBeenCalledWith('org', 'repo', 42, ['alice', 'bob']);
    expect(recordRerequest).toHaveBeenCalledWith(1);
    expect(appendActivity).toHaveBeenCalledWith([
      expect.objectContaining({
        action: 'rerequest_review',
        repo: 'org/repo',
        prNumber: 42,
        result: 'success',
        reviewers: ['alice', 'bob'],
      }),
    ]);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('alreadyRequested response is treated as success', async () => {
    (requestReviewers as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, alreadyRequested: true });
    const onSuccess = vi.fn();
    render(
      <RerequestConfirmView pr={basePR} approvers={['alice']} onCancel={vi.fn()} onSuccess={onSuccess} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('rerequest-confirm-post'));
    });
    expect(recordRerequest).toHaveBeenCalledWith(1);
    expect(appendActivity).toHaveBeenCalledWith([
      expect.objectContaining({ action: 'rerequest_review', result: 'success' }),
    ]);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('failure surfaces error and logs failed activity, does not call onSuccess', async () => {
    (requestReviewers as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP_403'));
    const onSuccess = vi.fn();
    render(
      <RerequestConfirmView pr={basePR} approvers={['alice']} onCancel={vi.fn()} onSuccess={onSuccess} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('rerequest-confirm-post'));
    });
    expect(screen.getByTestId('rerequest-error')).toHaveTextContent('HTTP_403');
    expect(recordRerequest).not.toHaveBeenCalled();
    expect(appendActivity).toHaveBeenCalledWith([
      expect.objectContaining({ action: 'rerequest_review', result: 'failed' }),
    ]);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
