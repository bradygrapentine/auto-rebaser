import { useEffect, useState } from 'react';
import type { DeviceFlowStart } from '../../core/auth-device-flow';
import type { DeviceFlowStatus } from '../../background/auth-device-flow-runner';
import type { RuntimeResponse } from '../../core/types';

interface Props {
  onSubmit: (pat: string) => Promise<void>;
  /** Called after the popup learns the device flow finished successfully so
   *  the parent re-checks auth status and transitions to the PR list. */
  onDeviceFlowSuccess?: () => void;
  busy?: boolean;
  error?: string;
  /** Wave B1 — when true, the device flow lands the new auth under a
   *  separate accountId without disturbing the currently-active account. */
  addingAccount?: boolean;
  /** Wave B1 — back button that returns to the PR list (only shown when
   *  `addingAccount` is true; for first sign-in there is no list to return to). */
  onCancel?: () => void;
}

type LocalView = 'choice' | 'pat' | 'device';

export function SignInView({ onSubmit, onDeviceFlowSuccess, busy = false, error, addingAccount = false, onCancel }: Props) {
  const [view, setView] = useState<LocalView>('choice');
  const [pat, setPat] = useState('');
  const [deviceStart, setDeviceStart] = useState<DeviceFlowStart | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Chrome MV3 popups close as soon as a new tab is created via
  // chrome.tabs.create(), wiping local state. On reopen, ask the service
  // worker if a device flow is in flight and restore the user code so
  // the popup picks up where it left off.
  //
  // Only `pending` is auto-resumed. Stale `success` (the runner never
  // resets after a successful flow) used to trigger
  // onDeviceFlowSuccess() here, which on a signed-out account bounced
  // SignInView back into PRListView and then back to SignInView, which
  // re-read the same stale `success` — an infinite remount loop the
  // user saw as "popup glitching on the login screen". Anything other
  // than `pending` is treated as no-op now.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = (await chrome.runtime.sendMessage({
        type: 'AUTH_DEVICE_FLOW_STATUS',
      })) as RuntimeResponse;
      if (cancelled || !res?.ok || !res.data) return;
      const status = res.data as DeviceFlowStatus;
      if (status?.state === 'pending') {
        setDeviceStart(status.start);
        setView('device');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submitPAT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat.trim() || busy) return;
    await onSubmit(pat);
  };

  const beginDeviceFlow = async () => {
    setDeviceError(null);
    setView('device');
    try {
      const res = (await chrome.runtime.sendMessage({
        type: addingAccount ? 'AUTH_BEGIN_DEVICE_FLOW_ADD' : 'AUTH_BEGIN_DEVICE_FLOW',
      })) as RuntimeResponse;
      if (!res.ok) throw new Error(res.error ?? 'failed to start device flow');
      const start = res.data as DeviceFlowStart;
      setDeviceStart(start);
      // NOTE: do not auto-open the verification tab. chrome.tabs.create()
      // steals focus from the popup, which Chrome then destroys — the user
      // never sees the code. Show the code first; the user clicks a link
      // (which we copy the code on click) to navigate when ready.
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'failed to start');
    }
  };

  const openVerificationTab = () => {
    if (!deviceStart) return;
    chrome.tabs.create({ url: deviceStart.verificationUri });
  };

  const cancelDeviceFlow = async () => {
    await chrome.runtime.sendMessage({ type: 'AUTH_CANCEL_DEVICE_FLOW' });
    setDeviceStart(null);
    setView('choice');
  };

  // Poll the service worker for status when the device flow is in progress.
  useEffect(() => {
    if (view !== 'device' || !deviceStart) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const res = (await chrome.runtime.sendMessage({
        type: 'AUTH_DEVICE_FLOW_STATUS',
      })) as RuntimeResponse;
      if (cancelled) return;
      if (!res.ok) return;
      const status = res.data as DeviceFlowStatus;
      if (status.state === 'success') {
        cancelled = true;
        // Reset the runner so the next sign-in attempt starts fresh.
        // Without this, a stale `success` state lingers and any future
        // SignInView mount used to spuriously re-fire the success path.
        void chrome.runtime.sendMessage({ type: 'AUTH_RESET_DEVICE_FLOW' });
        onDeviceFlowSuccess?.();
        return;
      }
      if (status.state === 'expired') {
        setDeviceError('Code expired — start over');
        return;
      }
      if (status.state === 'cancelled') {
        setDeviceError('Cancelled');
        return;
      }
      if (status.state === 'error') {
        setDeviceError(status.message);
        return;
      }
    };
    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [view, deviceStart, onDeviceFlowSuccess]);

  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (!deviceStart?.userCode) return;
    // navigator.clipboard.writeText is unreliable in extension popups when the
    // popup is about to lose focus (e.g. opening a new tab). Fall through to
    // the synchronous execCommand path so the code lands on the clipboard
    // before any focus shift.
    let ok = false;
    try {
      const ta = document.createElement('textarea');
      ta.value = deviceStart.userCode;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch { /* fall through */ }
    if (!ok && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(deviceStart.userCode);
      ok = true;
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (view === 'device') {
    return (
      <div className="signin">
        <h1 className="signin__title">auto-rebaser --auth</h1>
        {!deviceStart ? (
          <p className="muted">requesting code…</p>
        ) : (
          <>
            <p>Enter this code at github.com/login/device:</p>
            <div className="device-code" data-testid="device-code">
              <code>{deviceStart.userCode}</code>
              <button type="button" className="btn" onClick={copyCode}>
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <button
              type="button"
              className="btn btn--block"
              onClick={openVerificationTab}
              data-testid="open-verification-tab"
            >
              open verification page
            </button>
            <p className="help">
              The popup closes when the tab opens — click the extension icon
              again to come back here. Polling continues in the background;
              once you authorize, we sign you in automatically.
            </p>
          </>
        )}
        {deviceError && (
          <div role="alert" className="alert" data-testid="device-flow-error">{deviceError}</div>
        )}
        <button type="button" className="btn btn--block" onClick={cancelDeviceFlow}>
          cancel
        </button>
      </div>
    );
  }

  if (view === 'pat') {
    return (
      <div className="signin">
        <h1 className="signin__title">auto-rebaser --auth</h1>
        <p className="signin__lede">Sign in with a Personal Access Token (legacy)</p>
        <form onSubmit={submitPAT}>
          <label htmlFor="pat-input" className="label">github_pat</label>
          <input
            id="pat-input"
            type="password"
            autoComplete="off"
            autoFocus
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_… or github_pat_…"
            disabled={busy}
            className="input"
            style={{ fontFamily: 'inherit' }}
          />
          <p className="help">
            required scope: <code>repo</code>. add <code>notifications</code> if you plan to enable auto-dismiss-stale-notifications.{' '}
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=Auto%20Rebaser"
              target="_blank"
              rel="noopener noreferrer"
            >
              generate →
            </a>
          </p>
          <button type="submit" disabled={busy || !pat.trim()} className="btn btn--primary btn--block">
            {busy ? 'verifying…' : 'save token'}
          </button>
        </form>
        {error && <div role="alert" className="alert">{error}</div>}
        <button
          type="button"
          className="btn btn--block"
            onClick={() => setView('choice')}
        >
          back
        </button>
      </div>
    );
  }

  // 'choice' — pick the path
  return (
    <div className="signin">
      <h1 className="signin__title">auto-rebaser --auth</h1>
      <p className="signin__lede">
        {addingAccount
          ? 'Sign in with a different GitHub account'
          : 'Keep your GitHub PRs up to date automatically'}
      </p>

      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={beginDeviceFlow}
        data-testid="signin-github-app"
      >
        sign in with GitHub App (recommended)
      </button>

      <button
        type="button"
        className="btn btn--block"
        onClick={() => setView('pat')}
        data-testid="signin-pat"
      >
        use a personal access token (legacy)
      </button>

      {addingAccount && onCancel && (
        <button
          type="button"
          className="btn btn--block"
          onClick={onCancel}
            data-testid="signin-cancel"
        >
          cancel
        </button>
      )}
    </div>
  );
}
