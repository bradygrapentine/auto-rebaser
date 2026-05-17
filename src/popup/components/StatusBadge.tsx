import type { PRState } from '../../core/types';

const LABELS: Record<PRState, string> = {
  current:        'Current',
  behind:         'Behind',
  pending:        'Pending',
  draft:          'Draft',
  updated:        'Updated',
  conflict:       'Conflict',
  'needs-manual': 'Manual',
  'rebase-rejected': 'Rebase rejected',
  error:          'Error',
  merged:         'Merged',
  closed:         'Closed',
};

interface Props {
  state: PRState;
}

export function StatusBadge({ state }: Props) {
  return (
    <span data-state={state} className="state-badge">
      {LABELS[state]}
    </span>
  );
}
