import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from '../../../src/popup/components/StatusBadge';
import type { PRState } from '../../../src/core/types';

const cases: Array<[PRState, string]> = [
  ['current', 'Current'],
  ['behind', 'Behind'],
  ['pending', 'Pending'],
  ['draft', 'Draft'],
  ['updated', 'Updated'],
  ['conflict', 'Conflict'],
  ['needs-manual', 'Manual'],
  ['rebase-rejected', 'Rebase rejected'],
  ['error', 'Error'],
  ['merged', 'Merged'],
  ['closed', 'Closed'],
];

describe('StatusBadge', () => {
  it.each(cases)('state=%s shows label %s', (state, label) => {
    render(<StatusBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(cases)('state=%s has data-state attribute', (state) => {
    render(<StatusBadge state={state} />);
    const el = document.querySelector('[data-state]');
    expect(el).toHaveAttribute('data-state', state);
  });
});
