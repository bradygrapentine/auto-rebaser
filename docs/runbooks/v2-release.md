# Runbook — Cutting v2.0.0 (Chrome)

_For Firefox AMO submission, see `docs/runbooks/v2-release-firefox.md` (it can run in parallel with this; the version bump in Step 1 covers both manifests)._

_Migration / rollback details: `docs/runbooks/multi-account-migration.md`._

## Pre-release verification (all must be ✅ before cutting)

Run these in order. Each is a green-or-stop gate.

### Code state
- [ ] On main, current with origin: `git fetch origin && git rev-parse HEAD` matches `git rev-parse origin/main`
- [ ] Working tree clean: `git status -s` empty
- [ ] Main CI green: `gh run list --branch main --limit 1 --json conclusion --jq '.[0].conclusion'` returns `"success"`
- [ ] No open release-blocker PRs: `gh pr list --state open` (anything open should be explicitly deferred to v2.1)

### Test posture
- [ ] `npm run typecheck` — clean
- [ ] `npx vitest run --coverage` — all tests pass, coverage meets thresholds (lines ≥95 / branches ≥88 / functions ≥95 / statements ≥95, per `vite.config.ts`)
- [ ] `npx playwright test` — 4/4 E2E green (`sign-in`, `pr-list-state-chips`, `settings-persistence`, `reviewer-tab`)

### Manual smoke (load `dist/` as unpacked extension in Chrome)
- [ ] **Multi-account:** sign in to one account, add a second account, switch between them. Popup, badge, settings, and activity log all reflect the active account.
- [ ] **Settings split:** open settings, confirm `global` section (ignored repos, keyboard shortcuts, GHES host) is shared and `this account (<login>)` section is per-account.
- [ ] **Repo-filter chip:** with 5+ repos in the popup PR list, narrow via the `[ filter ▾ ]` chip; clear restores all.
- [ ] **Reviewer tab (opt-in):** enable in settings; tab appears; PRs you review show up with state chips (`awaiting review` / `i approved` / `i requested changes` / `auto-merge armed`).
- [ ] **Push-since-approval badge:** PR with stale approval shows `! re-review` chip; toggle the actionable-mode sub-toggle and confirm click → re-request review fires.
- [ ] **Desktop notifications:** toggle ON in settings, grant the runtime permission prompt, trigger a rebase, observe a system notification. Toggle OFF and confirm no future notifications fire.
- [ ] **Storage migration:** install over an existing v1.0.2 build (use the build at tag `v1.0.2` if available, else seed a v1-shape fixture in `chrome.storage.local`). Confirm `_migration_backup_v1` key exists post-migration and existing settings are preserved.

### Listing assets
- [ ] `docs/STORE_LISTING.md` reflects the v2 surface (multi-account, settings split, repo filter, reviewer tab, push-since-approval, desktop notifications)
- [ ] Screenshots refreshed for: account switcher, settings split with `this account (<login>)` chip, reviewer tab with chips, push-since-approval badge, desktop-notifications settings block. See `docs/runbooks/icons-and-screenshots.md` for sizing + naming conventions.
- [ ] Privacy / Terms pages still accurate — no new third-party services in V2

**If any item fails, stop. Do not advance to Step 1.**

---

## Step 1 — Bump version

```bash
git checkout main && git pull origin main
sed -i '' 's/"version": "1\.[0-9]*\.[0-9]*"/"version": "2.0.0"/' \
  package.json manifest.json manifest.firefox.json
grep '"version"' package.json manifest.json manifest.firefox.json
```

All three lines must show `2.0.0`. macOS sed needs the empty `''` after `-i`; on Linux drop the `''`.

## Step 2 — Build the Chrome artifact

```bash
npm run build:store        # STORE=1 build for both Chrome + Firefox; strips manifest.key
cd dist && zip -rq ../auto-rebaser-chrome.zip . && cd ..
ls -lh auto-rebaser-chrome.zip
```

The zip should be ~150–250 KB. If it's >1 MB something pulled `node_modules` into the build — abort and inspect `dist/`.

Chrome Web Store does NOT require a separate source-code zip (AMO does — see `docs/runbooks/v2-release-firefox.md`).

## Step 3 — PR + merge the version bump

```bash
git checkout -b release/v2.0.0
git add package.json manifest.json manifest.firefox.json
git commit -m "chore(release): v2.0.0"
git push -u origin release/v2.0.0
gh pr create --title "chore(release): v2.0.0" --body-file docs/release-notes/v2.0.0.md
gh pr merge --auto --squash
```

Wait for merge before continuing.

## Step 4 — Tag + GitHub release

```bash
git checkout main && git pull origin main
git tag -a v2.0.0 -m "v2.0.0 — multi-account, reviewer dashboard, push-since-approval, settings split"
git push origin v2.0.0
gh release create v2.0.0 --title "v2.0.0" \
  --notes-file docs/release-notes/v2.0.0.md \
  auto-rebaser-chrome.zip
```

The release page will be visible at `https://github.com/bradygrapentine/auto-rebaser/releases/tag/v2.0.0`. Copy the URL — the Chrome Web Store changelog can link to it.

## Step 5 — Submit to Chrome Web Store

Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Auto Rebaser appears under your items.

1. Click into the **Auto Rebaser** item → **Package** tab.
2. Click **Upload new package** → select `auto-rebaser-chrome.zip` (from Step 2).
3. The dashboard parses the manifest. Confirm:
   - Version: `2.0.0`
   - Permissions: `alarms`, `storage`, `identity` (unchanged from v1.0.2)
   - Optional permissions: `notifications` (new; requested at runtime when the user opts in)
   - Host permissions: `https://api.github.com/*`, `https://github.com/*` (unchanged)
4. **Store listing** tab — paste the v2 short / long description from `docs/STORE_LISTING.md`. Re-upload screenshots if any have changed.
5. **Distribution** tab — confirm visibility settings are unchanged (Public, or whatever v1.0.2 was on).
6. **Submit for review**. Review typically lands in <24h for an existing item with no new required permissions.

You'll receive an email when review completes. The item updates automatically on user devices within ~6h of approval.

## Step 6 — Post-release verification

After Chrome approves the update:

- [ ] Install fresh on a clean profile from the store. Confirm the version reads `2.0.0` in the popup footer.
- [ ] Sign in via PAT and via GitHub App; verify both paths work.
- [ ] Watch the GitHub issue tracker for the next 48h for migration bugs. The `_migration_backup_v1` key buys 60 days of safe rollback (see `docs/runbooks/multi-account-migration.md`).
- [ ] Update `docs/superpowers/BACKLOG.md` §7 with the v2.0.0 ship date.
- [ ] If Firefox is on a parallel ship, cross-link from the Firefox runbook to this one's PR / tag for traceability.

## Rollback

If a critical bug surfaces in the wild:

1. **Do NOT delete the v2.0.0 store listing or unpublish.** That strands installed users on a broken version with no auto-update path.
2. Cut `v2.0.1` with a targeted fix; re-submit. Same flow as Steps 1–5.
3. If the bug is in storage migration: bump `STORAGE_VERSION` in `multi-account.ts`, write a v2 → v2.1 migration that restores from `_migration_backup_v1` for affected users.
