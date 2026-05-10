# Runbook — Cutting v2.0.0

_Companion to: `docs/superpowers/plans/2026-05-07-v2-implementation-plan.md`_

When the V2 feature surface is stable (MA-1 storage refactor, B1/B2/B3 multi-account UX, Story 2.5 repo filter, Story 2.4 desktop notifications), this runbook drives the release.

## Pre-release gates (all must pass)

- [ ] All Sprint 1 PRs merged to main, CI green: MA-1 (#91), B1 (#94), B2 (#95), B3 (#96), 2.5 (#98), 2.4 (#99)
- [ ] Storage migration tested with a v1.0.2 fixture install (no data loss; `_migration_backup_v1` created)
- [ ] GitHub live-tested end-to-end on at least two sandbox accounts (work + personal shape)
- [ ] Multi-account smoke: two GitHub accounts in the same install; switching reflects in popup, badge, settings, and activity
- [ ] Desktop-notification smoke (Chrome): toggle ON → grant permission → trigger a rebase → see system notification; toggle OFF removes permission
- [ ] Repo-filter smoke: filter to 2 repos out of 30 PRs; clearing filter restores all
- [ ] All 810+ tests passing; coverage flat or up (current: 95.61 / 90.04 / 95.61 / 95.61 vs 95/88/95/95 thresholds)
- [ ] `docs/STORE_LISTING.md` rewritten for v2 features (multi-account switcher, settings split, account+repo filter chips, opt-in desktop notifications)
- [ ] New screenshots captured: account switcher dropdown, settings split (global vs `this account (login)`), repo-filter chip, activity-log account chip, desktop-notifications settings block

## Step 1 — Bump version

```bash
git checkout main && git pull origin main
sed -i '' 's/"version": "1\.[0-9]*\.[0-9]*"/"version": "2.0.0"/' \
  package.json manifest.json manifest.firefox.json
grep '"version"' package.json manifest.json manifest.firefox.json
```

## Step 2 — Build artifacts

```bash
npm run build:store        # STORE=1 strips manifest.key
cd dist && zip -rq ../auto-rebaser-chrome.zip . && cd ..
cd dist-firefox && zip -rq ../auto-rebaser-firefox.zip . && cd ..
zip -rq auto-rebaser-source.zip src tests icons LICENSE \
  package.json package-lock.json tsconfig.json vite.config.ts \
  manifest.json manifest.firefox.json README.md
ls -la auto-rebaser-*.zip
```

Verify the source zip builds cleanly in a temp dir before continuing — same check we did pre-v1.0.1.

## Step 3 — PR + merge the version bump

```bash
git checkout -b release/v2.0.0
git add package.json manifest.json manifest.firefox.json
git commit -m "chore(release): v2.0.0 — multi-account + repo filter + desktop notifications"
git push -u origin release/v2.0.0
gh pr create --title "chore(release): v2.0.0" --body "<changelog excerpt>"
gh pr merge --auto --squash
```

Wait for merge.

## Step 4 — Tag + GitHub release

```bash
git checkout main && git pull origin main
git tag -a v2.0.0 -m "v2.0.0 — multi-account on GitHub + repo filter + desktop notifications"
git push origin v2.0.0
gh release create v2.0.0 --title "v2.0.0" \
  --notes "$(cat docs/release-notes/v2.0.0.md)" \
  auto-rebaser-chrome.zip auto-rebaser-firefox.zip
```

## Step 5 — Re-submit to extension stores

Each store treats v2.0.0 as a new version submission:

- **Chrome Web Store** — dev console → existing item → upload new package → re-fill changelog → submit. Review usually <24h.
- **Firefox AMO** — submit new version → upload `auto-rebaser-firefox.zip` + `auto-rebaser-source.zip` → reviewer notes mention multi-account + the new opt-in `notifications` permission → submit. Review 1–7 days.

Source zip rebuilds change because of the multi-account storage refactor; flag in reviewer notes:
> v2.0.0 introduces multi-account support on GitHub. No new third-party services; the extension still only contacts api.github.com / github.com (or the user's GHES host). Storage is migrated from a single-account shape to a per-account shape on first install — see `docs/runbooks/multi-account-migration.md` for the procedure and rollback path.

## Step 6 — Marketplace listing already live

MP-1 ships **before** v2 work begins (per the revised plan). By the time v2.0.0 lands, the GitHub Marketplace listing is already approved against v1.0.2. Update the listing with v2 features post-release:
- Edit the existing Marketplace listing → bump description bullets to mention multi-account.
- Refresh screenshots if the v2 UI is materially different.
- No re-review required for description-only edits.

## Step 7 — Post-release

- Update `README.md` with v2 features + Marketplace badge (once approved).
- Update `docs/superpowers/BACKLOG.md` §7 with all V2 stories shipped.
- Watch issue tracker for migration bugs (the `_migration_backup_v1` key buys 60 days of safe rollback).

## Rollback

If a critical V2 bug surfaces in the wild:
1. **Don't** delete the v2.0.0 release — that breaks already-installed users.
2. Cut `v2.0.1` with a fix; re-submit to all 3 stores. Same flow as above.
3. If unrecoverable: cut `v1.1.0` from the pre-V2 main commit, ship as a "stable" branch alongside v2.x. This is the nuclear option.

## Open items for the maintainer

- Decide: is v2.0.0 the right bump? Storage migration is the only breaking-shape change; multi-provider (GitLab) is deferred to v3. SemVer says "any breaking change" → major bump; v2 is fine.
