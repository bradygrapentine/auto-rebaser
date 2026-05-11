// Wave B1 — Header dropdown for switching / adding / signing out accounts.
//
// Closed: shows the active account login + chevron.
// Open: lists every signed-in account, "+ Add account", "Sign out <login>",
// and "Sign out all". Clicking an account row flips active and closes.

import { useEffect, useRef, useState } from 'react';
import type { AccountSummary } from '../../core/storage/account-summary';

interface Props {
  accounts: AccountSummary[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onAddAccount: () => void;
  onSignOut: (id: string) => void;
  onSignOutAll: () => void;
}

export function AccountSwitcher({
  accounts,
  activeId,
  onSwitch,
  onAddAccount,
  onSignOut,
  onSignOutAll,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!active) return null;

  const otherAccountNeedsAttention = accounts.some(
    (a) => a.id !== activeId && a.actionableCount > 0,
  );

  return (
    <div className="account-switcher" ref={ref}>
      <button
        type="button"
        aria-label={
          otherAccountNeedsAttention
            ? `Account ${active.login}, another account has PRs needing attention, click to open switcher`
            : `Account ${active.login}, click to open switcher`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        className="account-switcher__pill"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{active.login}</span>
        <span aria-hidden className="account-switcher__chevron">
          {open ? '▴' : '▾'}
        </span>
        {otherAccountNeedsAttention && (
          <span
            aria-hidden
            className="account-switcher__pill-attention"
            data-testid="account-switcher-pill-attention"
          />
        )}
      </button>
      {open && (
        <div className="account-switcher__menu" role="menu">
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className={`account-switcher__item${a.id === activeId ? ' account-switcher__item--active' : ''}`}
              onClick={() => {
                if (a.id !== activeId) onSwitch(a.id);
                setOpen(false);
              }}
            >
              <span
                aria-hidden
                className={`account-switcher__dot${
                  a.suspended ? ' account-switcher__dot--suspended' : ''
                }${a.id === activeId ? ' account-switcher__dot--active' : ''}`}
              />
              <span className="account-switcher__login">{a.login}</span>
              {a.host && <span className="account-switcher__host">@{a.host}</span>}
              {a.id === activeId && (
                <span className="account-switcher__hint">active</span>
              )}
              {a.suspended && (
                <span className="account-switcher__hint" title="App installation suspended">
                  suspended
                </span>
              )}
              {a.actionableCount > 0 && a.id !== activeId && (
                <span
                  className="account-switcher__dot account-switcher__dot--attention"
                  aria-label={`${a.actionableCount} PR${a.actionableCount === 1 ? '' : 's'} need attention`}
                  data-testid={`account-switcher-row-attention-${a.id}`}
                />
              )}
            </button>
          ))}
          <div className="account-switcher__sep" />
          <button
            type="button"
            role="menuitem"
            className="account-switcher__item account-switcher__item--add"
            onClick={() => {
              onAddAccount();
              setOpen(false);
            }}
          >
            <span aria-hidden className="account-switcher__plus">
              +
            </span>
            <span>Add account</span>
          </button>
          <div className="account-switcher__sep" />
          <button
            type="button"
            role="menuitem"
            className="account-switcher__item account-switcher__item--danger"
            onClick={() => {
              onSignOut(active.id);
              setOpen(false);
            }}
          >
            Sign out {active.login}
          </button>
          {accounts.length > 1 && (
            <button
              type="button"
              role="menuitem"
              className="account-switcher__item account-switcher__item--danger"
              onClick={() => {
                onSignOutAll();
                setOpen(false);
              }}
            >
              Sign out all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
