# Auto Rebaser Launch Plan

_Owner: Brady · Target: ship to Chrome Web Store + addons.mozilla.org_

## Status snapshot

- Code: feature-complete (MVP + Phase 2). 413/423 tests green; 10 stale assertions from Primer-style UX rewrite.
- Build: `npm run build` (Chrome → `dist/`) and `npm run build:firefox` (→ `dist-firefox/`) both green.
- Privacy policy: drafted at `PRIVACY.md` (needs `<REPO_URL>` replacement).
- Live testing: not yet performed.
- Store listings: not yet created.
- Icons: placeholder green squares.

## Track summary

Tracks run roughly in the order below, but tracks 2–4 can overlap.

| # | Track | Output | Runbook |
|---|---|---|---|
| 1 | Styling polish | 423/423 tests green; finalized Primer styling | `docs/runbooks/styling-polish.md` |
| 2 | Icons + screenshots | `icons/icon{16,48,128}.png`, store screenshots, hero tile | `docs/runbooks/icons-and-screenshots.md` |
| 3 | Donations link | "Support" link in popup footer pointing to GitHub Sponsors / Ko-fi | `docs/runbooks/donations-link.md` |
| 4 | Live smoke tests | Both browsers verified against RUNBOOK §3 + §4 | `docs/runbooks/firefox-smoke-test.md`, `docs/runbooks/chrome-smoke-test.md` |
| 5 | Store submission | Listings live, extension published | `docs/runbooks/store-submission.md` |

## Critical path

```
Track 1 (styling)                        ─┐
Track 2 (icons + screenshots)             ├─► Track 4 (smoke tests) ─► Track 5 (submission)
Track 3 (donations link, optional)       ─┘
```

Track 5 cannot start until smoke tests pass on both browsers AND screenshots exist.

## Per-track scope and exit criteria

### Track 1 — Styling polish

**Scope.** Finalize the Primer-style rebrand of `popup.css`, `Header.tsx`, `RepoGroup.tsx`, `PRRow.tsx`, `PollSummaryFooter.tsx`, `SignInView.tsx`, `SettingsView.tsx`, `PRListView.tsx`. Update the 10 stale test assertions to match new copy/markup. No behavior changes.

**Exit.** `npm test` is 423/423; `npm run typecheck` clean; `npm run build` clean.

### Track 2 — Icons + screenshots

**Scope.** Replace the three placeholder PNGs at `icons/icon{16,48,128}.png` with real artwork. Produce store assets:

- Chrome Web Store: 128×128 store icon, 1280×800 *or* 640×400 screenshots (1–5 of them), optional 440×280 small promo tile, optional 1400×560 marquee.
- AMO: 64×64 icon, 1280×800 screenshots, optional promo image.

**Exit.** `dist/icons/icon128.png` and `dist-firefox/icons/icon128.png` are real artwork. Store-asset folder `marketing/` contains screenshots and tiles ready to upload.

### Track 3 — Donations link (optional, ~10 LOC)

**Scope.** Add a "Support" link in the popup footer pointing to an external donation URL (GitHub Sponsors page once created, or Ko-fi/Buy Me a Coffee in the meantime). External link only — no embedded payment.

**Exit.** Link visible in popup, opens external URL in a new tab. Compliant with Chrome Web Store's policy: external donation link from a non-paid extension is allowed; embedded paid features outside Google's billing API are not.

### Track 4 — Live smoke tests

**Scope.** Walk RUNBOOK §3 (MVP behaviors) and §4 (Phase 2 behaviors) against a real GitHub account in each browser. Confirm: PAT auth, poll cadence, rebase trigger, branch deletion, auto-merge, thread resolve, notification dismiss, badge counts, error states.

**Exit.** Both runbooks have a dated ✅ entry per scenario; any deviations are filed as issues and either fixed or explicitly accepted.

### Track 5 — Store submission

**Scope.**
- Create developer accounts (Chrome: $5 one-time fee; AMO: free).
- Upload zips, fill listings, attach screenshots and privacy policy URL.
- Wait on review.

**Exit.** Both stores show "published". Public install URLs captured in `LAUNCH_PLAN.md` history section below.

## Pre-submission checklist

- [ ] All 423 tests pass locally.
- [ ] `npm run build:all` produces both `dist/` and `dist-firefox/` cleanly.
- [ ] Real icons in place (no green-square placeholder).
- [ ] Privacy policy hosted at a public URL (GitHub Pages on the repo is fine).
- [ ] `<REPO_URL>` placeholder in `PRIVACY.md` replaced with the actual repo URL.
- [ ] Both smoke-test runbooks have dated passes for the latest commit.
- [ ] Source-code zip prepared for AMO (separate from `dist-firefox/`).
- [ ] Store listing copy drafted (short description ≤132 chars, long description, category, support email).
- [ ] Screenshots produced at correct resolutions for each store.
- [ ] Version number in `manifest.json` and `manifest.firefox.json` matches `package.json`.

## Post-launch

- Monitor reviews. Respond to bug reports.
- Bump version, rebuild, resubmit when shipping fixes — Chrome auto-pushes after re-review (1–3 days); AMO auto-pushes after re-review (usually <1 day).
- Track install counts in store dashboards.

## Launch history

_(Fill in once published.)_

- Chrome Web Store URL: …
- AMO URL: …
- Initial published version: …
- Date published: …
