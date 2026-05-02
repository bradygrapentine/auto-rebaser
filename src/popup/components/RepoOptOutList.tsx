import { useState } from 'react';

interface Props {
  label: string;
  repos: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function RepoOptOutList({ label, repos, onChange, disabled }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const trimmed = input.trim();
    if (!REPO_RE.test(trimmed)) {
      setError('Use owner/repo format');
      return;
    }
    if (repos.includes(trimmed)) {
      setError('Already in list');
      return;
    }
    onChange([...repos, trimmed]);
    setInput('');
    setError(null);
  };

  const remove = (repo: string) => {
    onChange(repos.filter((r) => r !== repo));
  };

  return (
    <div data-testid="repo-opt-out-list" className="chip-list-wrap">
      <div className="chip-list-wrap__label">{label}</div>
      <div className="chip-list-wrap__row">
        <input
          type="text"
          value={input}
          aria-label={`${label} input`}
          placeholder="owner/repo"
          disabled={disabled}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="input input--small"
          style={{ flex: 1 }}
        />
        <button type="button" disabled={disabled} onClick={add} className="btn" style={{ marginLeft: 4 }}>
          Add
        </button>
      </div>
      {error && (
        <div role="alert" className="alert alert--inline">
          {error}
        </div>
      )}
      {repos.length > 0 && (
        <ul className="chip-list">
          {repos.map((repo) => (
            <li key={repo} className="chip">
              <span>{repo}</span>
              <button
                type="button"
                aria-label={`Remove ${repo}`}
                disabled={disabled}
                onClick={() => remove(repo)}
                className="chip__remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
