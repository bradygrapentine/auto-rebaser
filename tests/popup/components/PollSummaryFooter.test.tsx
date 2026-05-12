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
  errors: 0,
});

beforeEach(() => {
  (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({});
});

describe('PollSummaryFooter', () => {
  it('always renders the view-activity link when onOpenActivity is provided (entries=0 → "View activity" without count)', async () => {
    mockStore({});
    render(<PollSummaryFooter onOpenActivity={vi.fn()} />);
    await act(async () => {});
    const link = screen.getByTestId('view-activity');
    expect(link).toHaveTextContent(/^View activity$/);
  });

  it('persistent link with rebased>0 but no activity entries: count omitted', async () => {
    mockStore({ lastPollSummary: summary(3) }, []);
    render(<PollSummaryFooter onOpenActivity={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('view-activity')).toHaveTextContent(/^View activity$/);
  });

  it('persistent link with last-deleted-branch but no activity entries', async () => {
    mockStore({
      lastDeletedBranch: { repo: 'org/repo', ref: 'feat/login', deletedAt: 1000 },
    }, []);
    render(<PollSummaryFooter onOpenActivity={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('view-activity')).toBeInTheDocument();
  });

  it('renders nothing when onOpenActivity is not provided (no-op footer)', async () => {
    const entries: ActivityEntry[] = [
      { at: 1, action: 'rebase', repo: 'a/b', prNumber: 1, prTitle: 't', result: 'success' },
    ];
    mockStore({}, entries);
    const { container } = render(<PollSummaryFooter />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
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
    expect(link).toHaveTextContent('View activity (2)');
    fireEvent.click(link);
    expect(onOpenActivity).toHaveBeenCalledWith(false);
  });

});
