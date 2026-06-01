import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  notify,
  hasNotificationsPermission,
  THROTTLE_MS,
  handleNotificationClick,
  CLICK_TARGETS_KEY,
  CLICK_TARGETS_MAX,
} from '../../src/background/notifications';
import type { AutomationSettings } from '../../src/core/automations-types';
import { STORAGE_KEYS_V2 } from '../../src/core/storage/multi-account';

const NOTIF_SETTINGS = {
  notificationsEnabled: true,
  notifyOnRebased: true,
  notifyOnConflicted: true,
  notifyOnMerged: true,
  notifyOnIdle: true,
  notifyOnPingConfirmed: true,
} satisfies Pick<
  AutomationSettings,
  | 'notificationsEnabled'
  | 'notifyOnRebased'
  | 'notifyOnConflicted'
  | 'notifyOnMerged'
  | 'notifyOnIdle'
  | 'notifyOnPingConfirmed'
>;

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

function setActive(id: string | null) {
  if (id == null) delete local.data[STORAGE_KEYS_V2.activeAccountId];
  else local.data[STORAGE_KEYS_V2.activeAccountId] = id;
}

function setPermissionGranted(granted: boolean) {
  (chrome.permissions.contains as ReturnType<typeof vi.fn>).mockImplementation(
    (_req: unknown, cb: (g: boolean) => void) => cb(granted),
  );
}

beforeEach(() => {
  local = makeStorage();
  chrome.storage.local.get = local.get as unknown as typeof chrome.storage.local.get;
  chrome.storage.local.set = local.set as unknown as typeof chrome.storage.local.set;
  chrome.storage.local.remove = local.remove as unknown as typeof chrome.storage.local.remove;
  setPermissionGranted(true);
  setActive('gh_octocat');
  local.data[STORAGE_KEYS_V2.accounts] = { gh_octocat: {} };
});

const payload = (over: Partial<Parameters<typeof notify>[0]> = {}): Parameters<typeof notify>[0] => ({
  event: 'rebased',
  repo: 'org/repo',
  prNumber: 42,
  prTitle: 'My PR',
  ...over,
});

// CT-5 — a minimal AccountScope stand-in backed by its OWN in-memory throttle
// store, so two scopes can be proven isolated (notify() only calls
// read/writeNotifThrottle on the scope).
type Scope4 = Parameters<typeof notify>[3];
function fakeScope(initial: Record<string, number> = {}) {
  let store: Record<string, number> = { ...initial };
  const scope = {
    readNotifThrottle: async () => ({ ...store }),
    writeNotifThrottle: async (v: Record<string, number>) => { store = { ...v }; },
  } as unknown as Scope4;
  return { scope, snapshot: () => store };
}

describe('hasNotificationsPermission', () => {
  it('returns true when chrome.permissions.contains says granted', async () => {
    setPermissionGranted(true);
    expect(await hasNotificationsPermission()).toBe(true);
  });

  it('returns false when not granted', async () => {
    setPermissionGranted(false);
    expect(await hasNotificationsPermission()).toBe(false);
  });
});

