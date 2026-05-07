import type { RuntimeMessage, RuntimeResponse } from '../core/types';
import { runPollCycle } from './poll-cycle';
import { setupAlarm } from './alarm';
import {
  beginDeviceFlow,
  cancelDeviceFlow,
  getStatus as getDeviceFlowStatus,
  resetStatus as resetDeviceFlowStatus,
} from './auth-device-flow-runner';

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
    (msg: RuntimeMessage, _sender: chrome.runtime.MessageSender, sendResponse: (r: RuntimeResponse) => void) =>
      handleMessage(msg, sendResponse)
  );
}
