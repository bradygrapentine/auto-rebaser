import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useAutomationSettings } from './hooks/useAutomationSettings';
import { SignInView } from './views/SignInView';
import { PRListView } from './views/PRListView';
import { SettingsView } from './views/SettingsView';
import { ActivityLogView } from './views/ActivityLogView';
import { HelpView } from './views/HelpView';
import { PingConfirmView } from './views/PingConfirmView';
import { RerequestConfirmView } from './views/RerequestConfirmView';
import type { PRRecord } from '../core/types';

type View = 'list' | 'settings' | 'activity-log' | 'help' | 'ping-confirm' | 'rerequest-confirm' | 'add-account';

export function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>('list');
  const [activityFilter, setActivityFilter] = useState<{ todayOnly?: boolean }>({});
  const [pingTarget, setPingTarget] = useState<PRRecord | null>(null);
  const [rerequestTarget, setRerequestTarget] = useState<{ pr: PRRecord; approvers: string[] } | null>(null);
  const { settings: automation } = useAutomationSettings();

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
        <SignInView
          onSubmit={auth.signInWithPAT}
          onDeviceFlowSuccess={auth.refresh}
          error={auth.error}
        />
      </div>
    );
  }

  // signed-in
  switch (view) {
    case 'settings':
      return (
        <SettingsView
          onBack={() => setView('list')}
          authMethod={auth.method}
          onSignOut={async () => {
            await auth.signOut();
            setView('list');
          }}
        />
      );
    case 'activity-log':
      return (
        <ActivityLogView
          onBack={() => setView('list')}
          initialFilter={activityFilter}
        />
      );
    case 'help':
      return <HelpView onBack={() => setView('list')} />;
    case 'add-account':
      return (
        <div className="popup-root">
          <SignInView
            addingAccount
            onSubmit={auth.signInWithPAT}
            onDeviceFlowSuccess={() => {
              auth.refresh();
              setView('list');
            }}
            onCancel={() => setView('list')}
            error={auth.error}
          />
        </div>
      );
    case 'rerequest-confirm':
      if (!rerequestTarget) {
        setView('list');
        return null;
      }
      return (
        <RerequestConfirmView
          pr={rerequestTarget.pr}
          approvers={rerequestTarget.approvers}
          onCancel={() => {
            setRerequestTarget(null);
            setView('list');
          }}
          onSuccess={() => {
            setRerequestTarget(null);
            setView('list');
          }}
        />
      );
    case 'ping-confirm':
      if (!pingTarget) {
        setView('list');
        return null;
      }
      return (
        <PingConfirmView
          pr={pingTarget}
          template={automation.pingTemplate}
          onCancel={() => {
            setPingTarget(null);
            setView('list');
          }}
          onSuccess={() => {
            setPingTarget(null);
            setView('list');
          }}
        />
      );
    default:
      return (
        <PRListView
          user={auth.user}
          authMethod={auth.method}
          installations={auth.installations}
          onSettings={() => setView('settings')}
          onSignOut={auth.signOut}
          onHelp={() => setView('help')}
          onPing={(pr) => {
            setPingTarget(pr);
            setView('ping-confirm');
          }}
          onRerequest={(pr, approvers) => {
            setRerequestTarget({ pr, approvers });
            setView('rerequest-confirm');
          }}
          onOpenActivity={(todayOnly) => {
            setActivityFilter({ todayOnly });
            setView('activity-log');
          }}
          onAddAccount={() => setView('add-account')}
        />
      );
  }
}
