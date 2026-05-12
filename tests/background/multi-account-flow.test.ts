// T3 — Integration: end-to-end add-second-account flow with closure capture safety.
//
// Probative assertions:
// 1. Add-account success writes auth to new account, not existing account.
// 2. Closure captures protect against SW eviction during the device-flow .then.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/core/auth-device-flow', () => ({
  startDeviceFlow: vi.fn(),
  pollDeviceFlow: vi.fn(),
  DeviceFlowAbort: class DeviceFlowAbort extends Error {
    constructor(public code: string) { super(code); }
  },
}));

vi.mock('../../src/core/auth-store', () => ({
  setAuthGitHubApp: vi.fn(),
  setInstallations: vi.fn(),
  setInstallationsFor: vi.fn(),
}));

vi.mock('../../src/github/endpoints/installations', () => ({
  getUserInstallations: vi.fn(),
}));

vi.mock('../../src/core/storage/multi-account', () => ({
  buildAccountId: vi.fn(),
  setAccountState: vi.fn(),
  setActiveAccountId: vi.fn(),
  listAccountIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/core/settings-store', () => ({
  getSettings: vi.fn(),
}));

vi.mock('../../src/core/host-config', () => ({
  getApiBase: vi.fn(),
}));

import {
  beginDeviceFlowAddAccount,
  getStatus,
  _resetForTests,
} from '../../src/background/auth-device-flow-runner';
import {
  startDeviceFlow,
  pollDeviceFlow,
  type DeviceFlowStart,
} from '../../src/core/auth-device-flow';
import {
  setAuthGitHubApp,
  setInstallationsFor,
} from '../../src/core/auth-store';
import { getUserInstallations } from '../../src/github/endpoints/installations';
import {
  buildAccountId,
  setAccountState,
  setActiveAccountId,
} from '../../src/core/storage/multi-account';
import { getSettings } from '../../src/core/settings-store';
import { getApiBase } from '../../src/core/host-config';

const realFetch = globalThis.fetch;

function mockFetch(handler: () => Response | Promise<Response>) {
  globalThis.fetch = vi.fn().mockImplementation(handler);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTests();

  (startDeviceFlow as ReturnType<typeof vi.fn>).mockResolvedValue({
    deviceCode: 'code123',
    userCode: 'ABCD-1234',
    verificationUri: 'https://github.com/login/device',
  } as DeviceFlowStart);

  (getSettings as ReturnType<typeof vi.fn>).mockResolvedValue({
    enterpriseHost: null,
  });

  (getApiBase as ReturnType<typeof vi.fn>).mockResolvedValue(
    'https://api.github.com',
  );

  (buildAccountId as ReturnType<typeof vi.fn>).mockImplementation(
    (login: string) => `gh_${login}`,
  );

  (setAccountState as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (setActiveAccountId as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined,
  );
  (setInstallationsFor as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined,
  );
  (getUserInstallations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('multi-account flow — end-to-end add-account', () => {
  it('writes auth to new account when add-account success completes', async () => {
    const stubStart = {
      deviceCode: 'code123',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
    } as DeviceFlowStart;
    (startDeviceFlow as ReturnType<typeof vi.fn>).mockResolvedValue(stubStart);

    // Simulate device flow polling arriving with a token.
    const stubTokenSet = {
      accessToken: 'gho_new',
      refreshToken: 'ghr_new',
      expiresAt: Date.now() + 3600000,
    };
    (pollDeviceFlow as ReturnType<typeof vi.fn>).mockImplementation(
      async (_start, _opts) => {
        // Yield to let beginDeviceFlow return, then resolve the flow.
        await new Promise((r) => setTimeout(r, 0));
        return stubTokenSet;
      },
    );

    mockFetch(() => jsonResponse({ login: 'newuser' }));

    // Start an add-account flow.
    const start = await beginDeviceFlowAddAccount();
    expect(start).toEqual(stubStart);

    // Let the polling loop settle.
    await new Promise((r) => setTimeout(r, 10));

    // Verify the new account received the auth.
    expect(setAccountState).toHaveBeenCalledWith('gh_newuser', 'auth', {
      method: 'github_app',
      ...stubTokenSet,
    });

    // Verify installations were written to the new account.
    expect(setInstallationsFor).toHaveBeenCalledWith('gh_newuser', []);

    // Verify active account was flipped.
    expect(setActiveAccountId).toHaveBeenCalledWith('gh_newuser');

    // Verify the status reflects success.
    const status = getStatus();
    expect(status.state).toBe('success');
    expect((status as { userLogin?: string }).userLogin).toBe('newuser');
  });

  it('does not overwrite existing account when device flow succeeds', async () => {
    const stubStart = {
      deviceCode: 'code456',
      userCode: 'WXYZ-9999',
      verificationUri: 'https://github.com/login/device',
    } as DeviceFlowStart;
    (startDeviceFlow as ReturnType<typeof vi.fn>).mockResolvedValue(stubStart);

    const newTokenSet = {
      accessToken: 'gho_newaccount',
      refreshToken: 'ghr_newaccount',
      expiresAt: Date.now() + 3600000,
    };
    (pollDeviceFlow as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        await new Promise((r) => setTimeout(r, 0));
        return newTokenSet;
      },
    );

    mockFetch(() => jsonResponse({ login: 'seconduser' }));

    // Start add-account (simulating existing account 'gh_first').
    await beginDeviceFlowAddAccount();
    await new Promise((r) => setTimeout(r, 10));

    // Verify the old account setAuthGitHubApp was NOT called (that's legacy path).
    expect(setAuthGitHubApp).not.toHaveBeenCalled();

    // Verify new account got the new token.
    expect(setAccountState).toHaveBeenCalledWith('gh_seconduser', 'auth', {
      method: 'github_app',
      ...newTokenSet,
    });
  });

  it('protects against SW eviction resetting addingAccount flag mid-flow', async () => {
    // This test verifies the closure capture. If addingAccount was read from
    // state after the await instead of captured, the test fixture would
    // reproduce the bug: set addingAccount=true, start the flow, reset state
    // (simulating eviction), and verify the flag doesn't revert to false mid-handler.
    const stubStart = {
      deviceCode: 'code789',
      userCode: 'MNOP-5555',
      verificationUri: 'https://github.com/login/device',
    } as DeviceFlowStart;
    (startDeviceFlow as ReturnType<typeof vi.fn>).mockResolvedValue(stubStart);

    const tokenSet = {
      accessToken: 'gho_protected',
      refreshToken: 'ghr_protected',
      expiresAt: Date.now() + 3600000,
    };
    (pollDeviceFlow as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        await new Promise((r) => setTimeout(r, 0));
        // Simulate SW eviction: reset the global state (closure captures protect against this).
        _resetForTests();
        return tokenSet;
      },
    );

    mockFetch(() => jsonResponse({ login: 'protected' }));

    // Start with add-account mode.
    await beginDeviceFlowAddAccount();
    await new Promise((r) => setTimeout(r, 10));

    // If the code was reading state.addingAccount after the resetStatus() above,
    // it would take the legacy single-account path. Instead, the closure-captured
    // flag should force the add-account path, writing to the new account.
    expect(setAccountState).toHaveBeenCalledWith('gh_protected', 'auth', {
      method: 'github_app',
      ...tokenSet,
    });

    // The legacy path would have called setAuthGitHubApp; it must not be called.
    expect(setAuthGitHubApp).not.toHaveBeenCalled();
  });
});
