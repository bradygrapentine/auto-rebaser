import type { PRState } from '../../core/types';

const LABELS: Record<PRState, string> = {
  current:        'Current',
  behind:         'Behind',
  updating:       'Updating…',
  updated:        'Updated',
  conflict:       'Conflict',
  'needs-manual': 'Manual',
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
