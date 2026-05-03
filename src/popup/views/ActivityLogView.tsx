import { useMemo, useState } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';
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
  if (e.branchRef) parts.push(`'${e.branchRef}'`);
  if (e.mergeMethod) parts.push(e.mergeMethod.toLowerCase());
  if (e.threadId) parts.push(e.threadId);
  if (e.reviewers && e.reviewers.length) parts.push(e.reviewers.map((r) => `@${r}`).join(', '));
  return parts.join(' · ');
}

export function ActivityLogView({ onBack, initialFilter }: Props) {
  const { entries, loading, clear } = useActivityLog();
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
          ~/activity
        </span>
      </header>

      <div className="view-body">
        <div className="activity-toolbar">
          <select
            aria-label="Filter by action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as 'all' | ActivityAction)}
            className="select select--small"
          >
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by repo"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            className="select select--small"
          >
            <option value="all">All repos</option>
            {repoOptions.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
          <label className="activity-toolbar__today">
            <input
              type="checkbox"
              checked={todayOnly}
              onChange={(e) => setTodayOnly(e.target.checked)}
            />
            today only
          </label>
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            disabled={entries.length === 0}
            className="btn"
          >
            clear log
          </button>
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
              <span className="activity-entry__repo">
                {e.repo} #{e.prNumber}
              </span>
              <span className="activity-entry__action">
                {e.action} · {e.result}
                {entryDetails(e) && <> · {entryDetails(e)}</>}
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
