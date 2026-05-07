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
  cancelDeviceFlow: vi.fn(),
  getStatus: vi.fn(),
}));

import { runPollCycle } from '../../src/background/poll-cycle';
import { setupAlarm } from '../../src/background/alarm';
import {
  beginDeviceFlow,
  cancelDeviceFlow,
  getStatus,
} from '../../src/background/auth-device-flow-runner';

describe('handleMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (runPollCycle as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('POLL_NOW', () => {
    it('calls runPollCycle and responds ok=true', async () => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const isAsync = handleMessage(msg, sendResponse);
      expect(isAsync).toBe(true);
      // Wait for cycle to complete
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(runPollCycle).toHaveBeenCalledTimes(1);
    });

    it('returns true (async)', () => {
      const msg: RuntimeMessage = { type: 'POLL_NOW' };
      const result = handleMessage(msg, vi.fn());
      expect(result).toBe(true);
    });
  });

  describe('SET_INTERVAL', () => {
    it.each([1, 5, 15, 30] as const)('valid intervalMinutes=%d → ok', (intervalMinutes) => {
      const sendResponse = vi.fn();
      const msg: RuntimeMessage = { type: 'SET_INTERVAL', intervalMinutes };
      const isAsync = handleMessage(msg, sendResponse);
      expect(isAsync).toBe(false);
      expect(setupAlarm).toHaveBeenCalledWith(intervalMinutes);
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    it('invalid intervalMinutes → INVALID_INTERVAL error', () => {
      const sendResponse = vi.fn();
      // Cast to bypass TS since we're testing runtime validation
      const msg = { type: 'SET_INTERVAL', intervalMinutes: 7 } as unknown as RuntimeMessage;
      const isAsync = handleMessage(msg, sendResponse);
      expect(isAsync).toBe(false);
      expect(setupAlarm).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'INVALID_INTERVAL' });
    });

    it('returns false (sync)', () => {
      const msg: RuntimeMessage = { type: 'SET_INTERVAL', intervalMinutes: 5 };
      const result = handleMessage(msg, vi.fn());
      expect(result).toBe(false);
    });
  });

  describe('unknown type', () => {
    it('returns UNKNOWN_MESSAGE error', () => {
      const sendResponse = vi.fn();
      const msg = { type: 'BOGUS' } as unknown as RuntimeMessage;
      const isAsync = handleMessage(msg, sendResponse);
      expect(isAsync).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'UNKNOWN_MESSAGE' });
    });
  });
});

describe('registerMessageListener', () => {
  it('registers a listener with chrome.runtime.onMessage', () => {
    registerMessageListener();
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(typeof (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('function');
  });

  it('registered listener forwards to handleMessage and returns its boolean', () => {
    (runPollCycle as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    registerMessageListener();
    const listener = (chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as (msg: RuntimeMessage, sender: unknown, send: (r: unknown) => void) => boolean;
    const sendResponse = vi.fn();
    // POLL_NOW returns true (async).
    const result = listener({ type: 'POLL_NOW' } as RuntimeMessage, {}, sendResponse);
    expect(result).toBe(true);
    expect(runPollCycle).toHaveBeenCalled();
  });

  // Story 4.2 — Device Flow message handlers
  describe('AUTH_BEGIN_DEVICE_FLOW', () => {
    it('returns the DeviceFlowStart on success', async () => {
      const start = {
        userCode: 'AAA-111',
        verificationUri: 'https://github.com/login/device',
        deviceCode: 'DC1', intervalMs: 5000, expiresAt: 0,
      };
      (beginDeviceFlow as ReturnType<typeof vi.fn>).mockResolvedValue(start);
      const sendResponse = vi.fn();
      const isAsync = handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW' }, sendResponse);
      expect(isAsync).toBe(true);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: start });
    });

    it('returns ok=false with error message on failure', async () => {
      (beginDeviceFlow as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
      const sendResponse = vi.fn();
      handleMessage({ type: 'AUTH_BEGIN_DEVICE_FLOW' }, sendResponse);
      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: 'boom' });
    });
  });

  describe('AUTH_DEVICE_FLOW_STATUS', () => {
    it('returns the runner status synchronously', () => {
      (getStatus as ReturnType<typeof vi.fn>).mockReturnValue({ state: 'success' });
      const sendResponse = vi.fn();
      const isAsync = handleMessage({ type: 'AUTH_DEVICE_FLOW_STATUS' }, sendResponse);
      expect(isAsync).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: { state: 'success' } });
    });
  });

  describe('AUTH_CANCEL_DEVICE_FLOW', () => {
    it('cancels and responds ok=true', () => {
      const sendResponse = vi.fn();
      handleMessage({ type: 'AUTH_CANCEL_DEVICE_FLOW' }, sendResponse);
      expect(cancelDeviceFlow).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });
});
