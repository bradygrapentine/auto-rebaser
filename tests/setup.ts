import { vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// Stub Vite env vars so import.meta.env.VITE_* doesn't blow up during tests.
vi.stubEnv('VITE_GITHUB_CLIENT_ID', 'test-client-id');
vi.stubEnv('VITE_GITHUB_CLIENT_SECRET', 'test-client-secret');

// Build a fresh chrome mock per test file. Individual tests can re-mock specific methods.
function buildChromeMock() {
  return {
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      sync: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
      session: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      clearAll: vi.fn(),
      onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    identity: {
      launchWebAuthFlow: vi.fn(),
      getRedirectURL: vi.fn(() => 'https://abc123.chromiumapp.org/'),
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    tabs: {
      create: vi.fn(),
    },
    runtime: {
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      sendMessage: vi.fn(),
      lastError: undefined,
      getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
    },
    permissions: {
      contains: vi.fn((_req: unknown, cb: (granted: boolean) => void) => cb(false)),
      request: vi.fn((_req: unknown, cb: (granted: boolean) => void) => cb(true)),
      remove: vi.fn((_req: unknown, cb: () => void) => cb()),
    },
    notifications: {
      create: vi.fn((_idOrOpts: unknown, _optsOrCb: unknown, cb?: () => void) => {
        if (typeof _optsOrCb === 'function') (_optsOrCb as () => void)();
        else if (typeof cb === 'function') cb();
      }),
    },
  };
}

Object.defineProperty(globalThis, 'chrome', {
  value: buildChromeMock(),
  writable: true,
  configurable: true,
});

// Reset chrome mock fully between tests so listener counts and stored returns don't leak.
afterEach(() => {
  Object.defineProperty(globalThis, 'chrome', {
    value: buildChromeMock(),
    writable: true,
    configurable: true,
  });
  vi.restoreAllMocks();
});
