import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../../src/popup/App';

vi.mock('../../src/popup/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../src/github/endpoints/issues', () => ({
  postIssueComment: vi.fn().mockResolvedValue({ id: 100, html_url: '', body: '' }),
}));

vi.mock('../../src/core/ping-throttle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/ping-throttle')>();
  return { ...actual, recordPing: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../src/popup/hooks/usePRStore', () => ({
  usePRStore: vi.fn(),
}));

vi.mock('../../src/popup/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn().mockResolvedValue({
    ignoredRepos: [],
    autoRebaseEnabled: true,
    autoRebaseOptOutRepos: [],
    autoDeleteMergedBranch: true,
    autoDeleteOptOutRepos: [],
    autoEnableAutoMerge: false,
    mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
    autoMergeOptOutRepos: [],
    mergeCleanPRsOptOutRepos: [],
    autoResolveOutdatedThreads: false,
    autoResolveOptOutRepos: [],
    autoDismissStaleNotifications: false,
    unsubscribeStalePRNotifications: false,
    autoDismissOptOutRepos: [],
    notificationsScopeGranted: false,
  }),
  saveAutomationSettings: vi.fn().mockResolvedValue(undefined),
}));

import { useAuth } from '../../src/popup/hooks/useAuth';
import { usePRStore } from '../../src/popup/hooks/usePRStore';
import { useSettings } from '../../src/popup/hooks/useSettings';
import { getAutomationSettings } from '../../src/core/automations-store';

const AUTOMATION_DEFAULTS = {
  ignoredRepos: [] as string[],
  autoRebaseEnabled: true,
  autoRebaseOptOutRepos: [] as string[],
  autoDeleteMergedBranch: true,
  autoDeleteOptOutRepos: [] as string[],
  autoEnableAutoMerge: false,
  mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'] as Array<'SQUASH' | 'REBASE' | 'MERGE'>,
  autoMergeOptOutRepos: [] as string[],
  mergeCleanPRsOptOutRepos: [] as string[],
  autoResolveOutdatedThreads: false,
  autoResolveOptOutRepos: [] as string[],
  autoDismissStaleNotifications: false,
  unsubscribeStalePRNotifications: false,
  autoDismissOptOutRepos: [] as string[],
  notificationsScopeGranted: false,
};

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(AUTOMATION_DEFAULTS);
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: null });
    (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: { intervalMinutes: 5 },
      saveSettings: vi.fn(),
    });
  });

  it('shows loading state', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'loading',
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows SignInView when signed-out', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-out',
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    expect(screen.getByTestId('signin-github-app')).toBeInTheDocument();
  });

  it('shows SignInView with error when status=error', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'error',
      error: 'Something went wrong',
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    // Choice screen renders; PAT-specific error appears after navigating to PAT view.
    expect(screen.getByTestId('signin-github-app')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('signin-pat'));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows PRListView when signed-in by default', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    expect(screen.getByText(/no open prs found/i)).toBeInTheDocument();
  });

  it('navigates to SettingsView on settings click', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('navigates back to PRListView from SettingsView', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText(/no open prs found/i)).toBeInTheDocument();
  });

  it('renders HelpView when shortcuts button is clicked', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    fireEvent.click(screen.getByTestId('help-link'));
    expect(screen.getByTestId('help-view')).toBeInTheDocument();
  });

  it('clicking view-activity routes to ActivityLogView (covers App onOpenActivity handler)', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      async (key: string) => {
        if (key === 'activity') {
          return {
            activity: {
              entries: [
                { at: Date.now(), action: 'rebase', repo: 'org/repo', prNumber: 7, result: 'success' },
              ],
            },
          };
        }
        return {};
      },
    );
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    fireEvent.click(await screen.findByTestId('view-activity'));
    expect(screen.getByTestId('activity-list')).toBeInTheDocument();
  });

  it('successful ping post returns to PR list (covers App onSuccess handler)', async () => {
    const stalePR = {
      id: 1,
      number: 7,
      title: 'Stuck',
      repo: 'org/repo',
      url: 'https://github.com/org/repo/pull/7',
      state: 'current' as const,
      lastUpdated: 0,
      requestedReviewers: ['alice'],
      staleness: { idleDays: 21, lastActivityAt: 0 },
    };
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      prs: [stalePR],
      lastPollAt: null,
    });
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...AUTOMATION_DEFAULTS,
      enableStaleBadge: true,
      enablePingReviewers: true,
      staleCountsAsAttention: true,
      staleThresholdDays: 14,
      pingTemplate: 'nudge {reviewers}',
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: { id: 100, html_url: '', body: '' },
    });
    render(<App />);
    fireEvent.click(await screen.findByTestId('ping-link'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('ping-confirm-post'));
    });
    expect(screen.queryByTestId('ping-confirm-body')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /poll now/i })).toBeInTheDocument();
  });

  it('clicking ping on a stale PR routes to PingConfirmView, cancel returns to list', async () => {
    const stalePR = {
      id: 1,
      number: 7,
      title: 'Stuck',
      repo: 'org/repo',
      url: 'https://github.com/org/repo/pull/7',
      state: 'current' as const,
      lastUpdated: 0,
      requestedReviewers: ['alice'],
      staleness: { idleDays: 21, lastActivityAt: 0 },
    };
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      prs: [stalePR],
      lastPollAt: null,
    });
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...AUTOMATION_DEFAULTS,
      enableStaleBadge: true,
      enablePingReviewers: true,
      staleCountsAsAttention: true,
      staleThresholdDays: 14,
      pingTemplate: 'nudge {reviewers}',
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    await act(async () => {});
    fireEvent.click(await screen.findByTestId('ping-link'));
    expect(screen.getByTestId('ping-confirm-body')).toHaveTextContent('nudge @alice');
    fireEvent.click(screen.getAllByText('cancel')[0]);
    expect(screen.queryByTestId('ping-confirm-body')).not.toBeInTheDocument();
    // Back on the PR list — the Poll-now header button only renders there.
    expect(screen.getByRole('button', { name: /poll now/i })).toBeInTheDocument();
  });

  it('navigates back from HelpView to PRListView', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
    });
    render(<App />);
    fireEvent.click(screen.getByTestId('help-link'));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText(/no open prs found/i)).toBeInTheDocument();
  });

  it('sign-out returns to signed-out state', async () => {
    const mockSignOut = vi.fn();
    // start signed-in
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: mockSignOut,
      refresh: vi.fn(),
    });
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    });
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  // Covers the App.tsx async () => { await auth.signOut(); setView('list') }
  // wrapper passed to SettingsView. After signing out from Settings, the user
  // should end up back at the PR list (or sign-in screen if signOut flips
  // status), exercising both await + setView.
  it('signing out from SettingsView routes back to list and calls signOut once', async () => {
    const mockSignOut = vi.fn().mockResolvedValue(undefined);
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'signed-in',
      method: 'github_app',
      user: { login: 'testuser', avatarUrl: '' },
      signInWithPAT: vi.fn(),
      signOut: mockSignOut,
      refresh: vi.fn(),
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    await act(async () => {
      fireEvent.click(screen.getByTestId('switch-method'));
    });
    expect(mockSignOut).toHaveBeenCalledOnce();
    // After setView('list'), PRListView empty state shows again.
    expect(screen.getByText(/no open prs found/i)).toBeInTheDocument();
  });
});
