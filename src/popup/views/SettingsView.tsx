import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { AutomationsSettings } from '../components/AutomationsSettings';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { validateHost } from '../../core/host-config';
import type { IntervalMinutes } from '../../core/types';

interface Props {
  onBack: () => void;
  /** Story 4.4 — current auth method, drives the Account section. */
  authMethod?: 'github_app' | 'pat';
  /** Story 4.4 — sign out, returning the user to the choice screen. */
  onSignOut?: () => void;
}

const INTERVALS: Array<{ value: IntervalMinutes; label: string }> = [
  { value: 1,   label: '1m'  },
  { value: 2,   label: '2m'  },
  { value: 5,   label: '5m'  },
  { value: 10,  label: '10m' },
  { value: 15,  label: '15m' },
  { value: 30,  label: '30m' },
  { value: 60,  label: '1h'  },
  { value: 120, label: '2h'  },
  { value: 240, label: '4h'  },
];

async function requestHostPermission(host: string): Promise<boolean> {
  // chrome.permissions may be missing in tests / Firefox edge cases.
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return true;
  return new Promise<boolean>((resolve) => {
    chrome.permissions.request(
      { origins: [`https://${host}/*`] },
      (granted) => resolve(Boolean(granted)),
    );
  });
}

async function removeHostPermission(host: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.remove) return;
  await new Promise<void>((resolve) => {
    chrome.permissions.remove(
      { origins: [`https://${host}/*`] },
      () => resolve(),
    );
  });
}

export function SettingsView({ onBack, authMethod, onSignOut }: Props) {
  const { settings, saveSettings } = useSettings();
  const [hostDraft, setHostDraft] = useState<string>(settings.enterpriseHost ?? '');
  const [clientIdDraft, setClientIdDraft] = useState<string>(settings.enterpriseClientId ?? '');
  const [hostError, setHostError] = useState<string | null>(null);
  const { settings: automation } = useAutomationSettings();
  useKeyboardShortcuts({
    enabled: automation.enableKeyboardShortcuts,
    bindings: { Escape: onBack },
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value) as IntervalMinutes;
    saveSettings({ ...settings, intervalMinutes: val });
  };

  const otherMethodLabel = authMethod === 'github_app' ? 'PAT' : 'GitHub App';

  const applyEnterpriseHost = async () => {
    const trimmed = hostDraft.trim();
    const err = validateHost(trimmed);
    if (err) { setHostError(err); return; }
    setHostError(null);
    if (trimmed) {
      const ok = await requestHostPermission(trimmed);
      if (!ok) {
        setHostError('host permission denied — setting reverted');
        setHostDraft(settings.enterpriseHost ?? '');
        return;
      }
    } else if (settings.enterpriseHost) {
      // Returning to cloud — drop the optional permission we requested earlier.
      await removeHostPermission(settings.enterpriseHost);
    }
    await saveSettings({
      ...settings,
      enterpriseHost: trimmed || undefined,
      enterpriseClientId: trimmed ? (clientIdDraft.trim() || undefined) : undefined,
    });
  };

  return (
    <div className="popup-root">
      <header className="popup-header">
        <button type="button" aria-label="Back" onClick={onBack} className="btn">← back</button>
        <span className="popup-header__title" style={{ marginLeft: 4 }}>settings</span>
      </header>

      <div className="settings">
        <h2 className="settings__heading">general</h2>
        <div className="enterprise-row">
          <span className="settings-row__label">github_poll_interval</span>
          <span className="settings-row__sep" aria-hidden>—</span>
          <select
            value={settings.intervalMinutes}
            onChange={handleChange}
            className="select select--small enterprise-input"
          >
            {INTERVALS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {authMethod && (
          <section className="settings-group" data-testid="account-section">
            <h2 className="settings__heading">account</h2>
            <div className="settings-row settings-row--inline">
              <span className="settings-row__label">auth_method</span>
              <span className="settings-row__sep" aria-hidden>—</span>
              <span className="muted settings-row__value-text">
                {authMethod === 'github_app' ? 'GitHub App' : 'PAT (legacy)'}
              </span>
            </div>
            {onSignOut && (
              <div className="settings-row settings-row--action">
                <button
                  type="button"
                  className="btn"
                  onClick={onSignOut}
                  data-testid="switch-method"
                >
                  switch to {otherMethodLabel}
                </button>
              </div>
            )}
          </section>
        )}

        <section className="settings-group" data-testid="enterprise-section">
          <h2 className="settings__heading">enterprise</h2>
          <div className="enterprise-row">
            <label htmlFor="ghes-host" className="settings-row__label">github_host</label>
            <span className="settings-row__sep" aria-hidden>—</span>
            <input
              id="ghes-host"
              type="text"
              className="input input--small enterprise-input"
              placeholder="github.acme.corp"
              value={hostDraft}
              onChange={(e) => setHostDraft(e.target.value)}
              data-testid="enterprise-host-input"
            />
          </div>
          {hostDraft.trim() && (
            <div className="enterprise-row">
              <label htmlFor="ghes-client-id" className="settings-row__label">
                github_app_client_id
              </label>
              <span className="settings-row__sep" aria-hidden>—</span>
              <input
                id="ghes-client-id"
                type="text"
                className="input input--small enterprise-input"
                placeholder="Iv23li…"
                value={clientIdDraft}
                onChange={(e) => setClientIdDraft(e.target.value)}
                data-testid="enterprise-client-id-input"
              />
            </div>
          )}
          {hostError && (
            <p role="alert" className="ping-confirm__error" data-testid="enterprise-host-error">{hostError}</p>
          )}
          <div className="settings-row settings-row--action enterprise-apply-row">
            <button
              type="button"
              className="btn"
              onClick={applyEnterpriseHost}
              data-testid="enterprise-apply"
            >
              apply
            </button>
            <span className="muted enterprise-hint">
              Switching hosts requires sign-out + sign-in
            </span>
          </div>
        </section>

        <AutomationsSettings authMethod={authMethod} />
      </div>
    </div>
  );
}
