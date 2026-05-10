// Story 2.5 — covers PRListView's display-only repo filter.
//
// Lives in its own file so we can mock useAutomationSettings without
// disturbing the shared mock setup of PRListView.test.tsx.

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PRRecord, PRStore } from '../../../src/core/types';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';

vi.mock('../../../src/popup/hooks/usePRStore', () => ({
  usePRStore: vi.fn(),
}));
vi.mock('../../../src/popup/hooks/useAutomationSettings', () => ({
  useAutomationSettings: vi.fn(),
}));

import { PRListView } from '../../../src/popup/views/PRListView';
import { usePRStore } from '../../../src/popup/hooks/usePRStore';
import { useAutomationSettings } from '../../../src/popup/hooks/useAutomationSettings';

const pr = (over: Partial<PRRecord>): PRRecord => ({
  id: 1,
  number: 1,
  title: 'PR',
  repo: 'org/repo',
  url: 'https://github.com/org/repo/pull/1',
  state: 'behind',
  lastUpdated: 0,
  ...over,
});

function setStore(prs: PRRecord[]) {
  const store: PRStore = { prs, lastPollAt: null };
  (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(store);
}

function setSettings(repoFilter: string[], save = vi.fn()) {
  (useAutomationSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    settings: { ...DEFAULT_AUTOMATION_SETTINGS, repoFilter },
    save,
    loading: false,
  });
  return save;
}

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe('PRListView — Story 2.5 repo filter', () => {
  it('renders no filter pill when there are no repos', () => {
    setStore([]);
    setSettings([]);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.queryByTestId('repo-filter-pill')).not.toBeInTheDocument();
  });

  it('renders the filter pill when at least one repo is present', () => {
    setStore([pr({ repo: 'org/repo1' })]);
    setSettings([]);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByTestId('repo-filter-pill')).toBeInTheDocument();
  });

  it('with no filter selected, all repo groups are shown', () => {
    setStore([
      pr({ id: 1, repo: 'org/a', title: 'A' }),
      pr({ id: 2, repo: 'org/b', title: 'B' }),
      pr({ id: 3, repo: 'org/c', title: 'C' }),
    ]);
    setSettings([]);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText(/^A$/)).toBeInTheDocument();
    expect(screen.getByText(/^B$/)).toBeInTheDocument();
    expect(screen.getByText(/^C$/)).toBeInTheDocument();
  });

  it('with repoFilter set, only matching repos are shown — clearing restores all', () => {
    setStore([
      pr({ id: 1, repo: 'org/a', title: 'A' }),
      pr({ id: 2, repo: 'org/b', title: 'B' }),
      pr({ id: 3, repo: 'org/c', title: 'C' }),
    ]);
    const save = setSettings(['org/a', 'org/c']);
    const { rerender } = render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText(/^A$/)).toBeInTheDocument();
    expect(screen.queryByText(/^B$/)).not.toBeInTheDocument();
    expect(screen.getByText(/^C$/)).toBeInTheDocument();

    // Clear via the dropdown's "clear all".
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    fireEvent.click(screen.getByTestId('repo-filter-clear'));
    expect(save).toHaveBeenCalledWith({ repoFilter: [] });

    // Simulate the parent re-render with cleared filter.
    setSettings([]);
    rerender(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText(/^A$/)).toBeInTheDocument();
    expect(screen.getByText(/^B$/)).toBeInTheDocument();
    expect(screen.getByText(/^C$/)).toBeInTheDocument();
  });

  it('checking a repo in the dropdown calls save with the new selection', async () => {
    setStore([
      pr({ id: 1, repo: 'org/a', title: 'A' }),
      pr({ id: 2, repo: 'org/b', title: 'B' }),
    ]);
    const save = setSettings([]);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    fireEvent.click(screen.getByTestId('repo-filter-pill'));
    fireEvent.click(screen.getByRole('checkbox', { name: /filter to org\/a/i }));
    await act(async () => {});
    expect(save).toHaveBeenCalledWith({ repoFilter: ['org/a'] });
  });
});
