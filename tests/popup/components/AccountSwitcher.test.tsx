import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AccountSwitcher } from '../../../src/popup/components/AccountSwitcher';
import type { AccountSummary } from '../../../src/core/storage/account-summary';

const account = (over: Partial<AccountSummary> = {}): AccountSummary => ({
  id: 'gh_octocat',
  login: 'octocat',
  avatarUrl: '',
  method: 'github_app',
  host: '',
  suspended: false,
  actionableCount: 0,
  ...over,
});

function setup(props: Partial<Parameters<typeof AccountSwitcher>[0]> = {}) {
  const defaults: Parameters<typeof AccountSwitcher>[0] = {
    accounts: [account()],
    activeId: 'gh_octocat',
    onSwitch: vi.fn(),
    onAddAccount: vi.fn(),
    onSignOut: vi.fn(),
    onSignOutAll: vi.fn(),
  };
  return { ...defaults, ...props };
}

describe('AccountSwitcher', () => {
  it('renders the active login pill', () => {
    render(<AccountSwitcher {...setup()} />);
    expect(screen.getByRole('button', { name: /Account octocat/i })).toBeInTheDocument();
  });

  it('renders nothing when there are no accounts', () => {
    const { container } = render(<AccountSwitcher {...setup({ accounts: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the menu on pill click and shows accounts + actions', () => {
    render(
      <AccountSwitcher
        {...setup({
          accounts: [account(), account({ id: 'gh_acme', login: 'acme-bot' })],
          activeId: 'gh_octocat',
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /octocat active/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /acme-bot/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /add account/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out octocat/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out all/i })).toBeInTheDocument();
  });

  it('clicking a non-active account fires onSwitch and closes the menu', () => {
    const onSwitch = vi.fn();
    render(
      <AccountSwitcher
        {...setup({
          accounts: [account(), account({ id: 'gh_acme', login: 'acme-bot' })],
          activeId: 'gh_octocat',
          onSwitch,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /acme-bot/i }));
    expect(onSwitch).toHaveBeenCalledWith('gh_acme');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clicking the active account is a no-op for onSwitch but still closes', () => {
    const onSwitch = vi.fn();
    render(<AccountSwitcher {...setup({ onSwitch })} />);
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /octocat active/i }));
    expect(onSwitch).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('add-account / sign-out / sign-out-all wire to the right callbacks', () => {
    const onAddAccount = vi.fn();
    const onSignOut = vi.fn();
    const onSignOutAll = vi.fn();
    render(
      <AccountSwitcher
        {...setup({
          accounts: [account(), account({ id: 'gh_b', login: 'b' })],
          onAddAccount,
          onSignOut,
          onSignOutAll,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add account/i }));
    expect(onAddAccount).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out octocat/i }));
    expect(onSignOut).toHaveBeenCalledWith('gh_octocat');

    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out all/i }));
    expect(onSignOutAll).toHaveBeenCalledOnce();
  });

  it('"sign out all" entry is hidden when only one account is signed in', () => {
    render(<AccountSwitcher {...setup()} />);
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    expect(screen.queryByRole('menuitem', { name: /sign out all/i })).not.toBeInTheDocument();
  });

  it('Esc closes the menu', () => {
    render(<AccountSwitcher {...setup()} />);
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('outside click closes the menu', () => {
    render(
      <div>
        <button data-testid="outside">outside</button>
        <AccountSwitcher {...setup()} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders the suspended hint when an account is suspended', () => {
    render(
      <AccountSwitcher
        {...setup({ accounts: [account({ suspended: true })] })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
  });

  it('shows GHES host in the account row when set', () => {
    render(
      <AccountSwitcher
        {...setup({ accounts: [account({ host: 'github.acme.corp' })] })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Account octocat/i }));
    expect(screen.getByText(/@github\.acme\.corp/)).toBeInTheDocument();
  });

});
