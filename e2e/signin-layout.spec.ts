// Sign-in layout pin (T3, post-Cowork v2 smoke).
//
// Locks in the centering bias + button-width + lede→button1 gap so the
// CSS rules in `popup.css .signin` can't silently drift again. We test
// the actual rendered bounding rects, not the raw CSS values, because
// the failure mode the Cowork report surfaced was "the rule is there
// but doesn't apply" — only computed layout catches that.

import { test, expect } from './fixtures';

test('signed-out: sign-in layout is centered, narrow, and rhythmically spaced', async ({
  popupPage,
}) => {
  await popupPage.waitForLoadState('domcontentloaded');

  // Wait for the choice view to mount.
  await expect(popupPage.getByRole('heading', { name: /auto-rebaser --auth/i })).toBeVisible();

  const metrics = await popupPage.evaluate(() => {
    const popupRoot =
      document.querySelector('.popup-root') ??
      document.querySelector('main') ??
      document.body;
    const popupRect = popupRoot.getBoundingClientRect();
    const title = document.querySelector('.signin__title');
    const lede = document.querySelector('.signin__lede');
    const buttons = Array.from(document.querySelectorAll('.signin .btn--block'));
    return {
      popupHeight: popupRect.height,
      popupWidth: popupRect.width,
      title: title ? title.getBoundingClientRect() : null,
      lede: lede ? lede.getBoundingClientRect() : null,
      buttons: buttons.map((b) => b.getBoundingClientRect()),
    };
  });

  if (!metrics.title || !metrics.lede || metrics.buttons.length < 1) {
    throw new Error('Sign-in layout missing required elements');
  }

  // (a) Vertical centering: title top sits between 15% and 55% of popup
  //     height. Loose floor to tolerate the upper-bias Cowork measured
  //     while still catching the "glued to top" regression.
  const titleTopPct = metrics.title.top / metrics.popupHeight;
  expect(titleTopPct).toBeGreaterThan(0.15);
  expect(titleTopPct).toBeLessThan(0.55);

  // (b) Button width: rendered width ≤ 340px (the max-width clamp).
  for (const b of metrics.buttons) {
    expect(b.width).toBeLessThanOrEqual(340 + 1);
  }

  // (c) lede→button1 gap: ±6px tolerance around the 28px spec to absorb
  //     subpixel rendering and font-metrics drift across browsers.
  const gap = metrics.buttons[0].top - metrics.lede.bottom;
  expect(gap).toBeGreaterThan(28 - 6);
  expect(gap).toBeLessThan(28 + 6);
});
