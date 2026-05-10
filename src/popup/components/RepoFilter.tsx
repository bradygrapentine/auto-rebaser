// Story 2.5 — Header dropdown that scopes the popup PR list to a chosen subset
// of repos. Multi-select. Display-only — does not change polling.
//
// Closed: shows `filter` (or `filter (N)` when active) + chevron.
// Open: lists every repo with a checkbox, plus a "clear all" footer when any
// repo is selected. Outside-click + Esc close.

import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  /** All repos that should appear in the menu (typically every repo present in the active account's PR store). */
  repos: string[];
  /** Currently-selected repos. Empty array means no filter. */
  selected: string[];
  onChange: (next: string[]) => void;
}

export function RepoFilter({ repos, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Show every known repo plus any orphaned selections (repo previously selected
  // but no longer in the PR list — preserve so the user can still uncheck it).
  const sorted = useMemo(() => {
    const all = new Set(repos);
    for (const r of selected) all.add(r);
    return Array.from(all).sort();
  }, [repos, selected]);

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

  if (sorted.length === 0) return null;

  const toggle = (repo: string) => {
    const next = new Set(selectedSet);
    if (next.has(repo)) next.delete(repo);
    else next.add(repo);
    onChange(Array.from(next));
  };

  const label = selected.length > 0 ? `filter (${selected.length})` : 'filter';

  return (
    <div className="repo-filter" ref={ref}>
      <button
        type="button"
        aria-label={selected.length > 0 ? `Repo filter, ${selected.length} selected` : 'Repo filter'}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`repo-filter__pill${selected.length > 0 ? ' repo-filter__pill--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        data-testid="repo-filter-pill"
      >
        <span>{label}</span>
        <span aria-hidden className="repo-filter__chevron">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="repo-filter__menu" role="menu" data-testid="repo-filter-menu">
          {sorted.map((repo) => {
            const checked = selectedSet.has(repo);
            return (
              <label
                key={repo}
                className={`repo-filter__item${checked ? ' repo-filter__item--checked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(repo)}
                  aria-label={`Filter to ${repo}`}
                />
                <span className="repo-filter__name">{repo}</span>
              </label>
            );
          })}
          {selected.length > 0 && (
            <>
              <div className="repo-filter__sep" />
              <button
                type="button"
                role="menuitem"
                className="repo-filter__item repo-filter__item--clear"
                onClick={() => {
                  onChange([]);
                  setOpen(false);
                }}
                data-testid="repo-filter-clear"
              >
                clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
