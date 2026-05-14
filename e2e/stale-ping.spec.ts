// Story 5.1 — integration gate that the stale-PR ping flow posts a comment
// with the configured template + @-mentions, and respects the 24h throttle.
// Unit coverage in tests/core/ping-throttle.test.ts proves the throttle math
// in isolation; this spec proves popup click → POST plumbing.

import { test, expect, mockGitHubApi } from './fixtures';

interface CommentPost { url: string; body: string }

async function wireRoutes(
  context: import('@playwright/test').BrowserContext,
  posts: CommentPost[],
): Promise<void> {
  await mockGitHubApi(context);
  await context.route('**/api.github.com/repos/*/*/issues/*/comments', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    let body: { body?: string } = {};
    try { body = JSON.parse(route.request().postData() ?? '{}'); } catch {}
    posts.push({ url: route.request().url(), body: body.body ?? '' });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 12345, body: body.body, user: { login: 'e2e-user' } }),
    });
  });
}

async function seed(
  popupPage: import('@playwright/test').Page,
  opts: { pingedAt?: number | null } = {},
): Promise<void> {
  await popupPage.evaluate(async (o) => {
    const id = 'gh_e2e-user';
    const now = Date.now();
    await chrome.storage.local.set({
      storage_version: 2,
      active_account_id: id,
      accounts: {
        [id]: {
          auth: { method: 'pat', token: 'fake-token-for-e2e' },
          pr_store: {
            prs: [{
              id: 501,
              number: 501,
              title: 'PR needing a nudge',
              repo: 'org/web',
              url: 'https://github.com/org/web/pull/501',
              state: 'current',
              lastUpdated: now - 30 * 24 * 60 * 60 * 1000,
              requestedReviewers: ['alice', 'bob'],
              // staleness field triggers the chip via pingStateFor.
              staleness: { idleDays: 30, badge: 'idle 30d' },
            }],
            lastPollAt: now,
          },
          // Pre-seed pinged throttle when requested. Shape per
          // src/core/ping-throttle.ts: Record<prId, { at: number }>.
          ...(o.pingedAt != null ? { pingedPRs: { 501: { at: o.pingedAt } } } : {}),
        },
      },
    });
    await chrome.storage.sync.set({
      storage_version: 2,
      'per_account_settings:gh_e2e-user': {
        enablePingReviewers: true,
        pingTemplate: 'Friendly nudge — could you take a look when you have a moment? {reviewers}',
      },
      per_account_settings_index: [id],
    });
  }, opts);
}

test('signed-in: clicking the idle chip posts an @-mention comment', async ({ context, popupPage }) => {
  const posts: CommentPost[] = [];
  await wireRoutes(context, posts);
  await seed(popupPage);
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  // Expand the repo group so the row renders.
  await popupPage.getByRole('button', { name: /web/i }).click();

  // Click the ping chip → routes to PingConfirmView.
  await popupPage.getByTestId('ping-link').click();
  await expect(popupPage.getByTestId('ping-confirm-view')).toBeVisible();

  // Body preview should contain both reviewer mentions.
  const body = await popupPage.getByTestId('ping-confirm-body').textContent();
  expect(body).toContain('@alice');
  expect(body).toContain('@bob');

  // Click "post comment" → fires POST /issues/501/comments.
  await popupPage.getByTestId('ping-confirm-post').click();

  await expect.poll(() => posts.length, { timeout: 10_000 }).toBe(1);
  expect(posts[0].url).toContain('/repos/org/web/issues/501/comments');
  expect(posts[0].body).toContain('@alice');
  expect(posts[0].body).toContain('@bob');
  expect(posts[0].body).toContain('Friendly nudge');
});

test('signed-in: ping is throttled within 24h of last ping', async ({ context, popupPage }) => {
  const posts: CommentPost[] = [];
  await wireRoutes(context, posts);
  // Seed: pinged 1 hour ago — well inside the 24h throttle.
  await seed(popupPage, { pingedAt: Date.now() - 60 * 60 * 1000 });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.getByRole('button', { name: /web/i }).click();

  // Chip renders the "pinged Nh ago" label and is disabled.
  const chip = popupPage.getByTestId('ping-link');
  await expect(chip).toBeVisible();
  await expect(chip).toBeDisabled();
  await expect(chip).toContainText(/pinged \d+h ago/);

  // No POST fires because the button is disabled.
  expect(posts.length).toBe(0);
});
