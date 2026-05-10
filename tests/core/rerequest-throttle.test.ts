import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRerequestStore,
  recordRerequest,
  clearRerequestStore,
  isThrottled,
  hoursSinceLastRerequest,
  RERE_REQUEST_THROTTLE_KEY,
  RERE_REQUEST_THROTTLE_WINDOW_MS,
} from '../../src/core/rerequest-throttle';
import { STORAGE_KEYS_V2 } from '../../src/core/storage/multi-account';

function makeStorage() {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys == null) return { ...data };
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (k in data) out[k] = data[k];
      return out;
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete data[k];
    }),
  };
}

let local: ReturnType<typeof makeStorage>;

beforeEach(() => {
  local = makeStorage();
  chrome.storage.local.get = local.get as unknown as typeof chrome.storage.local.get;
  chrome.storage.local.set = local.set as unknown as typeof chrome.storage.local.set;
  chrome.storage.local.remove = local.remove as unknown as typeof chrome.storage.local.remove;
  // Active account so the multi-account facade reads/writes under accounts.<id>.
  local.data[STORAGE_KEYS_V2.activeAccountId] = 'gh_octocat';
  local.data[STORAGE_KEYS_V2.accounts] = { gh_octocat: {} };
});

describe('isThrottled', () => {
  const now = 1_700_000_000_000;

  it('returns false when PR is not in store', () => {
    expect(isThrottled({}, 1, now)).toBe(false);
  });

  it('returns true within 24 hours of a re-request', () => {
    const store = { 1: { at: now - 60 * 60 * 1000 } };
    expect(isThrottled(store, 1, now)).toBe(true);
  });

  it('returns false at exactly 24 hours', () => {
    expect(isThrottled({ 1: { at: now - RERE_REQUEST_THROTTLE_WINDOW_MS } }, 1, now)).toBe(false);
  });

  it('returns false past 24 hours', () => {
    expect(isThrottled({ 1: { at: now - RERE_REQUEST_THROTTLE_WINDOW_MS - 1 } }, 1, now)).toBe(false);
  });

  it('throttles per PR id, not across PRs', () => {
    expect(isThrottled({ 1: { at: now } }, 1, now)).toBe(true);
    expect(isThrottled({ 1: { at: now } }, 2, now)).toBe(false);
  });
});

describe('hoursSinceLastRerequest', () => {
  const now = 1_700_000_000_000;

  it('returns null when never re-requested', () => {
    expect(hoursSinceLastRerequest({}, 1, now)).toBeNull();
  });

  it('returns the floor of hours since last re-request', () => {
    const ninetyMinAgo = now - 90 * 60 * 1000;
    expect(hoursSinceLastRerequest({ 1: { at: ninetyMinAgo } }, 1, now)).toBe(1);
  });
});

describe('recordRerequest persistence', () => {
  it('records the timestamp under the active account', async () => {
    await recordRerequest(42, 1_700_000_000_000);
    const store = await getRerequestStore();
    expect(store).toEqual({ 42: { at: 1_700_000_000_000 } });
  });

  it('prunes entries older than the throttle window on write', async () => {
    const t0 = 1_700_000_000_000;
    // Pre-seed an old entry directly under the account namespace.
    (local.data[STORAGE_KEYS_V2.accounts] as Record<string, Record<string, unknown>>).gh_octocat
      .rerequestedPRs = { 1: { at: t0 - RERE_REQUEST_THROTTLE_WINDOW_MS - 1 } };
    await recordRerequest(2, t0);
    const store = await getRerequestStore();
    expect(store).toEqual({ 2: { at: t0 } });
  });
});

describe('clearRerequestStore', () => {
  it('removes the rerequestedPRs key from the active account', async () => {
    await recordRerequest(1, Date.now());
    expect(await getRerequestStore()).not.toEqual({});
    await clearRerequestStore();
    expect(await getRerequestStore()).toEqual({});
  });
});

describe('exported constants', () => {
  it('storage key matches the AccountState slot name', () => {
    expect(RERE_REQUEST_THROTTLE_KEY).toBe('rerequestedPRs');
  });

  it('window is 24 hours', () => {
    expect(RERE_REQUEST_THROTTLE_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
