import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../../../src/popup/components/Header';

describe('Header', () => {
  it('shows app title', () => {
    render(<Header onSettings={vi.fn()} />);
    expect(screen.getByText('auto-rebaser')).toBeInTheDocument();
  });

  it('clicking settings calls onSettings', () => {
    const onSettings = vi.fn();
    render(<Header onSettings={onSettings} />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(onSettings).toHaveBeenCalledOnce();
  });

  describe('refresh icon button', () => {
    it('does NOT render when onPollNow is not provided', () => {
      render(<Header onSettings={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /poll now/i })).not.toBeInTheDocument();
    });

    it('renders refresh icon button when onPollNow is provided', () => {
      render(<Header onSettings={vi.fn()} onPollNow={vi.fn()} />);
      expect(screen.getByRole('button', { name: /poll now/i })).toBeInTheDocument();
    });

    it('clicking refresh button calls onPollNow', () => {
      const onPollNow = vi.fn();
      render(<Header onSettings={vi.fn()} onPollNow={onPollNow} />);
      fireEvent.click(screen.getByRole('button', { name: /poll now/i }));
      expect(onPollNow).toHaveBeenCalledOnce();
    });

    it('button is disabled and labeled "Polling" when polling=true', () => {
      render(<Header onSettings={vi.fn()} onPollNow={vi.fn()} polling />);
      const btn = screen.getByRole('button', { name: /polling/i });
      expect(btn).toBeDisabled();
    });

    it('icon has spin class when polling=true', () => {
      const { container } = render(
        <Header onSettings={vi.fn()} onPollNow={vi.fn()} polling />
      );
      expect(container.querySelector('.ar-spin')).toBeInTheDocument();
    });

    it('icon does NOT have spin class when polling=false', () => {
      const { container } = render(
        <Header onSettings={vi.fn()} onPollNow={vi.fn()} />
      );
      expect(container.querySelector('.ar-spin')).not.toBeInTheDocument();
    });
  });

});
