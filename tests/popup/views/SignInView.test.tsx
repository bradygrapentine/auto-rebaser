import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SignInView } from '../../../src/popup/views/SignInView';

describe('SignInView', () => {
  it('shows app title and description', () => {
    render(<SignInView onSubmit={vi.fn()} />);
    expect(screen.getByText(/auto-rebaser/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save token/i })).toBeInTheDocument();
  });

  it('submitting form calls onSubmit with the entered PAT', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SignInView onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/github_pat/i), {
      target: { value: 'ghp_testtoken' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save token/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('ghp_testtoken'));
  });

  it('button is disabled when input is empty', () => {
    render(<SignInView onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /save token/i })).toBeDisabled();
  });

  it('button is disabled when busy=true', () => {
    render(<SignInView onSubmit={vi.fn()} busy />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('button shows "Verifying…" while busy', () => {
    render(<SignInView onSubmit={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: /verifying/i })).toBeInTheDocument();
  });

  it('shows error message when provided', () => {
    render(<SignInView onSubmit={vi.fn()} error="Invalid token" />);
    expect(screen.getByText('Invalid token')).toBeInTheDocument();
  });

  it('does not show error section when no error', () => {
    render(<SignInView onSubmit={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('submit handler short-circuits when busy=true with non-empty input', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(<SignInView onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/github_pat/i), {
      target: { value: 'ghp_x' },
    });
    rerender(<SignInView onSubmit={onSubmit} busy />);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when input is whitespace only', async () => {
    const onSubmit = vi.fn();
    render(<SignInView onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/github_pat/i), {
      target: { value: '   ' },
    });
    expect(screen.getByRole('button', { name: /save token/i })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
