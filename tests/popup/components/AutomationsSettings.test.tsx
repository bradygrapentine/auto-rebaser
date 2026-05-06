import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationsSettings } from '../../../src/popup/components/AutomationsSettings';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';

vi.mock('../../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  saveAutomationSettings: vi.fn(),
}));

import {
  getAutomationSettings,
  saveAutomationSettings,
} from '../../../src/core/automations-store';

async function flush() {
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  (saveAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe('AutomationsSettings', () => {
  it('renders defaults: auto-delete on, others off', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    // 4 main automation toggles + 1 keyboard-shortcuts toggle. Sub-toggle for
    // unsubscribe is hidden when 2.9 is off. Three additional checkboxes
    // inside the expanded auto-merge section come from the merge-method
    // preference list (one per method).
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(8);
    expect(screen.getByLabelText(/Auto-delete merged branches/)).toBeChecked();
    expect(screen.getByLabelText(/Auto-enable auto-merge/)).not.toBeChecked();
    expect(screen.getByLabelText(/Auto-resolve outdated review threads/)).not.toBeChecked();
    expect(screen.getByLabelText(/Dismiss stale PR notifications/)).not.toBeChecked();
    expect(screen.getByLabelText(/Enable keyboard shortcuts/)).toBeChecked();
  });

  it('toggling 2.6 calls save with the new value', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    const toggle = screen.getByLabelText(/Auto-delete merged branches/);
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoDeleteMergedBranch: false })
    );
  });

  it('merge-method preference controls disabled when 2.7 is off', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    expect(screen.getByLabelText('Enable squash')).toBeDisabled();
  });

  it('merge-method preference controls enabled when 2.7 is on', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoEnableAutoMerge: true,
    });
    render(<AutomationsSettings />);
    await flush();
    expect(screen.getByLabelText('Enable squash')).not.toBeDisabled();
  });

  it('moving REBASE up persists with REBASE first', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoEnableAutoMerge: true,
      mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
    });
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Move rebase up'));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mergeMethodPreference: ['REBASE', 'SQUASH', 'MERGE'] })
    );
  });

  it('unchecking SQUASH removes it from preference', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoEnableAutoMerge: true,
      mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
    });
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Enable squash'));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mergeMethodPreference: ['REBASE', 'MERGE'] })
    );
  });

  it('unsubscribe sub-toggle hidden when 2.9 is off', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    expect(screen.queryByText('Also unsubscribe')).not.toBeInTheDocument();
  });

  it('unsubscribe sub-toggle visible when 2.9 is on', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoDismissStaleNotifications: true,
      notificationsScopeGranted: true,
    });
    render(<AutomationsSettings />);
    await flush();
    expect(screen.getByText('Also unsubscribe')).toBeInTheDocument();
  });

  it('grant-notifications CTA shown only when 2.9 on AND scope missing', async () => {
    // Off → no CTA
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    const { rerender } = render(<AutomationsSettings />);
    await flush();
    expect(screen.queryByTestId('grant-notifications-cta')).not.toBeInTheDocument();

    // On + scope granted → no CTA
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoDismissStaleNotifications: true,
      notificationsScopeGranted: true,
    });
    rerender(<AutomationsSettings key="b" />);
    await flush();
    expect(screen.queryByTestId('grant-notifications-cta')).not.toBeInTheDocument();

    // On + scope missing → CTA visible
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoDismissStaleNotifications: true,
      notificationsScopeGranted: false,
    });
    rerender(<AutomationsSettings key="c" />);
    await flush();
    expect(screen.getByTestId('grant-notifications-cta')).toBeInTheDocument();
  });

  it('CTA click sends REAUTH message with notifications scope', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoDismissStaleNotifications: true,
      notificationsScopeGranted: false,
    });
    render(<AutomationsSettings />);
    await flush();
    fireEvent.click(screen.getByTestId('grant-notifications-cta'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'REAUTH',
      scopes: ['notifications'],
    });
  });

  it('toggling 2.8 (resolve outdated threads) persists', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Auto-resolve outdated review threads/));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoResolveOutdatedThreads: true })
    );
  });

  it('toggling 2.9 (dismiss stale notifications) persists', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Dismiss stale PR notifications/));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoDismissStaleNotifications: true })
    );
  });

  it('toggling 2.7 (auto-merge) persists', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Auto-enable auto-merge/));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoEnableAutoMerge: true })
    );
  });

  it('toggling unsubscribe sub-setting persists', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoDismissStaleNotifications: true,
      notificationsScopeGranted: true,
    });
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Also unsubscribe/));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ unsubscribeStalePRNotifications: true })
    );
  });

  it('renders global ignore + per-automation skip-repos lists', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    const lists = screen.getAllByTestId('repo-opt-out-list');
    // 1 global ignored-repos + 4 per-automation skip-repos
    expect(lists).toHaveLength(5);
  });

  it.each([
    ['ignored-repos', 'ignored-repos section'],
    ['auto-delete', 'auto-delete-branch section'],
    ['auto-resolve', 'auto-resolve-threads section'],
    ['dismiss', 'dismiss-notifications section'],
  ])(
    '%s chevron toggles aria-expanded',
    async (_name, ariaSuffix) => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS
      );
      render(<AutomationsSettings />);
      await flush();
      const collapseRe = new RegExp(`Collapse ${ariaSuffix}`);
      const expandRe = new RegExp(`Expand ${ariaSuffix}`);
      const chevron = screen.getByLabelText(collapseRe);
      expect(chevron).toHaveAttribute('aria-expanded', 'true');
      await act(async () => {
        fireEvent.click(chevron);
      });
      expect(screen.getByLabelText(expandRe)).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    }
  );

  it('clicking a section chevron collapses its sub-content', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    // All 5 lists visible by default (sections expanded).
    expect(screen.getAllByTestId('repo-opt-out-list')).toHaveLength(5);

    // Collapse the auto-merge section — its skip-repos list and merge_method
    // sub-row should disappear.
    const chevron = screen.getByLabelText(/Collapse auto-merge section/);
    await act(async () => {
      fireEvent.click(chevron);
    });
    expect(screen.getAllByTestId('repo-opt-out-list')).toHaveLength(4);
    expect(screen.queryByTestId('merge-method-preference')).not.toBeInTheDocument();

    // Clicking again re-expands.
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Expand auto-merge section/));
    });
    expect(screen.getAllByTestId('repo-opt-out-list')).toHaveLength(5);
    expect(screen.getByTestId('merge-method-preference')).toBeInTheDocument();
  });

  it('global ignored-repos input persists to ignoredRepos', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    const input = screen.getByLabelText('Ignored repos input');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'octo/ignored' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ ignoredRepos: ['octo/ignored'] })
    );
  });

  it.each([
    [0, 'autoDeleteOptOutRepos'],
    [1, 'autoMergeOptOutRepos'],
    [2, 'autoResolveOptOutRepos'],
    [3, 'autoDismissOptOutRepos'],
  ] as const)(
    'per-automation skip-repos list #%i persists to %s',
    async (index, field) => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS
      );
      render(<AutomationsSettings />);
      await flush();
      // 4 per-automation skip-repos lists, in order: 2.6, 2.7, 2.8, 2.9.
      const inputs = screen.getAllByLabelText('Skip repos input');
      expect(inputs).toHaveLength(4);
      await act(async () => {
        fireEvent.change(inputs[index], { target: { value: 'octo/skip' } });
        fireEvent.keyDown(inputs[index], { key: 'Enter' });
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ [field]: ['octo/skip'] })
      );
    }
  );
});
