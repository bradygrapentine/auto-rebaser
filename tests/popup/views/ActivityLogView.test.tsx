import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityLogView } from '../../../src/popup/views/ActivityLogView';
import type { ActivityEntry } from '../../../src/core/activity-log-types';

const e = (over: Partial<ActivityEntry>): ActivityEntry => ({
  at: Date.now() - 60_000,
  action: 'rebase',
  repo: 'a/b',
  prNumber: 1,
  prTitle: 't',
  result: 'success',
  ...over,
});

function mountWith(entries: ActivityEntry[], initialFilter?: { todayOnly?: boolean }) {
  (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
    activity: { entries },
  });
  return render(<ActivityLogView onBack={vi.fn()} initialFilter={initialFilter} />);
}

describe('ActivityLogView', () => {
  beforeEach(() => {
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({});
  });

  it('shows empty-state copy when no entries', async () => {
    mountWith([]);
    await act(async () => {});
    expect(screen.getByTestId('activity-empty')).toHaveTextContent(/no activity yet/i);
  });

  it('renders entries newest-first', async () => {
    mountWith([
      e({ at: 1000, prNumber: 1 }),
      e({ at: 2000, prNumber: 2 }),
      e({ at: 3000, prNumber: 3 }),
    ]);
    await act(async () => {});
    const list = screen.getByTestId('activity-list');
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('#3');
    expect(items[2]).toHaveTextContent('#1');
  });

  it('action filter narrows entries client-side', async () => {
    mountWith([
      e({ action: 'rebase', prNumber: 1 }),
      e({ action: 'branch_deleted', prNumber: 2 }),
      e({ action: 'rebase', prNumber: 3 }),
    ]);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /filter by action/i }));
    fireEvent.click(screen.getByRole('option', { name: 'branch_deleted' }));
    const items = within(screen.getByTestId('activity-list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('#2');
  });

  it('repo filter narrows entries client-side', async () => {
    mountWith([
      e({ repo: 'org/a', prNumber: 1 }),
      e({ repo: 'org/b', prNumber: 2 }),
    ]);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /filter by repo/i }));
    fireEvent.click(screen.getByRole('option', { name: 'org/b' }));
    const items = within(screen.getByTestId('activity-list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('org/b');
  });

  it('initialFilter.todayOnly limits to today entries', async () => {
    const yesterday = Date.now() - 26 * 60 * 60 * 1000;
    mountWith(
      [
        e({ at: yesterday, prNumber: 1 }),
        e({ at: Date.now() - 60_000, prNumber: 2 }),
      ],
      { todayOnly: true },
    );
    await act(async () => {});
    const items = within(screen.getByTestId('activity-list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('#2');
  });

  it('clear log: confirm dialog → confirm calls storage.set with empty entries', async () => {
    (chrome.storage.local.set as ReturnType<typeof Object>).mockResolvedValue(undefined);
    mountWith([e({})]);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /clear log/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ activity: { entries: [] } });
  });

  it('clear log cancel does not touch storage', async () => {
    mountWith([e({})]);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /clear log/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('clear-log button is disabled when no entries', async () => {
    mountWith([]);
    await act(async () => {});
    expect(screen.getByRole('button', { name: /clear log/i })).toBeDisabled();
  });

  it('back button calls onBack', async () => {
    const onBack = vi.fn();
    (chrome.storage.local.get as ReturnType<typeof Object>).mockResolvedValue({
      activity: { entries: [] },
    });
    render(<ActivityLogView onBack={onBack} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it('renders entry details: branchRef for branch_deleted', async () => {
    mountWith([
      e({ action: 'branch_deleted', branchRef: 'feat/x' }),
    ]);
    await act(async () => {});
    expect(screen.getByText(/feat\/x/)).toBeInTheDocument();
  });

  it('renders entry details: mergeMethod for auto_merge_enabled', async () => {
    mountWith([
      e({ action: 'auto_merge_enabled', mergeMethod: 'SQUASH' }),
    ]);
    await act(async () => {});
    expect(screen.getByText(/squash/)).toBeInTheDocument();
  });

  it('renders entry details: reviewers for reviewer_pinged', async () => {
    mountWith([
      e({ action: 'reviewer_pinged', reviewers: ['octocat', 'hubot'] }),
    ]);
    await act(async () => {});
    expect(screen.getByText(/@octocat, @hubot/)).toBeInTheDocument();
  });

  it('renders error message for failed entries', async () => {
    mountWith([
      e({ result: 'failed', errorMessage: 'rate limit' }),
    ]);
    await act(async () => {});
    expect(screen.getByText(/rate limit/)).toBeInTheDocument();
  });

  it('formats recent times as relative (Nm ago)', async () => {
    mountWith([e({ at: Date.now() - 5 * 60_000 })]);
    await act(async () => {});
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
  });

  it('formats just-now (<1min) as "just now"', async () => {
    mountWith([e({ at: Date.now() - 5_000 })]);
    await act(async () => {});
    expect(screen.getByText(/just now/)).toBeInTheDocument();
  });

  it('today-only checkbox toggles filtering', async () => {
    const yesterday = Date.now() - 26 * 60 * 60 * 1000;
    mountWith([
      e({ at: yesterday, prNumber: 99 }),
      e({ at: Date.now() - 60_000, prNumber: 100 }),
    ]);
    await act(async () => {});
    const cb = screen.getByLabelText(/today only/i);
    fireEvent.click(cb);
    const items = within(screen.getByTestId('activity-list')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('#100');
  });
});
