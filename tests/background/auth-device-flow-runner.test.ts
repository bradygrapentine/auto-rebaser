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
  setAuthGitHubApp: vi.fn(),
  getAuth: vi.fn().mockResolvedValue(null),
  setInstallations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/github/endpoints/installations', () => ({
  getUserInstallations: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/core/storage/multi-account', () => ({
  buildAccountId: vi.fn().mockReturnValue('gh_octocat'),
  setAccountState: vi.fn().mockResolvedValue(undefined),
  setActiveAccountId: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/core/settings-store', () => ({
  getSettings: vi.fn().mockResolvedValue({ intervalMinutes: 5 }),
}));
vi.mock('../../src/core/host-config', () => ({
  getApiBase: vi.fn().mockResolvedValue('https://api.github.com'),
}));

import {
  startDeviceFlow,
  pollDeviceFlow,
  DeviceFlowAbort,
} from '../../src/core/auth-device-flow';
import { setAuthGitHubApp } from '../../src/core/auth-store';
import {
  beginDeviceFlow,
  beginDeviceFlowAddAccount,
  cancelDeviceFlow,
  getStatus,
  resetStatus,
  _resetForTests,
} from '../../src/background/auth-device-flow-runner';

const mStart = vi.mocked(startDeviceFlow);
const mPoll = vi.mocked(pollDeviceFlow);
const mSetAuth = vi.mocked(setAuthGitHubApp);

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

    expect(mSetAuth).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'gho_test' }));
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
    expect(mSetAuth).not.toHaveBeenCalled();
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

describe('resetStatus', () => {
  it('returns status to idle after a terminal state', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockReturnValue(new Promise(() => {}));
    await beginDeviceFlow();
    cancelDeviceFlow();
    expect(getStatus().state).toBe('cancelled');
    resetStatus();
    expect(getStatus()).toEqual({ state: 'idle' });
  });
});

describe('beginDeviceFlowAddAccount', () => {
  it('starts a device flow and returns the start payload', async () => {
    mStart.mockResolvedValue(exampleStart);
    mPoll.mockReturnValue(new Promise(() => {}));
    const result = await beginDeviceFlowAddAccount();
    expect(result).toEqual(exampleStart);
    expect(getStatus().state).toBe('pending');
  });
});
