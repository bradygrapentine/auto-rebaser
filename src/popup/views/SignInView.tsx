import { useState } from 'react';

interface Props {
  onSubmit: (pat: string) => Promise<void>;
  busy?: boolean;
  error?: string;
}

export function SignInView({ onSubmit, busy = false, error }: Props) {
  const [pat, setPat] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim() || busy) return;
    await onSubmit(pat);
  };

  return (
    <div className="signin">
      <h1 className="signin__title">auto-rebaser --auth</h1>
      <p className="signin__lede">
        Keep your GitHub PRs up to date automatically.
      </p>

      <form onSubmit={submit}>
        <label htmlFor="pat-input" className="label">
          github_pat
        </label>
        <input
          id="pat-input"
          type="password"
          autoComplete="off"
          autoFocus
          value={pat}
          onChange={(e) => setPat(e.target.value)}
          placeholder="ghp_… or github_pat_…"
          disabled={busy}
          className="input"
          style={{ fontFamily: 'inherit' }}
        />
        <p className="help">
          required scope: <code>repo</code>. add <code>notifications</code> if you plan to enable auto-dismiss-stale-notifications.{' '}
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=Auto%20Rebaser"
            target="_blank"
            rel="noreferrer"
          >
            generate →
          </a>
        </p>
        <button
          type="submit"
          disabled={busy || !pat.trim()}
          className="btn btn--primary btn--block"
        >
          {busy ? 'verifying…' : 'save token'}
        </button>
      </form>

      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
    </div>
  );
}
