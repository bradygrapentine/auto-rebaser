import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityLogView } from '../../../src/popup/views/ActivityLogView';
import type { ActivityEntry } from '../../../src/core/activity-log-types';
import { STORAGE_KEYS_V2 } from '../../../src/core/storage/multi-account';

const e = (over: Partial<ActivityEntry>): ActivityEntry => ({
  at: Date.now() - 60_000,
  action: 'rebase',
  repo: 'a/b',
  prNumber: 1,
  prTitle: 't',
  result: 'success',
  ...over,
});

function mockStorage(data: Record<string, unknown>) {
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
    async (keys: string | string[] | null) => {
      if (keys == null) return { ...data };
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (k in data) out[k] = data[k];
      return out;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe('ActivityLogView — account filter chip', () => {
  it('does not render the account chip when only one account is signed in', async () => {
    mockStorage({
      [STORAGE_KEYS_V2.accounts]: {
        gh_octocat: {
          auth: { method: 'pat', token: 't' },
          activity: { entries: [e({ prNumber: 1 })] },
        },
      },
      [STORAGE_KEYS_V2.activeAccountId]: 'gh_octocat',
    });
    render(<ActivityLogView onBack={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /filter by account/i })).not.toBeInTheDocument();
  });

  it('renders the chip with two accounts and defaults to "this account"', async () => {
    mockStorage({
      [STORAGE_KEYS_V2.accounts]: {
        gh_octocat: {
          auth: { method: 'pat', token: 't' },
          activity: { entries: [e({ prNumber: 1, repo: 'octo/repo' })] },
        },
        gh_acme: {
          auth: { method: 'pat', token: 't' },
          activity: { entries: [e({ prNumber: 2, repo: 'acme/repo' })] },
        },
      },
      [STORAGE_KEYS_V2.activeAccountId]: 'gh_octocat',
    });
    render(<ActivityLogView onBack={vi.fn()} />);
    await act(async () => {});
    const chip = screen.getByRole('button', { name: /filter by account/i });
    expect(chip).toHaveTextContent(/this account/i);
    // Only the active account's entries are shown by default.
    const list = screen.getByTestId('activity-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('octo/repo');
    expect(list).not.toHaveTextContent('acme/repo');
  });

  it('switching to "all accounts" merges entries and tags non-active rows with [login]', async () => {
    mockStorage({
      [STORAGE_KEYS_V2.accounts]: {
        gh_octocat: {
          auth: { method: 'pat', token: 't' },
          activity: { entries: [e({ at: 2000, prNumber: 1, repo: 'octo/repo' })] },
        },
        gh_acme: {
          auth: { method: 'pat', token: 't' },
          activity: { entries: [e({ at: 3000, prNumber: 2, repo: 'acme/repo' })] },
        },
      },
      [STORAGE_KEYS_V2.activeAccountId]: 'gh_octocat',
    });
    render(<ActivityLogView onBack={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /filter by account/i }));
    fireEvent.click(screen.getByRole('option', { name: /all accounts/i }));
    await act(async () => {});

    const list = screen.getByTestId('activity-list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // Newer (acme) first.
    expect(items[0]).toHaveTextContent('acme/repo');
    expect(items[1]).toHaveTextContent('octo/repo');
    // Non-active row is tagged.
    const tags = screen.getAllByTestId('activity-account-tag');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toHaveTextContent('[acme]');
  });

  it('switching back to "this account" hides non-active entries and tags', async () => {
    mockStorage({
      [STORAGE_KEYS_V2.accounts]: {
        gh_octocat: {
          auth: { method: 'pat', token: 't' },
          activity: { entries: [e({ prNumber: 1, repo: 'octo/repo' })] },
        },
        gh_acme: {
          auth: { method: 'pat', token: 't' },
          activity: { entries: [e({ prNumber: 2, repo: 'acme/repo' })] },
        },
      },
      [STORAGE_KEYS_V2.activeAccountId]: 'gh_octocat',
    });
    render(<ActivityLogView onBack={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /filter by account/i }));
    fireEvent.click(screen.getByRole('option', { name: /all accounts/i }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /filter by account/i }));
    fireEvent.click(screen.getByRole('option', { name: /this account/i }));
    await act(async () => {});

    const list = screen.getByTestId('activity-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByTestId('activity-account-tag')).not.toBeInTheDocument();
  });
});
