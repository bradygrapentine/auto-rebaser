import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { SignInView } from './views/SignInView';
import { PRListView } from './views/PRListView';
import { SettingsView } from './views/SettingsView';
import { ActivityLogView } from './views/ActivityLogView';

// View routing — extend cases as new top-level views ship (Story 5.5 'help'
// and others will add to this union).
type View = 'list' | 'settings' | 'activity-log';

export function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>('list');
  const [activityFilter, setActivityFilter] = useState<{ todayOnly?: boolean }>({});

  if (auth.status === 'loading') {
    return (
      <div className="popup-root">
        <div className="cmd-line">loading…</div>
      </div>
    );
  }

  if (auth.status === 'signed-out' || auth.status === 'error') {
    return (
      <div className="popup-root">
        <SignInView onSubmit={auth.signInWithPAT} error={auth.error} />
      </div>
    );
  }

  // signed-in
  switch (view) {
    case 'settings':
      return <SettingsView onBack={() => setView('list')} />;
    case 'activity-log':
      return (
        <ActivityLogView
          onBack={() => setView('list')}
          initialFilter={activityFilter}
        />
      );
    default:
      return (
        <PRListView
          user={auth.user}
          onSettings={() => setView('settings')}
          onSignOut={auth.signOut}
          onOpenActivity={(todayOnly) => {
            setActivityFilter({ todayOnly });
            setView('activity-log');
          }}
        />
      );
  }
}
