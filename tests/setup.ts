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
    runtime: {
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      sendMessage: vi.fn(),
      lastError: undefined,
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
