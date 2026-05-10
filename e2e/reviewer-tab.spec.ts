// REVIEWER-AUTOMATIONS — popup-level E2E for the reviewer tab.
//
// Seeds v2 multi-account storage with a small set of reviewer PRs, flips on
// the master toggle in settings, and asserts: tab bar visible with correct
// counts, scope swap on click, chips render, groups auto-expand on the
// reviewer tab even for state='current' rows (the fix from #<this PR>).

import { test, expect, mockGitHubApi } from './fixtures';

test('signed-in: reviewer tab renders rows with chips and auto-expands current-state PRs', async ({ context, popupPage }) => {
  await mockGitHubApi(context);

  // Seed v2 account state. Both `pr_store` (authored — empty here) and
  // `reviewerPRs` live under accounts.<id>.* . active_account_id is top-level.
  await popupPage.evaluate(async () => {
    const id = 'gh_e2e-user';
    await chrome.storage.local.set({
      auth: { method: 'pat', token: 'fake-token-for-e2e' },
      active_account_id: id,
      accounts: {
        [id]: {
          login: 'e2e-user',
          method: 'pat',
          token: 'fake-token-for-e2e',
          pr_store: { prs: [], lastPollAt: Date.now() },
          reviewerPRs: {
            prs: [
              {
                id: 201, number: 201, title: 'I-APPROVED',
                repo: 'org/api', url: 'https://github.com/org/api/pull/201',
                state: 'current', lastUpdated: Date.now(),
                myReviewState: 'APPROVED',
              },
              {
                id: 202, number: 202, title: 'CHANGES-REQUESTED',
                repo: 'org/api', url: 'https://github.com/org/api/pull/202',
                state: 'current', lastUpdated: Date.now(),
                myReviewState: 'CHANGES_REQUESTED',
              },
              {
                id: 203, number: 203, title: 'AUTO-MERGE-ARMED',
                repo: 'org/web', url: 'https://github.com/org/web/pull/203',
                state: 'current', lastUpdated: Date.now(),
                myReviewState: 'APPROVED',
                reviewerAutoMergeArmed: { at: Date.now() },
              },
            ],
            lastPollAt: Date.now(),
          },
        },
      },
    });
    await chrome.storage.sync.set({
      'per_account_settings:gh_e2e-user': { enableReviewerTab: true },
      per_account_settings_index: ['gh_e2e-user'],
    });
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  // Tab bar visible with the right counts.
  await expect(popupPage.getByTestId('pr-tab-authored')).toHaveText(/Authored\s*\(0\)/);
  await expect(popupPage.getByTestId('pr-tab-reviewer')).toHaveText(/Reviewer\s*\(3\)/);

  // Switch to reviewer tab; groups must auto-expand even though all rows are
  // state='current'.
  await popupPage.getByTestId('pr-tab-reviewer').click();
  await expect(popupPage.getByText('I-APPROVED')).toBeVisible();
  await expect(popupPage.getByText('CHANGES-REQUESTED')).toBeVisible();
  await expect(popupPage.getByText('AUTO-MERGE-ARMED')).toBeVisible();

  // Chips render their respective test-ids. .first() because there are two
  // APPROVED-ish rows in the seeded data (id 201 + 203); we just need to
  // confirm at least one of each chip variant is on the page.
  await expect(popupPage.getByTestId('reviewer-chip-approved').first()).toBeVisible();
  await expect(popupPage.getByTestId('reviewer-chip-changes')).toBeVisible();
  await expect(popupPage.getByTestId('reviewer-chip-armed')).toBeVisible();

  // Authored tab → zero PRs, reviewer rows not visible.
  await popupPage.getByTestId('pr-tab-authored').click();
  await expect(popupPage.getByText('I-APPROVED')).not.toBeVisible();
});
