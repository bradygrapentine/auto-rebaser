# Runbook — Cutting v2.0.0 (Firefox AMO)

_Run after or in parallel with `docs/runbooks/v2-release.md` (Chrome). The version bump in the Chrome runbook's Step 1 covers `manifest.firefox.json` too — don't bump twice._

## Pre-release verification

Same as the Chrome runbook's pre-release section, plus:

- [ ] `npm run build:firefox` produces `dist-firefox/` cleanly
- [ ] Firefox load-as-temporary-extension smoke: open `about:debugging` → This Firefox → Load Temporary Add-on → pick `dist-firefox/manifest.json`. Confirm the popup loads, sign-in works, and the badge appears.

## Step 1 — Build the Firefox artifacts

```bash
npm run build:store        # if not already run for Chrome
cd dist-firefox && zip -rq ../auto-rebaser-firefox.zip . && cd ..
# AMO REQUIRES a source zip for built / transpiled extensions:
zip -rq auto-rebaser-source.zip src tests e2e scripts icons LICENSE \
  package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts \
  manifest.json manifest.firefox.json README.md
ls -lh auto-rebaser-firefox.zip auto-rebaser-source.zip
```

Verify the source zip builds cleanly in a temp dir before submitting:

```bash
unzip -q auto-rebaser-source.zip -d /tmp/check-src && cd /tmp/check-src && npm ci && npm run build:firefox
```

AMO reviewers will run something similar.

## Step 2 — Submit to addons.mozilla.org

1. Open the [AMO developer hub](https://addons.mozilla.org/en-US/developers/) → Auto Rebaser → **Submit a new version**.
2. Upload `auto-rebaser-firefox.zip`.
3. When prompted for source code, upload `auto-rebaser-source.zip` and set the build command: `npm ci && npm run build:firefox`.
4. **Reviewer notes** — paste:

   > v2.0.0 introduces multi-account support on GitHub: users can add and switch between multiple GitHub accounts within one install. No new third-party services; the extension still only contacts api.github.com / github.com (or the user's GHES host). Storage is migrated from a single-account shape to a per-account shape on first install — see `docs/runbooks/multi-account-migration.md` in the source zip for the procedure and rollback path.
   >
   > New optional permission in V2: `notifications` — used for opt-in desktop notifications (rebased / conflicted / merged / idle / ping-confirmed). The permission is requested at runtime when the user toggles notifications ON, not at install time. Default state: off.

5. Submit. Review is typically 1–7 days for AMO.

## Step 3 — Post-approval verification

- [ ] Install from AMO on a clean Firefox profile. Confirm version `2.0.0`.
- [ ] Smoke the same paths as the Chrome runbook's Step 6.

## Rollback

Mirror the Chrome rollback procedure. AMO supports unlisting a version, but as with Chrome, **don't** — strand-no-update is worse than the bug. Cut a fix as `v2.0.1`.
