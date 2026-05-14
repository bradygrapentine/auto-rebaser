// Story 2.7 — integration gate that the orchestrator's authored-side
// auto-merge fires enablePullRequestAutoMerge for AUTHORED PRs when
// settings.autoEnableAutoMerge=true, and is suppressed for repos in
// autoMergeOptOutRepos.
//
// Distinct from REVIEWER-AUTOMATIONS auto-merge (covered separately):
// authored side runs through the orchestrator's runEnableAutoMerge,
// reviewer side runs through the gate inside runReviewerPhase.

import { test, expect } from './fixtures';

interface GraphQLBody { query?: string; variables?: Record<string, unknown> }
interface Capture { mutations: GraphQLBody[] }

async function wireRoutes(
  context: import('@playwright/test').BrowserContext,
  capture: Capture,
  prs: Array<{ repo: string; number: number; nodeId: string }>,
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
      if (q.includes('author:@me') && !q.includes('-author:@me')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: prs.map((p) => ({
              id: p.number,
              number: p.number,
              title: `${p.repo}#${p.number}`,
              html_url: `https://github.com/${p.repo}/pull/${p.number}`,
              repository_url: `https://api.github.com/repos/${p.repo}`,
            })),
            total_count: prs.length,
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total_count: 0 }) });
      return;
    }

    // GET /repos/:o/:r — sub-resources (like /pulls/N) must NOT match here.
    // Match the bare-repo path only.
    const repoBare = url.match(/\/repos\/([^/]+)\/([^/?#]+)(?:[?#]|$)/);
    if (repoBare && !url.includes('/pulls/')) {
      const repo = `${repoBare[1]}/${repoBare[2]}`;
      if (prs.some((p) => p.repo === repo)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 1, name: repoBare[2], full_name: repo,
            allow_squash_merge: true,
            allow_merge_commit: true,
            allow_rebase_merge: true,
          }),
        });
        return;
      }
    }

    const prMatch = url.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/);
    if (prMatch) {
      const repo = prMatch[1];
      const number = parseInt(prMatch[2], 10);
      const pr = prs.find((p) => p.repo === repo && p.number === number);
      if (pr) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: number,
            number,
            title: `${repo}#${number}`,
            html_url: `https://github.com/${repo}/pull/${number}`,
            state: 'open',
            mergeable_state: 'clean',
            draft: false,
            merged: false,
            auto_merge: null,
            node_id: pr.nodeId,
            base: { ref: 'main', sha: 'base-sha', repo: { full_name: repo } },
            head: { ref: 'feature', sha: 'head-sha', repo: { full_name: repo } },
            requested_reviewers: [],
          }),
        });
        return;
      }
    }

    if (url.endsWith('/graphql')) {
      let body: GraphQLBody = {};
      try { body = JSON.parse(route.request().postData() ?? '{}'); } catch {}
      if (body.query?.includes('enablePullRequestAutoMerge')) {
        capture.mutations.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              enablePullRequestAutoMerge: {
                pullRequest: { id: body.variables?.prId, autoMergeRequest: { enabledAt: new Date().toISOString() } },
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

async function seed(
  popupPage: import('@playwright/test').Page,
  settings: Record<string, unknown>,
): Promise<void> {
  await popupPage.evaluate(async (s) => {
    const id = 'gh_e2e-user';
    await chrome.storage.local.set({
      storage_version: 2,
      active_account_id: id,
      accounts: { [id]: { auth: { method: 'pat', token: 'fake-token-for-e2e' }, pr_store: { prs: [], lastPollAt: 0 } } },
    });
    await chrome.storage.sync.set({
      storage_version: 2,
      [`per_account_settings:${id}`]: s,
      per_account_settings_index: [id],
    });
  }, settings);
}

test('signed-in: authored auto-merge fires enablePullRequestAutoMerge for each eligible PR', async ({ context, popupPage }) => {
  const capture: Capture = { mutations: [] };
  await wireRoutes(context, capture, [
    { repo: 'org/a', number: 11, nodeId: 'PR_a_11' },
    { repo: 'org/b', number: 22, nodeId: 'PR_b_22' },
  ]);

  await seed(popupPage, {
    autoEnableAutoMerge: true,
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
    autoMergeOptOutRepos: [],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));

  await expect.poll(() => capture.mutations.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);

  const ids = new Set(capture.mutations.map((m) => m.variables?.prId));
  expect(ids.has('PR_a_11')).toBe(true);
  expect(ids.has('PR_b_22')).toBe(true);
  // First method preference is SQUASH; both should pick it.
  for (const m of capture.mutations) expect(m.variables?.method).toBe('SQUASH');
});

test('signed-in: per-repo opt-out suppresses authored auto-merge for matching repos', async ({ context, popupPage }) => {
  const capture: Capture = { mutations: [] };
  await wireRoutes(context, capture, [
    { repo: 'org/a', number: 11, nodeId: 'PR_a_11' },
    { repo: 'org/b', number: 22, nodeId: 'PR_b_22' },
  ]);

  await seed(popupPage, {
    autoEnableAutoMerge: true,
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
    autoMergeOptOutRepos: ['org/a'],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  // Wait for any mutation that's going to fire.
  await popupPage.waitForTimeout(3000);

  const ids = new Set(capture.mutations.map((m) => m.variables?.prId));
  expect(ids.has('PR_a_11')).toBe(false);
  expect(ids.has('PR_b_22')).toBe(true);
});

test('signed-in: autoEnableAutoMerge=false suppresses all enablePullRequestAutoMerge mutations', async ({ context, popupPage }) => {
  const capture: Capture = { mutations: [] };
  await wireRoutes(context, capture, [
    { repo: 'org/a', number: 11, nodeId: 'PR_a_11' },
  ]);

  await seed(popupPage, {
    autoEnableAutoMerge: false,
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
    autoMergeOptOutRepos: [],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  await popupPage.waitForTimeout(3000);

  expect(capture.mutations.length).toBe(0);
});
