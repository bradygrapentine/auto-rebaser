import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LabelList } from '../../../src/popup/components/LabelList';

describe('LabelList — CT-3c suggestions', () => {
  it('renders a <datalist> with the suggestions and links the input to it', () => {
    render(
      <LabelList label="Include" values={[]} onChange={vi.fn()} suggestions={['bug', 'p1']} />,
    );
    const input = screen.getByLabelText('Include input') as HTMLInputElement;
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    // useId() ids contain colons → not a valid CSS #id selector; use getElementById.
    const list = document.getElementById(listId!) as HTMLDataListElement;
    const options = list.querySelectorAll('option');
    expect(Array.from(options).map((o) => o.getAttribute('value'))).toEqual(['bug', 'p1']);
  });

  it('filters out already-added values from the suggestions', () => {
    render(
      <LabelList label="Include" values={['bug']} onChange={vi.fn()} suggestions={['bug', 'p1']} />,
    );
    const input = screen.getByLabelText('Include input') as HTMLInputElement;
    const list = document.getElementById(input.getAttribute('list')!) as HTMLDataListElement;
    expect(Array.from(list.querySelectorAll('option')).map((o) => o.getAttribute('value'))).toEqual(['p1']);
  });

  it('renders no datalist (and unlinks the input) when no suggestions remain', () => {
    render(<LabelList label="Include" values={['bug']} onChange={vi.fn()} suggestions={['bug']} />);
    const input = screen.getByLabelText('Include input') as HTMLInputElement;
    expect(input.getAttribute('list')).toBeNull();
    expect(document.querySelector('datalist')).toBeNull();
  });

  it('renders no datalist when suggestions prop is omitted (back-compat)', () => {
    render(<LabelList label="Include" values={[]} onChange={vi.fn()} />);
    expect(document.querySelector('datalist')).toBeNull();
  });
});
