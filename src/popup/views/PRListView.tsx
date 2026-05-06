import { useState, useMemo } from 'react';
import { Header } from '../components/Header';
import { RepoGroup } from '../components/RepoGroup';
import { PollSummaryFooter } from '../components/PollSummaryFooter';
import { usePRStore } from '../hooks/usePRStore';
import { useGroupedPRs } from '../hooks/useGroupedPRs';
import { useAutomationSettings } from '../hooks/useAutomationSettings';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface Props {
  user?: { login: string; avatarUrl: string };
  onSettings: () => void;
  onSignOut: () => void;
  onHelp?: () => void;
  onOpenActivity?: (todayOnly: boolean) => void;
}

export function PRListView({ user, onSettings, onSignOut, onHelp, onOpenActivity }: Props) {
  const store = usePRStore();
  const { prs, lastPollAt, pollInProgress } = store;
  const { settings } = useAutomationSettings();
  const ignored = new Set(settings.ignoredRepos);
  const visiblePRs = prs.filter((pr) => !ignored.has(pr.repo));
  const groups = useGroupedPRs(visiblePRs);

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
        {groups.length === 0 ? (
          <p className="empty-state">no open prs found.</p>
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
              />
            );
          })
        )}
      </div>
      <footer className="popup-footer">
        <span className="popup-footer__line">{lastPollText}</span>
        <PollSummaryFooter onOpenActivity={onOpenActivity} />
        {onHelp && (
          <button
            type="button"
            className="popup-footer__help"
            onClick={onHelp}
            aria-label="Show keyboard shortcuts"
            data-testid="help-link"
          >
            ?
          </button>
        )}
      </footer>
    </div>
  );
}
