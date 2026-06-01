// CT-3 T4 — the "Filters" section of the automations settings panel.
//
// Asserts the four filter controls persist the right patch: skip-drafts toggle,
// deny-repo (RepoOptOutList), and an include-label (LabelList). save() merges
// the patch into the full settings object before calling saveAutomationSettings,
// so we assert with objectContaining on the persisted payload.

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

const save = saveAutomationSettings as ReturnType<typeof vi.fn>;
const lastSaved = () => save.mock.calls[save.mock.calls.length - 1][0];

async function flush() {
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DEFAULT_AUTOMATION_SETTINGS });
});

describe('AutomationsSettings — CT-3 Filters section', () => {
  it('renders the Filters block with the skip-drafts toggle', async () => {
    render(<AutomationsSettings />);
    await flush();
    expect(screen.getByTestId('filters-block')).toBeInTheDocument();
    expect(screen.getByTestId('skip-drafts-toggle')).not.toBeChecked();
  });

  it('toggling skip-drafts persists skipDraftPRs:true', async () => {
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-drafts-toggle'));
    });
    expect(lastSaved()).toEqual(expect.objectContaining({ skipDraftPRs: true }));
  });

  it('adding a deny repo persists denyRepos:["owner/repo"]', async () => {
    render(<AutomationsSettings />);
    await flush();
    const input = screen.getByLabelText('Never these repos (deny-list) input');
    fireEvent.change(input, { target: { value: 'owner/repo' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(lastSaved()).toEqual(expect.objectContaining({ denyRepos: ['owner/repo'] }));
  });

  it('adding an allow repo persists allowRepos:["owner/repo"]', async () => {
    render(<AutomationsSettings />);
    await flush();
    const input = screen.getByLabelText('Only these repos (allow-list) input');
    fireEvent.change(input, { target: { value: 'owner/repo' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(lastSaved()).toEqual(expect.objectContaining({ allowRepos: ['owner/repo'] }));
  });

  it('adding an include label trims and persists includeLabels:["bug"]', async () => {
    render(<AutomationsSettings />);
    await flush();
    const input = screen.getByLabelText('Only PRs with a label (include) input');
    fireEvent.change(input, { target: { value: '  bug  ' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(lastSaved()).toEqual(expect.objectContaining({ includeLabels: ['bug'] }));
  });

  it('adding an exclude label persists excludeLabels:["do-not-merge"]', async () => {
    render(<AutomationsSettings />);
    await flush();
    const input = screen.getByLabelText('Skip PRs with a label (exclude) input');
    fireEvent.change(input, { target: { value: 'do-not-merge' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(lastSaved()).toEqual(expect.objectContaining({ excludeLabels: ['do-not-merge'] }));
  });

  it('empty / whitespace-only label input is a no-op (no save)', async () => {
    render(<AutomationsSettings />);
    await flush();
    save.mockClear();
    const input = screen.getByLabelText('Only PRs with a label (include) input');
    fireEvent.change(input, { target: { value: '   ' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('a label can be added then removed (round-trip back to empty)', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      includeLabels: ['bug'],
    });
    render(<AutomationsSettings />);
    await flush();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove bug'));
    });
    expect(lastSaved()).toEqual(expect.objectContaining({ includeLabels: [] }));
  });

  it('adding a duplicate label is a no-op (dedupe)', async () => {
    (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_AUTOMATION_SETTINGS,
      includeLabels: ['bug'],
    });
    render(<AutomationsSettings />);
    await flush();
    save.mockClear();
    const input = screen.getByLabelText('Only PRs with a label (include) input');
    fireEvent.change(input, { target: { value: 'bug' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(save).not.toHaveBeenCalled();
  });
});
