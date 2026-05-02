import type { PRRecord } from '../../core/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  pr: PRRecord;
}

export function PRRow({ pr }: Props) {
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
      <StatusBadge state={pr.state} />
    </a>
  );
}
