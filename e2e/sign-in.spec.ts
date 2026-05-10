// Smoke test: with no auth in storage, the popup renders the sign-in view.
//
// This is the baseline E2E — proves the extension loads, the popup HTML
// is reachable at chrome-extension://<id>/src/popup/index.html, React
// mounts, and the SignInView path is taken when chrome.storage has no
// `auth` key.

import { test, expect } from './fixtures';

test('signed-out: popup shows the sign-in view', async ({ popupPage }) => {
  // No storage seeded — auth-store reads `auth` from storage.local and
  // gets undefined → useAuth resolves to 'signed-out' → SignInView mounts.
  await popupPage.waitForLoadState('domcontentloaded');

  // SignInView header is the stable selector. The text is the literal
  // string rendered in the choice view at the top of the sign-in flow.
  await expect(popupPage.getByRole('heading', { name: /auto-rebaser --auth/i })).toBeVisible();
});
