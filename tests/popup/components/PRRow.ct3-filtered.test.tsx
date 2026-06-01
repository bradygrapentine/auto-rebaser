// CT-3 T4 — the live-recomputed [filtered] chip in PRRow.
//
// D6: the chip is the SAME predicate the poll cycle gates on, recomputed live
// from current settings (no persisted flag). We mock useAutomationSettings to
// drive the verdict deterministically. The StatusBadge must still render
// alongside the chip when filtered.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';
import type { AutomationSettings } from '../../../src/core/automations-types';
import type { PRRecord } from '../../../src/core/types';

let mockSettings: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS };
vi.mock('../../../src/popup/hooks/useAutomationSettings', () => ({
  useAutomationSettings: () => ({ settings: mockSettings, save: vi.fn(), loading: false }),
}));

import { PRRow } from '../../../src/popup/components/PRRow';

const basePR = (over: Partial<PRRecord> = {}): PRRecord =>
  ({
    id: 1,
    number: 42,
    title: 'Fix the bug',
    repo: 'owner/repo',
    url: 'https://github.com/owner/repo/pull/42',
    state: 'behind',
    lastUpdated: 0,
    ...over,
  }) as PRRecord;

beforeEach(() => {
  mockSettings = { ...DEFAULT_AUTOMATION_SETTINGS };
});

describe('PRRow — CT-3 [filtered] chip', () => {
  it('default (inert) settings: no filtered badge', () => {
    render(<PRRow pr={basePR()} />);
    expect(screen.queryByTestId('filtered-badge')).not.toBeInTheDocument();
  });

  it('draft PR + skipDraftPRs: renders the badge, title names the draft reason', () => {
    mockSettings = { ...DEFAULT_AUTOMATION_SETTINGS, skipDraftPRs: true };
    render(<PRRow pr={basePR({ isDraft: true } as Partial<PRRecord>)} />);
    const badge = screen.getByTestId('filtered-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', expect.stringContaining('draft'));
    // StatusBadge still renders alongside the chip.
    expect(screen.getByText('#42')).toBeInTheDocument();
  });

  it('denied repo: renders the badge with the repo reason', () => {
    mockSettings = { ...DEFAULT_AUTOMATION_SETTINGS, denyRepos: ['owner/repo'] };
    render(<PRRow pr={basePR()} />);
    const badge = screen.getByTestId('filtered-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', expect.stringContaining('repo'));
  });

  it('excluded label: renders the badge with the label reason', () => {
    mockSettings = { ...DEFAULT_AUTOMATION_SETTINGS, excludeLabels: ['do-not-merge'] };
    render(<PRRow pr={basePR({ labels: [{ name: 'do-not-merge' }] } as Partial<PRRecord>)} />);
    const badge = screen.getByTestId('filtered-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', expect.stringContaining('label'));
  });

  it('non-suppressed PR under active settings: no badge', () => {
    mockSettings = { ...DEFAULT_AUTOMATION_SETTINGS, denyRepos: ['other/repo'] };
    render(<PRRow pr={basePR()} />);
    expect(screen.queryByTestId('filtered-badge')).not.toBeInTheDocument();
  });
});
