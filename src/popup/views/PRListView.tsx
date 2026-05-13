import { useState, useMemo, useEffect } from 'react';
import type { PRRecord } from '../../core/types';
import { isPRActionable } from '../../core/actionable-pr';
import type { PRRecordPhaseTwo } from '../../core/automations-types';
import { Header } from '../components/Header';
import { RepoGroup } from '../components/RepoGroup';
import { PollSummaryFooter } from '../components/PollSummaryFooter';
import { MigrationBanner } from '../components/MigrationBanner';
import type { Installation } from '../../github/endpoints/installations';
import {
  coverageFor,
  getInstallRequestUrl,
} from '../../core/installations-helpers';
import { usePRStore } from '../hooks/usePRStore';
import { useReviewerPRStore } from '../hooks/useReviewerPRStore';
import { useGroupedPRs } from '../hooks/useGroupedPRs';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePingedStore } from '../hooks/usePingedStore';
import { useRerequestStore } from '../hooks/useRerequestStore';
import { useAccounts } from '../hooks/useAccounts';

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
  /** Story 5.2-A — invoked when a PR's `! re-review` badge is clicked. */
  onRerequest?: (pr: PRRecord, approvers: string[]) => void;
  onOpenActivity?: (todayOnly: boolean) => void;
  /** Wave B1 — App routes to the add-account sign-in mode. */
  onAddAccount?: () => void;
}

