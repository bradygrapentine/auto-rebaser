import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notify, hasNotificationsPermission, THROTTLE_MS } from '../../src/background/notifications';
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
    expect(accounts.gh_octocat.notif_throttle).toEqual({ '42:rebased': 1_000_000 });
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
