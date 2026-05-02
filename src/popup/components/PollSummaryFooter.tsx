import { usePRStore } from '../hooks/usePRStore';

export function PollSummaryFooter() {
  const { lastPollSummary, lastDeletedBranch } = usePRStore();
  const rebased = lastPollSummary?.rebased ?? 0;

  if (rebased === 0 && !lastDeletedBranch) return null;

  return (
    <div data-testid="poll-summary-footer" className="popup-footer__delta">
      {rebased > 0 && (
        <span data-counter="rebased">
          rebased <strong>{rebased}</strong>
        </span>
      )}
      {lastDeletedBranch && (
        <span data-testid="last-deleted-branch">
          deleted <code>{lastDeletedBranch.repo}</code>:<code>{lastDeletedBranch.ref}</code>
        </span>
      )}
    </div>
  );
}
