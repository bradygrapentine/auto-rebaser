// PR #145 regression net — verify per-account scoping of the ETag cache,
// pingedPRs throttle, and notif_throttle survives a two-account poll. The
// original bug (pre-#145): a single global ETag cache served stale data
// to whichever account polled second, since If-None-Match echoed the
// other account's etag.

import { test, expect } from './fixtures';

interface ETagCalls { ifNoneMatch: Array<string | null> }

async function wireRoutes(
  context: import('@playwright/test').BrowserContext,
  calls: ETagCalls,
): Promise<void> {
  await context.route('**/api.github.com/**', async (route) => {
    const url = route.request().url();

    if (url.endsWith('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: '"user-etag"' },
        body: JSON.stringify({ login: 'e2e-user', id: 99999, avatar_url: '' }),
      });
      return;
    }

    if (url.includes('/search/issues')) {
      // Record what If-None-Match was sent (null when fresh).
      calls.ifNoneMatch.push(route.request().headers()['if-none-match'] ?? null);
      const q = new URL(url).searchParams.get('q') ?? '';
      // Authored search returns empty for both accounts (we don't need
      // PRs to materialize — we just need each request to carry an etag
      // and write it back to per-account storage).
      const etag = q.includes('author:@me') && !q.includes('-author:@me')
        ? '"authored-etag"'
        : '"reviewer-etag"';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: etag },
        body: JSON.stringify({ items: [], total_count: 0 }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test('per-account isolation: ETag cache, pingedPRs, and notif_throttle do not leak across accounts', async ({ context, popupPage }) => {
  const calls: ETagCalls = { ifNoneMatch: [] };
  await wireRoutes(context, calls);

  // Seed TWO accounts. Account A has pre-existing pingedPRs + notif_throttle
  // entries; account B has neither. After a poll, the per-account data
  // must remain scoped — account B's record must not pick up A's state.
  await popupPage.evaluate(async () => {
    const now = Date.now();
    await chrome.storage.local.set({
      storage_version: 2,
      active_account_id: 'gh_A',
      accounts: {
        gh_A: {
          auth: { method: 'pat', token: 'token-A' },
          pr_store: { prs: [], lastPollAt: 0 },
          pingedPRs: { 9001: { at: now - 60 * 60 * 1000 } },
          notif_throttle: { '9001:rebased': now - 60 * 60 * 1000 },
        },
        gh_B: {
          auth: { method: 'pat', token: 'token-B' },
          pr_store: { prs: [], lastPollAt: 0 },
        },
      },
    });
    await chrome.storage.sync.set({
      storage_version: 2,
      'per_account_settings:gh_A': { enableReviewerTab: true },
      'per_account_settings:gh_B': { enableReviewerTab: true },
      per_account_settings_index: ['gh_A', 'gh_B'],
    });
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));

  // Wait for both accounts' polls to land etags in storage.
  await popupPage.waitForFunction(async () => {
    const { accounts } = await chrome.storage.local.get('accounts');
    const a = accounts?.gh_A;
    const b = accounts?.gh_B;
    return !!a?.etags && Object.keys(a.etags).length > 0
      && !!b?.etags && Object.keys(b.etags).length > 0;
  }, null, { timeout: 15_000 });

  const snap = await popupPage.evaluate(async () => {
    const local = await chrome.storage.local.get(null);
    return local;
  }) as Record<string, unknown>;
  const accounts = snap.accounts as Record<string, Record<string, unknown>>;

  // Both accounts have their own etag map.
  expect(accounts.gh_A.etags).toBeTruthy();
  expect(accounts.gh_B.etags).toBeTruthy();
  expect(Object.keys(accounts.gh_A.etags as Record<string, unknown>).length).toBeGreaterThan(0);
  expect(Object.keys(accounts.gh_B.etags as Record<string, unknown>).length).toBeGreaterThan(0);

  // Top-level legacy etag key must NOT be set (PR #145 fix: per-account scope only).
  expect((snap as { etags?: unknown }).etags).toBeUndefined();

  // Pinged store isolation: account A still has its 9001 entry; account B has no pingedPRs.
  const aPinged = accounts.gh_A.pingedPRs as Record<string, unknown>;
  expect(aPinged?.[9001]).toBeTruthy();
  expect(accounts.gh_B.pingedPRs).toBeFalsy();

  // Notification throttle isolation: account A still has its 9001:rebased entry; account B has no notif_throttle.
  const aThrottle = accounts.gh_A.notif_throttle as Record<string, unknown>;
  expect(aThrottle?.['9001:rebased']).toBeTruthy();
  expect(accounts.gh_B.notif_throttle).toBeFalsy();
});

test('per-account isolation: first poll of each account sends NO If-None-Match (no cross-account etag echo)', async ({ context, popupPage }) => {
  const calls: ETagCalls = { ifNoneMatch: [] };
  await wireRoutes(context, calls);

  await popupPage.evaluate(async () => {
    await chrome.storage.local.set({
      storage_version: 2,
      active_account_id: 'gh_A',
      accounts: {
        gh_A: { auth: { method: 'pat', token: 'token-A' }, pr_store: { prs: [], lastPollAt: 0 } },
        gh_B: { auth: { method: 'pat', token: 'token-B' }, pr_store: { prs: [], lastPollAt: 0 } },
      },
    });
    await chrome.storage.sync.set({
      storage_version: 2,
      'per_account_settings:gh_A': {},
      'per_account_settings:gh_B': {},
      per_account_settings_index: ['gh_A', 'gh_B'],
    });
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  await popupPage.waitForFunction(async () => {
    const { accounts } = await chrome.storage.local.get('accounts');
    return !!accounts?.gh_A?.etags && !!accounts?.gh_B?.etags;
  }, null, { timeout: 15_000 });

  // Both accounts' first /search/issues call must have sent NO If-None-Match.
  // (Pre-#145, account B would have echoed account A's etag, getting a 304
  // with empty body that the v1 cache mis-served.)
  const nonNullEcho = calls.ifNoneMatch.filter((v) => v != null);
  expect(nonNullEcho).toEqual([]);
});
