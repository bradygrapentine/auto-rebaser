import { useState, useMemo, useEffect } from 'react';
import type { PRRecord } from '../../core/types';
import type { PRRecordPhaseTwo } from '../../core/automations-types';
import { Header } from '../components/Header';
import { RepoGroup } from '../components/RepoGroup';
import { PollSummaryFooter } from '../components/PollSummaryFooter';
import { MigrationBanner } from '../components/MigrationBanner';
import type { Installation } from '../../github/endpoints/installations';
import {
  coverageFor,
  installationsDisplay,
  getInstallRequestUrl,
} from '../../core/installations-helpers';
import { usePRStore } from '../hooks/usePRStore';
import { useGroupedPRs } from '../hooks/useGroupedPRs';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePingedStore } from '../hooks/usePingedStore';

interface Props {
  user?: { login: string; avatarUrl: string };
  /** Story 4.4 — auth method drives the migration banner + footer "via X" line. */
  authMethod?: 'github_app' | 'pat';
  /** Story 4.5 — list of installations the App is installed on. */
  installations?: Installation[];
  onSettings: () => void;
  onSignOut: () => void;
  onHelp?: () => void;
  onPing?: (pr: PRRecord) => void;
  onOpenActivity?: (todayOnly: boolean) => void;
}

export function PRListView({
  user, authMethod, installations, onSettings, onSignOut, onHelp, onPing, onOpenActivity,
}: Props) {
  const store = usePRStore();
  const { prs, lastPollAt, pollInProgress } = store;
  const { settings } = useAutomationSettings();
  const ignored = new Set(settings.ignoredRepos);
  const visiblePRs = prs.filter((pr) => !ignored.has(pr.repo));
  const groups = useGroupedPRs(visiblePRs, {
    staleCountsAsAttention: settings.staleCountsAsAttention,
  });

  const pinged = usePingedStore();

  // Audit B3 — derive install-request URL from the host config so GHES users
  // get a working link.
  const [installRequestUrl, setInstallRequestUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    getInstallRequestUrl().then((url) => { if (!cancelled) setInstallRequestUrl(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const pingStateFor = (pr: PRRecord) => {
    if (!settings.enablePingReviewers || !onPing) return null;
    const extended = pr as PRRecord & PRRecordPhaseTwo;
    if (!extended.staleness) return null;
    const reviewers = extended.requestedReviewers ?? [];
    if (reviewers.length === 0) return null;
    const hours = pinged.hoursSince(pr.id);
    const throttled = pinged.isThrottled(pr.id);
    return { canPing: !throttled, pingedHoursAgo: hours };
  };

  // Lifted expansion state — repos the user has toggled away from their
  // default. Effective expansion = `defaultExpanded XOR toggled.has(repo)`.
  // Keyboard navigation needs this to compute the flat visible-row list.
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const isExpanded = (repo: string, defaultExpanded: boolean) =>
    toggled.has(repo) ? !defaultExpanded : defaultExpanded;
  const toggleGroup = (repo: string) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      return next;
    });
  };

  const flatVisiblePRs = useMemo(() => {
    const out: typeof prs = [];
    for (const g of groups) {
      if (isExpanded(g.repo, g.hasAttention)) out.push(...g.prs);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, toggled]);

  const [focusedPRId, setFocusedPRId] = useState<number | null>(null);
  // Reset focus when the visible set changes shape and the focused PR is gone.
  const focusStillVisible = focusedPRId != null
    && flatVisiblePRs.some((p) => p.id === focusedPRId);
  const effectiveFocusedId = focusStillVisible ? focusedPRId : null;

  const handlePollNow = () => {
    chrome.runtime.sendMessage({ type: 'POLL_NOW' });
  };

  const moveFocus = (delta: 1 | -1) => {
    if (flatVisiblePRs.length === 0) return;
    const idx = effectiveFocusedId == null
      ? -1
      : flatVisiblePRs.findIndex((p) => p.id === effectiveFocusedId);
    let next: number;
    if (idx === -1) {
      next = delta === 1 ? 0 : flatVisiblePRs.length - 1;
    } else {
      next = (idx + delta + flatVisiblePRs.length) % flatVisiblePRs.length;
    }
    setFocusedPRId(flatVisiblePRs[next].id);
  };

  const openFocused = () => {
    if (effectiveFocusedId == null) return;
    const pr = flatVisiblePRs.find((p) => p.id === effectiveFocusedId);
    if (pr) chrome.tabs.create({ url: pr.url });
  };

  useKeyboardShortcuts({
    enabled: settings.enableKeyboardShortcuts,
    bindings: {
      r: handlePollNow,
      s: onSettings,
      '?': () => onHelp?.(),
      j: () => moveFocus(1),
      k: () => moveFocus(-1),
      Enter: openFocused,
    },
  });

  const lastPollText = lastPollAt
    ? `Last poll: ${new Date(lastPollAt).toLocaleTimeString()}`
    : 'Last poll: never';

  return (
    <div className="popup-root">
      <Header
        user={user}
        onSignOut={onSignOut}
        onSettings={onSettings}
        onPollNow={handlePollNow}
        polling={pollInProgress === true}
      />
      <div className="view-body">
        {authMethod === 'pat' && (
          <MigrationBanner onSwitchToApp={onSignOut} />
        )}
        {authMethod === 'github_app'
          && (!installations || installations.length === 0) && (
          <div className="empty-installations" data-testid="empty-installations">
            <p>The Auto Rebaser App isn't installed on any account you can access</p>
            <div className="empty-installations__actions">
              <a
                href={installRequestUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn--primary"
              >
                install or request
              </a>
            </div>
          </div>
        )}
        {groups.length === 0 ? (
          <p className="empty-state">no open prs found</p>
        ) : (
          groups.map((g) => {
            const expanded = isExpanded(g.repo, g.hasAttention);
            return (
              <RepoGroup
                key={g.repo}
                group={g}
                expanded={expanded}
                onToggle={() => toggleGroup(g.repo)}
                userLogin={user?.login}
                focusedPRId={effectiveFocusedId}
                showStaleBadges={settings.enableStaleBadge}
                pingStateFor={pingStateFor}
                onPing={onPing}
                coverage={
                  authMethod === 'github_app'
                    ? coverageFor(g.repo, installations)
                    : undefined
                }
              />
            );
          })
        )}
      </div>
      <footer className="popup-footer">
        <span className="popup-footer__line">{lastPollText}</span>
        {authMethod && (
          <span className="popup-footer__via" data-testid="auth-method-line">
            via {authMethod === 'github_app' ? 'GitHub App' : 'PAT'}
            {authMethod === 'github_app' && installations && installations.length > 0 && (
              <> on {installationsDisplay(installations)}</>
            )}
          </span>
        )}
        <PollSummaryFooter onOpenActivity={onOpenActivity} />
        {onHelp && (
          <button
            type="button"
            className="popup-footer__shortcuts"
            onClick={onHelp}
            data-testid="help-link"
            aria-label="Show keyboard shortcuts"
          >
            shortcuts
          </button>
        )}
      </footer>
    </div>
  );
}