export function PRListView({
  user, authMethod, installations, onSettings, onSignOut, onHelp, onPing, onRerequest, onOpenActivity, onAddAccount,
}: Props) {
  const { accounts, activeId, switchTo, signOut, signOutAll } = useAccounts();
  const authoredStore = usePRStore();
  const reviewerStore = useReviewerPRStore();
  const [activeTab, setActiveTab] = useState<'authored' | 'reviewer'>('authored');
  const store = activeTab === 'reviewer' ? reviewerStore : authoredStore;
  const { prs, lastPollAt, pollInProgress } = store;

  // Auto-poll when the popup opens if we don't have fresh data. Fires
  // when there's never been a poll OR the last poll is older than 60s,
  // so the user sees current state without manually clicking the
  // refresh icon every time the popup wakes up.
  useEffect(() => {
    const stale = lastPollAt == null || Date.now() - lastPollAt > 60_000;
    if (stale && !pollInProgress) {
      chrome.runtime.sendMessage({ type: 'POLL_NOW' });
    }
    // Intentionally only fires on mount — periodic polling is handled
    // by the service-worker alarm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { settings } = useAutomationSettings();
  const ignored = settings.enableIgnoredRepos === false
    ? new Set<string>()
    : new Set(settings.ignoredRepos);
  const repoFilter = settings.repoFilter ?? [];
  const repoFilterSet = useMemo(() => new Set(repoFilter), [repoFilter]);
  const visiblePRs = prs.filter((pr) => {
    if (ignored.has(pr.repo)) return false;
    if (repoFilterSet.size > 0 && !repoFilterSet.has(pr.repo)) return false;
    return true;
  });
  const groups = useGroupedPRs(visiblePRs, {
    staleCountsAsAttention: settings.staleCountsAsAttention,
  });

  const pinged = usePingedStore();
  const rerequested = useRerequestStore();

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

  const rerequestStateFor = (pr: PRRecord) => {
    if (!settings.enablePushSinceApproval) return null;
    const extended = pr as PRRecord & PRRecordPhaseTwo;
    if (!extended.staleApproval || extended.staleApproval.approvers.length === 0) return null;
    const throttled = rerequested.isThrottled(pr.id);
    return { actionable: settings.enableRequestRereview && !!onRerequest && !throttled };
  };
  const handleRerequest = (pr: PRRecord) => {
    if (!onRerequest) return;
    const extended = pr as PRRecord & PRRecordPhaseTwo;
    const approvers = extended.staleApproval?.approvers ?? [];
    if (approvers.length === 0) return;
    onRerequest(pr, approvers);
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
      // Reviewer-tab PRs are usually `current` (clean, approved); the
      // attention-state heuristic would collapse them and hide the dashboard.
      const defaultExpanded = activeTab === 'reviewer' ? true : g.hasAttention;
      if (isExpanded(g.repo, defaultExpanded)) out.push(...g.prs);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, toggled, activeTab]);

  const [focusedPRId, setFocusedPRId] = useState<number | null>(null);
  // Reset focus when the visible set changes shape and the focused PR is gone.
  const focusStillVisible = focusedPRId != null
    && flatVisiblePRs.some((p) => p.id === focusedPRId);
  const effectiveFocusedId = focusStillVisible ? focusedPRId : null;

  // Optimistic spinner — pollInProgress from storage can flip true→false
  // faster than React renders when the cycle is short (cached 304s), so the
  // spinner would never appear. Hold the spin locally for at least 500ms so
  // the click is always visibly acknowledged.
  const [optimisticPolling, setOptimisticPolling] = useState(false);
  const handlePollNow = () => {
    setOptimisticPolling(true);
    setTimeout(() => setOptimisticPolling(false), 500);
    void chrome.runtime.sendMessage({ type: 'POLL_NOW' });
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
      // REVIEWER-AUTOMATIONS — 1/2 switch tabs when the reviewer tab is enabled.
      '1': () => settings.enableReviewerTab && setActiveTab('authored'),
      '2': () => settings.enableReviewerTab && setActiveTab('reviewer'),
    },
  });

  // REVIEWER-AUTOMATIONS — reviewer-chip computation, only relevant when the
  // user is looking at the reviewer tab.
  const reviewerChipFor = (pr: PRRecord) => {
    if (activeTab !== 'reviewer') return null;
    const extended = pr as PRRecord & PRRecordPhaseTwo;
    return {
      myReviewState: extended.myReviewState ?? 'AWAITING',
      autoMergeArmed: !!extended.reviewerAutoMergeArmed,
    };
  };

  return (
    <div className="popup-root">
      <Header
        onSettings={onSettings}
        onPollNow={handlePollNow}
        polling={pollInProgress === true || optimisticPolling}
        accounts={accounts}
        activeId={activeId}
        authMethod={authMethod}
        onSwitchAccount={switchTo}
        onAddAccount={onAddAccount}
        onSignOutAccount={async (id) => {
          await signOut(id);
          // If the only account was just removed, useAuth will see signed-out
          // on next refresh — return to sign-in via the parent.
          if (accounts.length === 1) onSignOut();
        }}
        onSignOutAll={async () => {
          await signOutAll();
          onSignOut();
        }}
      />
      <div className="view-body">
        {authMethod === 'pat' && (
          <MigrationBanner onSwitchToApp={onSignOut} />
        )}
        {settings.enableReviewerTab && (
          <div className="pr-tabs" data-testid="pr-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              data-testid="pr-tab-authored"
              aria-selected={activeTab === 'authored'}
              className={`pr-tabs__tab ${activeTab === 'authored' ? 'pr-tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('authored')}
            >
              Authored ({authoredStore.prs.length})
            </button>
            <button
              type="button"
              role="tab"
              data-testid="pr-tab-reviewer"
              aria-selected={activeTab === 'reviewer'}
              className={`pr-tabs__tab ${activeTab === 'reviewer' ? 'pr-tabs__tab--active' : ''}`}
              onClick={() => setActiveTab('reviewer')}
            >
              Reviewer ({reviewerStore.prs.length})
            </button>
          </div>
        )}
        {authMethod === 'github_app'
          && (!installations || installations.length === 0) && (
          <div className="empty-installations" data-testid="empty-installations">
            <p>The Auto Rebaser App isn't installed on any account you can access</p>
            <div className="empty-installations__actions">
              <a
                href={installRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary"
              >
                install or request
              </a>
            </div>
          </div>
        )}
        {groups.length === 0 ? (
          <p className="empty-state">no open PRs found</p>
        ) : (
          groups.map((g) => {
            const defaultExpanded = activeTab === 'reviewer' ? true : g.hasAttention;
            const expanded = isExpanded(g.repo, defaultExpanded);
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
                rerequestStateFor={rerequestStateFor}
                onRerequest={handleRerequest}
                coverage={
                  authMethod === 'github_app'
                    ? coverageFor(g.repo, installations)
                    : undefined
                }
                installRequestUrl={installRequestUrl}
                reviewerChipFor={reviewerChipFor}
                actionableFor={(pr) => isPRActionable(pr as PRRecord & PRRecordPhaseTwo, settings)}
              />
            );
          })
        )}
      </div>
      <footer className="popup-footer">
        <div className="popup-footer__main">
          {authMethod === 'github_app' ? (
            <span className="popup-footer__via" data-testid="footer-via">
              via app · {installations?.length ?? 0} installation
              {(installations?.length ?? 0) === 1 ? '' : 's'}
            </span>
          ) : authMethod === 'pat' && user?.login ? (
            <span className="popup-footer__via" data-testid="footer-via">
              via @{user.login}
            </span>
          ) : null}
          <PollSummaryFooter onOpenActivity={onOpenActivity} />
          <a
            href="https://github.com/sponsors/bradygrapentine"
            target="_blank"
            rel="noopener noreferrer"
            className="popup-footer__support-link"
            data-testid="support-link"
          >
            Support the project
          </a>
        </div>
        {onHelp && (
          <button
            type="button"
            className="btn popup-footer__shortcuts-btn"
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
