import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Select } from '../../../src/popup/components/Select';

const OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
];

describe('Select', () => {
  it('opens on trigger click and closes on outside click (covers click-outside handler)', () => {
    render(
      <div>
        <Select value="a" options={OPTIONS} onChange={vi.fn()} ariaLabel="picker" />
        <div data-testid="outside">elsewhere</div>
      </div>,
    );
    const trigger = screen.getByRole('button', { name: /picker/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'B' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('option', { name: 'B' })).not.toBeInTheDocument();
  });

  it('closes on Escape (covers Escape handler)', () => {
    render(
      <Select value="a" options={OPTIONS} onChange={vi.fn()} ariaLabel="picker" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /picker/i }));
    expect(screen.getByRole('option', { name: 'B' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('option', { name: 'B' })).not.toBeInTheDocument();
  });
});
