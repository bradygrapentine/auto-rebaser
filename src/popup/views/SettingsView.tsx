import { useSettings } from '../hooks/useSettings';
import { AutomationsSettings } from '../components/AutomationsSettings';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
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

export function SettingsView({ onBack, authMethod, onSignOut }: Props) {
  const { settings, saveSettings } = useSettings();
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

  return (
    <div className="popup-root">
      <header className="popup-header">
        <button type="button" aria-label="Back" onClick={onBack} className="btn">← back</button>
        <span className="popup-header__title" style={{ marginLeft: 4 }}>settings</span>
      </header>

      <div className="settings">
        <h2 className="settings__heading">general</h2>
        <div className="settings-row">
          <span className="settings-row__label">github_poll_interval</span>
          <select
            value={settings.intervalMinutes}
            onChange={handleChange}
            className="select select--small"
            style={{ width: 'auto' }}
          >
            {INTERVALS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {authMethod && (
          <section className="settings-group" data-testid="account-section">
            <h2 className="settings__heading">account</h2>
            <div className="settings-row">
              <span className="settings-row__label">auth_method</span>
              <span className="muted">
                {authMethod === 'github_app' ? 'GitHub App' : 'Personal Access Token (legacy)'}
              </span>
            </div>
            {onSignOut && (
              <div className="settings-row">
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

        <AutomationsSettings authMethod={authMethod} />
      </div>
    </div>
  );
}
