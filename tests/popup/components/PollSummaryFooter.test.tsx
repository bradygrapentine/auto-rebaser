import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PollSummaryFooter } from '../../../src/popup/components/PollSummaryFooter';
import type { PollSummary } from '../../../src/core/automations-types';
import type { PRStore } from '../../../src/core/types';
import type { ActivityEntry } from '../../../src/core/activity-log-types';

function mockStore(partial: Partial<PRStore>, activity: ActivityEntry[] = []) {
  const store: PRStore = { prs: [], lastPollAt: null, ...partial };
  (chrome.storage.local.get as ReturnType<typeof Object>).mockImplementation(
    (key: string | undefined) => {
      if (key === 'pr_store') return Promise.resolve({ pr_store: store });
      if (key === 'activity') return Promise.resolve({ activity: { entries: activity } });
      // No-arg or unknown: return both for components that ask broadly.
      return Promise.resolve({ pr_store: store, activity: { entries: activity } });
    },
  );
}

const summary = (rebased = 0): PollSummary => ({
  ranAt: 1,
  rebased,
  branchesDeleted: 0,
  autoMergeEnabled: 0,
  threadsResolved: 0,
  notificationsDismissed: 0,
  errors: 0,
});

beforeEach(() => {
  (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({});
});

describe('PollSummaryFooter', () => {
  it('renders nothing when no summary and no last-deleted-branch', async () => {
    mockStore({});
    const { container } = render(<PollSummaryFooter />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when rebased=0 and no last-deleted-branch', async () => {
    mockStore({ lastPollSummary: summary(0) });
    const { container } = render(<PollSummaryFooter />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the rebased counter when rebased > 0', async () => {
    mockStore({ lastPollSummary: summary(3) });
    render(<PollSummaryFooter />);
    await act(async () => {});
    expect(screen.getByText(/rebased/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows last deleted branch when present', async () => {
    mockStore({
      lastDeletedBranch: { repo: 'org/repo', ref: 'feat/login', deletedAt: 1000 },
    });
    render(<PollSummaryFooter />);
    await act(async () => {});
    expect(screen.getByTestId('last-deleted-branch')).toBeInTheDocument();
    expect(screen.getByText('org/repo')).toBeInTheDocument();
    expect(screen.getByText('feat/login')).toBeInTheDocument();
  });

  it('shows both rebased and last-deleted-branch when both present', async () => {
    mockStore({
      lastPollSummary: summary(2),
      lastDeletedBranch: { repo: 'org/repo', ref: 'feat/x', deletedAt: 1000 },
    });
    render(<PollSummaryFooter />);
    await act(async () => {});
    expect(screen.getByText(/rebased/i)).toBeInTheDocument();
    expect(screen.getByTestId('last-deleted-branch')).toBeInTheDocument();
  });

  it('clicking the rebased counter calls onOpenActivity(true)', async () => {
    mockStore({ lastPollSummary: summary(3) });
    const onOpenActivity = vi.fn();
    render(<PollSummaryFooter onOpenActivity={onOpenActivity} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('poll-counter-clickable'));
    expect(onOpenActivity).toHaveBeenCalledWith(true);
  });

  it('counter button is disabled when onOpenActivity is not provided', async () => {
    mockStore({ lastPollSummary: summary(3) });
    render(<PollSummaryFooter />);
    await act(async () => {});
    expect(screen.getByTestId('poll-counter-clickable')).toBeDisabled();
  });

  it('shows "view activity (N)" link when total entries > 0 and onOpenActivity provided', async () => {
    const entries: ActivityEntry[] = [
      { at: 1, action: 'rebase', repo: 'a/b', prNumber: 1, prTitle: 't', result: 'success' },
      { at: 2, action: 'rebase', repo: 'a/b', prNumber: 2, prTitle: 't', result: 'success' },
    ];
    mockStore({}, entries);
    const onOpenActivity = vi.fn();
    render(<PollSummaryFooter onOpenActivity={onOpenActivity} />);
    await act(async () => {});
    const link = screen.getByTestId('view-activity');
    expect(link).toHaveTextContent('view activity (2)');
    fireEvent.click(link);
    expect(onOpenActivity).toHaveBeenCalledWith(false);
  });

  it('renders nothing when no summary, no deleted branch, AND no activity entries', async () => {
    mockStore({}, []);
    const { container } = render(<PollSummaryFooter onOpenActivity={vi.fn()} />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the view-activity link only when entries exist (entries=0 hides it)', async () => {
    mockStore({ lastPollSummary: summary(1) }, []);
    render(<PollSummaryFooter onOpenActivity={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId('view-activity')).not.toBeInTheDocument();
  });
});
