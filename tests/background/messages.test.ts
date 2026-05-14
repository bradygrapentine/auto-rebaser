import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMessage, registerMessageListener } from '../../src/background/messages';
import type { RuntimeMessage } from '../../src/core/types';

// Mock dependencies before importing
vi.mock('../../src/background/poll-cycle', () => ({
  runPollCycle: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/background/alarm', () => ({
  setupAlarm: vi.fn(),
}));
vi.mock('../../src/background/auth-device-flow-runner', () => ({
  beginDeviceFlow: vi.fn(),
  beginDeviceFlowAddAccount: vi.fn(),
  cancelDeviceFlow: vi.fn(),
  getStatus: vi.fn(),
  resetStatus: vi.fn(),
}));

import { runPollCycle } from '../../src/background/poll-cycle';
import { setupAlarm } from '../../src/background/alarm';
import {
  beginDeviceFlow,
  beginDeviceFlowAddAccount,
  cancelDeviceFlow,
  getStatus,
  resetStatus,
} from '../../src/background/auth-device-flow-runner';

// ------------------------------------------------------------------
// Helpers: valid / invalid senders
// ------------------------------------------------------------------

/** Legitimate popup sender -- passes all SEC-1 checks. */
function legitimateSender(): chrome.runtime.MessageSender {
  return {
    id: chrome.runtime.id,
    url: chrome.runtime.getURL('popup/index.html'),
    // tab intentionally absent -> undefined (not a content-script)
  };
}

/** Foreign-extension sender: wrong id and wrong URL. */
function foreignExtSender(): chrome.runtime.MessageSender {
  return {
    id: 'other-extension-id',
    url: 'chrome-extension://other/popup.html',
  };
}

/** Content-script / web-page sender: has a tab object. */
function contentScriptSender(): chrome.runtime.MessageSender {
  return {
    id: chrome.runtime.id,
    url: chrome.runtime.getURL('content.js'),
    tab: { id: 1, index: 0, pinned: false, highlighted: false, windowId: 1,
           active: true, incognito: false, selected: false,
           discarded: false, autoDiscardable: true, groupId: -1 },
  };
}

// SEC-1 note: manifest.json and manifest.firefox.json have NO `externally_connectable`
// key (confirmed by grep). Chrome default restricts cross-origin messaging;
// this runtime check is defense-in-depth.

describe('handleMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure chrome.runtime.id is defined (global setup only mocks getURL)
    Object.defineProperty(chrome.runtime, 'id', {
      value: 'test-extension-id',
      writable: true,
      configurable: true,
    });
    (runPollCycle as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  // ----------------------------------------------------------------
  // SEC-1 -- Sender validation (runs before any dispatch)
  // ----------------------------------------------------------------
  describe('SEC-1 sender validation', () => {
    it('rejects foreign-extension sender with UNAUTHORIZED_SENDER', () => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const result = handleMessage(msg, foreignExtSender(), sendResponse);
      expect(result).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'UNAUTHORIZED_SENDER' });
      // Handler must NOT have run
      expect(runPollCycle).not.toHaveBeenCalled();
    });

    it('rejects content-script / web-page sender (tab != undefined) with UNAUTHORIZED_SENDER', () => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const result = handleMessage(msg, contentScriptSender(), sendResponse);
      expect(result).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'UNAUTHORIZED_SENDER' });
      expect(runPollCycle).not.toHaveBeenCalled();
    });

    it('rejects sender with mismatched URL (right id, wrong URL)', () => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const sender: chrome.runtime.MessageSender = {
        id: chrome.runtime.id,
        url: 'https://evil.example.com/page',
      };
      handleMessage(msg, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'UNAUTHORIZED_SENDER' });
      expect(runPollCycle).not.toHaveBeenCalled();
    });

    it('allows legitimate popup sender through to handler', async () => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const result = handleMessage(msg, legitimateSender(), sendResponse);
      expect(result).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(runPollCycle).toHaveBeenCalledTimes(1);
    });
  });

  describe('POLL_NOW', () => {
    it('calls runPollCycle and responds ok=true', async () => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const isAsync = handleMessage(msg, legitimateSender(), sendResponse);
      expect(isAsync).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(runPollCycle).toHaveBeenCalledTimes(1);
    });

    it('returns true (async)', () => {
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const result = handleMessage(msg, legitimateSender(), vi.fn());
      expect(result).toBe(true);
    });
  });

  describe('SET_INTERVAL', () => {
    it.each([1, 5, 15, 30] as const)('valid intervalMinutes=%d -> ok', (intervalMinutes) => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'SET_INTERVAL', intervalMinutes };
      const isAsync = handleMessage(msg, legitimateSender(), sendResponse);
      expect(isAsync).toBe(false);
      expect(setupAlarm).toHaveBeenCalledWith(intervalMinutes);
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    it('invalid intervalMinutes -> INVALID_INTERVAL error', () => {
      const sendResponse = vi.fn();
      const msg = { type: 'SET_INTERVAL', intervalMinutes: 7 } as unknown as RuntimeMessage;
      const isAsync = handleMessage(msg, legitimateSender(), sendResponse);
      expect(isAsync).toBe(false);
      expect(setupAlarm).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'INVALID_INTERVAL' });
    });

    it('returns false (sync)', () => {
      const msg: RuntimeMessage = { type: 'SET_INTERVAL', intervalMinutes: 5 };
      const result = handleMessage(msg, legitimateSender(), vi.fn());
      expect(result).toBe(false);
    });
  });

  describe('unknown type', () => {
    it('returns UNKNOWN_MESSAGE error', () => {
      const sendResponse = vi.fn();
      const msg = { type: 'BOGUS' } as unknown as RuntimeMessage;
      const isAsync = handleMessage(msg, legitimateSender(), sendResponse);
      expect(isAsync).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'UNKNOWN_MESSAGE' });
    });
  });
});

