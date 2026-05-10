// REVIEWER-AUTOMATIONS — covers the Reviewer-tab UI in PRListView.
//
// Verifies: tab bar hidden when master toggle is off; tab bar with counts
// when on; scope swap on click; reviewer chips render off the per-PR fields.

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PRRecord, PRStore } from '../../../src/core/types';
import type { PRRecordPhaseTwo } from '../../../src/core/automations-types';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';

vi.mock('../../../src/popup/hooks/usePRStore', () => ({ usePRStore: vi.fn() }));
vi.mock('../../../src/popup/hooks/useReviewerPRStore', () => ({ useReviewerPRStore: vi.fn() }));
vi.mock('../../../src/popup/hooks/useAutomationSettings', () => ({ useAutomationSettings: vi.fn() }));

import { PRListView } from '../../../src/popup/views/PRListView';
import { usePRStore } from '../../../src/popup/hooks/usePRStore';
import { useReviewerPRStore } from '../../../src/popup/hooks/useReviewerPRStore';
import { useAutomationSettings } from '../../../src/popup/hooks/useAutomationSettings';

const pr = (over: Partial<PRRecord & PRRecordPhaseTwo>): PRRecord & PRRecordPhaseTwo => ({
  id: 1, number: 1, title: 'PR', repo: 'org/repo',
  url: 'https://github.com/org/repo/pull/1', state: 'behind', lastUpdated: 0,
  ...over,
});

function setStores(authored: PRRecord[], reviewer: PRRecord[]) {
  (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: authored, lastPollAt: null } as PRStore);
  (useReviewerPRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: reviewer, lastPollAt: null } as PRStore);
}

function setSettings(over: Partial<typeof DEFAULT_AUTOMATION_SETTINGS> = {}) {
  (useAutomationSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    settings: { ...DEFAULT_AUTOMATION_SETTINGS, ...over },
    save: vi.fn(),
    loading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe('PRListView — reviewer tab', () => {
  it('hides tab bar when enableReviewerTab is off', async () => {
    setSettings({ enableReviewerTab: false });
    setStores([], []);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId('pr-tabs')).not.toBeInTheDocument();
  });

  it('renders tab bar with counts when enableReviewerTab is on', async () => {
    setSettings({ enableReviewerTab: true });
    setStores(
      [pr({ id: 1, repo: 'org/a' })],
      [pr({ id: 100, repo: 'org/b' }), pr({ id: 101, repo: 'org/b' })],
    );
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('pr-tab-authored')).toHaveTextContent(/Authored\s*\(1\)/);
    expect(screen.getByTestId('pr-tab-reviewer')).toHaveTextContent(/Reviewer\s*\(2\)/);
  });

  it('swaps the visible PR list on tab click', async () => {
    setSettings({ enableReviewerTab: true });
    setStores(
      [pr({ id: 1, repo: 'org/a', title: 'AUTHORED-PR' })],
      [pr({ id: 100, repo: 'org/b', title: 'REVIEWER-PR' })],
    );
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText('AUTHORED-PR')).toBeInTheDocument();
    expect(screen.queryByText('REVIEWER-PR')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pr-tab-reviewer'));
    await act(async () => {});
    expect(screen.queryByText('AUTHORED-PR')).not.toBeInTheDocument();
    expect(screen.getByText('REVIEWER-PR')).toBeInTheDocument();
  });

  it('auto-expands reviewer-tab repo groups even when all PRs are state=current', async () => {
    // Reviewer-tab PRs are usually `current` (clean, approved, waiting for
    // other gates) — outside ATTENTION_STATES. Collapsing them by default
    // defeats the dashboard purpose. The reviewer tab must always render rows
    // expanded.
    setSettings({ enableReviewerTab: true });
    setStores([], [pr({ id: 99, number: 99, repo: 'org/x', title: 'CLEAN-PR', state: 'current' })]);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('pr-tab-reviewer'));
    await act(async () => {});
    expect(screen.getByText('CLEAN-PR')).toBeInTheDocument();
  });

  it('renders reviewer chips for each myReviewState value when on the Reviewer tab', async () => {
    setSettings({ enableReviewerTab: true });
    setStores([], [
      pr({ id: 1, number: 1, title: 'a', repo: 'org/a', myReviewState: 'AWAITING' }),
      pr({ id: 2, number: 2, title: 'b', repo: 'org/a', myReviewState: 'APPROVED' }),
      pr({ id: 3, number: 3, title: 'c', repo: 'org/a', myReviewState: 'CHANGES_REQUESTED' }),
      pr({ id: 4, number: 4, title: 'd', repo: 'org/a', myReviewState: 'APPROVED', reviewerAutoMergeArmed: { at: 1 } }),
    ]);
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('pr-tab-reviewer'));
    await act(async () => {});

    expect(screen.getByTestId('reviewer-chip-awaiting')).toBeInTheDocument();
    expect(screen.getByTestId('reviewer-chip-approved')).toBeInTheDocument();
    expect(screen.getByTestId('reviewer-chip-changes')).toBeInTheDocument();
    expect(screen.getByTestId('reviewer-chip-armed')).toBeInTheDocument();
  });
});
