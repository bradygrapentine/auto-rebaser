import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignInView } from '../../../src/popup/views/SignInView';

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: { state: 'pending' },
  });
  (chrome.tabs.create as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

/** Navigate from the choice screen to the PAT form. */
function gotoPATView() {
  fireEvent.click(screen.getByTestId('signin-pat'));
}

describe('SignInView', () => {
  it('shows app title and both choice buttons by default', () => {
    render(<SignInView onSubmit={vi.fn()} />);
    expect(screen.getByText(/auto-rebaser/)).toBeInTheDocument();
    expect(screen.getByTestId('signin-github-app')).toBeInTheDocument();
    expect(screen.getByTestId('signin-pat')).toBeInTheDocument();
  });

  it('PAT path: submitting form calls onSubmit with the entered PAT', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SignInView onSubmit={onSubmit} />);
    gotoPATView();
    fireEvent.change(screen.getByLabelText(/github_pat/i), {
      target: { value: 'ghp_testtoken' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save token/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('ghp_testtoken'));
  });

  it('PAT button disabled when input is empty', () => {
    render(<SignInView onSubmit={vi.fn()} />);
    gotoPATView();
    expect(screen.getByRole('button', { name: /save token/i })).toBeDisabled();
  });

  it('PAT button disabled when busy=true', () => {
    render(<SignInView onSubmit={vi.fn()} busy />);
    gotoPATView();
    expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled();
  });

  it('shows error message when provided in PAT view', () => {
    render(<SignInView onSubmit={vi.fn()} error="Invalid token" />);
    gotoPATView();
    expect(screen.getByText('Invalid token')).toBeInTheDocument();
  });

  it('does not show error section when no error', () => {
    render(<SignInView onSubmit={vi.fn()} />);
    gotoPATView();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not submit when PAT input is whitespace only', () => {
    const onSubmit = vi.fn();
    render(<SignInView onSubmit={onSubmit} />);
    gotoPATView();
    fireEvent.change(screen.getByLabelText(/github_pat/i), {
      target: { value: '   ' },
    });
    expect(screen.getByRole('button', { name: /save token/i })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Story 4.2 — Device Flow

  it('clicking GitHub App button starts device flow and shows the user code', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'AUTH_BEGIN_DEVICE_FLOW') {
        return {
          ok: true,
          data: {
            userCode: 'ABCD-1234',
            verificationUri: 'https://github.com/login/device',
            deviceCode: 'DC1',
            intervalMs: 5000,
            expiresAt: Date.now() + 900_000,
          },
        };
      }
      return { ok: true, data: { state: 'pending' } };
    });

    render(<SignInView onSubmit={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-github-app'));
    });
    expect(await screen.findByTestId('device-code')).toHaveTextContent('ABCD-1234');
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://github.com/login/device',
    });
  });

  it('cancel from device-flow view sends cancel message and returns to choice', async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      data: {
        userCode: 'X', verificationUri: 'https://github.com/login/device',
        deviceCode: 'D', intervalMs: 5000, expiresAt: Date.now() + 900_000,
      },
    });

    render(<SignInView onSubmit={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('signin-github-app'));
    });
    await screen.findByTestId('device-code');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'AUTH_CANCEL_DEVICE_FLOW',
    });
    // Back on the choice view
    expect(screen.getByTestId('signin-github-app')).toBeInTheDocument();
  });
});
