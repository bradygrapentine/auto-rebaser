// MERGE-2 — integration gate that when GitHub refuses enableAutoMerge with
// "Pull request is in clean status" AND settings.mergeCleanPRsImmediately
// is true, the orchestrator falls through to a direct PUT /pulls/:n/merge.
// Per-repo opt-out in mergeCleanPRsOptOutRepos suppresses the fall-through.

import { test, expect } from './fixtures';

interface GraphQLBody { query?: string; variables?: Record<string, unknown> }
interface Capture {
  graphqlMutations: GraphQLBody[];
  directMerges: Array<{ url: string; body: { sha?: string; merge_method?: string } }>;
}

async function wireRoutes(
  context: import('@playwright/test').BrowserContext,
  capture: Capture,
  prs: Array<{ repo: string; number: number; nodeId: string }>,
): Promise<void> {
  await context.route('**/api.github.com/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

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

    // Direct merge endpoint.
    const mergeMatch = url.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)\/merge$/);
    if (mergeMatch && method === 'PUT') {
      let body: { sha?: string; merge_method?: string } = {};
      try { body = JSON.parse(route.request().postData() ?? '{}'); } catch {}
      capture.directMerges.push({ url, body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sha: body.sha, merged: true, message: 'merged' }),
      });
      return;
    }

    // GET /repos/:o/:r — bare-repo path (no /pulls/N etc.).
    const repoBare = url.match(/\/repos\/([^/]+)\/([^/?#]+)(?:[?#]|$)/);
    if (repoBare && !url.includes('/pulls/')) {
      const repo = `${repoBare[1]}/${repoBare[2]}`;
      if (prs.some((p) => p.repo === repo)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 1, name: repoBare[2], full_name: repo,
            allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true,
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
            id: number, number,
            title: `${repo}#${number}`,
            html_url: `https://github.com/${repo}/pull/${number}`,
            state: 'open',
            mergeable_state: 'clean',
            draft: false, merged: false,
            auto_merge: null,
            node_id: pr.nodeId,
            base: { ref: 'main', sha: 'base-sha', repo: { full_name: repo } },
            head: { ref: 'feature', sha: `head-sha-${number}`, repo: { full_name: repo } },
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
        capture.graphqlMutations.push(body);
        // Return GitHub's "clean status" error → orchestrator should
        // mark unsupported AND, if mergeCleanPRsImmediately is on,
        // trigger the direct-merge fall-through.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [{ message: 'Pull request Pull request is in clean status' }],
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

test('signed-in: clean-status PR direct-merges when mergeCleanPRsImmediately is ON', async ({ context, popupPage }) => {
  const capture: Capture = { graphqlMutations: [], directMerges: [] };
  await wireRoutes(context, capture, [{ repo: 'org/svc', number: 555, nodeId: 'PR_555' }]);

  await seed(popupPage, {
    autoEnableAutoMerge: true,
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
    autoMergeOptOutRepos: [],
    mergeCleanPRsImmediately: true,
    mergeCleanPRsOptOutRepos: [],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));

  await expect.poll(() => capture.directMerges.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(capture.directMerges[0].url).toContain('/repos/org/svc/pulls/555/merge');
  expect(capture.directMerges[0].body.merge_method).toBe('squash');
  expect(capture.directMerges[0].body.sha).toBe('head-sha-555');
});

test('signed-in: clean-status PR is NOT direct-merged when mergeCleanPRsImmediately is OFF', async ({ context, popupPage }) => {
  const capture: Capture = { graphqlMutations: [], directMerges: [] };
  await wireRoutes(context, capture, [{ repo: 'org/svc', number: 555, nodeId: 'PR_555' }]);

  await seed(popupPage, {
    autoEnableAutoMerge: true,
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
    autoMergeOptOutRepos: [],
    mergeCleanPRsImmediately: false,
    mergeCleanPRsOptOutRepos: [],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  await popupPage.waitForTimeout(3000);

  // Auto-merge mutation was attempted (returned "clean status") but the
  // fall-through did NOT fire.
  expect(capture.graphqlMutations.length).toBeGreaterThan(0);
  expect(capture.directMerges.length).toBe(0);
});

test('signed-in: per-repo mergeCleanPRsOptOutRepos suppresses fall-through for matching repos', async ({ context, popupPage }) => {
  const capture: Capture = { graphqlMutations: [], directMerges: [] };
  await wireRoutes(context, capture, [
    { repo: 'org/a', number: 111, nodeId: 'PR_a_111' },
    { repo: 'org/b', number: 222, nodeId: 'PR_b_222' },
  ]);

  await seed(popupPage, {
    autoEnableAutoMerge: true,
    mergeMethodPreference: ['SQUASH', 'MERGE', 'REBASE'],
    autoMergeOptOutRepos: [],
    mergeCleanPRsImmediately: true,
    mergeCleanPRsOptOutRepos: ['org/a'],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  await popupPage.waitForTimeout(3000);

  const mergedRepos = new Set(capture.directMerges.map((m) => {
    const match = m.url.match(/\/repos\/([^/]+\/[^/]+)\/pulls/);
    return match?.[1];
  }));
  expect(mergedRepos.has('org/a')).toBe(false);
  expect(mergedRepos.has('org/b')).toBe(true);
});
