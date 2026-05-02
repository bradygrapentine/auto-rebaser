interface Props {
  user?: { login: string; avatarUrl: string };
  onSignOut: () => void;
  onSettings: () => void;
  /** When provided, a refresh icon button appears in the toolbar. */
  onPollNow?: () => void;
  /** When true, the refresh icon spins (poll in progress). */
  polling?: boolean;
}

export function Header({ user, onSignOut, onSettings, onPollNow, polling = false }: Props) {
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
      {user && (
        <button type="button" aria-label="Sign out" onClick={onSignOut} className="btn">
          log-out
        </button>
      )}
    </header>
  );
}
