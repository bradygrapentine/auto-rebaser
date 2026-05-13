import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface Props {
  onBack: () => void;
}

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'r', action: 'Poll now' },
  { keys: 's', action: 'Open settings' },
  { keys: 'j', action: 'Focus next PR' },
  { keys: 'k', action: 'Focus previous PR' },
  { keys: 'Enter', action: 'Open focused PR in a new tab' },
  { keys: '?', action: 'Show this help' },
  { keys: 'Esc', action: 'Go back' },
];

export function HelpView({ onBack }: Props) {
  useKeyboardShortcuts({
    enabled: true,
    bindings: { Escape: onBack },
  });

  return (
    <div className="popup-root popup-root--auto" data-testid="help-view">
      <header className="popup-header">
        <button type="button" aria-label="Back" onClick={onBack} className="btn">
          ← back
        </button>
        <span className="popup-header__title" style={{ marginLeft: 4 }}>
          shortcuts
        </span>
      </header>
      <div className="view-body help-view">
        <dl className="help-shortcuts">
          {SHORTCUTS.map(({ keys, action }) => (
            <div key={keys} className="help-shortcuts__row">
              <dt className="help-shortcuts__keys"><code>{keys}</code></dt>
              <dd className="help-shortcuts__action">{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
