import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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
    expect(link).toHaveAttribute('rel', 'noreferrer');
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
});
