import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationsSettings } from '../../../src/popup/components/AutomationsSettings';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';

vi.mock('../../../src/core/automations-store', () => ({
  getAutomationSettings: vi.fn(),
  saveAutomationSettings: vi.fn(),
}));

vi.mock('../../../src/popup/hooks/useKnownRepos', () => ({
  useKnownRepos: () => [],
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
    // 1 ignored-repos master + 1 auto-rebase + 3 main automation toggles
    // (2.6/2.7/2.8) + 1 stale-badge toggle + 2 stale sub-toggles + 1
    // keyboard-shortcuts toggle + 3 merge-method pref checkboxes + 1
    // merge-clean-PRs-immediately + 1 desktop-notifications master + 5
    // notification sub-toggles (visible by default, disabled when master off)
    // + 1 push-since-approval master (default ON) + 1 enable-request-rereview
    // sub (visible by default) + 1 reviewer-tab master (default OFF) + 1
    // reviewer-auto-merge sub (visible by default, disabled when master off)
    // = 23.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(23);
    expect(screen.getByLabelText(/Auto-rebase behind PRs/)).toBeChecked();
    expect(screen.getByLabelText(/Auto-delete merged branches/)).toBeChecked();
    expect(screen.getByLabelText(/^Auto-enable auto-merge$/)).not.toBeChecked();
    expect(screen.getByLabelText(/Merge clean PRs immediately/)).not.toBeChecked();
    expect(screen.getByLabelText(/Auto-resolve outdated review threads/)).not.toBeChecked();
    expect(screen.getByLabelText(/Enable keyboard shortcuts/)).toBeChecked();
    expect(screen.getByLabelText(/Show stale-PR badge/)).toBeChecked();
    expect(screen.getByLabelText(/Allow ping reviewers/)).not.toBeChecked();
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

  it.each([
    ['Auto-rebase behind PRs', 'autoRebaseEnabled', false],
    ['Merge clean PRs immediately', 'mergeCleanPRsImmediately', true],
    ['Show stale-PR badge', 'enableStaleBadge', false],
    ['Enable keyboard shortcuts', 'enableKeyboardShortcuts', false],
  ])('toggling %s persists', async (labelRe, key, expected) => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      // mergeCleanPRsImmediately checkbox is gated by autoEnableAutoMerge=true.
      autoEnableAutoMerge: true,
    });
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(new RegExp(labelRe)));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ [key]: expected }),
    );
  });

  it('moving SQUASH down persists with REBASE first', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoEnableAutoMerge: true,
      mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE'],
    });
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Move squash down'));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mergeMethodPreference: ['REBASE', 'SQUASH', 'MERGE'] }),
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

  it('re-checking a disabled method appends it back to preference', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoEnableAutoMerge: true,
      mergeMethodPreference: ['REBASE', 'MERGE'],
    });
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Enable squash'));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ mergeMethodPreference: ['REBASE', 'MERGE', 'SQUASH'] })
    );
  });

  it('turning a sub-toggle OFF persists with just the sub key (subToggle falsy branch)', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      enableStaleBadge: true,
      staleCountsAsAttention: true,
    });
    render(<AutomationsSettings />);
    await flush();
    const cb = screen.getByLabelText(/stale counts as attention/i, { selector: 'input' });
    await act(async () => {
      fireEvent.click(cb);
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ staleCountsAsAttention: false })
    );
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

  it('toggling 2.7 (auto-merge) persists', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/^Auto-enable auto-merge$/));
    });
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoEnableAutoMerge: true })
    );
  });

  it('renders global ignore + per-automation skip-repos lists', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
      DEFAULT_AUTOMATION_SETTINGS
    );
    render(<AutomationsSettings />);
    await flush();
    const lists = screen.getAllByTestId('repo-opt-out-list');
    // 1 global ignored-repos + 5 per-automation skip-repos (rebase, delete, merge, merge-clean, resolve)
    expect(lists).toHaveLength(6);
  });

  it.each([
    ['ignored-repos', 'ignored-repos section'],
    ['auto-rebase', 'auto-rebase section'],
    ['auto-delete', 'auto-delete-branch section'],
    ['auto-resolve', 'auto-resolve-threads section'],
    ['merge-clean', 'merge-clean-immediately section'],
    ['stale', 'stale-PR section'],
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
    // 6 lists visible by default (ignored + rebase + delete + merge + merge-clean + resolve).
    expect(screen.getAllByTestId('repo-opt-out-list')).toHaveLength(6);

    // Collapse the auto-merge section — its skip-repos list and merge_method
    // sub-row should disappear.
    const chevron = screen.getByLabelText(/Collapse auto-merge section/);
    await act(async () => {
      fireEvent.click(chevron);
    });
    expect(screen.getAllByTestId('repo-opt-out-list')).toHaveLength(5);
    expect(screen.queryByTestId('merge-method-preference')).not.toBeInTheDocument();

    // Clicking again re-expands.
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Expand auto-merge section/));
    });
    expect(screen.getAllByTestId('repo-opt-out-list')).toHaveLength(6);
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

  describe('stale-PR section (5.1)', () => {
    it('changing idle threshold persists staleThresholdDays + enableStaleBadge:true', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS
      );
      render(<AutomationsSettings />);
      await flush();
      const select = screen.getByLabelText('Idle threshold (days)') as HTMLSelectElement;
      await act(async () => {
        fireEvent.change(select, { target: { value: '30' } });
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ enableStaleBadge: true, staleThresholdDays: 30 })
      );
    });

    it('toggling "Stale counts as attention" persists via subToggle', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        staleCountsAsAttention: false,
      });
      render(<AutomationsSettings />);
      await flush();
      const cb = screen.getByLabelText(/stale counts as attention/i, { selector: 'input' });
      await act(async () => {
        fireEvent.click(cb);
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ enableStaleBadge: true, staleCountsAsAttention: true })
      );
    });

    it('toggling "Allow ping reviewers" reveals the template textarea and persists', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        enablePingReviewers: false,
      });
      render(<AutomationsSettings />);
      await flush();
      expect(screen.queryByTestId('ping-template')).not.toBeInTheDocument();
      const cb = screen.getByLabelText(/allow ping reviewers/i, { selector: 'input' });
      await act(async () => {
        fireEvent.click(cb);
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ enableStaleBadge: true, enablePingReviewers: true })
      );
    });

    it('editing ping comment template persists pingTemplate', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        enablePingReviewers: true,
      });
      render(<AutomationsSettings />);
      await flush();
      const ta = screen.getByTestId('ping-template') as HTMLTextAreaElement;
      await act(async () => {
        fireEvent.change(ta, { target: { value: 'hey {reviewers}, mind taking a look?' } });
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ pingTemplate: 'hey {reviewers}, mind taking a look?' })
      );
    });
  });

  it.each([
    [0, 'autoRebaseOptOutRepos'],
    [1, 'autoDeleteOptOutRepos'],
    [2, 'autoMergeOptOutRepos'],
    [3, 'mergeCleanPRsOptOutRepos'],
    [4, 'autoResolveOptOutRepos'],
  ] as const)(
    'per-automation skip-repos list #%i persists to %s',
    async (index, field) => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS
      );
      render(<AutomationsSettings />);
      await flush();
      // 5 per-automation skip-repos lists, in order: rebase, delete, merge, merge-clean, resolve.
      const inputs = screen.getAllByLabelText('Skip repos input');
      expect(inputs).toHaveLength(5);
      await act(async () => {
        fireEvent.change(inputs[index], { target: { value: 'octo/skip' } });
        fireEvent.keyDown(inputs[index], { key: 'Enter' });
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ [field]: ['octo/skip'] })
      );
    }
  );

  describe('Story 2.4 — desktop notifications', () => {
    it('master toggle is unchecked by default; subtoggles visible but disabled', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS,
      );
      render(<AutomationsSettings />);
      await flush();
      expect(screen.getByTestId('notifications-master')).not.toBeChecked();
      expect(screen.getByTestId('notify-rebased')).toBeDisabled();
    });

    it('flipping master ON requests permission and only saves on grant', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS,
      );
      (chrome.permissions.request as ReturnType<typeof vi.fn>).mockImplementation(
        (_req: unknown, cb: (g: boolean) => void) => cb(true),
      );
      render(<AutomationsSettings />);
      await flush();
      await act(async () => {
        fireEvent.click(screen.getByTestId('notifications-master'));
      });
      expect(chrome.permissions.request).toHaveBeenCalledWith(
        { permissions: ['notifications'] },
        expect.any(Function),
      );
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationsEnabled: true }),
      );
    });

    it('does not save when the user denies the permission', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS,
      );
      (chrome.permissions.request as ReturnType<typeof vi.fn>).mockImplementation(
        (_req: unknown, cb: (g: boolean) => void) => cb(false),
      );
      render(<AutomationsSettings />);
      await flush();
      await act(async () => {
        fireEvent.click(screen.getByTestId('notifications-master'));
      });
      expect(saveAutomationSettings).not.toHaveBeenCalled();
    });

    it('subtoggles render when master is on and persist their state', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        notificationsEnabled: true,
      });
      render(<AutomationsSettings />);
      await flush();
      const rebased = screen.getByTestId('notify-rebased');
      expect(rebased).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(rebased);
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notifyOnRebased: true }),
      );
    });

    it('flipping master OFF saves and removes the runtime permission', async () => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        notificationsEnabled: true,
      });
      render(<AutomationsSettings />);
      await flush();
      await act(async () => {
        fireEvent.click(screen.getByTestId('notifications-master'));
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationsEnabled: false }),
      );
      expect(chrome.permissions.remove).toHaveBeenCalledWith(
        { permissions: ['notifications'] },
        expect.any(Function),
      );
    });

    it.each([
      ['notify-conflicted', 'notifyOnConflicted'],
      ['notify-merged', 'notifyOnMerged'],
      ['notify-idle', 'notifyOnIdle'],
      ['notify-ping-confirmed', 'notifyOnPingConfirmed'],
    ] as const)('subtoggle %s persists %s', async (testid, field) => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_AUTOMATION_SETTINGS,
        notificationsEnabled: true,
      });
      render(<AutomationsSettings />);
      await flush();
      await act(async () => {
        fireEvent.click(screen.getByTestId(testid));
      });
      expect(saveAutomationSettings).toHaveBeenCalledWith(
        expect.objectContaining({ [field]: true }),
      );
    });
  });
});
