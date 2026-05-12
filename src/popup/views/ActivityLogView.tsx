import { useMemo, useState } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useAccounts } from '../hooks/useAccounts';
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
  auto_merged_now: 'auto_merged_now',
  thread_resolved: 'thread_resolved',
  reviewer_pinged: 'reviewer_pinged',
  rerequest_review: 'rerequest_review',
  reviewer_auto_merge_armed: 'reviewer_auto_merge_armed',
};

function formatTime(at: number, now: number = Date.now()): string {
  const ageMs = now - at;
  if (ageMs < 60_000) return 'just now';
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  if (ageMs < 7 * 86_400_000) return `${Math.floor(ageMs / 86_400_000)}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toLocalDateString(at: number): string {
  const d = new Date(at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type SortKey = 'newest' | 'oldest' | 'repo';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  repo: 'Repo (A→Z)',
};

function entryDetails(e: ActivityEntry): string {
  const parts: string[] = [];
  if (e.branchRef) parts.push(`'${e.branchRef}' #${e.prNumber}`);
  if (e.mergeMethod) parts.push(e.mergeMethod.toLowerCase());
  if (e.threadId) parts.push(e.threadId);
  if (e.reviewers && e.reviewers.length) parts.push(e.reviewers.map((r) => `@${r}`).join(', '));
  return parts.join(' · ');
}

export function ActivityLogView({ onBack, initialFilter }: Props) {
  const { accounts, activeId } = useAccounts();
  const showAccountChip = accounts.length > 1;
  const { entries, loading, clear } = useActivityLog({ scope: 'all' });
  const loginById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.id] = a.login;
    return m;
  }, [accounts]);
  const { settings: automation } = useAutomationSettings();
  useKeyboardShortcuts({
    enabled: automation.enableKeyboardShortcuts,
    bindings: { Escape: onBack },
  });
  const [actionFilter, setActionFilter] = useState<'all' | ActivityAction>('all');
  const [repoFilter, setRepoFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>(
    initialFilter?.todayOnly ? toLocalDateString(Date.now()) : '',
  );
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const repoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.repo);
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const sorters: Record<SortKey, (a: ActivityEntry, b: ActivityEntry) => number> = {
      newest: (a, b) => b.at - a.at,
      oldest: (a, b) => a.at - b.at,
      repo: (a, b) => a.repo.localeCompare(b.repo) || b.at - a.at,
    };
    return entries
      .filter((e) => actionFilter === 'all' || e.action === actionFilter)
      .filter((e) => repoFilter === 'all' || e.repo === repoFilter)
      .filter((e) => !dateFilter || toLocalDateString(e.at) === dateFilter)
      .slice()
      .sort(sorters[sortKey]);
  }, [entries, actionFilter, repoFilter, dateFilter, sortKey]);

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
          <div className="activity-toolbar__sort-row">
            <Select
              ariaLabel="Sort by"
              value={sortKey}
              onChange={(v) => setSortKey(v as SortKey)}
              options={Object.entries(SORT_LABELS).map(([value, label]) => ({
                value, label,
              }))}
            />
            <label className="activity-toolbar__date">
              <span className="activity-toolbar__date-label">date</span>
              <input
                type="date"
                aria-label="Filter by date"
                className="input input--small"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              {(() => {
                const todayStr = toLocalDateString(Date.now());
                const isToday = dateFilter === todayStr;
                return (
                  <button
                    type="button"
                    className={`btn btn--small${isToday ? ' btn--small-active' : ''}`}
                    onClick={() => setDateFilter(isToday ? '' : todayStr)}
                    aria-label={isToday ? 'Clear date filter' : 'Set date to today'}
                    aria-pressed={isToday}
                  >
                    today
                  </button>
                );
              })()}
            </label>
          </div>
        </div>

        {confirmingClear && (
          <div role="alertdialog" className="activity-confirm">
            <p>This deletes activity history — cannot be undone</p>
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
            No activity yet — the extension logs every automated action here
          </p>
        )}

        <ul className="activity-list" data-testid="activity-list">
          {filtered.map((e, i) => {
            const href = e.prUrl ?? `https://github.com/${e.repo}/pull/${e.prNumber}`;
            return (
              <li
                key={`${e.at}-${i}`}
                className={`activity-entry activity-entry--${e.result}`}
                data-action={e.action}
                data-repo={e.repo}
              >
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="activity-entry__link"
                >
                  <span className="activity-entry__time">{formatTime(e.at)}</span>
                  {showAccountChip && e.accountId && e.accountId !== activeId && (
                    <span className="activity-entry__account-tag" data-testid="activity-account-tag">
                      [{loginById[e.accountId] ?? e.accountId}]
                    </span>
                  )}
                  <span className="activity-entry__repo">{e.repo}</span>
                  <span className="activity-entry__action">
                    {e.action}
                    {e.result === 'failed' ? <> · failed</> : null}
                    {e.result === 'skipped' ? <> · skipped</> : null}
                    {entryDetails(e) ? <> · {entryDetails(e)}</> : <> · #{e.prNumber}</>}
                  </span>
                  {e.errorMessage && (
                    <span className="activity-entry__error">"{e.errorMessage}"</span>
                  )}
                  {e.result === 'skipped' && e.skipReason && (
                    <span className="activity-entry__skip-reason">
                      {e.skipReason === 'already_clean'
                        ? 'already mergeable — no action needed'
                        : 'already merged — landed before our call'}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
