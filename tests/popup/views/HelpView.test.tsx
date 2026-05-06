import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HelpView } from '../../../src/popup/views/HelpView';

describe('HelpView', () => {
  it('renders the shortcut table', () => {
    render(<HelpView onBack={() => {}} />);
    expect(screen.getByTestId('help-view')).toBeInTheDocument();
    expect(screen.getByText('poll now')).toBeInTheDocument();
    expect(screen.getByText('focus next PR')).toBeInTheDocument();
    expect(screen.getByText('open focused PR in a new tab')).toBeInTheDocument();
  });

  it('back button calls onBack', () => {
    const onBack = vi.fn();
    render(<HelpView onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onBack', () => {
    const onBack = vi.fn();
    render(<HelpView onBack={onBack} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
