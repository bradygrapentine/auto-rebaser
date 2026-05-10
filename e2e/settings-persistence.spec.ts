// Smoke test: toggling a setting writes to chrome.storage and persists
// across popup reloads.
//
// Catches the regression where, e.g., a settings refactor stops calling
// `save()` from the toggle handler, or writes to the wrong storage area.
// Doesn't test every setting — just exercises one round-trip to prove
// the settings UI → storage path works.

import { test, expect, seedStorage, reloadPopup, mockGitHubApi } from './fixtures';

test('signed-in: toggling auto-rebase persists across popup reload', async ({ context, popupPage }) => {
  await mockGitHubApi(context);
  // Seed an active account so saveAutomationSettings exercises the v2
  // per-account split path (writes per_account_settings:<id> + global_settings).
  // The v1/v2 split bug that previously dropped the write on the no-account
  // path was fixed; that scenario is covered by the unit test in
  // tests/core/automations-store.test.ts. This E2E focuses on the multi-
  // account v2 round-trip.
  await seedStorage(popupPage, {
    local: {
      auth: { method: 'pat', token: 'fake-token-for-e2e' },
      pr_store: { prs: [], lastPollAt: Date.now() },
      active_account_id: 'gh_e2e-user',
      accounts: { 'gh_e2e-user': { login: 'e2e-user', method: 'pat', token: 'fake-token-for-e2e' } },
    },
  });
  await reloadPopup(popupPage);

  // Navigate to settings. The header gear button has aria-label="Settings".
  await popupPage.getByRole('button', { name: 'Settings' }).click();

  // Auto-rebase is ON by default. The checkbox is inside a label with the
  // text "Auto-rebase behind PRs".
  const toggle = popupPage.getByRole('checkbox', { name: /Auto-rebase behind PRs/i });
  await expect(toggle).toBeChecked();

  // Flip it OFF. Wait a beat for the async save → setSettings round-trip.
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  // Verify it persisted to chrome.storage.sync (where AutomationSettings
  // is written by saveAutomationSettings).
  const persisted = await popupPage.evaluate(async () => {
    const all = await chrome.storage.sync.get(null);
    return all;
  });
  // The settings key shape varies (v1 single-blob vs v2 split) — check both.
  const v2Global = persisted.global_settings as { ignoredRepos?: unknown } | undefined;
  const v1Blob = persisted.automation_settings as { autoRebaseEnabled?: boolean } | undefined;
  const perAccountKey = Object.keys(persisted).find((k) => k.startsWith('per_account_settings:'));
  const v2PerAccount = perAccountKey ? (persisted[perAccountKey] as { autoRebaseEnabled?: boolean }) : undefined;

  const stored = v2PerAccount?.autoRebaseEnabled ?? v1Blob?.autoRebaseEnabled;
  expect(stored).toBe(false);

  // Sanity: v2 split must have populated global_settings as a side effect.
  // (saveAutomationSettings always writes the global half.)
  expect(v2Global).toBeDefined();

  // Round-trip: reload the popup and confirm the checkbox is still OFF.
  await reloadPopup(popupPage);
  await popupPage.getByRole('button', { name: 'Settings' }).click();
  await expect(popupPage.getByRole('checkbox', { name: /Auto-rebase behind PRs/i })).not.toBeChecked();
});
