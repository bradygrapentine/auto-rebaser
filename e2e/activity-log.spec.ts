// E2E: Activity log view renders persisted entries and supports its
// action / date / sort controls.
//
// Activity is per-account under v2 (accounts.<id>.activity.entries). The
// scope='all' default in the view merges across accounts; non-active rows
// get a `[<login>]` tag.

import { test, expect, seedStorage, reloadPopup, mockGitHubApi } from './fixtures';

const NOW = 1714600000000;

test('activity log shows persisted entries newest-first and supports action filter', async ({
  context,
  popupPage,
}) => {
  await mockGitHubApi(context);
  await seedStorage(popupPage, {
    local: {
      auth: { method: 'pat', token: 'tok' },
      active_account_id: 'gh_e2e',
      accounts: {
        gh_e2e: {
          auth: { method: 'pat', token: 'tok' },
          pr_store: { prs: [], lastPollAt: NOW },
          activity: {
            entries: [
              {
                at: NOW - 5_000,
                action: 'rebase',
                repo: 'octo/cat',
                prNumber: 1,
                prTitle: 'recent rebase',
                result: 'success',
                accountId: 'gh_e2e',
              },
              {
                at: NOW - 60_000,
                action: 'auto_merged_now',
                repo: 'octo/cat',
                prNumber: 2,
                prTitle: 'older merge',
                result: 'success',
                mergeMethod: 'SQUASH',
                accountId: 'gh_e2e',
              },
            ],
          },
        },
      },
    },
  });
  await reloadPopup(popupPage);

  // The activity view is reachable from the PR-list footer "View activity"
  // button (rendered when entries exist).
  await popupPage.getByTestId('view-activity').click();

  // Both entries render in the list.
  const list = popupPage.getByTestId('activity-list');
  const entries = list.locator('li.activity-entry');
  await expect(entries).toHaveCount(2);
  // Newest-first ordering — data-action attribute reflects the action enum.
  await expect(entries.nth(0)).toHaveAttribute('data-action', 'rebase');
  await expect(entries.nth(1)).toHaveAttribute('data-action', 'auto_merged_now');

  // Action filter narrows to one entry via the custom Select.
  await popupPage.getByRole('button', { name: 'Filter by action' }).click();
  await popupPage.getByRole('option', { name: /^rebase$/ }).click();
  await expect(entries).toHaveCount(1);
  await expect(entries.first()).toHaveAttribute('data-action', 'rebase');
});
