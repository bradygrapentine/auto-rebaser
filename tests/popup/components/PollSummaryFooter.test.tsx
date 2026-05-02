import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { PollSummaryFooter } from '../../../src/popup/components/PollSummaryFooter';
import type { PollSummary } from '../../../src/core/automations-types';
import type { PRStore } from '../../../src/core/types';

function mockStore(partial: Partial<PRStore>) {
  const store: PRStore = { prs: [], lastPollAt: null, ...partial };
  (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({ pr_store: store });
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
});
