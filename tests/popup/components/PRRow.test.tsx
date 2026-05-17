import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PRRow } from '../../../src/popup/components/PRRow';
import type { PRRecord } from '../../../src/core/types';

const basePR: PRRecord = {
  id: 1,
  number: 42,
  title: 'Fix the bug',
  repo: 'owner/repo',
  url: 'https://github.com/owner/repo/pull/42',
  state: 'behind',
  lastUpdated: 0,
};

describe('PRRow', () => {
  it('renders #number and title', () => {
    render(<PRRow pr={basePR} />);
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('Fix the bug')).toBeInTheDocument();
  });

  it('link has correct href and target', () => {
    render(<PRRow pr={basePR} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/pull/42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it('shows errorMessage as title attribute when present', () => {
    render(<PRRow pr={{ ...basePR, errorMessage: 'merge conflict' }} />);
    const row = document.querySelector('[title]');
    expect(row).toHaveAttribute('title', 'merge conflict');
  });

  it('no title attribute when errorMessage absent', () => {
    render(<PRRow pr={basePR} />);
    const row = document.querySelector('.pr-row');
    expect(row).not.toHaveAttribute('title');
  });

  it('renders auto-merge skip badge when autoMergeSkipReason is set', () => {
    const prWithSkip = { ...basePR, autoMergeSkipReason: 'no-allowed-method' as const };
    render(<PRRow pr={prWithSkip as PRRecord} />);
    expect(screen.getByTestId('auto-merge-skip-badge')).toBeInTheDocument();
  });

  it('does not render skip badge when autoMergeSkipReason is absent', () => {
    render(<PRRow pr={basePR} />);
    expect(screen.queryByTestId('auto-merge-skip-badge')).not.toBeInTheDocument();
  });

  // Story 5.1
  it('renders idle badge when staleness is set and showStaleBadge=true', () => {
    const pr = {
      ...basePR,
      staleness: { idleDays: 14, lastActivityAt: 0 },
    } as PRRecord;
    render(<PRRow pr={pr} showStaleBadge />);
    expect(screen.getByTestId('stale-badge')).toHaveTextContent('idle 2w');
  });

  it('does not render idle badge when showStaleBadge=false', () => {
    const pr = {
      ...basePR,
      staleness: { idleDays: 14, lastActivityAt: 0 },
    } as PRRecord;
    render(<PRRow pr={pr} showStaleBadge={false} />);
    expect(screen.queryByTestId('stale-badge')).not.toBeInTheDocument();
  });

  it('renders ping link when canPing=true and onPing is provided', () => {
    const onPing = vi.fn();
    render(
      <PRRow
        pr={basePR}
        pingState={{ canPing: true, pingedHoursAgo: null }}
        onPing={onPing}
      />
    );
    const link = screen.getByTestId('ping-link');
    expect(link).toHaveTextContent('ping');
    fireEvent.click(link);
    expect(onPing).toHaveBeenCalledWith(basePR);
  });

  it('renders "pinged Xh ago" disabled when throttled', () => {
    render(
      <PRRow
        pr={basePR}
        pingState={{ canPing: false, pingedHoursAgo: 3 }}
        onPing={vi.fn()}
      />
    );
    const link = screen.getByTestId('ping-link');
    expect(link).toHaveTextContent('pinged 3h ago');
    expect(link).toBeDisabled();
  });

  it('renders error hint inline when state=error and errorMessage is set', () => {
    const errPR: PRRecord = { ...basePR, state: 'error', errorMessage: 'HTTP 500: Server Error' };
    render(<PRRow pr={errPR} />);
    expect(screen.getByTestId('pr-error-hint')).toHaveTextContent('HTTP 500: Server Error');
  });

  it('does not render error hint when state is not error', () => {
    render(<PRRow pr={{ ...basePR, errorMessage: 'whatever' }} />);
    expect(screen.queryByTestId('pr-error-hint')).not.toBeInTheDocument();
  });

  it('renders inline install link for App-not-installed errors when installRequestUrl provided', () => {
    const errPR: PRRecord = {
      ...basePR,
      state: 'error',
      errorMessage: 'Auto Rebaser App not installed for this repo',
    };
    render(<PRRow pr={errPR} installRequestUrl="https://github.com/apps/foo/installations/new" />);
    const fix = screen.getByText('install');
    expect(fix).toHaveAttribute('href', 'https://github.com/apps/foo/installations/new');
    expect(fix).toHaveAttribute('target', '_blank');
  });

  it('does not render install link without installRequestUrl', () => {
    const errPR: PRRecord = {
      ...basePR,
      state: 'error',
      errorMessage: 'Auto Rebaser App not installed for this repo',
    };
    render(<PRRow pr={errPR} />);
    expect(screen.queryByText('install')).not.toBeInTheDocument();
  });

  it('install link click does not propagate to row', () => {
    const errPR: PRRecord = {
      ...basePR,
      state: 'error',
      errorMessage: 'Auto Rebaser App not installed for this repo',
    };
    render(<PRRow pr={errPR} installRequestUrl="https://x.test" />);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopProp = vi.spyOn(ev, 'stopPropagation');
    screen.getByText('install').dispatchEvent(ev);
    expect(stopProp).toHaveBeenCalled();
  });

  describe('CONFLICT-1: rebase-rejected chip', () => {
    const rejectedPR: PRRecord = {
      ...basePR,
      state: 'rebase-rejected',
      errorMessage: 'Rebase rejected by GitHub',
    };

    it('renders conflict chip with link to /conflicts when state=rebase-rejected', () => {
      render(<PRRow pr={rejectedPR} />);
      const chip = screen.getByTestId('rebase-rejected-chip');
      expect(chip).toHaveAttribute('href', 'https://github.com/owner/repo/pull/42/conflicts');
      expect(chip).toHaveAttribute('target', '_blank');
      expect(chip).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('does not render chip when state is not rebase-rejected', () => {
      render(<PRRow pr={basePR} />);
      expect(screen.queryByTestId('rebase-rejected-chip')).not.toBeInTheDocument();
    });

    it('chip click does not propagate to outer row anchor', () => {
      render(<PRRow pr={rejectedPR} />);
      const chip = screen.getByTestId('rebase-rejected-chip');
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
      const stopProp = vi.spyOn(ev, 'stopPropagation');
      chip.dispatchEvent(ev);
      expect(stopProp).toHaveBeenCalled();
    });
  });

  it('renders direct-merge-failure badge with method + error in title', () => {
    const failedPR = {
      ...basePR,
      lastDirectMergeFailure: { sha: 'abc', method: 'SQUASH' as const, error: 'SHA_MISMATCH' },
    };
    render(<PRRow pr={failedPR as PRRecord} />);
    const badge = screen.getByTestId('direct-merge-failure-badge');
    expect(badge).toHaveTextContent('merge failed: SHA_MISMATCH');
    expect(badge).toHaveAttribute('title', 'Direct merge (squash) failed: SHA_MISMATCH');
  });

  it('does not render direct-merge-failure badge when no-allowed-method skip is set', () => {
    const both = {
      ...basePR,
      autoMergeSkipReason: 'no-allowed-method' as const,
      lastDirectMergeFailure: { sha: 'abc', method: 'SQUASH' as const, error: 'whatever' },
    };
    render(<PRRow pr={both as PRRecord} />);
    expect(screen.queryByTestId('direct-merge-failure-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('auto-merge-skip-badge')).toBeInTheDocument();
  });

  it('does not render ping link when no pingState provided', () => {
    render(<PRRow pr={basePR} />);
    expect(screen.queryByTestId('ping-link')).not.toBeInTheDocument();
  });
});
