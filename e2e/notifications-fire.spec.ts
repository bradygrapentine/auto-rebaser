// Story 2.4 — integration gate that the poll cycle dispatches a desktop
// notification via chrome.notifications.create after a successful rebase
// when the user has notificationsEnabled + notifyOnRebased + runtime
// permission. Unit coverage in tests/background/notifications.test.ts
// proves the throttle + setting truth-table; this spec proves the
// poll-cycle → notify() wiring.

import { test, expect } from './fixtures';

async function wireRoutes(context: import('@playwright/test').BrowserContext): Promise<void> {
  let getPRCalls = 0;
  await context.route('**/api.github.com/**', async (route) => {
    const url = route.request().url();

    if (url.endsWith('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ login: 'e2e-user', id: 99999, avatar_url: '' }),
      });
      return;
    }

    if (url.includes('/search/issues')) {
      const q = new URL(url).searchParams.get('q') ?? '';
      // Authored search returns one behind PR; reviewer-side empty.
      if (q.includes('author:@me') && !q.includes('-author:@me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{
              id: 701,
              number: 701,
              title: 'PR to rebase',
              html_url: 'https://github.com/org/svc/pull/701',
              repository_url: 'https://api.github.com/repos/org/svc',
            }],
            total_count: 1,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total_count: 0 }),
      });
      return;
    }

    if (/\/repos\/org\/svc\/pulls\/701\/update-branch/.test(url)) {
      // Successful rebase response.
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Updating pull request branch.' }),
      });
      return;
    }

    if (/\/repos\/org\/svc\/pulls\/701$/.test(url)) {
      getPRCalls++;
      // First call: behind → triggers rebase. Subsequent calls (post-rebase
      // re-fetch): clean → state flips to 'updated', activity entry fires
      // with action='rebase' result='success' → notify('rebased').
      const mergeable_state = getPRCalls === 1 ? 'behind' : 'clean';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 701,
          number: 701,
          title: 'PR to rebase',
          html_url: 'https://github.com/org/svc/pull/701',
          state: 'open',
          mergeable_state,
          draft: false,
          merged: false,
          node_id: 'PR_node_701',
          base: { ref: 'main', sha: 'base-sha', repo: { full_name: 'org/svc' } },
          head: { ref: 'feature', sha: 'head-sha', repo: { full_name: 'org/svc' } },
          requested_reviewers: [],
        }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function stubNotificationsApi(serviceWorker: import('@playwright/test').Worker): Promise<void> {
  await serviceWorker.evaluate(() => {
    interface NotifGlobal { __notif_calls__: unknown[]; __perm_grant__: boolean }
    const g = globalThis as unknown as NotifGlobal;
    g.__notif_calls__ = [];
    g.__perm_grant__ = true;

    // Stub permissions.contains → respects the per-test toggle.
    if (chrome.permissions) {
      const stub = (perms: chrome.permissions.Permissions, cb?: (granted: boolean) => void) => {
        const wants = perms?.permissions ?? [];
        const granted = wants.includes('notifications') ? g.__perm_grant__ : true;
        if (typeof cb === 'function') cb(granted);
        return Promise.resolve(granted);
      };
      (chrome.permissions as { contains: typeof stub }).contains = stub;
    }

    // Stub notifications.create — install the API surface if it isn't
    // present (the optional `notifications` permission isn't granted in
    // headless test Chromium, so `chrome.notifications` is undefined and
    // the underlying `chrome.notifications?.create` guard in notify() would
    // short-circuit before our stub could record anything).
    interface ChromeWithNotif { notifications?: { create?: unknown } }
    const c = chrome as unknown as ChromeWithNotif;
    if (!c.notifications) c.notifications = {};
    const create = (
      opts: chrome.notifications.NotificationOptions,
      cb?: (id: string) => void,
    ): string => {
      g.__notif_calls__.push(opts);
      if (typeof cb === 'function') cb('fake-notif-id');
      return 'fake-notif-id';
    };
    c.notifications.create = create;
  });
}

async function readNotifCalls(serviceWorker: import('@playwright/test').Worker): Promise<unknown[]> {
  return serviceWorker.evaluate(() => {
    const g = globalThis as unknown as { __notif_calls__: unknown[] };
    return g.__notif_calls__ ?? [];
  });
}

async function setPermGrant(serviceWorker: import('@playwright/test').Worker, granted: boolean): Promise<void> {
  await serviceWorker.evaluate((val) => {
    const g = globalThis as unknown as { __perm_grant__: boolean };
    g.__perm_grant__ = val;
  }, granted);
}

async function seedAccount(
  popupPage: import('@playwright/test').Page,
  settings: Record<string, unknown>,
): Promise<void> {
  await popupPage.evaluate(async (s) => {
    const id = 'gh_e2e-user';
    await chrome.storage.local.set({
      storage_version: 2,
      active_account_id: id,
      accounts: {
        [id]: {
          auth: { method: 'pat', token: 'fake-token-for-e2e' },
          pr_store: { prs: [], lastPollAt: 0 },
        },
      },
    });
    await chrome.storage.sync.set({
      storage_version: 2,
      [`per_account_settings:${id}`]: s,
      per_account_settings_index: [id],
    });
  }, settings);
}

test('signed-in: notification fires after a successful rebase when settings + permission ON', async ({ context, popupPage, serviceWorker }) => {
  await wireRoutes(context);
  await stubNotificationsApi(serviceWorker);

  await seedAccount(popupPage, {
    notificationsEnabled: true,
    notifyOnRebased: true,
    autoRebaseEnabled: true,
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));

  await expect.poll(
    async () => (await readNotifCalls(serviceWorker)).length,
    { timeout: 15_000 },
  ).toBeGreaterThan(0);

  const calls = await readNotifCalls(serviceWorker) as Array<{ title?: string; message?: string }>;
  expect(calls[0]?.title).toBe('PR rebased');
  expect(calls[0]?.message).toContain('org/svc#701');
});

test('signed-in: notification does NOT fire when master toggle is off', async ({ context, popupPage, serviceWorker }) => {
  await wireRoutes(context);
  await stubNotificationsApi(serviceWorker);

  await seedAccount(popupPage, {
    notificationsEnabled: false,
    notifyOnRebased: true,
    autoRebaseEnabled: true,
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  await popupPage.waitForTimeout(3000);

  const calls = await readNotifCalls(serviceWorker);
  expect(calls.length).toBe(0);
});

test('signed-in: notification does NOT fire when runtime permission is not granted', async ({ context, popupPage, serviceWorker }) => {
  await wireRoutes(context);
  await stubNotificationsApi(serviceWorker);
  await setPermGrant(serviceWorker, false);

  await seedAccount(popupPage, {
    notificationsEnabled: true,
    notifyOnRebased: true,
    autoRebaseEnabled: true,
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  await popupPage.waitForTimeout(3000);

  const calls = await readNotifCalls(serviceWorker);
  expect(calls.length).toBe(0);
});
