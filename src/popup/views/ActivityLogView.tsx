import { useMemo, useState } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Select } from '../components/Select';
import type { ActivityAction, ActivityEntry } from '../../core/activity-log-types';

interface Props {
  onBack: () => void;
  initialFilter?: { todayOnly?: boolean };
}

const ACTION_LABELS: Record<ActivityAction | 'all', string> = {
  all: 'All actions',
  rebase: 'rebase',
  branch_deleted: 'branch_deleted',
  auto_merge_enabled: 'auto_merge_enabled',
  thread_resolved: 'thread_resolved',
  notification_dismissed: 'notification_dismissed',
  reviewer_pinged: 'reviewer_pinged',
};

function formatTime(at: number, now: number = Date.now()): string {
  const ageMs = now - at;
  if (ageMs < 60_000) return 'just now';
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  return new Date(at).toLocaleString();
}

function isToday(at: number, now: number = Date.now()): boolean {
  const a = new Date(at);
  const b = new Date(now);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function entryDetails(e: ActivityEntry): string {
  const parts: string[] = [];
  if (e.branchRef) parts.push(`'${e.branchRef}' #${e.prNumber}`);
  if (e.mergeMethod) parts.push(e.mergeMethod.toLowerCase());
  if (e.threadId) parts.push(e.threadId);
  if (e.reviewers && e.reviewers.length) parts.push(e.reviewers.map((r) => `@${r}`).join(', '));
  return parts.join(' · ');
}

export function ActivityLogView({ onBack, initialFilter }: Props) {
  const { entries, loading, clear } = useActivityLog();
  const { settings: automation } = useAutomationSettings();
  useKeyboardShortcuts({
    enabled: automation.enableKeyboardShortcuts,
    bindings: { Escape: onBack },
  });
  const [actionFilter, setActionFilter] = useState<'all' | ActivityAction>('all');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [todayOnly, setTodayOnly] = useState<boolean>(initialFilter?.todayOnly ?? false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const repoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.repo);
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => actionFilter === 'all' || e.action === actionFilter)
      .filter((e) => repoFilter === 'all' || e.repo === repoFilter)
      .filter((e) => !todayOnly || isToday(e.at))
      .slice()
      .reverse(); // newest first for display
  }, [entries, actionFilter, repoFilter, todayOnly]);

  return (
    <div className="popup-root">
      <header className="popup-header">
        <button type="button" aria-label="Back" onClick={onBack} className="btn">
          ← back
        </button>
        <span className="popup-header__title" style={{ marginLeft: 4 }}>
          activity
        </span>
        <button
          type="button"
          onClick={() => setConfirmingClear(true)}
          disabled={entries.length === 0}
          className="btn"
        >
          clear log
        </button>
      </header>

      <div className="view-body activity-view">
        <div className="activity-toolbar">
          <div className="activity-toolbar__filters">
            <Select
              ariaLabel="Filter by action"
              value={actionFilter}
              onChange={(v) => setActionFilter(v as 'all' | ActivityAction)}
              options={Object.entries(ACTION_LABELS).map(([value, label]) => ({
                value, label,
              }))}
            />
            <Select
              ariaLabel="Filter by repo"
              value={repoFilter}
              onChange={setRepoFilter}
              options={[
                { value: 'all', label: 'All repos' },
                ...repoOptions.map((r) => ({ value: r, label: r })),
              ]}
            />
          </div>
          <label className="toggle activity-toolbar__today">
            <span>today only</span>
            <input
              type="checkbox"
              checked={todayOnly}
              onChange={(e) => setTodayOnly(e.target.checked)}
            />
          </label>
        </div>

        {confirmingClear && (
          <div role="alertdialog" className="activity-confirm">
            <p>This deletes activity history. Cannot be undone.</p>
            <div>
              <button type="button" onClick={() => setConfirmingClear(false)} className="btn">
                cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clear();
                  setConfirmingClear(false);
                }}
                className="btn btn--primary"
              >
                clear
              </button>
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="empty-state" data-testid="activity-empty">
            No activity yet. The extension logs every automated action here.
          </p>
        )}

        <ul className="activity-list" data-testid="activity-list">
          {filtered.map((e, i) => (
            <li
              key={`${e.at}-${i}`}
              className={`activity-entry activity-entry--${e.result}`}
              data-action={e.action}
              data-repo={e.repo}
            >
              <span className="activity-entry__time">{formatTime(e.at)}</span>
              <span className="activity-entry__repo">{e.repo}</span>
              <span className="activity-entry__action">
                {e.action} · {e.result}
                {entryDetails(e) ? <> · {entryDetails(e)}</> : <> · #{e.prNumber}</>}
              </span>
              {e.errorMessage && (
                <span className="activity-entry__error">"{e.errorMessage}"</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
