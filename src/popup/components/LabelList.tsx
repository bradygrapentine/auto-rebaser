import { useState } from 'react';

interface Props {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

// CT-3 — a controlled free-text chip list for label names. Unlike
// RepoOptOutList (whose REPO_RE rejects anything that isn't `owner/repo`),
// labels are arbitrary strings, so this primitive trims + dedupes only. A
// typo'd label simply never matches a PR → fails safe (PR not filtered).
export function LabelList({ label, values, onChange, disabled, placeholder = 'label name' }: Props) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || values.includes(trimmed)) {
      setInput('');
      return;
    }
    onChange([...values, trimmed]);
    setInput('');
  };

  const remove = (value: string) => {
    onChange(values.filter((v) => v !== value));
  };

  return (
    <div data-testid="label-list" className="chip-list-wrap">
      <div className="chip-list-wrap__label">{label}</div>
      <div className="chip-list-wrap__row">
        <input
          type="text"
          value={input}
          aria-label={`${label} input`}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
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
      {values.length > 0 && (
        <ul className="chip-list">
          {values.map((value) => (
            <li key={value} className="chip">
              <span>{value}</span>
              <button
                type="button"
                aria-label={`Remove ${value}`}
                disabled={disabled}
                onClick={() => remove(value)}
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
