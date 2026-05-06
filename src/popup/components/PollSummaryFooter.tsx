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
  // lastPollSummary / lastDeletedBranch are kept on the store for the activity
  // log itself; the footer no longer surfaces them inline.
  usePRStore();
  const { entries } = useActivityLog();
  const total = entries.length;

  if (!onOpenActivity || total === 0) return null;

  return (
    <div data-testid="poll-summary-footer" className="popup-footer__delta">
      <button
        type="button"
        className="popup-footer__view-activity"
        onClick={() => onOpenActivity(false)}
        data-testid="view-activity"
      >
        View activity ({total})
      </button>
    </div>
  );
}
