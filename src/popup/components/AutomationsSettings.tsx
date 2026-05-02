import { useState } from 'react';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { RepoOptOutList } from './RepoOptOutList';
import type { MergeMethod } from '../../core/automations-types';

const MERGE_METHODS: Array<{ value: MergeMethod; label: string }> = [
  { value: 'SQUASH', label: 'squash' },
  { value: 'MERGE',  label: 'merge'  },
  { value: 'REBASE', label: 'rebase' },
];

type SubKey = 'ignored' | 'autoDelete' | 'autoMerge' | 'autoResolve' | 'dismiss';

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

export function AutomationsSettings() {
  const { settings, save } = useAutomationSettings();
  const [expanded, setExpanded] = useState<Record<SubKey, boolean>>({
    ignored: true,
    autoDelete: true,
    autoMerge: true,
    autoResolve: true,
    dismiss: true,
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
            <div className="toggle-sub">
              <span>merge_method</span>
              <select
                value={settings.autoMergeMethod}
                disabled={!settings.autoEnableAutoMerge}
                onChange={(e) => save({ autoMergeMethod: e.target.value as MergeMethod })}
                aria-label="Merge method"
                className="select select--small"
              >
                {MERGE_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
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
            {settings.autoDismissStaleNotifications && !settings.notificationsScopeGranted && (
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
    </section>
  );
}
