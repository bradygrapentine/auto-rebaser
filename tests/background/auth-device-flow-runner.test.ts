import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the pure module so the runner can be tested without real network.
vi.mock('../../src/core/auth-device-flow', () => ({
  startDeviceFlow: vi.fn(),
  pollDeviceFlow: vi.fn(),
  DeviceFlowAbort: class extends Error {
    constructor(public code: string) { super(code); }
  },
}));
vi.mock('../../src/core/auth-store', () => ({
  setToken: vi.fn(),
}));

import {
  startDeviceFlow,
  pollDeviceFlow,
  DeviceFlowAbort,
} from '../../src/core/auth-device-flow';
import { setToken } from '../../src/core/auth-store';
import {
  beginDeviceFlow,
  cancelDeviceFlow,
  getStatus,
  _resetForTests,
} from '../../src/background/auth-device-flow-runner';

const mStart = vi.mocked(startDeviceFlow);
const mPoll = vi.mocked(pollDeviceFlow);
const mSetToken = vi.mocked(setToken);

const exampleStart = {
  userCode: 'AAA-111', verificationUri: 'https://github.com/login/device',
  deviceCode: 'DC1', intervalMs: 5000, expiresAt: Date.now() + 900_000,
};

beforeEach(() => {
  _resetForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  _resetForTests();
});

describe('beginDeviceFlow', () => {
  it('starts the flow and transitions through pending → success', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockResolvedValue({
      accessToken: 'gho_test',
      refreshToken: 'ghr_test',
      accessTokenExpiresAt: 0,
      refreshTokenExpiresAt: 0,
    });

    const start = await beginDeviceFlow();
    expect(start).toEqual(exampleStart);
    expect(getStatus()).toEqual({ state: 'pending', start: exampleStart });

    // Wait for the polling promise chain to complete
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(mSetToken).toHaveBeenCalledWith('gho_test');
    expect(getStatus()).toEqual({ state: 'success' });
  });

  it('returns the same start when called twice while pending', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockReturnValue(new Promise(() => { /* never resolves */ }));

    const a = await beginDeviceFlow();
    const b = await beginDeviceFlow();
    expect(a).toBe(b);
    expect(mStart).toHaveBeenCalledTimes(1);
  });

  it('access_denied via DeviceFlowAbort transitions to cancelled', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockRejectedValue(new (DeviceFlowAbort as unknown as { new(c: string): Error })('access_denied'));

    await beginDeviceFlow();
    await new Promise((r) => setTimeout(r, 0));
    expect(getStatus()).toEqual({ state: 'cancelled' });
    expect(mSetToken).not.toHaveBeenCalled();
  });

  it('expired_token via DeviceFlowAbort transitions to expired', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockRejectedValue(new (DeviceFlowAbort as unknown as { new(c: string): Error })('expired_token'));

    await beginDeviceFlow();
    await new Promise((r) => setTimeout(r, 0));
    expect(getStatus()).toEqual({ state: 'expired' });
  });

  it('generic error transitions to error with message', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockRejectedValue(new Error('boom'));

    await beginDeviceFlow();
    await new Promise((r) => setTimeout(r, 0));
    const status = getStatus();
    expect(status.state).toBe('error');
    if (status.state === 'error') {
      expect(status.message).toBe('boom');
    }
  });
});

describe('cancelDeviceFlow', () => {
  it('aborts the in-flight controller and marks status cancelled', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockReturnValue(new Promise(() => {}));

    await beginDeviceFlow();
    cancelDeviceFlow();
    expect(getStatus()).toEqual({ state: 'cancelled' });
  });
});
