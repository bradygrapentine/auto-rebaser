// Story 4.2 — OAuth Device Flow against GitHub.
//
// Two pure functions:
//   startDeviceFlow()   POSTs to /login/device/code → returns user_code + device_code
//   pollDeviceFlow()    polls /login/oauth/access_token until success/abort
//
// No `chrome.*` calls here. The service worker layer wraps these and
// persists the token; the popup is only responsible for displaying
// `userCode` and `verificationUri`. Both Chrome and Firefox use the same
// code path.

import { getOAuthClientId, getOriginBase } from './host-config';

const DEVICE_FLOW_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

export interface DeviceFlowStart {
  /** Display to the user. Format: "ABCD-1234". */
  userCode: string;
  /** URL the user opens. Always `https://github.com/login/device` for github.com. */
  verificationUri: string;
  /** Server-side handle, used in poll requests. NOT shown to the user. */
  deviceCode: string;
  /** Poll interval in ms. GitHub returns this in seconds; we convert. */
  intervalMs: number;
  /** Epoch ms after which the device code is no longer valid. */
  expiresAt: number;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  accessTokenExpiresAt: number;
  /** Epoch ms. */
  refreshTokenExpiresAt: number;
}

/**
 * Errors callers should branch on. Anything else is a generic Error.
 */
export type DeviceFlowError =
  | 'access_denied'   // user cancelled
  | 'expired_token'   // 15-minute window elapsed
  | 'unsupported_grant_type'
  | 'unauthorized_client';

export class DeviceFlowAbort extends Error {
  constructor(public readonly code: DeviceFlowError) {
    super(`device flow aborted: ${code}`);
    this.name = 'DeviceFlowAbort';
  }
}

export async function startDeviceFlow(now: number = Date.now()): Promise<DeviceFlowStart> {
  const origin = await getOriginBase();
  const clientId = await getOAuthClientId();
  if (!clientId) {
    throw new Error('MISSING_CLIENT_ID');
  }
  const res = await fetch(`${origin}/login/device/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ client_id: clientId }).toString(),
  });
  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }
  const data = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    deviceCode: data.device_code,
    intervalMs: data.interval * 1000,
    expiresAt: now + data.expires_in * 1000,
  };
}

interface PollDeps {
  /** Sleep adapter so tests can fast-forward. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Clock source. Defaults to Date.now. */
  now?: () => number;
  /** Abort signal — when triggered, the loop rejects with `DeviceFlowAbort('access_denied')`. */
  signal?: AbortSignal;
}

/**
 * Poll until GitHub returns a token, the device code expires, or the user
 * cancels. Honors `slow_down` by extending the interval per RFC 8628.
 */
export async function pollDeviceFlow(
  start: DeviceFlowStart,
  deps: PollDeps = {},
): Promise<TokenSet> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  let intervalMs = start.intervalMs;

  while (true) {
    if (deps.signal?.aborted) throw new DeviceFlowAbort('access_denied');
    if (now() >= start.expiresAt) throw new DeviceFlowAbort('expired_token');

    await sleep(intervalMs);

    const res = await fetch(`${await getOriginBase()}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: await getOAuthClientId(),
        device_code: start.deviceCode,
        grant_type: DEVICE_FLOW_GRANT_TYPE,
      }).toString(),
    });

    // GitHub always returns 200 with an `error` field for the pending /
    // slow_down / denied / expired states. Network/server errors return non-2xx.
    if (!res.ok) {
      throw new Error(`HTTP_${res.status}`);
    }
    const body = (await res.json()) as TokenResponseBody;

    if ('error' in body && body.error) {
      switch (body.error) {
        case 'authorization_pending':
          continue;
        case 'slow_down':
          intervalMs += 5000;
          continue;
        case 'access_denied':
        case 'expired_token':
        case 'unsupported_grant_type':
        case 'unauthorized_client':
          throw new DeviceFlowAbort(body.error);
        default:
          throw new Error(`device_flow_error: ${body.error}`);
      }
    }

    if ('access_token' in body) {
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? '',
        accessTokenExpiresAt: now() + (body.expires_in ?? 0) * 1000,
        refreshTokenExpiresAt:
          now() + (body.refresh_token_expires_in ?? 0) * 1000,
      };
    }

    throw new Error('device_flow_unexpected_response');
  }
}

type TokenResponseBody =
  | {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
      token_type?: string;
      scope?: string;
    }
  | {
      error: string;
      error_description?: string;
      error_uri?: string;
    };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
