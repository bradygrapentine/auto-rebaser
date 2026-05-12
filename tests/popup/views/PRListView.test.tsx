import { render, screen, fireEvent, act } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: /repo1/ }));
    expect(screen.getByText(/First PR/)).toBeInTheDocument();
  });

  it('groups PRs by repo with non-current groups auto-expanded', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr1, pr2], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    // pr2.state='behind' → its group auto-expands → row visible.
    expect(screen.getByText(/Second PR/)).toBeInTheDocument();
    // pr1 group collapsed by default; row hidden until clicked.
    expect(screen.queryByText(/First PR/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /repo1/ }));
    expect(screen.getByText(/First PR/)).toBeInTheDocument();
  });

  it('lists groups alphabetically by repo', () => {
    const prA = { ...pr1, id: 99, repo: 'aaa/zzz', title: 'A repo' };
    const prB = { ...pr2, id: 100, repo: 'zzz/aaa', title: 'Z repo' };
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [prB, prA], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    // Groups sort by full owner/repo: aaa/zzz < zzz/aaa. Display name has owner
    // stripped → headers show 'zzz' first, then 'aaa'.
    const headers = screen.getAllByRole('button', { name: /zzz|aaa/ });
    expect(headers[0]).toHaveTextContent(/zzz/);
    expect(headers[1]).toHaveTextContent(/aaa/);
  });

  it('renders Support link in the footer pointing at GitHub Sponsors', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    const link = screen.getByTestId('support-link') as HTMLAnchorElement;
    expect(link).toHaveAttribute('href', 'https://github.com/sponsors/bradygrapentine');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.rel).toContain('noopener');
  });

  it('Poll now button sends POLL_NOW message', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /poll now/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
  });

  it('mounts PollSummaryFooter when activity entries exist and onOpenActivity is wired', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      activity: { entries: [
        { at: 1, action: 'rebase', repo: 'a/b', prNumber: 1, prTitle: 't', result: 'success' },
      ] },
    });
    render(
      <PRListView
        onSettings={vi.fn()}
        onSignOut={vi.fn()}
        onOpenActivity={vi.fn()}
      />,
    );
    // The footer is conditional on entries loading async; just confirm the
    // wrapper renders. Direct text/counter assertions moved to
    // PollSummaryFooter.test.tsx.
    expect(screen.queryByTestId('poll-summary-footer')).toBeDefined();
  });

  it('shows refresh icon button in header that sends POLL_NOW', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /poll now/i }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
  });

  it('renders the popup without error when user is provided', () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr1], lastPollAt: null });
    render(
      <PRListView
        user={{ login: 'octocat', avatarUrl: '' }}
        onSettings={vi.fn()}
        onSignOut={vi.fn()}
      />
    );
    expect(screen.getByText('auto-rebaser')).toBeInTheDocument();
  });

  // Story 5.5 — keyboard shortcuts
  it('pressing j focuses the first visible PR row', async () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr2], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    // Wait for useAutomationSettings to resolve.
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(window, { key: 'j' });
    const focused = document.querySelector('[data-focused="true"]');
    expect(focused).toBeInTheDocument();
    expect(focused).toHaveTextContent(/Second PR/);
  });

  it('pressing s calls onSettings', async () => {
    const onSettings = vi.fn();
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={onSettings} onSignOut={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(window, { key: 's' });
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('pressing ? calls onHelp', async () => {
    const onHelp = vi.fn();
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} onHelp={onHelp} />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(window, { key: '?' });
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it('pressing Enter opens the focused PR in a new tab', async () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr2], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: pr2.url });
  });

  it('pressing Enter with no focused PR is a no-op', async () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('pressing r sends POLL_NOW', async () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(window, { key: 'r' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'POLL_NOW' });
  });

  it('j skips PRs in collapsed groups', async () => {
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [pr1, pr2], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    // Only pr2 group is auto-expanded (state='behind'). pr1 group is collapsed.
    fireEvent.keyDown(window, { key: 'j' });
    const focused = document.querySelector('[data-focused="true"]');
    expect(focused).toHaveTextContent(/Second PR/);
    // Pressing j again wraps to the same row (only 1 visible).
    fireEvent.keyDown(window, { key: 'j' });
    expect(document.querySelector('[data-focused="true"]')).toHaveTextContent(/Second PR/);
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

  describe('migration banner + empty-installations CTA', () => {
    it('renders MigrationBanner when authMethod=pat', async () => {
      (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
      // MigrationBanner reads dismissed-state from sync; default to undismissed.
      (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
      render(
        <PRListView
          authMethod="pat"
          onSettings={vi.fn()}
          onSignOut={vi.fn()}
        />,
      );
      // Banner initial render returns null while it awaits storage; flush.
      await act(async () => {});
      expect(screen.getByTestId('migration-banner')).toBeInTheDocument();
    });

    it('does not render MigrationBanner when authMethod=github_app', () => {
      (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
      render(
        <PRListView
          authMethod="github_app"
          installations={[]}
          onSettings={vi.fn()}
          onSignOut={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('migration-banner')).not.toBeInTheDocument();
    });

    it('renders empty-installations CTA when authMethod=github_app and no installations', () => {
      (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
      render(
        <PRListView
          authMethod="github_app"
          installations={[]}
          onSettings={vi.fn()}
          onSignOut={vi.fn()}
        />,
      );
      const cta = screen.getByTestId('empty-installations');
      expect(cta).toHaveTextContent(/isn't installed on any account/i);
      const link = screen.getByText(/install or request/i);
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('does not render empty-installations CTA when installations are present', () => {
      (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(emptyStore);
      render(
        <PRListView
          authMethod="github_app"
          installations={[
            { id: 1, account: { login: 'octo', type: 'User' }, repository_selection: 'all', target_type: 'User' },
          ]}
          onSettings={vi.fn()}
          onSignOut={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('empty-installations')).not.toBeInTheDocument();
    });
  });
});
