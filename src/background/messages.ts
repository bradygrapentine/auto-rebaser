import type { RuntimeMessage, RuntimeResponse } from '../core/types';
import { runPollCycle } from './poll-cycle';
import { setupAlarm } from './alarm';
import { signIn } from '../core/auth';

const VALID_INTERVALS = new Set([1, 2, 5, 10, 15, 30, 60, 120, 240]);

export function handleMessage(
  msg: RuntimeMessage,
  sendResponse: (r: RuntimeResponse) => void
): boolean {
  if (msg.type === 'POLL_NOW') {
    void runPollCycle().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'SET_INTERVAL') {
    const { intervalMinutes } = msg;
    if (!VALID_INTERVALS.has(intervalMinutes)) {
      sendResponse({ ok: false, error: 'INVALID_INTERVAL' });
      return false;
    }
    setupAlarm(intervalMinutes);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'REAUTH') {
    // signIn() recomposes the OAuth scope from automation-settings, so simply
    // calling it picks up any newly-enabled optional scopes (e.g. notifications).
    void signIn().then(
      () => sendResponse({ ok: true }),
      (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'REAUTH_FAILED' }),
    );
    return true;
  }

  sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE' });
  return false;
}

export function registerMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (msg: RuntimeMessage, _sender: chrome.runtime.MessageSender, sendResponse: (r: RuntimeResponse) => void) =>
      handleMessage(msg, sendResponse)
  );
}
