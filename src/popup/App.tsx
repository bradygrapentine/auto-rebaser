import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { SignInView } from './views/SignInView';
import { PRListView } from './views/PRListView';
import { SettingsView } from './views/SettingsView';

type View = 'list' | 'settings';

export function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>('list');

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
  if (view === 'settings') {
    return <SettingsView onBack={() => setView('list')} />;
  }

  return (
    <PRListView
      user={auth.user}
      onSettings={() => setView('settings')}
      onSignOut={auth.signOut}
    />
  );
}
