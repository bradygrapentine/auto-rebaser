import { useState } from 'react';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKnownRepos } from '../hooks/useKnownRepos';
import { RepoOptOutList } from './RepoOptOutList';
import type { MergeMethod, StaleThresholdDays } from '../../core/automations-types';

const MERGE_METHOD_LABELS: Record<MergeMethod, string> = {
  SQUASH: 'squash',
  MERGE: 'merge',
  REBASE: 'rebase',
};

const ALL_MERGE_METHODS: MergeMethod[] = ['SQUASH', 'REBASE', 'MERGE'];

function reorder<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [m] = next.splice(from, 1);
  next.splice(to, 0, m);
  return next;
}

type SubKey = 'ignored' | 'autoRebase' | 'autoDelete' | 'autoMerge' | 'mergeClean' | 'autoResolve' | 'shortcuts' | 'stale' | 'notifications';

async function requestNotificationsPermission(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return true;
  return new Promise<boolean>((resolve) => {
    chrome.permissions.request({ permissions: ['notifications'] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

async function removeNotificationsPermission(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.permissions?.remove) return;
  await new Promise<void>((resolve) => {
    chrome.permissions.remove({ permissions: ['notifications'] }, () => resolve());
  });
}

const STALE_THRESHOLDS: StaleThresholdDays[] = [3, 7, 14, 30, 60];

function Chevron({
  expanded,
  onClick,
  label,
}: {
  expanded: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="toggle__chevron"
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      {expanded ? '▾' : '▸'}
    </button>
  );
}

function MergeMethodPreferenceEditor({
  preference,
  disabled,
  onChange,
}: {
  preference: MergeMethod[];
  disabled: boolean;
  onChange: (next: MergeMethod[]) => void;
}) {
  const enabled = new Set(preference);
  const ordered: MergeMethod[] = [
    ...preference,
    ...ALL_MERGE_METHODS.filter((m) => !enabled.has(m)),
  ];

  const move = (from: number, to: number) => {
    // Reorder within the active prefix only.
    if (from >= preference.length) return;
    const next = reorder(preference, from, to);
    onChange(next);
  };

  const toggle = (method: MergeMethod) => {
    if (enabled.has(method)) {
      onChange(preference.filter((m) => m !== method));
    } else {
      onChange([...preference, method]);
    }
  };

  return (
    <div
      className="merge-method-preference"
      data-testid="merge-method-preference"
      role="list"
      aria-label="Merge method preference"
    >
      <div className="merge-method-preference__hint">Preference order</div>
      {ordered.map((method, idx) => {
        const isActive = idx < preference.length;
        const canMoveUp = isActive && idx > 0;
        const canMoveDown = isActive && idx < preference.length - 1;
        return (
          <div
            key={method}
            className="merge-method-row"
            data-testid={`merge-method-row-${method}`}
            data-active={isActive}
            role="listitem"
          >
            <span className="merge-method-row__rank">
              {isActive ? idx + 1 : '·'}
            </span>
            <label className="toggle merge-method-row__toggle">
              <span className="toggle__name">{MERGE_METHOD_LABELS[method]}</span>
              <input
                type="checkbox"
                checked={isActive}
                disabled={disabled}
                onChange={() => toggle(method)}
                aria-label={`Enable ${MERGE_METHOD_LABELS[method]}`}
              />
            </label>
            <button
              type="button"
              className="ar-icon-button merge-method-row__move"
              disabled={disabled || !canMoveUp}
              onClick={() => move(idx, idx - 1)}
              aria-label={`Move ${MERGE_METHOD_LABELS[method]} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="ar-icon-button merge-method-row__move"
              disabled={disabled || !canMoveDown}
              onClick={() => move(idx, idx + 1)}
              aria-label={`Move ${MERGE_METHOD_LABELS[method]} down`}
            >
              ↓
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function AutomationsSettings() {
  const { settings, save } = useAutomationSettings();
  const knownRepos = useKnownRepos();
  const [expanded, setExpanded] = useState<Record<SubKey, boolean>>({
    ignored: true,
    autoRebase: true,
    autoDelete: true,
    autoMerge: true,
    mergeClean: true,
    autoResolve: true,
    shortcuts: true,
    stale: true,
    notifications: true,
  });

  const toggle = (k: SubKey) =>
    setExpanded((e) => ({ ...e, [k]: !e[k] }));

  /**
   * Sub-toggle behaviour:
   * - flipping ON also turns the parent section ON (otherwise enabling a
   *   sub-option would silently do nothing while the parent was off).
   * - flipping OFF only flips the sub itself; the parent stays ON so the
   *   user doesn't accidentally collapse the entire section.
   */
  const subToggle = <K extends keyof typeof settings>(
    parentKey: keyof typeof settings,
    subKey: K,
    nextValue: typeof settings[K],
  ) => {
    if (nextValue) {
      save({ [parentKey]: true, [subKey]: nextValue } as Partial<typeof settings>);
    } else {
      save({ [subKey]: nextValue } as Partial<typeof settings>);
    }
  };

  return (
    <section data-testid="automations-settings" className="settings-group">
      <h2 className="settings__heading">automations</h2>

      {/* Global ignore — repos here are invisible to the popup and untouched
          by every automation. */}
      <div className="automation-block" data-testid="ignored-repos-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.ignored}
            onClick={() => toggle('ignored')}
            label="ignored-repos section"
          />
          <span className="toggle__name">Ignored repos</span>
        </div>
        {expanded.ignored && (
          <RepoOptOutList
            label="Ignored repos"
            repos={settings.ignoredRepos}
            onChange={(ignoredRepos) => save({ ignoredRepos })}
            suggestions={knownRepos}
          />
        )}
      </div>

      {/* REBASE-OPT-OUT — auto-rebase is the core feature; toggle is mostly
          for testing or for repos where the user wants manual control. */}
      <div className="automation-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.autoRebase}
            onClick={() => toggle('autoRebase')}
            label="auto-rebase section"
          />
          <label className="toggle">
            <span className="toggle__name">Auto-rebase behind PRs</span>
            <input
              type="checkbox"
              checked={settings.autoRebaseEnabled}
              onChange={(e) => save({ autoRebaseEnabled: e.target.checked })}
            />
          </label>
        </div>
        {expanded.autoRebase && (
          <RepoOptOutList
            label="Skip repos"
            repos={settings.autoRebaseOptOutRepos}
            onChange={(autoRebaseOptOutRepos) => save({ autoRebaseOptOutRepos })}
            suggestions={knownRepos}
          />
        )}
      </div>

      {/* 2.6 */}
      <div className="automation-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.autoDelete}
            onClick={() => toggle('autoDelete')}
            label="auto-delete-branch section"
          />
          <label className="toggle">
            <span className="toggle__name">Auto-delete merged branches</span>
            <input
              type="checkbox"
              checked={settings.autoDeleteMergedBranch}
              onChange={(e) => save({ autoDeleteMergedBranch: e.target.checked })}
            />
          </label>
        </div>
        {expanded.autoDelete && (
          <RepoOptOutList
            label="Skip repos"
            repos={settings.autoDeleteOptOutRepos}
            onChange={(autoDeleteOptOutRepos) => save({ autoDeleteOptOutRepos })}
            suggestions={knownRepos}
          />
        )}
      </div>

      {/* 2.7 */}
      <div className="automation-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.autoMerge}
            onClick={() => toggle('autoMerge')}
            label="auto-merge section"
          />
          <label className="toggle">
            <span className="toggle__name">Auto-enable auto-merge</span>
            <input
              type="checkbox"
              checked={settings.autoEnableAutoMerge}
              onChange={(e) => save({ autoEnableAutoMerge: e.target.checked })}
            />
          </label>
        </div>
        {expanded.autoMerge && (
          <>
            <MergeMethodPreferenceEditor
              preference={settings.mergeMethodPreference}
              disabled={!settings.autoEnableAutoMerge}
              onChange={(mergeMethodPreference) => save({ mergeMethodPreference })}
            />
            <RepoOptOutList
              label="Skip repos"
              repos={settings.autoMergeOptOutRepos}
              onChange={(autoMergeOptOutRepos) => save({ autoMergeOptOutRepos })}
              suggestions={knownRepos}
            />
          </>
        )}
      </div>

      {/* MERGE-2 — promoted to top-level peer section so its skip list is
          discoverable. Disabled when auto-merge is off (the fall-through only
          fires after auto-merge attempts to enable). */}
      <div className="automation-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.mergeClean}
            onClick={() => toggle('mergeClean')}
            label="merge-clean-immediately section"
          />
          <label className="toggle">
            <span className="toggle__name">Merge clean PRs immediately</span>
            <input
              type="checkbox"
              checked={settings.mergeCleanPRsImmediately}
              disabled={!settings.autoEnableAutoMerge}
              onChange={(e) => save({ mergeCleanPRsImmediately: e.target.checked })}
            />
          </label>
        </div>
        {expanded.mergeClean && (
          <RepoOptOutList
            label="Skip repos"
            repos={settings.mergeCleanPRsOptOutRepos}
            onChange={(mergeCleanPRsOptOutRepos) => save({ mergeCleanPRsOptOutRepos })}
            suggestions={knownRepos}
          />
        )}
      </div>

      {/* 2.8 */}
      <div className="automation-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.autoResolve}
            onClick={() => toggle('autoResolve')}
            label="auto-resolve-threads section"
          />
          <label className="toggle">
            <span className="toggle__name">Auto-resolve outdated review threads</span>
            <input
              type="checkbox"
              checked={settings.autoResolveOutdatedThreads}
              onChange={(e) => save({ autoResolveOutdatedThreads: e.target.checked })}
            />
          </label>
        </div>
        {expanded.autoResolve && (
          <RepoOptOutList
            label="Skip repos"
            repos={settings.autoResolveOptOutRepos}
            onChange={(autoResolveOptOutRepos) => save({ autoResolveOptOutRepos })}
            suggestions={knownRepos}
          />
        )}
      </div>

      {/* 5.1 stale-PR badge + ping reviewers */}
      <div className="automation-block" data-testid="stale-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.stale}
            onClick={() => toggle('stale')}
            label="stale-PR section"
          />
          <label className="toggle">
            <span className="toggle__name">Show stale-PR badge</span>
            <input
              type="checkbox"
              checked={settings.enableStaleBadge}
              onChange={(e) => save({ enableStaleBadge: e.target.checked })}
            />
          </label>
        </div>
        {expanded.stale && (
          <>
            <div className="toggle-sub toggle-sub--row">
              <span className="toggle-sub__label">Idle threshold</span>
              <select
                value={settings.staleThresholdDays}
                onChange={(e) => save({
                  enableStaleBadge: true,
                  staleThresholdDays: Number(e.target.value) as StaleThresholdDays,
                })}
                aria-label="Idle threshold (days)"
                className="select select--small toggle-sub__select"
              >
                {STALE_THRESHOLDS.map((d) => (
                  <option key={d} value={d}>{d}d</option>
                ))}
              </select>
            </div>
            <label className="toggle toggle-sub" style={{ display: 'grid', gridTemplateColumns: '1fr auto' }}>
              <span>Stale counts as attention</span>
              <input
                type="checkbox"
                checked={settings.staleCountsAsAttention}
                onChange={(e) => subToggle('enableStaleBadge', 'staleCountsAsAttention', e.target.checked)}
              />
            </label>
            <label className="toggle toggle-sub" style={{ display: 'grid', gridTemplateColumns: '1fr auto' }}>
              <span>Allow ping reviewers</span>
              <input
                type="checkbox"
                checked={settings.enablePingReviewers}
                onChange={(e) => subToggle('enableStaleBadge', 'enablePingReviewers', e.target.checked)}
              />
            </label>
            {settings.enablePingReviewers && (
              <div className="toggle-sub" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <span style={{ marginBottom: 4 }}>ping comment template</span>
                <textarea
                  className="ping-template"
                  value={settings.pingTemplate}
                  rows={3}
                  onChange={(e) => save({ pingTemplate: e.target.value })}
                  aria-label="Ping comment template"
                  data-testid="ping-template"
                />
                <span className="muted" style={{ fontSize: 10 }}>
                  Use {'{reviewers}'} to insert the @-mentions inline
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Story 5.2-A — Push-since-approval. Surface a `! re-review` chip when the
          latest push post-dates every current approval. Sub-toggle promotes the
          chip from passive label to clickable action that re-requests review. */}
      <div className="automation-block" data-testid="push-since-approval-block">
        <div className="automation-row automation-row--leaf">
          <label className="toggle">
            <span className="toggle__name">Show push-since-approval badge</span>
            <input
              type="checkbox"
              checked={settings.enablePushSinceApproval}
              onChange={(e) => save({ enablePushSinceApproval: e.target.checked })}
              data-testid="push-since-approval-master"
            />
          </label>
        </div>
        {settings.enablePushSinceApproval && (
          <label className="toggle toggle-sub" style={{ display: 'grid', gridTemplateColumns: '1fr auto' }}>
            <span>Allow click to re-request review</span>
            <input
              type="checkbox"
              checked={settings.enableRequestRereview}
              onChange={(e) => save({ enableRequestRereview: e.target.checked })}
              data-testid="enable-request-rereview"
            />
          </label>
        )}
      </div>

      {/* Story 2.4 — Desktop notifications. Master toggle gates the runtime
          permission request; per-event subtoggles let users opt in to the
          specific events they care about. */}
      <div className="automation-block" data-testid="notifications-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.notifications}
            onClick={() => toggle('notifications')}
            label="desktop-notifications section"
          />
          <label className="toggle">
            <span className="toggle__name">Desktop notifications</span>
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={async (e) => {
                const next = e.target.checked;
                if (next) {
                  const granted = await requestNotificationsPermission();
                  if (!granted) return; // user denied — leave toggle off
                  await save({ notificationsEnabled: true });
                } else {
                  await save({ notificationsEnabled: false });
                  await removeNotificationsPermission();
                }
              }}
              data-testid="notifications-master"
            />
          </label>
        </div>
        {expanded.notifications && settings.notificationsEnabled && (
          <>
            <label className="toggle toggle-sub">
              <span>Rebased</span>
              <input
                type="checkbox"
                checked={settings.notifyOnRebased}
                onChange={(e) => save({ notifyOnRebased: e.target.checked })}
                data-testid="notify-rebased"
              />
            </label>
            <label className="toggle toggle-sub">
              <span>Conflict on rebase</span>
              <input
                type="checkbox"
                checked={settings.notifyOnConflicted}
                onChange={(e) => save({ notifyOnConflicted: e.target.checked })}
                data-testid="notify-conflicted"
              />
            </label>
            <label className="toggle toggle-sub">
              <span>PR merged</span>
              <input
                type="checkbox"
                checked={settings.notifyOnMerged}
                onChange={(e) => save({ notifyOnMerged: e.target.checked })}
                data-testid="notify-merged"
              />
            </label>
            <label className="toggle toggle-sub">
              <span>PR went idle</span>
              <input
                type="checkbox"
                checked={settings.notifyOnIdle}
                onChange={(e) => save({ notifyOnIdle: e.target.checked })}
                data-testid="notify-idle"
              />
            </label>
            <label className="toggle toggle-sub">
              <span>Reviewer pinged</span>
              <input
                type="checkbox"
                checked={settings.notifyOnPingConfirmed}
                onChange={(e) => save({ notifyOnPingConfirmed: e.target.checked })}
                data-testid="notify-ping-confirmed"
              />
            </label>
          </>
        )}
      </div>

      {/* 5.5 keyboard shortcuts — leaf toggle, no expander since there are no
          sub-options. */}
      <div className="automation-block">
        <div className="automation-row automation-row--leaf">
          <label className="toggle">
            <span className="toggle__name">Enable keyboard shortcuts</span>
            <input
              type="checkbox"
              checked={settings.enableKeyboardShortcuts}
              onChange={(e) => save({ enableKeyboardShortcuts: e.target.checked })}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
