import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface Props {
  onBack: () => void;
}

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'r', action: 'poll now' },
  { keys: 's', action: 'open settings' },
  { keys: 'j', action: 'focus next PR' },
  { keys: 'k', action: 'focus previous PR' },
  { keys: 'Enter', action: 'open focused PR in a new tab' },
  { keys: '?', action: 'show this help' },
  { keys: 'Esc', action: 'go back' },
];

export function HelpView({ onBack }: Props) {
  useKeyboardShortcuts({
    enabled: true,
    bindings: { Escape: onBack },
  });

  return (
    <div className="popup-root" data-testid="help-view">
      <header className="view-header">
        <button type="button" className="btn" onClick={onBack}>back</button>
        <h2 className="view-header__title">keyboard shortcuts</h2>
      </header>
      <div className="view-body">
        <table className="help-shortcuts">
          <tbody>
            {SHORTCUTS.map(({ keys, action }) => (
              <tr key={keys}>
                <td className="help-shortcuts__keys"><code>{keys}</code></td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
