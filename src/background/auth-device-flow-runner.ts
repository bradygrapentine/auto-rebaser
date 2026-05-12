// Story 4.2 — service-worker side of OAuth Device Flow.
//
// The popup talks to the runner via runtime messages. Polling continues
// in the service worker even when the popup closes — when the user
// reopens it, `getStatus()` returns the in-flight start info or the
// final result. State is module-level (lives in the worker memory) and
// is reset when the worker idles out; the popup recovers by starting a
// new flow.

import {
  startDeviceFlow,
  pollDeviceFlow,
  DeviceFlowAbort,
  type DeviceFlowStart,
  type TokenSet,
} from '../core/auth-device-flow';
import { setAuthGitHubApp, setInstallations, setInstallationsFor } from '../core/auth-store';
import { getUserInstallations } from '../github/endpoints/installations';
import {
  buildAccountId,
  setAccountState,
  setActiveAccountId,
} from '../core/storage/multi-account';
import { getSettings } from '../core/settings-store';
import { getApiBase } from '../core/host-config';

export type DeviceFlowStatus =
  | { state: 'idle' }
  | { state: 'pending'; start: DeviceFlowStart }
  | { state: 'success'; userLogin?: string }
  | { state: 'cancelled' }
  | { state: 'expired' }
  | { state: 'error'; message: string };

interface RunnerState {
  status: DeviceFlowStatus;
  abort?: AbortController;
  lastTokenSet?: TokenSet;
  /** Wave B1 — when true, success writes to a NEW accountId derived from
   *  the token's /user, then flips active to it. When false, the legacy
   *  single-account path runs (writes via setAuthGitHubApp). */
  addingAccount: boolean;
}

const state: RunnerState = { status: { state: 'idle' }, addingAccount: false };

/**
 * Start a fresh flow. If one is already pending, returns its current
 * `DeviceFlowStart` so the popup can resume.
 */
export async function beginDeviceFlow(): Promise<DeviceFlowStart> {
  if (state.status.state === 'pending') return state.status.start;

  const start = await startDeviceFlow();
  const abort = new AbortController();
  state.status = { state: 'pending', start };
  state.abort = abort;
  // Capture in closure — module-level state can be reset (e.g. by SW eviction)
  // between flow start and .then resolution. Reads from state.* after the await
  // are unsafe — decisions must come from closure-captured locals only.
  const addAccount = state.addingAccount;
  const abortSignal = abort.signal;

  // Fire-and-forget polling loop; the result is parked in `state` for
  // whoever asks via `getStatus()`.
  void pollDeviceFlow(start, { signal: abortSignal })
    .then(async (tokenSet) => {
      state.lastTokenSet = tokenSet;

      if (addAccount) {
        // Add-account path — derive the new accountId from /user using
        // THIS tokenSet specifically (don't go through ensureFreshToken,
        // which would route to the currently active account's auth).
        try {
          const apiBase = await getApiBase();
          const userRes = await fetch(`${apiBase}/user`, {
            headers: {
              Authorization: `Bearer ${tokenSet.accessToken}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });
          if (!userRes.ok) throw new Error(`/user returned ${userRes.status}`);
          const me = (await userRes.json()) as { login: string };
          const settings = await getSettings();
          const newId = buildAccountId(me.login, settings.enterpriseHost);
          await setAccountState(newId, 'auth', { method: 'github_app', ...tokenSet });
          // Best-effort installations fetch + store under the new account.
          await setActiveAccountId(newId);
          try {
            const installations = await getUserInstallations(newId);
            await setInstallationsFor(newId, installations);
          } catch (err) {
            console.warn('[device-flow] could not fetch installations:', err);
          }
          state.status = { state: 'success', userLogin: me.login };
        } catch (err) {
          state.status = {
            state: 'error',
            message: err instanceof Error ? err.message : 'add-account failed',
          };
        } finally {
          state.addingAccount = false;
        }
        return;
      }

      // Legacy single-account path — writes to the currently active account
      // via setAuthGitHubApp (post-MA-1 the active id is set by migration).
      await setAuthGitHubApp(tokenSet);
      try {
        const installations = await getUserInstallations();
        await setInstallations(installations);
      } catch (err) {
        console.warn('[device-flow] could not fetch installations:', err);
      }
      state.status = { state: 'success' };
    })
    .catch((err) => {
      if (err instanceof DeviceFlowAbort) {
        if (err.code === 'expired_token') state.status = { state: 'expired' };
        else state.status = { state: 'cancelled' };
        return;
      }
      state.status = {
        state: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    });

  return start;
}

export function cancelDeviceFlow(): void {
  if (state.abort) state.abort.abort();
  if (state.status.state === 'pending') state.status = { state: 'cancelled' };
}

export function getStatus(): DeviceFlowStatus {
  return state.status;
}

/** Reset to idle. Called after the popup acknowledges a terminal status. */
export function resetStatus(): void {
  state.status = { state: 'idle' };
  state.abort = undefined;
  state.addingAccount = false;
}

/** Wave B1 — start a device flow whose success writes to a new accountId
 *  instead of overwriting the active account's auth. */
export async function beginDeviceFlowAddAccount(): Promise<DeviceFlowStart> {
  state.addingAccount = true;
  return beginDeviceFlow();
}

// Test-only — clears module-level state between test cases.
export function _resetForTests(): void {
  state.status = { state: 'idle' };
  state.abort = undefined;
  state.lastTokenSet = undefined;
  state.addingAccount = false;
}
