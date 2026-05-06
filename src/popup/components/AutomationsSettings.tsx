import { useState } from 'react';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
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

type SubKey = 'ignored' | 'autoDelete' | 'autoMerge' | 'autoResolve' | 'dismiss' | 'shortcuts' | 'stale';

const STALE_THRESHOLDS: StaleThresholdDays[] = [7, 14, 30, 60];

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
      <div className="toggle-sub merge-method-preference__hint">
        <span>preference order</span>
      </div>
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
            <label className="toggle">
              <input
                type="checkbox"
                checked={isActive}
                disabled={disabled}
                onChange={() => toggle(method)}
                aria-label={`Enable ${MERGE_METHOD_LABELS[method]}`}
              />
              <span className="toggle__name">{MERGE_METHOD_LABELS[method]}</span>
            </label>
            <button
              type="button"
              className="btn btn--icon"
              disabled={disabled || !canMoveUp}
              onClick={() => move(idx, idx - 1)}
              aria-label={`Move ${MERGE_METHOD_LABELS[method]} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn--icon"
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

interface AutomationsSettingsProps {
  /** Story 4.4 — drives the 2.9 notifications-scope CTA messaging. */
  authMethod?: 'github_app' | 'pat';
}

export function AutomationsSettings({ authMethod }: AutomationsSettingsProps = {}) {
  const { settings, save } = useAutomationSettings();
  const [expanded, setExpanded] = useState<Record<SubKey, boolean>>({
    ignored: true,
    autoDelete: true,
    autoMerge: true,
    autoResolve: true,
    dismiss: true,
    shortcuts: true,
    stale: true,
  });

  const toggle = (k: SubKey) =>
    setExpanded((e) => ({ ...e, [k]: !e[k] }));

  const handleReauth = () => {
    chrome.runtime.sendMessage({ type: 'REAUTH', scopes: ['notifications'] });
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
            />
          </>
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
          />
        )}
      </div>

      {/* 2.9 */}
      <div className="automation-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.dismiss}
            onClick={() => toggle('dismiss')}
            label="dismiss-notifications section"
          />
          <label className="toggle">
            <span className="toggle__name">Dismiss stale PR notifications</span>
            <input
              type="checkbox"
              checked={settings.autoDismissStaleNotifications}
              onChange={(e) => save({ autoDismissStaleNotifications: e.target.checked })}
            />
          </label>
        </div>
        {expanded.dismiss && (
          <>
            {settings.autoDismissStaleNotifications && (
              <label className="toggle toggle-sub" style={{ display: 'grid', gridTemplateColumns: '1fr auto' }}>
                <span>Also unsubscribe</span>
                <input
                  type="checkbox"
                  checked={settings.unsubscribeStalePRNotifications}
                  onChange={(e) => save({ unsubscribeStalePRNotifications: e.target.checked })}
                />
              </label>
            )}
            {settings.autoDismissStaleNotifications && authMethod === 'github_app' && (
              <p
                className="muted"
                data-testid="notifications-app-blocked"
                style={{ marginLeft: 18, marginTop: 6, fontSize: 11 }}
              >
                Notification cleanup is unavailable when signed in via GitHub App.
                Switch to PAT (settings → account) to enable.
              </p>
            )}
            {settings.autoDismissStaleNotifications && authMethod !== 'github_app'
              && !settings.notificationsScopeGranted && (
              <div style={{ marginLeft: 18, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={handleReauth}
                  data-testid="grant-notifications-cta"
                  className="btn"
                >
                  grant notifications scope
                </button>
              </div>
            )}
            <RepoOptOutList
              label="Skip repos"
              repos={settings.autoDismissOptOutRepos}
              onChange={(autoDismissOptOutRepos) => save({ autoDismissOptOutRepos })}
            />
          </>
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
            <div className="toggle-sub">
              <span>idle threshold</span>
              <select
                value={settings.staleThresholdDays}
                disabled={!settings.enableStaleBadge}
                onChange={(e) =>
                  save({ staleThresholdDays: Number(e.target.value) as StaleThresholdDays })
                }
                aria-label="Idle threshold (days)"
                className="select select--small"
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
                disabled={!settings.enableStaleBadge}
                onChange={(e) => save({ staleCountsAsAttention: e.target.checked })}
              />
            </label>
            <label className="toggle toggle-sub" style={{ display: 'grid', gridTemplateColumns: '1fr auto' }}>
              <span>Allow ping reviewers</span>
              <input
                type="checkbox"
                checked={settings.enablePingReviewers}
                onChange={(e) => save({ enablePingReviewers: e.target.checked })}
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
                  Use {'{reviewers}'} to insert the @-mentions inline.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 5.5 keyboard shortcuts */}
      <div className="automation-block">
        <div className="automation-row">
          <Chevron
            expanded={expanded.shortcuts}
            onClick={() => toggle('shortcuts')}
            label="keyboard-shortcuts section"
          />
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
