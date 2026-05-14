// Story 5.2-A — integration gate that the `! re-review` chip click flow
// fires POST /repos/:o/:r/pulls/:n/requested_reviewers with the approvers
// from the PR's staleApproval block.
//
// Unit coverage in tests/core/stale-approval.test.ts proves the chip
// derivation; this spec proves the popup click → confirm → POST plumbing.

import { test, expect, mockGitHubApi } from './fixtures';

interface RerequestPost { url: string; body: string }

async function wireRoutes(
  context: import('@playwright/test').BrowserContext,
  posts: RerequestPost[],
): Promise<void> {
  await mockGitHubApi(context);
  await context.route('**/api.github.com/repos/*/*/pulls/*/requested_reviewers', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    posts.push({ url: route.request().url(), body: route.request().postData() ?? '' });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 1, requested_reviewers: [] }),
    });
  });
}

async function seed(popupPage: import('@playwright/test').Page): Promise<void> {
  await popupPage.evaluate(async () => {
    const id = 'gh_e2e-user';
    await chrome.storage.local.set({
      storage_version: 2,
      active_account_id: id,
      accounts: {
        [id]: {
          auth: { method: 'pat', token: 'fake-token-for-e2e' },
          pr_store: {
            prs: [{
              id: 401,
              number: 401,
              title: 'Push after approval',
              repo: 'org/web',
              url: 'https://github.com/org/web/pull/401',
              state: 'current',
              lastUpdated: Date.now(),
              // staleApproval block triggers the `! re-review` chip via
              // rerequestStateFor in PRListView.
              staleApproval: {
                lastApprovedAt: Date.now() - 24 * 60 * 60 * 1000,
                lastPushedAt: Date.now() - 60 * 60 * 1000,
                approvers: ['carol', 'dave'],
              },
            }],
            lastPollAt: Date.now(),
          },
        },
      },
    });
    await chrome.storage.sync.set({
      storage_version: 2,
      'per_account_settings:gh_e2e-user': {
        enablePushSinceApproval: true,
        enableRequestRereview: true,
      },
      per_account_settings_index: [id],
    });
  });
}

test('signed-in: clicking the re-review chip POSTs requested_reviewers with the approvers', async ({ context, popupPage }) => {
  const posts: RerequestPost[] = [];
  await wireRoutes(context, posts);
  await seed(popupPage);
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  // Expand repo group → click the actionable re-review chip.
  await popupPage.getByRole('button', { name: /web/i }).click();

  // PRRow renders the actionable chip as a <button>, passive as a <span>;
  // both share data-testid="rerequest-badge". The testid lookup hits the
  // button when actionable.
  await popupPage.getByTestId('rerequest-badge').click();

  await expect(popupPage.getByTestId('rerequest-confirm-view')).toBeVisible();
  const body = await popupPage.getByTestId('rerequest-confirm-body').textContent();
  expect(body).toContain('@carol');
  expect(body).toContain('@dave');

  await popupPage.getByTestId('rerequest-confirm-post').click();

  await expect.poll(() => posts.length, { timeout: 10_000 }).toBe(1);
  expect(posts[0].url).toContain('/repos/org/web/pulls/401/requested_reviewers');
  const parsed = JSON.parse(posts[0].body) as { reviewers?: string[] };
  expect(parsed.reviewers).toEqual(['carol', 'dave']);
});

test('signed-in: passive chip (enableRequestRereview=false) renders but does not navigate to confirm', async ({ context, popupPage }) => {
  const posts: RerequestPost[] = [];
  await wireRoutes(context, posts);
  await seed(popupPage);
  // Override: enable push-since-approval visual but DISABLE the action.
  await popupPage.evaluate(async () => {
    await chrome.storage.sync.set({
      'per_account_settings:gh_e2e-user': {
        enablePushSinceApproval: true,
        enableRequestRereview: false,
      },
    });
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.getByRole('button', { name: /web/i }).click();

  // Passive variant is a <span aria-disabled="true">. Verify it via tag name + aria.
  const badge = popupPage.getByTestId('rerequest-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('aria-disabled', 'true');
  const tagName = await badge.evaluate((el) => el.tagName);
  expect(tagName).toBe('SPAN');

  expect(posts.length).toBe(0);
});
