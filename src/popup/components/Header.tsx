import type { ReactNode } from 'react';
import { AccountSwitcher } from './AccountSwitcher';
import type { AccountSummary } from '../../core/storage/account-summary';

interface Props {
  user?: { login: string; avatarUrl: string };
  onSignOut: () => void;
  onSettings: () => void;
  /** When provided, a refresh icon button appears in the toolbar. */
  onPollNow?: () => void;
  /** When true, the refresh icon spins (poll in progress). */
  polling?: boolean;
  /** Wave B1 — multi-account switcher props. When `accounts` is non-empty,
   *  the switcher dropdown replaces the legacy single log-out button. */
  accounts?: AccountSummary[];
  activeId?: string | null;
  onSwitchAccount?: (id: string) => void;
  onAddAccount?: () => void;
  onSignOutAccount?: (id: string) => void;
  onSignOutAll?: () => void;
  /** Story 2.5 — extra controls rendered before the account switcher (e.g. repo filter). */
  extras?: ReactNode;
}

export function Header({
  user,
  onSignOut,
  onSettings,
  onPollNow,
  polling = false,
  accounts,
  activeId,
  onSwitchAccount,
  onAddAccount,
  onSignOutAccount,
  onSignOutAll,
  extras,
}: Props) {
  const showSwitcher =
    accounts && accounts.length > 0 && onSwitchAccount && onAddAccount && onSignOutAccount && onSignOutAll;

  return (
    <header className="popup-header">
      <span className="popup-header__title">auto-rebaser</span>
      {onPollNow && (
        <button
          type="button"
          aria-label={polling ? 'Polling' : 'Poll now'}
          onClick={onPollNow}
          disabled={polling}
          className="ar-icon-button ar-icon-button--lg"
          title="Poll now"
        >
          <span aria-hidden className={polling ? 'ar-spin' : undefined}>↻</span>
        </button>
      )}
      <button
        type="button"
        aria-label="Settings"
        onClick={onSettings}
        className="ar-icon-button ar-icon-button--lg"
        title="Settings"
      >
        <span aria-hidden>⚙</span>
      </button>
      {extras}
      {showSwitcher ? (
        <AccountSwitcher
          accounts={accounts}
          activeId={activeId ?? null}
          onSwitch={onSwitchAccount}
          onAddAccount={onAddAccount}
          onSignOut={onSignOutAccount}
          onSignOutAll={onSignOutAll}
        />
      ) : (
        user && (
          <>
            <span className="header__user" data-testid="header-user">@{user.login}</span>
            <button type="button" aria-label="Sign out" onClick={onSignOut} className="btn">
              log-out
            </button>
          </>
        )
      )}
    </header>
  );
}
