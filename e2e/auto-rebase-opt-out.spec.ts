// REBASE-OPT-OUT — integration gate that the poll cycle skips the rebase
// API call when (a) the master toggle is off, or (b) the PR's repo is in
// the per-automation skip list. The PR remains in `behind` state so the
// popup surfaces it visibly.
//
// Unit coverage in tests/background/poll-cycle.* proves the derivation;
// this spec proves the wiring: that no PATCH /update-branch fires.

import { test, expect } from './fixtures';

interface RebaseCalls { calls: string[] }

async function wireRoutes(
  context: import('@playwright/test').BrowserContext,
  rebaseCalls: RebaseCalls,
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total_count: 0 }),
      });
      return;
    }

    const updateMatch = url.match(/\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)\/update-branch/);
    if (updateMatch) {
      rebaseCalls.calls.push(`${updateMatch[1]}#${updateMatch[2]}`);
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) });
      return;
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
            mergeable_state: 'behind',
            draft: false,
            merged: false,
            node_id: pr.nodeId,
            base: { ref: 'main', sha: 'base-sha', repo: { full_name: repo } },
            head: { ref: 'feature', sha: 'head-sha', repo: { full_name: repo } },
            requested_reviewers: [],
          }),
        });
        return;
      }
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

async function pollAndWait(popupPage: import('@playwright/test').Page): Promise<void> {
  await popupPage.evaluate(() => chrome.runtime.sendMessage({ type: 'POLL_NOW' }));
  // Wait long enough for the poll cycle to fully fan out (it would have
  // rebased by now if it was going to).
  await popupPage.waitForTimeout(3000);
}

test('signed-in: autoRebaseEnabled=false suppresses all rebase calls', async ({ context, popupPage }) => {
  const rebaseCalls: RebaseCalls = { calls: [] };
  await wireRoutes(context, rebaseCalls, [
    { repo: 'org/a', number: 1, nodeId: 'PR_a_1' },
    { repo: 'org/b', number: 2, nodeId: 'PR_b_2' },
  ]);
  await seed(popupPage, { autoRebaseEnabled: false });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await pollAndWait(popupPage);

  expect(rebaseCalls.calls).toEqual([]);
});

test('signed-in: per-repo opt-out suppresses only matching repos', async ({ context, popupPage }) => {
  const rebaseCalls: RebaseCalls = { calls: [] };
  await wireRoutes(context, rebaseCalls, [
    { repo: 'org/a', number: 1, nodeId: 'PR_a_1' },
    { repo: 'org/b', number: 2, nodeId: 'PR_b_2' },
  ]);
  await seed(popupPage, {
    autoRebaseEnabled: true,
    autoRebaseOptOutRepos: ['org/a'],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await pollAndWait(popupPage);

  expect(new Set(rebaseCalls.calls)).toEqual(new Set(['org/b#2']));
});

test('signed-in: autoRebaseEnabled=true with empty opt-out rebases all behind PRs', async ({ context, popupPage }) => {
  const rebaseCalls: RebaseCalls = { calls: [] };
  await wireRoutes(context, rebaseCalls, [
    { repo: 'org/a', number: 1, nodeId: 'PR_a_1' },
    { repo: 'org/b', number: 2, nodeId: 'PR_b_2' },
  ]);
  await seed(popupPage, {
    autoRebaseEnabled: true,
    autoRebaseOptOutRepos: [],
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  await pollAndWait(popupPage);

  // Use Set so multiple poll fires (storage-change listener + explicit
  // POLL_NOW) don't fail the assertion on count — we care about WHICH
  // repos got rebased, not how many times each.
  expect(new Set(rebaseCalls.calls)).toEqual(new Set(['org/a#1', 'org/b#2']));
});
