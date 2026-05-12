// REVIEWER-AUTOMATIONS — covers the Reviewer-automations settings section.
//
// Verifies: master toggle is OFF by default, sub-toggle + allowlist are
// hidden until the master is on, and flipping the master persists via
// saveAutomationSettings.

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

import { getAutomationSettings, saveAutomationSettings } from '../../../src/core/automations-store';

async function flush() {
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  (saveAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe('AutomationsSettings — reviewer-automations section', () => {
  it('renders master toggle off by default; sub-toggle visible but disabled, allowlist hidden', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_AUTOMATION_SETTINGS);
    render(<AutomationsSettings />);
    await flush();

    const master = screen.getByTestId('reviewer-tab-master');
    expect(master).not.toBeChecked();
    const sub = screen.getByTestId('enable-reviewer-auto-merge');
    expect(sub).toBeDisabled();
    expect(screen.queryByTestId('reviewer-allowlist')).not.toBeInTheDocument();
  });

  it('reveals the sub-toggle when master flips on; allowlist hidden until sub-toggle is also on', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      enableReviewerTab: true,
    });
    render(<AutomationsSettings />);
    await flush();

    expect(screen.getByTestId('enable-reviewer-auto-merge')).toBeInTheDocument();
    expect(screen.queryByTestId('reviewer-allowlist')).not.toBeInTheDocument();
  });

  it('reveals the allowlist editor when both toggles are on', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      enableReviewerTab: true,
      enableReviewerAutoMerge: true,
    });
    render(<AutomationsSettings />);
    await flush();

    expect(screen.getByTestId('reviewer-allowlist')).toBeInTheDocument();
  });

  it('persists master toggle changes via saveAutomationSettings', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_AUTOMATION_SETTINGS);
    render(<AutomationsSettings />);
    await flush();

    fireEvent.click(screen.getByTestId('reviewer-tab-master'));
    await flush();

    expect(saveAutomationSettings).toHaveBeenCalled();
    const last = (saveAutomationSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(last.enableReviewerTab).toBe(true);
  });
});
