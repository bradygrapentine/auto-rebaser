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
    // 1 auto-rebase + 3 main automation toggles (2.6/2.7/2.8) + 1 stale-badge
    // toggle + 2 stale sub-toggles + 1 keyboard-shortcuts toggle + 3 merge-
    // method pref checkboxes + 1 merge-clean-PRs-immediately = 12.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(12);
    expect(screen.getByLabelText(/Auto-rebase behind PRs/)).toBeChecked();
    expect(screen.getByLabelText(/Auto-delete merged branches/)).toBeChecked();
    expect(screen.getByLabelText(/Auto-enable auto-merge/)).not.toBeChecked();
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
      fireEvent.click(screen.getByLabelText(/Auto-enable auto-merge/));
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
    // 1 global ignored-repos + 4 per-automation skip-repos (rebase, delete, merge, resolve)
    expect(lists).toHaveLength(5);
  });

  it.each([
    ['ignored-repos', 'ignored-repos section'],
    ['auto-delete', 'auto-delete-branch section'],
    ['auto-resolve', 'auto-resolve-threads section'],
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
    // 5 lists visible by default (ignored + rebase + delete + merge + resolve).
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
    [3, 'autoResolveOptOutRepos'],
  ] as const)(
    'per-automation skip-repos list #%i persists to %s',
    async (index, field) => {
      (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(
        DEFAULT_AUTOMATION_SETTINGS
      );
      render(<AutomationsSettings />);
      await flush();
      // 4 per-automation skip-repos lists, in order: rebase, delete, merge, resolve.
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
