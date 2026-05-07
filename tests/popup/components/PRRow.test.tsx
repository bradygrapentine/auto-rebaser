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

  it('does not render ping link when no pingState provided', () => {
    render(<PRRow pr={basePR} />);
    expect(screen.queryByTestId('ping-link')).not.toBeInTheDocument();
  });
});
