import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPingedStore,
  recordPing,
  clearPingedStore,
  isThrottled,
  hoursSinceLastPing,
  PING_THROTTLE_KEY,
} from '../../src/core/ping-throttle';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isThrottled', () => {
  const now = 1_700_000_000_000;

  it('returns false when PR is not in store', () => {
    expect(isThrottled({}, 1, now)).toBe(false);
  });

  it('returns true within 24 hours of a ping', () => {
    const store = { 1: { at: now - 60 * 60 * 1000 } }; // 1 hour ago
    expect(isThrottled(store, 1, now)).toBe(true);
  });

  it('returns false at exactly 24 hours', () => {
    const store = { 1: { at: now - 24 * 60 * 60 * 1000 } };
    expect(isThrottled(store, 1, now)).toBe(false);
  });

  it('returns false past 24 hours', () => {
    const store = { 1: { at: now - 25 * 60 * 60 * 1000 } };
    expect(isThrottled(store, 1, now)).toBe(false);
  });

  it('throttles per PR id, not across PRs', () => {
    const store = { 1: { at: now } };
    expect(isThrottled(store, 1, now)).toBe(true);
    expect(isThrottled(store, 2, now)).toBe(false);
  });
});

describe('hoursSinceLastPing', () => {
  const now = 1_700_000_000_000;

  it('returns null when never pinged', () => {
    expect(hoursSinceLastPing({}, 1, now)).toBeNull();
  });

  it('returns floor of hours elapsed', () => {
    const store = { 1: { at: now - (3 * 60 * 60 * 1000 + 30 * 60 * 1000) } }; // 3h30m ago
    expect(hoursSinceLastPing(store, 1, now)).toBe(3);
  });
});

describe('prune (audit P1)', () => {
  it('drops entries older than the throttle window when recordPing runs', async () => {
    const now = 1_700_000_000_000;
    const old = now - (25 * 60 * 60 * 1000); // 25h ago — past throttle
    const recent = now - (60 * 60 * 1000);   // 1h ago — within throttle
    const data: Record<string, unknown> = {
      pingedPRs: { 1: { at: old }, 2: { at: recent } },
    };
    chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => ({
      [key]: data[key],
    }));
    chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    });

    const { recordPing } = await import('../../src/core/ping-throttle');
    await recordPing(99, now);

    const stored = data.pingedPRs as Record<number, { at: number }>;
    expect(stored[1]).toBeUndefined(); // pruned
    expect(stored[2]).toEqual({ at: recent });
    expect(stored[99]).toEqual({ at: now });
  });
});

describe('storage round-trip', () => {
  it('recordPing writes the entry, getPingedStore reads it back', async () => {
    const data: Record<string, unknown> = {};
    chrome.storage.local.get = vi.fn().mockImplementation(async (key: string) => ({
      [key]: data[key],
    }));
    chrome.storage.local.set = vi.fn().mockImplementation(async (obj: Record<string, unknown>) => {
      Object.assign(data, obj);
    });

    await recordPing(42, 1_700_000_000_000);
    const store = await getPingedStore();
    expect(store[42]).toEqual({ at: 1_700_000_000_000 });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ [PING_THROTTLE_KEY]: { 42: { at: 1_700_000_000_000 } } }),
    );
  });

  it('clearPingedStore drops the entire throttle map', async () => {
    (chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await clearPingedStore();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(PING_THROTTLE_KEY);
  });
});
