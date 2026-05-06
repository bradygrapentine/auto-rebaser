import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsView } from '../../../src/popup/views/SettingsView';

vi.mock('../../../src/popup/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

vi.mock('../../../src/core/automations-store', () => ({
  // Inline literal — vi.mock factories are hoisted above imports.
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

import { useSettings } from '../../../src/popup/hooks/useSettings';
import { getAutomationSettings } from '../../../src/core/automations-store';

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

describe('SettingsView', () => {
  const mockSaveSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: { intervalMinutes: 5 },
      saveSettings: mockSaveSettings,
    });
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(AUTOMATION_DEFAULTS);
    mockSaveSettings.mockResolvedValue(undefined);
  });

  it('shows current interval in dropdown', () => {
    render(<SettingsView onBack={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /github_poll_interval/i });
    expect(trigger).toHaveTextContent('5m');
  });

  it('changing dropdown calls saveSettings', () => {
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /github_poll_interval/i }));
    fireEvent.click(screen.getByRole('option', { name: '15m' }));
    expect(mockSaveSettings).toHaveBeenCalledWith({ intervalMinutes: 15 });
  });

  it('back button calls onBack', () => {
    const onBack = vi.fn();
    render(<SettingsView onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('shows all interval options', () => {
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /github_poll_interval/i }));
    expect(screen.getByRole('option', { name: '1m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '5m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '15m' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '30m' })).toBeInTheDocument();
  });

  it('mounts the automations settings section', async () => {
    render(<SettingsView onBack={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('automations-settings')).toBeInTheDocument();
  });
});
