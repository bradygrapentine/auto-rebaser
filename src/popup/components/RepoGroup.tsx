import { useState } from 'react';
import type { PRGroup } from '../hooks/useGroupedPRs';
import { PRRow } from './PRRow';

interface Props {
  group: PRGroup;
  /** When true, the group starts expanded on first render. */
  defaultExpanded?: boolean;
  /** Logged-in user; when the repo owner matches, the owner prefix is stripped. */
  userLogin?: string;
}

export function RepoGroup({ group, defaultExpanded = false, userLogin }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [owner, ...rest] = group.repo.split('/');
  const displayName =
    userLogin && owner.toLowerCase() === userLogin.toLowerCase()
      ? rest.join('/')
      : group.repo;

  return (
    <div className="repo-group">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`group-${group.repo}`}
        className="repo-group__header"
      >
        <span className="repo-group__chevron" aria-hidden>{expanded ? '▾' : '▸'}</span>
        <span className="repo-group__name">{displayName}</span>
        <span className="repo-group__count">{group.prs.length}</span>
        {group.hasAttention && !expanded && (
          <span aria-label="needs attention" className="repo-group__attention-dot">●</span>
        )}
      </button>
      {expanded && (
        <div id={`group-${group.repo}`} className="repo-group__list">
          {group.prs.map((pr) => (
            <PRRow key={pr.id} pr={pr} />
          ))}
        </div>
      )}
    </div>
  );
}
