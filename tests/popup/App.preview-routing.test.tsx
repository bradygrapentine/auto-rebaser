// PREVIEW-1 (T2) — App routing: PRListView's preview trigger navigates to
// PreviewView, and PreviewView is reachable end-to-end (not dead code).
// usePreview is mocked so this stays a routing test, not an integration test.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/popup/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../src/popup/hooks/usePRStore', () => ({ usePRStore: vi.fn() }));
vi.mock('../../src/popup/hooks/useSettings', () => ({ useSettings: vi.fn() }));
vi.mock('../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  saveAutomationSettings: vi.fn().mockResolvedValue(undefined),
}));
// Keep PreviewView a pure render — no chrome messaging on mount.
vi.mock('../../src/popup/hooks/usePreview', () => ({
  usePreview: () => ({
    projection: { actions: [], counts: { 'enable-auto-merge': 0, 'direct-merge': 0, 'delete-branch': 0, 'resolve-thread': 0 }, directMergePreviewable: false, directMergeCandidatePRIds: [], generatedAt: 0 },
    loading: false, error: null, run: vi.fn(),
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

describe('App — preview routing', () => {
  it('clicking the dry-run trigger navigates to PreviewView', () => {
    render(<App />);
    expect(screen.queryByTestId('preview-view')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('preview-link'));
    expect(screen.getByTestId('preview-view')).toBeInTheDocument();
  });

  it('the `p` keyboard shortcut navigates to PreviewView', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'p' });
    expect(screen.getByTestId('preview-view')).toBeInTheDocument();
  });

  it('back from PreviewView returns to the PR list', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('preview-link'));
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText(/no open prs found/i)).toBeInTheDocument();
  });
});
