import type { PRGroup } from '../hooks/useGroupedPRs';
import { PRRow } from './PRRow';

interface Props {
  group: PRGroup;
  /** Controlled expansion. */
  expanded: boolean;
  /** Toggle handler. */
  onToggle: () => void;
  /** Logged-in user; when the repo owner matches, the owner prefix is stripped. */
  userLogin?: string;
  /** Story 5.5 — id of the keyboard-focused PR (if any). */
  focusedPRId?: number | null;
}

export function RepoGroup({ group, expanded, onToggle, userLogin, focusedPRId }: Props) {
  const [owner, ...rest] = group.repo.split('/');
  const displayName =
    userLogin && owner.toLowerCase() === userLogin.toLowerCase()
      ? rest.join('/')
      : group.repo;

  return (
    <div className="repo-group">
      <button
        type="button"
        onClick={onToggle}
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
            <PRRow key={pr.id} pr={pr} focused={pr.id === focusedPRId} />
          ))}
        </div>
      )}
    </div>
  );
}
