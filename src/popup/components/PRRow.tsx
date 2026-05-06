import type { PRRecord } from '../../core/types';
import type { PRRecordPhaseTwo } from '../../core/automations-types';
import { StatusBadge } from './StatusBadge';

interface Props {
  pr: PRRecord;
}

export function PRRow({ pr }: Props) {
  const extended = pr as PRRecord & PRRecordPhaseTwo;
  const noAllowedMethod = extended.autoMergeSkipReason === 'no-allowed-method';
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      className="pr-row"
      title={pr.errorMessage}
    >
      <span className="pr-row__num" aria-hidden>#{pr.number}</span>
      <span className="pr-row__title">{pr.title}</span>
      {noAllowedMethod && (
        <span
          className="pr-row__skip-badge"
          data-testid="auto-merge-skip-badge"
          title="The repo doesn't allow any of your preferred merge methods."
        >
          auto-merge skipped: no allowed method
        </span>
      )}
      <StatusBadge state={pr.state} />
    </a>
  );
}
