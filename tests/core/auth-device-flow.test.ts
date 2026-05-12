import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startDeviceFlow,
  pollDeviceFlow,
  DeviceFlowAbort,
  type DeviceFlowStart,
} from '../../src/core/auth-device-flow';

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn().mockImplementation(handler);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const noSleep = () => Promise.resolve();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
});

describe('startDeviceFlow', () => {
  it('POSTs to /login/device/code with client_id and returns the parsed shape', async () => {
    let lastUrl = '';
    let lastBody = '';
    mockFetch((url, init) => {
      lastUrl = url;
      lastBody = init?.body as string;
      return jsonResponse({
        device_code: 'DC1',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      });
    });

    const now = 1_700_000_000_000;
    const result = await startDeviceFlow(now);

    expect(lastUrl).toBe('https://github.com/login/device/code');
    expect(lastBody).toContain('client_id=');
    expect(result.userCode).toBe('ABCD-1234');
    expect(result.verificationUri).toBe('https://github.com/login/device');
    expect(result.deviceCode).toBe('DC1');
    expect(result.intervalMs).toBe(5000);
    expect(result.expiresAt).toBe(now + 900 * 1000);
  });

  it('throws on non-200', async () => {
    mockFetch(() => new Response('boom', { status: 503 }));
    await expect(startDeviceFlow()).rejects.toThrow(/HTTP_503/);
  });
});

describe('pollDeviceFlow', () => {
  const baseStart: DeviceFlowStart = {
    userCode: 'AAA-111',
    verificationUri: 'https://github.com/login/device',
    deviceCode: 'DC1',
    intervalMs: 5000,
    expiresAt: 1_700_000_000_000 + 900_000,
  };

  it('returns a TokenSet on access_token response', async () => {
    mockFetch(() => jsonResponse({
      access_token: 'gho_abc',
      refresh_token: 'ghr_xyz',
      expires_in: 28800,
      refresh_token_expires_in: 15897600,
    }));

    let nowVal = 1_700_000_000_000;
    const result = await pollDeviceFlow(baseStart, { sleep: noSleep, now: () => nowVal });
    expect(result.accessToken).toBe('gho_abc');
    expect(result.refreshToken).toBe('ghr_xyz');
    expect(result.accessTokenExpiresAt).toBe(nowVal + 28800 * 1000);
    expect(result.refreshTokenExpiresAt).toBe(nowVal + 15897600 * 1000);
  });

  it('keeps polling on authorization_pending then succeeds', async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      if (calls < 3) return jsonResponse({ error: 'authorization_pending' });
      return jsonResponse({ access_token: 'gho_x', expires_in: 100, refresh_token_expires_in: 200 });
    });
    const result = await pollDeviceFlow(baseStart, { sleep: noSleep, now: () => 1_700_000_000_000 });
    expect(result.accessToken).toBe('gho_x');
    expect(calls).toBe(3);
  });

  it('extends interval by 5s on slow_down', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    mockFetch(() => {
      calls++;
      if (calls === 1) return jsonResponse({ error: 'slow_down' });
      return jsonResponse({ access_token: 'gho_x' });
    });
    await pollDeviceFlow(baseStart, {
      sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
      now: () => 1_700_000_000_000,
    });
    expect(sleeps[0]).toBe(5000);
    expect(sleeps[1]).toBe(10000);
  });

  it('rejects with access_denied when GitHub returns access_denied', async () => {
    mockFetch(() => jsonResponse({ error: 'access_denied' }));
    await expect(pollDeviceFlow(baseStart, { sleep: noSleep, now: () => 1_700_000_000_000 }))
      .rejects.toMatchObject({ code: 'access_denied' });
  });

  it('rejects with expired_token when GitHub returns expired_token', async () => {
    mockFetch(() => jsonResponse({ error: 'expired_token' }));
    await expect(pollDeviceFlow(baseStart, { sleep: noSleep, now: () => 1_700_000_000_000 }))
      .rejects.toMatchObject({ code: 'expired_token' });
  });

  it('rejects with expired_token when local clock passes expiresAt', async () => {
    mockFetch(() => jsonResponse({ error: 'authorization_pending' }));
    let nowVal = baseStart.expiresAt + 1;
    await expect(
      pollDeviceFlow(baseStart, { sleep: noSleep, now: () => nowVal }),
    ).rejects.toBeInstanceOf(DeviceFlowAbort);
  });

  it('rejects when AbortSignal is triggered', async () => {
    mockFetch(() => jsonResponse({ error: 'authorization_pending' }));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      pollDeviceFlow(baseStart, { sleep: noSleep, now: () => 1_700_000_000_000, signal: ctrl.signal }),
    ).rejects.toMatchObject({ code: 'access_denied' });
  });

  it('throws on non-200 (transient network)', async () => {
    mockFetch(() => new Response('', { status: 502 }));
    await expect(
      pollDeviceFlow(baseStart, { sleep: noSleep, now: () => 1_700_000_000_000 }),
    ).rejects.toThrow(/HTTP_502/);
  });

  it('throws device_flow_unexpected_response when body has neither error nor access_token', async () => {
    mockFetch(() => jsonResponse({}));
    await expect(
      pollDeviceFlow(baseStart, { sleep: noSleep, now: () => 1_700_000_000_000 }),
    ).rejects.toThrow(/device_flow_unexpected_response/);
  });

  it('uses defaultSleep when no sleep adapter is provided', async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return jsonResponse(
        calls === 1
          ? { error: 'authorization_pending' }
          : { access_token: 'tok', refresh_token: 'rt', expires_in: 3600, refresh_token_expires_in: 7200 },
      );
    });
    const promise = pollDeviceFlow(
      { ...baseStart, intervalMs: 10 },
      { now: () => 1_700_000_000_000 },
    );
    // Drain pending timers + microtasks so defaultSleep's setTimeout resolves.
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(promise).resolves.toMatchObject({ accessToken: 'tok' });
  });
});
