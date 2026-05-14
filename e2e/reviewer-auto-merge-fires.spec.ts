// REVIEWER-AUTOMATIONS — integration gate that the SW reviewer phase actually
// fires the enablePullRequestAutoMerge GraphQL mutation when all 4 gates pass,
// and does NOT fire when any single gate is closed.
//
// Unit coverage in tests/core/reviewer-auto-merge-gate.test.ts proves the
// truth table; this spec proves the wiring inside poll-cycle.ts hands the
// gate the right inputs and acts on a `fire: true` result.

import { test, expect } from './fixtures';

interface GraphQLBody {
  query?: string;
  variables?: Record<string, unknown>;
}

interface FixtureRoute {
  graphqlBodies: GraphQLBody[];
  resetGraphqlBodies: () => void;
}

async function wireRoutes(
  context: import('@playwright/test').BrowserContext,
  fixture: FixtureRoute,
): Promise<void> {
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
      // Reviewer-side search — return one PR.
      if (q.includes('review-requested:@me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [{
              id: 901,
              number: 901,
              title: 'Approved + green',
              html_url: 'https://github.com/org/api/pull/901',
              repository_url: 'https://api.github.com/repos/org/api',
            }],
            total_count: 1,
          }),
        });
        return;
      }
      // Authored search + assignee search — empty.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total_count: 0 }),
      });
      return;
    }

    if (/\/repos\/org\/api\/pulls\/901$/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 901,
          number: 901,
          title: 'Approved + green',
          html_url: 'https://github.com/org/api/pull/901',
          state: 'open',
          mergeable_state: 'clean',
          draft: false,
          merged: false,
          node_id: 'PR_node_901',
          base: { ref: 'main', sha: 'base-sha', repo: { full_name: 'org/api' } },
          head: { ref: 'feature', sha: 'head-sha', repo: { full_name: 'org/api' } },
          requested_reviewers: [],
        }),
      });
      return;
    }

    if (/\/repos\/org\/api\/pulls\/901\/reviews/.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          user: { login: 'e2e-user' },
          state: 'APPROVED',
          submitted_at: new Date().toISOString(),
          commit_id: 'head-sha',
        }]),
      });
      return;
    }

    if (url.endsWith('/graphql')) {
      let body: GraphQLBody = {};
      try { body = JSON.parse(route.request().postData() ?? '{}'); } catch {}
      fixture.graphqlBodies.push(body);

      if (body.query?.includes('reviewDecision')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { node: { reviewDecision: 'APPROVED' } } }),
        });
        return;
      }
      if (body.query?.includes('enablePullRequestAutoMerge')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              enablePullRequestAutoMerge: {
                pullRequest: { id: 'PR_node_901', autoMergeRequest: { enabledAt: new Date().toISOString() } },
              },
            },
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: {} }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function seedAccount(
  popupPage: import('@playwright/test').Page,
  overrides: Record<string, unknown>,
): Promise<void> {
  await popupPage.evaluate(async (settings) => {
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
      [`per_account_settings:${id}`]: settings,
      per_account_settings_index: [id],
    });
  }, overrides);
}

test('signed-in: reviewer auto-merge fires when all 4 gates pass', async ({ context, popupPage }) => {
  const fixture: FixtureRoute = { graphqlBodies: [], resetGraphqlBodies() { this.graphqlBodies.length = 0; } };
  await wireRoutes(context, fixture);

  await seedAccount(popupPage, {
    enableReviewerTab: true,
    enableReviewerAutoMerge: true,
    autoMergeReviewerOptInRepos: ['org/api'],
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));

  await expect.poll(
    () => fixture.graphqlBodies.some((b) => b.query?.includes('enablePullRequestAutoMerge')),
    { timeout: 15_000 },
  ).toBe(true);

  const mutation = fixture.graphqlBodies.find((b) => b.query?.includes('enablePullRequestAutoMerge'));
  expect(mutation?.variables?.prId).toBe('PR_node_901');
  expect(mutation?.variables?.method).toBe('SQUASH');
});

test('signed-in: reviewer auto-merge does NOT fire when repo is not allowlisted', async ({ context, popupPage }) => {
  const fixture: FixtureRoute = { graphqlBodies: [], resetGraphqlBodies() { this.graphqlBodies.length = 0; } };
  await wireRoutes(context, fixture);

  // All gates ON except the allowlist is empty → gate.fire = false (not-allowlisted).
  await seedAccount(popupPage, {
    enableReviewerTab: true,
    enableReviewerAutoMerge: true,
    autoMergeReviewerOptInRepos: [],
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));

  // Let the poll cycle complete: wait long enough that any mutation would have fired,
  // then assert the mutation array is mutation-free.
  await popupPage.waitForTimeout(3000);
  const fired = fixture.graphqlBodies.some((b) => b.query?.includes('enablePullRequestAutoMerge'));
  expect(fired).toBe(false);
});

test('signed-in: reviewer auto-merge does NOT fire when submodule toggle is off', async ({ context, popupPage }) => {
  const fixture: FixtureRoute = { graphqlBodies: [], resetGraphqlBodies() { this.graphqlBodies.length = 0; } };
  await wireRoutes(context, fixture);

  await seedAccount(popupPage, {
    enableReviewerTab: true,
    enableReviewerAutoMerge: false,
    autoMergeReviewerOptInRepos: ['org/api'],
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  await popupPage.waitForTimeout(3000);

  const fired = fixture.graphqlBodies.some((b) => b.query?.includes('enablePullRequestAutoMerge'));
  expect(fired).toBe(false);
});
