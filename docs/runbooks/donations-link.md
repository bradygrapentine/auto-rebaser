# Runbook — Donations link

_Goal: external "Support" link in popup; ~10 LOC; no embedded payments._

## Why external-only

- **Chrome Web Store policy.** External donation links from a free extension are allowed. Embedded paid features that bypass Google's billing API are not. A simple `<a href target="_blank">` is fine.
- **AMO policy.** Same — external donation links allowed; embedded payment processing is not allowed for free extensions.
- Embedded Stripe/PayPal forms in extension popups are also a frequent rejection cause. Don't.

## Pick a destination

Options, ordered by friction:

1. **GitHub Sponsors** — `https://github.com/sponsors/<username>`. Requires Sponsors enrollment (1–2 days; needs Stripe Connect). Best long-term option; integrates with the repo.
2. **Ko-fi** — `https://ko-fi.com/<username>`. Sign up takes 5 minutes. One-time and recurring tips.
3. **Buy Me a Coffee** — `https://buymeacoffee.com/<username>`. Same shape as Ko-fi.

Any of these is fine for v0.1.0. If Sponsors enrollment isn't done by launch, ship with Ko-fi/BMaC and swap to Sponsors in v0.1.1.

## Steps

1. Pick the URL. Save as a constant in `src/core/constants.ts`:

   ```ts
   export const DONATE_URL = 'https://ko-fi.com/<username>';
   ```

2. Add a footer in the popup. Edit `src/popup/views/PRListView.tsx` (or wherever the popup root lives) to render below the existing footer:

   ```tsx
   <a
     href={DONATE_URL}
     target="_blank"
     rel="noreferrer"
     className="popup-footer__support"
   >
     support development ↗
   </a>
   ```

3. Add a minimal style in `src/popup/popup.css` matching the existing `.popup-footer__delta` token style. Keep it understated — small, muted color, single line.

4. Add a test asserting the link exists and points at `DONATE_URL`. Don't assert the literal URL text; assert via `getByRole('link', { name: /support/i })` and check `href`.

5. `npm test` → 424/424.
6. `npm run build:all` → both bundles clean.
7. Commit: `feat(popup): add support-development link`.

## Exit

- Link visible in popup footer.
- Click opens donation page in a new tab.
- One new test, all green.

## Red flags

- Embedding any kind of `<iframe>` to a payment processor — store-policy violation.
- Adding a "rate" or "review" link that actually pops a Stripe form — same issue.
- Asking for a donation **before** the user has signed in — feels desperate; put it in the authenticated PR-list footer only.
- Donation URL ending up in screenshots without context — fine, but makes the screenshot look pushy. Crop or use an unauth'd screenshot for the hero.
