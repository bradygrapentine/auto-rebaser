// DIGEST-1 — DigestView render. useDigest is mocked so this is a pure render
// test (no Date.now / useActivityLog / chrome.storage pulled in).
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActivityDigest } from '../../../src/core/activity-digest';

const mockUseDigest = vi.fn();
vi.mock('../../../src/popup/hooks/useDigest', () => ({ useDigest: () => mockUseDigest() }));

import { DigestView } from '../../../src/popup/views/DigestView';

function digest(over: Partial<ActivityDigest> = {}): ActivityDigest {
  return {
    windowDays: 7,
    since: 0,
    totalActions: 6,
    byAction: [
      { action: 'rebase', success: 2, failed: 1, skipped: 0, total: 3 },
      { action: 'auto_merge_enabled', success: 1, failed: 0, skipped: 1, total: 2 },
      { action: 'branch_deleted', success: 1, failed: 0, skipped: 0, total: 1 },
    ],
    rebaseSuccess: 2,
    ...over,
  };
}

beforeEach(() => {
  mockUseDigest.mockReturnValue({ digest: digest(), loading: false });
});

describe('DigestView', () => {
  it('renders the rebase headline and one row per action with breakdowns', () => {
    render(<DigestView onBack={() => {}} />);
    expect(screen.getByTestId('digest-headline')).toHaveTextContent('Auto-rebased 2 PRs this week');
    expect(screen.getByTestId('digest-headline')).toHaveTextContent('6 automation actions in the last 7 days');
    expect(screen.getByTestId('digest-row-rebase')).toHaveTextContent('rebased');
    expect(screen.getByTestId('digest-row-auto_merge_enabled')).toBeInTheDocument();
    expect(screen.getByTestId('digest-row-branch_deleted')).toBeInTheDocument();
    // failed/skipped breakdowns surface
    expect(screen.getByTestId('digest-failed-rebase')).toHaveTextContent('1 failed');
    expect(screen.getByTestId('digest-row-auto_merge_enabled')).toHaveTextContent('1 skipped');
  });

  it('singularizes the headline when exactly one rebase', () => {
    mockUseDigest.mockReturnValue({ digest: digest({ rebaseSuccess: 1 }), loading: false });
    render(<DigestView onBack={() => {}} />);
    expect(screen.getByTestId('digest-headline')).toHaveTextContent('Auto-rebased 1 PR this week');
  });

  it('shows the empty state when there is no activity', () => {
    mockUseDigest.mockReturnValue({ digest: digest({ totalActions: 0, byAction: [], rebaseSuccess: 0 }), loading: false });
    render(<DigestView onBack={() => {}} />);
    expect(screen.getByTestId('digest-empty')).toHaveTextContent('No automation activity in the last 7 days');
    expect(screen.queryByTestId('digest-headline')).not.toBeInTheDocument();
  });

  it('shows a loading state', () => {
    mockUseDigest.mockReturnValue({ digest: digest({ totalActions: 0, byAction: [] }), loading: true });
    render(<DigestView onBack={() => {}} />);
    expect(screen.getByTestId('digest-loading')).toBeInTheDocument();
  });

  it('back button + Escape call onBack', () => {
    const onBack = vi.fn();
    render(<DigestView onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
