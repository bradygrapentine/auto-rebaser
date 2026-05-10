// Story 5.2-A — PRListView wires the stale-approval badge from the PR record
// down through RepoGroup → PRRow, gates rendering by `enablePushSinceApproval`,
// and only attaches a click handler when `enableRequestRereview` is true.

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PRRecord, PRStore } from '../../../src/core/types';
import type { PRRecordPhaseTwo } from '../../../src/core/automations-types';
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

function setStore(prs: Array<PRRecord & PRRecordPhaseTwo>) {
  const store: PRStore = { prs, lastPollAt: null };
  (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue(store);
}

function setSettings(over: Partial<typeof DEFAULT_AUTOMATION_SETTINGS> = {}) {
  (useAutomationSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    settings: { ...DEFAULT_AUTOMATION_SETTINGS, ...over },
    save: vi.fn(),
    loading: false,
  });
}

const stalePR = (over: Partial<PRRecord & PRRecordPhaseTwo> = {}): PRRecord & PRRecordPhaseTwo => ({
  id: 1,
  number: 42,
  title: 'PR with a stale approval',
  repo: 'org/repo',
  url: 'https://github.com/org/repo/pull/42',
  state: 'behind',
  lastUpdated: 0,
  staleApproval: {
    lastApprovedAt: 1_000,
    lastPushedAt: 2_000,
    approvers: ['alice', 'bob'],
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe('PRListView — stale-approval badge', () => {
  it('renders the badge on rows with staleApproval when enablePushSinceApproval=true', async () => {
    setStore([stalePR()]);
    setSettings({ enablePushSinceApproval: true });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('rerequest-badge')).toBeInTheDocument();
    expect(screen.getByTestId('rerequest-badge')).toHaveTextContent(/re-review/i);
  });

  it('hides the badge when enablePushSinceApproval=false even if staleApproval is set', async () => {
    setStore([stalePR()]);
    setSettings({ enablePushSinceApproval: false });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId('rerequest-badge')).not.toBeInTheDocument();
  });

  it('hides the badge on rows with no staleApproval', async () => {
    setStore([{ ...stalePR(), staleApproval: null }]);
    setSettings({ enablePushSinceApproval: true });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId('rerequest-badge')).not.toBeInTheDocument();
  });

  it('badge has no click handler when enableRequestRereview=false (passive label)', async () => {
    setStore([stalePR()]);
    setSettings({ enablePushSinceApproval: true, enableRequestRereview: false });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    const badge = screen.getByTestId('rerequest-badge');
    // Passive label: not a button, no aria-pressed, no onclick handler.
    expect(badge.tagName.toLowerCase()).not.toBe('button');
  });

  it('clicking the badge opens the rerequest confirm view when enableRequestRereview=true', async () => {
    setStore([stalePR()]);
    setSettings({ enablePushSinceApproval: true, enableRequestRereview: true });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    const badge = screen.getByTestId('rerequest-badge');
    fireEvent.click(badge);
    // Modal renders with the approver list from staleApproval.approvers.
    expect(screen.getByTestId('rerequest-confirm-body')).toBeInTheDocument();
    expect(screen.getByTestId('rerequest-confirm-body')).toHaveTextContent('@alice');
    expect(screen.getByTestId('rerequest-confirm-body')).toHaveTextContent('@bob');
  });
});
