import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '../../src/popup/App';

vi.mock('../../src/popup/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../src/popup/hooks/usePRStore', () => ({
  usePRStore: vi.fn(),
}));

vi.mock('../../src/popup/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn().mockResolvedValue({
    ignoredRepos: [],
    autoDeleteMergedBranch: true,
    autoDeleteOptOutRepos: [],
    autoEnableAutoMerge: false,
    mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
    autoMergeOptOutRepos: [],
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
  autoDeleteMergedBranch: true,
  autoDeleteOptOutRepos: [] as string[],
  autoEnableAutoMerge: false,
  mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'] as Array<'SQUASH' | 'REBASE' | 'MERGE'>,
  autoMergeOptOutRepos: [] as string[],
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
});
