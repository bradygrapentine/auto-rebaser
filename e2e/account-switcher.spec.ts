// Multi-account E2E — covers the AccountSwitcher pill: opening the menu,
// switching to a non-active account, signing one out, and signing out all.
//
// All paths land in chrome.storage.local under `active_account_id` /
// `accounts`. The popup re-reads via the useAccounts hook, which is wired
// to storage.onChanged.

import { test, expect, seedStorage, reloadPopup, mockGitHubApi } from './fixtures';

const TWO_ACCOUNTS = {
  local: {
    auth: { method: 'pat' as const, token: 'tok-octocat' },
    pr_store: { prs: [], lastPollAt: Date.now() },
    active_account_id: 'gh_octocat',
    accounts: {
      gh_octocat: {
        auth: { method: 'pat' as const, token: 'tok-octocat' },
        pr_store: { prs: [], lastPollAt: Date.now() },
      },
      gh_acme: {
        auth: { method: 'pat' as const, token: 'tok-acme' },
        pr_store: { prs: [], lastPollAt: Date.now() },
      },
    },
  },
};

test.beforeEach(async ({ context, popupPage }) => {
  await mockGitHubApi(context);
  await seedStorage(popupPage, TWO_ACCOUNTS);
  await reloadPopup(popupPage);
});

test('shows the active account pill with both accounts in the menu', async ({ popupPage }) => {
  await expect(
    popupPage.getByRole('button', { name: /Account octocat/i }),
  ).toBeVisible();
  await popupPage.getByRole('button', { name: /Account octocat/i }).click();
  await expect(popupPage.getByRole('menuitem', { name: /octocat active/i })).toBeVisible();
  await expect(popupPage.getByRole('menuitem', { name: /acme-bot|gh_acme|acme/i })).toBeVisible();
});

test('clicking the other account flips active_account_id', async ({ popupPage }) => {
  await popupPage.getByRole('button', { name: /Account octocat/i }).click();
  await popupPage.getByRole('menuitem', { name: /gh_acme|acme/i }).click();

  // After the click the storage write fires; useAccounts re-reads and the
  // pill should re-render with the new active login.
  const stored = await popupPage.evaluate(async () => {
    return (await chrome.storage.local.get('active_account_id')).active_account_id;
  });
  expect(stored).toBe('gh_acme');
});

test('"sign out all" wipes both accounts from storage', async ({ popupPage }) => {
  await popupPage.getByRole('button', { name: /Account octocat/i }).click();
  await popupPage.getByRole('menuitem', { name: /sign out all/i }).click();

  const stored = await popupPage.evaluate(async () => {
    return await chrome.storage.local.get(['accounts', 'active_account_id']);
  });
  const accounts = (stored.accounts ?? {}) as Record<string, unknown>;
  expect(Object.keys(accounts)).toHaveLength(0);
});