describe('notify', () => {
  it('does nothing when master toggle is off', async () => {
    const fired = await notify(payload(), { ...NOTIF_SETTINGS, notificationsEnabled: false });
    expect(fired).toBe(false);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('does nothing when the per-event toggle is off', async () => {
    const fired = await notify(payload({ event: 'rebased' }), {
      ...NOTIF_SETTINGS,
      notifyOnRebased: false,
    });
    expect(fired).toBe(false);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('does nothing when the runtime permission is not granted', async () => {
    setPermissionGranted(false);
    const fired = await notify(payload(), NOTIF_SETTINGS);
    expect(fired).toBe(false);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it('fires a notification on the happy path', async () => {
    const fired = await notify(payload(), NOTIF_SETTINGS);
    expect(fired).toBe(true);
    expect(chrome.notifications.create).toHaveBeenCalledOnce();
    const call = (chrome.notifications.create as ReturnType<typeof vi.fn>).mock.calls[0];
    const opts = call[0];
    expect(opts).toMatchObject({ type: 'basic', title: 'PR rebased' });
    expect(opts.message).toContain('org/repo#42');
    expect(opts.message).toContain('My PR');
  });

  it('throttles a second fire for the same (PR, event) within the window', async () => {
    const t0 = 1_000_000;
    expect(await notify(payload(), NOTIF_SETTINGS, t0)).toBe(true);
    expect(await notify(payload(), NOTIF_SETTINGS, t0 + 1000)).toBe(false);
    expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('fires again after the throttle window elapses', async () => {
    const t0 = 1_000_000;
    expect(await notify(payload(), NOTIF_SETTINGS, t0)).toBe(true);
    expect(await notify(payload(), NOTIF_SETTINGS, t0 + THROTTLE_MS + 1)).toBe(true);
    expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
  });

  it('does not throttle different events on the same PR', async () => {
    const t0 = 1_000_000;
    await notify(payload({ event: 'rebased' }), NOTIF_SETTINGS, t0);
    await notify(payload({ event: 'conflicted' }), NOTIF_SETTINGS, t0 + 1000);
    expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
  });

  it('does not throttle the same event on different PRs', async () => {
    const t0 = 1_000_000;
    await notify(payload({ prNumber: 1 }), NOTIF_SETTINGS, t0);
    await notify(payload({ prNumber: 2 }), NOTIF_SETTINGS, t0 + 1000);
    expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
  });

  it('persists throttle entries under the active account state', async () => {
    await notify(payload(), NOTIF_SETTINGS, 1_000_000);
    const accounts = local.data[STORAGE_KEYS_V2.accounts] as Record<string, { notif_throttle?: Record<string, number> }>;
    expect(accounts.gh_octocat.notif_throttle).toEqual({ 'org/repo#42:rebased': 1_000_000 });
  });

  // ── CT-5 — account-scoped throttle (cross-account isolation) ──
  it('CT-5: account A throttle does NOT suppress account B, and B does not clobber A', async () => {
    const t0 = 1_000_000;
    const a = fakeScope();
    const b = fakeScope();
    const p = payload({ event: 'rebased', repo: 'o/r', prNumber: 42 });
    await notify(p, NOTIF_SETTINGS, t0, a.scope);
    await notify(p, NOTIF_SETTINGS, t0 + 1, b.scope); // within THROTTLE_MS of A
    // B fired despite A's recent throttle entry → 2 notifications total.
    expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
    // A's slot is intact and NOT mutated by B's write.
    expect(a.snapshot()).toEqual({ 'o/r#42:rebased': t0 });
    expect(b.snapshot()).toEqual({ 'o/r#42:rebased': t0 + 1 });
  });

  it('CT-5: repo-qualified key — same PR number in two repos gets independent slots', async () => {
    const t0 = 1_000_000;
    const s = fakeScope();
    await notify(payload({ repo: 'org/a', prNumber: 42 }), NOTIF_SETTINGS, t0, s.scope);
    await notify(payload({ repo: 'org/b', prNumber: 42 }), NOTIF_SETTINGS, t0 + 1, s.scope);
    expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
    expect(s.snapshot()).toEqual({ 'org/a#42:rebased': t0, 'org/b#42:rebased': t0 + 1 });
  });

  it('CT-5: same repo+pr+event within the window is still throttled (scoped path)', async () => {
    const t0 = 1_000_000;
    const s = fakeScope();
    await notify(payload(), NOTIF_SETTINGS, t0, s.scope);
    await notify(payload(), NOTIF_SETTINGS, t0 + 1, s.scope);
    expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('uses the right title per event', async () => {
    const titles: string[] = [];
    (chrome.notifications.create as ReturnType<typeof vi.fn>).mockImplementation(
      (opts: { title: string }, cb: () => void) => {
        titles.push(opts.title);
        cb();
      },
    );
    await notify(payload({ event: 'conflicted', prNumber: 1 }), NOTIF_SETTINGS);
    await notify(payload({ event: 'merged', prNumber: 2 }), NOTIF_SETTINGS);
    await notify(payload({ event: 'idle', prNumber: 3 }), NOTIF_SETTINGS);
    await notify(payload({ event: 'ping-confirmed', prNumber: 4 }), NOTIF_SETTINGS);
    expect(titles).toEqual(['Rebase conflict', 'PR merged', 'PR idle', 'Reviewer pinged']);
  });
});

// CT-4 (re-scoped) — clicking a notification opens the PR.
describe('notification click-to-open', () => {
  // Yield deterministic ids from create (the global stub passes none).
  function createYields(ids: string[]) {
    let i = 0;
    (chrome.notifications.create as ReturnType<typeof vi.fn>).mockImplementation(
      (_opts: unknown, cb: (id: string) => void) => cb(ids[i++] ?? `nid_${i}`),
    );
  }

  beforeEach(() => {
    createYields(['nid_1']);
    chrome.tabs.create = vi.fn() as unknown as typeof chrome.tabs.create;
    chrome.notifications.clear = vi.fn() as unknown as typeof chrome.notifications.clear;
  });

  const clickMap = () =>
    (local.data[CLICK_TARGETS_KEY] as Record<string, string> | undefined) ?? {};

  it('captures the id and persists the click target when url is set', async () => {
    await notify(payload({ url: 'https://github.com/org/repo/pull/42' }), NOTIF_SETTINGS, 1_000_000);
    expect(clickMap()).toEqual({ nid_1: 'https://github.com/org/repo/pull/42' });
  });

  it('stores NO click target when url is absent (still fires)', async () => {
    const fired = await notify(payload(), NOTIF_SETTINGS, 1_000_000);
    expect(fired).toBe(true);
    expect(clickMap()).toEqual({});
  });

  it('click opens the PR, clears the notification, and removes the entry', async () => {
    local.data[CLICK_TARGETS_KEY] = { nid_1: 'https://github.com/org/repo/pull/42' };
    await handleNotificationClick('nid_1');
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://github.com/org/repo/pull/42' });
    expect(chrome.notifications.clear).toHaveBeenCalledWith('nid_1');
    expect(clickMap()).toEqual({});
  });

  it('click on an unknown id is a no-op (no tab, no throw)', async () => {
    local.data[CLICK_TARGETS_KEY] = { nid_1: 'https://github.com/org/repo/pull/42' };
    await expect(handleNotificationClick('unknown')).resolves.toBeUndefined();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(clickMap()).toEqual({ nid_1: 'https://github.com/org/repo/pull/42' });
  });

  it('bounds the click-target map to the most-recent CLICK_TARGETS_MAX', async () => {
    const n = CLICK_TARGETS_MAX + 5;
    createYields(Array.from({ length: n }, (_, i) => `nid_${i}`));
    for (let i = 0; i < n; i++) {
      // distinct prNumber so the per-(PR,event) throttle never suppresses a fire
      await notify(payload({ prNumber: i, url: `https://github.com/org/repo/pull/${i}` }), NOTIF_SETTINGS, 1_000_000 + i);
    }
    const map = clickMap();
    expect(Object.keys(map).length).toBe(CLICK_TARGETS_MAX);
    // newest survives, oldest dropped
    expect(map[`nid_${n - 1}`]).toBe(`https://github.com/org/repo/pull/${n - 1}`);
    expect(map.nid_0).toBeUndefined();
  });

  it('a click-target persist failure is swallowed (notification still fires)', async () => {
    (local.set as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('storage boom'));
    const fired = await notify(payload({ url: 'https://github.com/org/repo/pull/42' }), NOTIF_SETTINGS, 1_000_000);
    expect(fired).toBe(true);
    expect(chrome.notifications.create).toHaveBeenCalledOnce();
  });
});
