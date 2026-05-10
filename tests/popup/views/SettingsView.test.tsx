import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsView } from '../../../src/popup/views/SettingsView';

vi.mock('../../../src/popup/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}));

vi.mock('../../../src/popup/hooks/useKnownRepos', () => ({
  useKnownRepos: () => [],
}));

vi.mock('../../../src/core/automations-store', () => ({
  // Inline literal — vi.mock factories are hoisted above imports.
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

import { useSettings } from '../../../src/popup/hooks/useSettings';
import { getAutomationSettings } from '../../../src/core/automations-store';

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

  it('renders the account section when authMethod is provided', () => {
    render(<SettingsView onBack={vi.fn()} authMethod="github_app" onSignOut={vi.fn()} />);
    expect(screen.getByTestId('account-section')).toBeInTheDocument();
    expect(screen.getByText(/GitHub App/)).toBeInTheDocument();
  });

  it('shows PAT label when authMethod is pat', () => {
    render(<SettingsView onBack={vi.fn()} authMethod="pat" onSignOut={vi.fn()} />);
    expect(screen.getByText(/PAT \(legacy\)/)).toBeInTheDocument();
    expect(screen.getByTestId('switch-method')).toHaveTextContent(/switch to GitHub App/i);
  });

  it('switch-method button invokes onSignOut', () => {
    const onSignOut = vi.fn();
    render(<SettingsView onBack={vi.fn()} authMethod="github_app" onSignOut={onSignOut} />);
    fireEvent.click(screen.getByTestId('switch-method'));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('enterprise client_id input is editable when host is set', async () => {
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('enterprise-host-input'), {
      target: { value: 'github.acme.corp' },
    });
    const clientIdInput = screen.getByTestId('enterprise-client-id-input') as HTMLInputElement;
    fireEvent.change(clientIdInput, { target: { value: 'Iv23liABC' } });
    expect(clientIdInput.value).toBe('Iv23liABC');
  });

  it('enterprise apply with invalid host shows error and does not save', async () => {
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('enterprise-host-input'), {
      target: { value: 'not a valid host' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('enterprise-apply'));
    });
    expect(screen.getByTestId('enterprise-host-error')).toBeInTheDocument();
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('enterprise apply requests host permission and saves on grant', async () => {
    const requestMock = vi.fn((_perms, cb: (granted: boolean) => void) => cb(true));
    const removeMock = vi.fn((_perms, cb: () => void) => cb());
    (globalThis as { chrome: typeof chrome }).chrome = {
      ...chrome,
      permissions: { request: requestMock, remove: removeMock },
    } as unknown as typeof chrome;
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('enterprise-host-input'), {
      target: { value: 'github.acme.corp' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('enterprise-apply'));
    });
    expect(requestMock).toHaveBeenCalledWith(
      { origins: ['https://github.acme.corp/*'] },
      expect.any(Function),
    );
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseHost: 'github.acme.corp' }),
    );
  });

  it('enterprise apply surfaces error when host permission denied', async () => {
    const requestMock = vi.fn((_perms, cb: (granted: boolean) => void) => cb(false));
    (globalThis as { chrome: typeof chrome }).chrome = {
      ...chrome,
      permissions: { request: requestMock, remove: vi.fn() },
    } as unknown as typeof chrome;
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('enterprise-host-input'), {
      target: { value: 'github.acme.corp' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('enterprise-apply'));
    });
    expect(screen.getByTestId('enterprise-host-error')).toHaveTextContent(/permission denied/i);
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('enterprise apply still saves when chrome.permissions.request is unavailable (Firefox / test edge)', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = {
      ...chrome,
      permissions: undefined,
    } as unknown as typeof chrome;
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('enterprise-host-input'), {
      target: { value: 'github.acme.corp' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('enterprise-apply'));
    });
    // requestHostPermission returns true when chrome.permissions is missing,
    // so the save still goes through.
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseHost: 'github.acme.corp' }),
    );
  });

  it('clearing enterprise host is a no-op for permissions when chrome.permissions.remove is unavailable', async () => {
    (globalThis as { chrome: typeof chrome }).chrome = {
      ...chrome,
      permissions: undefined,
    } as unknown as typeof chrome;
    (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: { intervalMinutes: 5, enterpriseHost: 'github.acme.corp' },
      saveSettings: mockSaveSettings,
    });
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('enterprise-host-input'), {
      target: { value: '' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('enterprise-apply'));
    });
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseHost: undefined, enterpriseClientId: undefined }),
    );
  });

  it('enterprise apply with empty host clears the setting and removes the permission', async () => {
    const removeMock = vi.fn((_perms, cb: () => void) => cb());
    (globalThis as { chrome: typeof chrome }).chrome = {
      ...chrome,
      permissions: { request: vi.fn(), remove: removeMock },
    } as unknown as typeof chrome;
    (useSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      settings: { intervalMinutes: 5, enterpriseHost: 'github.acme.corp' },
      saveSettings: mockSaveSettings,
    });
    render(<SettingsView onBack={vi.fn()} />);
    fireEvent.change(screen.getByTestId('enterprise-host-input'), {
      target: { value: '' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('enterprise-apply'));
    });
    expect(removeMock).toHaveBeenCalledWith(
      { origins: ['https://github.acme.corp/*'] },
      expect.any(Function),
    );
    expect(mockSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enterpriseHost: undefined, enterpriseClientId: undefined }),
    );
  });
});
