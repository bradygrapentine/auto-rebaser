// DIGEST-1 — App routing: PRListView's digest trigger navigates to DigestView,
// and DigestView is reachable end-to-end. useDigest mocked → routing test only.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/popup/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../src/popup/hooks/usePRStore', () => ({ usePRStore: vi.fn() }));
vi.mock('../../src/popup/hooks/useSettings', () => ({ useSettings: vi.fn() }));
vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  saveAutomationSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/popup/hooks/useDigest', () => ({
  useDigest: () => ({
    digest: { windowDays: 7, since: 0, totalActions: 0, byAction: [], rebaseSuccess: 0 },
    loading: false,
  }),
}));

import { App } from '../../src/popup/App';
import { useAuth } from '../../src/popup/hooks/useAuth';
import { usePRStore } from '../../src/popup/hooks/usePRStore';
import { useSettings } from '../../src/popup/hooks/useSettings';
import { getAutomationSettings } from '../../src/core/automations-store';

const SETTINGS = {
  ignoredRepos: [], autoRebaseEnabled: true, autoRebaseOptOutRepos: [],
  autoDeleteMergedBranch: true, autoDeleteOptOutRepos: [], autoEnableAutoMerge: false,
  mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'], autoMergeOptOutRepos: [], mergeCleanPRsOptOutRepos: [],
  autoResolveOutdatedThreads: false, autoResolveOptOutRepos: [],
  enableKeyboardShortcuts: true,
  allowRepos: [], denyRepos: [], skipDraftPRs: false, includeLabels: [], excludeLabels: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(SETTINGS);
  (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: Date.now() });
  (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({ settings: { intervalMinutes: 5 }, saveSettings: vi.fn() });
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    status: 'signed-in', user: { login: 'u', avatarUrl: '' },
    signInWithPAT: vi.fn(), signOut: vi.fn(), refresh: vi.fn(),
  });
});

describe('App — digest routing', () => {
  it('clicking the "this week" trigger navigates to DigestView', () => {
    render(<App />);
    expect(screen.queryByTestId('digest-view')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('digest-link'));
    expect(screen.getByTestId('digest-view')).toBeInTheDocument();
  });

  it('the `d` keyboard shortcut navigates to DigestView', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByTestId('digest-view')).toBeInTheDocument();
  });

  it('back from DigestView returns to the PR list', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('digest-link'));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText(/no open prs found/i)).toBeInTheDocument();
  });
});
