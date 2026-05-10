// Smoke test: popup renders state badges from stored PR records.
//
// Anchors the [updated]-masking regression fix (PR #103). After a rebase
// where the post-rebase mergeable_state is `blocked` (failing required
// check), poll-cycle writes the PR as `state: 'pending'` — NOT
// `'updated'`. This test verifies the popup correctly renders that final
// state. If a future change reintroduces the masking at the rendering
// layer (e.g. PRRow accidentally treats certain states as 'updated'),
// this fails.
//
// We seed storage directly rather than triggering the poll cycle — the
// poll-cycle logic itself has full unit coverage in poll-cycle.test.ts.
// E2E proves the storage → UI render path is intact.

// This is the regression test for PR #103: a PR with `mergeable_state: 'blocked'`
// (failing required check) must surface as `[pending]` in the popup, NOT
// `[updated]`. Pre-#103, the poll cycle hard-set 'updated' after a successful
// rebase, masking the real blocker for one cycle.
//
// Strategy: rather than seeding pr_store directly (the SW's startup poll
// would overwrite it), we mock the GitHub API surface so the poll cycle
// runs and writes the state we expect to render. This tests the full
// roundtrip from poll-cycle → storage → popup render.

import { test, expect, mockGitHubApi } from './fixtures';

test('signed-in: PR with mergeable_state=blocked renders as Pending, not Updated', async ({ context, popupPage }) => {
  // Override the default mock — we need a real search response with our
  // test PR, plus a getPR response that returns mergeable_state='blocked'.
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
      // One PR — the regression target. Same shape as a real /search/issues
      // hit returns (subset of fields the poll cycle uses).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 1,
              number: 101,
              title: 'PR with failing required check',
              html_url: 'https://github.com/org/repo-a/pull/101',
              repository_url: 'https://api.github.com/repos/org/repo-a',
            },
          ],
          total_count: 1,
        }),
      });
      return;
    }

    if (url.includes('/repos/org/repo-a/pulls/101')) {
      // mergeable_state='blocked' → deriveStateFromMergeable → 'pending'.
      // Critical: no `head.sha` mismatch with base, so poll-cycle does NOT
      // trigger a rebase (which would obscure the regression we're testing).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          number: 101,
          title: 'PR with failing required check',
          html_url: 'https://github.com/org/repo-a/pull/101',
          mergeable_state: 'blocked',
          draft: false,
          node_id: 'PR_node_1',
          base: { ref: 'main', sha: 'base-sha', repo: { full_name: 'org/repo-a' } },
          head: { ref: 'feature/x', sha: 'head-sha', repo: { full_name: 'org/repo-a' } },
        }),
      });
      return;
    }

    // Default: 200 empty for anything else.
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Seed auth so the SW + popup treat us as signed in. The poll cycle will
  // fire on extension startup; we wait for it to land state in storage.
  await popupPage.evaluate(async () => {
    await chrome.storage.local.set({
      auth: { method: 'pat', token: 'fake-token-for-e2e' },
    });
  });
  await popupPage.reload();

  // Trigger a poll cycle explicitly so we don't race the SW startup poll.
  // chrome.runtime.sendMessage with { type: 'poll-now' } is what the popup
  // uses for its Poll Now button — same code path.
  await popupPage.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'POLL_NOW' });
  });
  // Give the poll cycle a beat to fan out fetches + write to storage.
  await popupPage.waitForTimeout(1500);
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  // Wait for the post-poll state to land in storage. The poll cycle runs
  // async after POLL_NOW; poll until pr_store.prs[0].state is 'pending'.
  await popupPage.waitForFunction(async () => {
    const { pr_store } = await chrome.storage.local.get('pr_store');
    return pr_store?.prs?.[0]?.state === 'pending';
  }, null, { timeout: 10_000 });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  // 'pending' isn't an attention state so the repo group is collapsed by
  // default. Click the header to expand it. Locating by the repo name
  // text inside the header button.
  await popupPage.getByRole('button', { name: /org\/repo-a/i }).click();

  // The regression assertion: 'blocked' must map to 'pending', not 'updated'.
  await expect(popupPage.locator('[data-state="pending"]')).toBeVisible({ timeout: 10_000 });
  await expect(popupPage.locator('[data-state="pending"]')).toHaveText(/Pending/i);

  // Negative: no `[data-state="updated"]` chip exists for this PR — that
  // would mean the masking bug returned at either the poll-cycle or the
  // popup-rendering layer.
  await expect(popupPage.locator('[data-state="updated"]')).toHaveCount(0);
});
