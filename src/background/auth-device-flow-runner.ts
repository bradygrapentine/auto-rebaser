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
import { setAuthGitHubApp } from '../core/auth-store';

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
}

const state: RunnerState = { status: { state: 'idle' } };

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

  // Fire-and-forget polling loop; the result is parked in `state` for
  // whoever asks via `getStatus()`.
  void pollDeviceFlow(start, { signal: abort.signal })
    .then(async (tokenSet) => {
      state.lastTokenSet = tokenSet;
      await setAuthGitHubApp(tokenSet);
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
}

// Test-only — clears module-level state between test cases.
export function _resetForTests(): void {
  state.status = { state: 'idle' };
  state.abort = undefined;
  state.lastTokenSet = undefined;
}