describe('registerMessageListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(chrome.runtime, 'id', {
      value: 'test-extension-id',
      writable: true,
      configurable: true,
    });
    (runPollCycle as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('registers a listener with chrome.runtime.onMessage', () => {
    registerMessageListener();
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(typeof (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('function');
  });

  it('registered listener forwards to handleMessage and returns boolean for legitimate sender', () => {
    registerMessageListener();
    const listener = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as (msg: RuntimeMessage, sender: chrome.runtime.MessageSender, send: (r: unknown) => void) => boolean;
    const sendResponse = vi.fn();
    const result = listener(
      { type: 'POLL_NOW' } as RuntimeMessage,
      { id: 'test-extension-id', url: chrome.runtime.getURL('popup/index.html') },
      sendResponse,
    );
    expect(result).toBe(true);
    expect(runPollCycle).toHaveBeenCalled();
  });

  it('registered listener rejects foreign sender before dispatch', () => {
    registerMessageListener();
    const listener = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as (msg: RuntimeMessage, sender: chrome.runtime.MessageSender, send: (r: unknown) => void) => boolean;
    const sendResponse = vi.fn();
    const result = listener(
      { type: 'POLL_NOW' } as RuntimeMessage,
      { id: 'evil-ext', url: 'chrome-extension://evil/popup.html' },
      sendResponse,
    );
    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'UNAUTHORIZED_SENDER' });
    expect(runPollCycle).not.toHaveBeenCalled();
  });

  // Story 4.2 -- Device Flow message handlers
  describe('AUTH_BEGIN_DEVICE_FLOW', () => {
    it('returns the DeviceFlowStart on success', async () => {
      const start = {
        userCode: 'AAA-111',
        verificationUri: 'https://github.com/login/device',
        deviceCode: 'DC1', intervalMs: 5000, expiresAt: 0,
      };
      (beginDeviceFlow as ReturnType<typeof vi.fn>).mockResolvedValue(start);
      const sendResponse = vi.fn();
      const isAsync = handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW' }, legitimateSender(), sendResponse);
      expect(isAsync).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: start });
    });

    it('returns ok=false with error message on failure', async () => {
      (beginDeviceFlow as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
      const sendResponse = vi.fn();
      handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW' }, legitimateSender(), sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'boom' });
    });

    it('returns fallback error code when rejection is non-Error', async () => {
      (beginDeviceFlow as ReturnType<typeof vi.fn>).mockRejectedValue('plain string');
      const sendResponse = vi.fn();
      handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW' }, legitimateSender(), sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'DEVICE_FLOW_START_FAILED' });
    });
  });

  describe('AUTH_BEGIN_DEVICE_FLOW_ADD', () => {
    it('returns the DeviceFlowStart on success', async () => {
      const start = {
        userCode: 'BBB-222',
        verificationUri: 'https://github.com/login/device',
        deviceCode: 'DC2', intervalMs: 5000, expiresAt: 0,
      };
      (beginDeviceFlowAddAccount as ReturnType<typeof vi.fn>).mockResolvedValue(start);
      const sendResponse = vi.fn();
      const isAsync = handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW_ADD' }, legitimateSender(), sendResponse);
      expect(isAsync).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: start });
    });

    it('returns ok=false with Error message on failure', async () => {
      (beginDeviceFlowAddAccount as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('add boom'));
      const sendResponse = vi.fn();
      handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW_ADD' }, legitimateSender(), sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'add boom' });
    });

    it('returns fallback error code on non-Error rejection', async () => {
      (beginDeviceFlowAddAccount as ReturnType<typeof vi.fn>).mockRejectedValue(42);
      const sendResponse = vi.fn();
      handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW_ADD' }, legitimateSender(), sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'DEVICE_FLOW_START_FAILED' });
    });
  });

  describe('AUTH_RESET_DEVICE_FLOW', () => {
    it('calls resetStatus and responds ok=true synchronously', () => {
      const sendResponse = vi.fn();
      const isAsync = handleMessage({ type: 'AUTH_RESET_DEVICE_FLOW' }, legitimateSender(), sendResponse);
      expect(isAsync).toBe(false);
      expect(resetStatus).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe('AUTH_DEVICE_FLOW_STATUS', () => {
    it('returns the runner status synchronously', () => {
      (getStatus as ReturnType<typeof vi.fn>).mockReturnValue({ state: 'success' });
      const sendResponse = vi.fn();
      const isAsync = handleMessage({ type: 'AUTH_DEVICE_FLOW_STATUS' }, legitimateSender(), sendResponse);
      expect(isAsync).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: { state: 'success' } });
    });
  });

  describe('AUTH_CANCEL_DEVICE_FLOW', () => {
    it('cancels and responds ok=true', () => {
      const sendResponse = vi.fn();
      handleMessage({ type: 'AUTH_CANCEL_DEVICE_FLOW' }, legitimateSender(), sendResponse);
      expect(cancelDeviceFlow).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });
});
