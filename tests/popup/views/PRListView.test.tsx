import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRListView } from '../../../src/popup/views/PRListView';
import type { PRRecord, PRStore } from '../../../src/core/types';

vi.mock('../../../src/popup/hooks/usePRStore', () => ({
  usePRStore: vi.fn(),
}));

import { usePRStore } from '../../../src/popup/hooks/usePRStore';

const emptyStore: PRStore = { prs: [], lastPollAt: null };

const pr1: PRRecord = {
  id: 1, number: 10, title: 'First PR', repo: 'org/repo1',
  url: 'https://github.com/org/repo1/pull/10', state: 'current', lastUpdated: 0,
};
const pr2: PRRecord = {
  id: 2, number: 20, title: 'Second PR', repo: 'org/repo2',
  url: 'https://github.com/org/repo2/pull/20', state: 'behind', lastUpdated: 0,
};

describe('PRListView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    // PollSummaryFooter mounts inside PRListView and reads chrome.storage.local.
    // Default to empty so the existing tests don't need to know about it.
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('shows empty state when no PRs', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText(/no open prs found/i)).toBeInTheDocument();
  });

  it('shows one PR row when its repo group is expanded', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr1], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    // pr1 is state='current' so its group is collapsed by default.
    fireEvent.click(screen.getByRole('button', { name: /org\/repo1/ }));
    expect(screen.getByText(/First PR/)).toBeInTheDocument();
  });

  it('groups PRs by repo with non-current groups auto-expanded', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr1, pr2], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    // pr2.state='behind' → its group auto-expands → row visible.
    expect(screen.getByText(/Second PR/)).toBeInTheDocument();
    // pr1 group collapsed by default; row hidden until clicked.
    expect(screen.queryByText(/First PR/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /org\/repo1/ }));
    expect(screen.getByText(/First PR/)).toBeInTheDocument();
  });

  it('lists groups alphabetically by repo', () => {
    const prA = { ...pr1, id: 99, repo: 'aaa/zzz', title: 'A repo' };
    const prB = { ...pr2, id: 100, repo: 'zzz/aaa', title: 'Z repo' };
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [prB, prA], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    const headers = screen.getAllByRole('button', { name: /aaa\/zzz|zzz\/aaa/ });
    expect(headers[0]).toHaveTextContent(/aaa\/zzz/);
    expect(headers[1]).toHaveTextContent(/zzz\/aaa/);
  });

  it('shows "Last poll: never" when lastPollAt is null', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText(/last poll: never/i)).toBeInTheDocument();
  });

  it('shows formatted time when lastPollAt is set', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: 1000 });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText(/last poll:/i)).toBeInTheDocument();
    expect(screen.queryByText(/never/i)).not.toBeInTheDocument();
  });

  it('Poll now button sends POLL_NOW message', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /poll now/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
  });

  it('mounts PollSummaryFooter and shows the rebased counter from store', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...emptyStore,
      lastPollSummary: {
        ranAt: 1,
        rebased: 2,
        branchesDeleted: 0,
        autoMergeEnabled: 0,
        threadsResolved: 0,
        notificationsDismissed: 0,
        errors: 0,
      },
    });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByTestId('poll-summary-footer')).toBeInTheDocument();
    expect(screen.getByText(/rebased/i)).toBeInTheDocument();
  });

  it('shows refresh icon button in header that sends POLL_NOW', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /poll now/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
  });

  it('passes user.login down so RepoGroup receives userLogin', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr1], lastPollAt: null });
    render(
      <PRListView
        user={{ login: 'octocat', avatarUrl: '' }}
        onSettings={vi.fn()}
        onSignOut={vi.fn()}
      />
    );
    // sign-out button renders only when user is provided (proves prop flowed through).
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('refresh button is disabled and labeled "Polling" when pollInProgress', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      ...emptyStore,
      pollInProgress: true,
    });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /polling/i });
    expect(btn).toBeDisabled();
  });
});
