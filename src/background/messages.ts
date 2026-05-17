import type { RuntimeMessage, RuntimeResponse } from '../core/types';
import { runPollCycle } from './poll-cycle';
import { setupAlarm } from './alarm';
import {
  beginDeviceFlow,
  beginDeviceFlowAddAccount,
  cancelDeviceFlow,
  getStatus as getDeviceFlowStatus,
  resetStatus as resetDeviceFlowStatus,
} from './auth-device-flow-runner';

const VALID_INTERVALS = new Set([1, 2, 5, 10, 15, 30, 60, 120, 240]);

/**
 * SEC-1: Validate that the message sender is the extension itself (popup / SW),
 * not a foreign extension, content-script, or web page.
 *
 * Rejected if ANY of:
 *   - sender.id !== chrome.runtime.id  (foreign extension or undefined)
 *   - sender.url does not start with chrome.runtime.getURL('')  (not extension origin)
 *
 * Content-scripts and web pages are rejected by the URL-origin check — they
 * cannot spoof an extension-origin `sender.url`. The earlier `sender.tab !== undefined`
 * gate was over-restrictive: it also rejected extension pages opened as tabs
 * (e.g. the popup loaded via Playwright's `page.goto(chrome-extension://...)`,
 * any future options/settings page). The URL-origin check is sufficient on its own.
 *
 * Note: manifest.json and manifest.firefox.json deliberately have NO
 * `externally_connectable` key — Chrome's default already restricts cross-origin
 * messaging. This runtime check is defense-in-depth.
 */
function isAuthorizedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const extensionOrigin = chrome.runtime.getURL('');
  if (!sender.url || !sender.url.startsWith(extensionOrigin)) return false;
  return true;
}

export function handleMessage(
  msg: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: RuntimeResponse) => void
): boolean {
  // SEC-1: reject unauthorized senders before any handler dispatch
  if (!isAuthorizedSender(sender)) {
    sendResponse({ ok: false, error: 'UNAUTHORIZED_SENDER' });
    return false;
  }

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

  if (msg.type === 'AUTH_BEGIN_DEVICE_FLOW') {
    void beginDeviceFlow().then(
      (start) => sendResponse({ ok: true, data: start }),
      (err: unknown) => sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : 'DEVICE_FLOW_START_FAILED',
      }),
    );
    return true;
  }

  if (msg.type === 'AUTH_BEGIN_DEVICE_FLOW_ADD') {
    void beginDeviceFlowAddAccount().then(
      (start) => sendResponse({ ok: true, data: start }),
      (err: unknown) => sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : 'DEVICE_FLOW_START_FAILED',
      }),
    );
    return true;
  }

  if (msg.type === 'AUTH_DEVICE_FLOW_STATUS') {
    sendResponse({ ok: true, data: getDeviceFlowStatus() });
    return false;
  }

  if (msg.type === 'AUTH_CANCEL_DEVICE_FLOW') {
    cancelDeviceFlow();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'AUTH_RESET_DEVICE_FLOW') {
    resetDeviceFlowStatus();
    sendResponse({ ok: true });
    return false;
  }

  sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE' });
  return false;
}

export function registerMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (msg: RuntimeMessage, sender: chrome.runtime.MessageSender, sendResponse: (r: RuntimeResponse) => void) =>
      handleMessage(msg, sender, sendResponse)
  );
}
