import { usePRStore } from '../hooks/usePRStore';
import { useActivityLog } from '../hooks/useActivityLog';

interface Props {
  /**
   * Open the activity-log view. The boolean argument indicates whether to
   * pre-apply the "today only" filter — true when the user clicked the
   * counter line, false when they clicked the secondary "view activity" link.
   */
  onOpenActivity?: (todayOnly: boolean) => void;
}

export function PollSummaryFooter({ onOpenActivity }: Props = {}) {
  const { lastPollSummary, lastDeletedBranch } = usePRStore();
  const { entries } = useActivityLog();
  const rebased = lastPollSummary?.rebased ?? 0;
  const total = entries.length;

  if (rebased === 0 && !lastDeletedBranch && total === 0) return null;

  const counterClickable = onOpenActivity && (rebased > 0 || lastDeletedBranch);

  return (
    <div data-testid="poll-summary-footer" className="popup-footer__delta">
      {(rebased > 0 || lastDeletedBranch) && (
        <button
          type="button"
          className="popup-footer__counter"
          onClick={counterClickable ? () => onOpenActivity!(true) : undefined}
          disabled={!counterClickable}
          data-testid="poll-counter-clickable"
        >
          {rebased > 0 && (
            <span data-counter="rebased">
              rebased <strong>{rebased}</strong>
            </span>
          )}
          {lastDeletedBranch && (
            <span data-testid="last-deleted-branch">
              {' '}deleted <code>{lastDeletedBranch.repo}</code>:<code>{lastDeletedBranch.ref}</code>
            </span>
          )}
        </button>
      )}
      {onOpenActivity && total > 0 && (
        <button
          type="button"
          className="popup-footer__view-activity"
          onClick={() => onOpenActivity(false)}
          data-testid="view-activity"
        >
          view activity ({total})
        </button>
      )}
    </div>
  );
}
