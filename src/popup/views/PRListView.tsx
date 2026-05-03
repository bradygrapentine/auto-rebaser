import { Header } from '../components/Header';
import { RepoGroup } from '../components/RepoGroup';
import { PollSummaryFooter } from '../components/PollSummaryFooter';
import { usePRStore } from '../hooks/usePRStore';
import { useGroupedPRs } from '../hooks/useGroupedPRs';
import { useAutomationSettings } from '../hooks/useAutomationSettings';

interface Props {
  user?: { login: string; avatarUrl: string };
  onSettings: () => void;
  onSignOut: () => void;
  onOpenActivity?: (todayOnly: boolean) => void;
}

export function PRListView({ user, onSettings, onSignOut, onOpenActivity }: Props) {
  const store = usePRStore();
  const { prs, lastPollAt, pollInProgress } = store;
  const { settings } = useAutomationSettings();
  const ignored = new Set(settings.ignoredRepos);
  const visiblePRs = prs.filter((pr) => !ignored.has(pr.repo));
  const groups = useGroupedPRs(visiblePRs);

  const handlePollNow = () => {
    chrome.runtime.sendMessage({ type: 'POLL_NOW' });
  };

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
          groups.map((g) => (
            <RepoGroup
              key={g.repo}
              group={g}
              defaultExpanded={g.hasAttention}
              userLogin={user?.login}
            />
          ))
        )}
      </div>
      <footer className="popup-footer">
        <span className="popup-footer__line">{lastPollText}</span>
        <PollSummaryFooter onOpenActivity={onOpenActivity} />
      </footer>
    </div>
  );
}
