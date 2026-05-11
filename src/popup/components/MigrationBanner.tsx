import { useEffect, useState } from 'react';
import {
  isMigrationBannerDismissed,
  dismissMigrationBanner,
} from '../../core/migration-banner';

interface Props {
  /** Caller is responsible for sign-out so the user can re-sign in via App. */
  onSwitchToApp: () => void;
}

export function MigrationBanner({ onSwitchToApp }: Props) {
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isMigrationBannerDismissed()
      .then((d) => { if (!cancelled) setHidden(d); })
      .catch(() => { if (!cancelled) setHidden(false); });
    return () => { cancelled = true; };
  }, []);

  if (hidden !== false) return null;

  const dismiss = async () => {
    setHidden(true);
    await dismissMigrationBanner();
  };

  return (
    <div className="migration-banner migration-banner--compact" data-testid="migration-banner" role="region" aria-label="Auth migration suggestion">
      <span className="migration-banner__hint">PAT auth — </span>
      <button
        type="button"
        className="migration-banner__action"
        onClick={onSwitchToApp}
      >
        switch to GitHub App ›
      </button>
      <button
        type="button"
        className="migration-banner__dismiss"
        onClick={dismiss}
        data-testid="migration-banner-dismiss"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
