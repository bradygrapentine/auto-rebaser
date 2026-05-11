# V2 Release Chrome Runbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `docs/runbooks/v2-release.md` so it's Chrome-focused, post-V2-scope-shipped, and walkable end-to-end without surprises. Move Firefox/AMO specifics to a sibling doc so the Chrome flow stays lean. Add a v2.0.0 release-notes template file the runbook references.

**Architecture:** Three doc artifacts, no code. Cross-link Chrome ↔ Firefox docs at the top of each. Release-notes file pre-populated with the actual shipped V2 surface area so the operator just edits/copy-pastes.

**Tech Stack:** Markdown only. Bash snippets in the runbook must be exactly what an operator would paste (no placeholders without explicit `<REPLACE-ME>` markers).

---

## Background

`docs/runbooks/v2-release.md` was written 2026-05-07 against the V2 plan when no Sprint 1/2/3 work was merged. Since then, the following landed on main:

- **Sprint 1:** MA-1 (#91), B1 (#94), B2 (#95), B3 (#96), 2.5 (#98), 2.4 (#99)
- **Sprint 2:** 5.2-A push-since-approval (#102)
- **Sprint 3:** STATE-2 (#103), E2E-1 (#104), REVIEWER-AUTOMATIONS (#105), FOLLOWUPs 1/2 + TESTs 1/2 (#106), CHORE-1 flake fix (#108), FOLLOWUP-3 read-side migration (#109)

The current runbook:
- Lists pre-release gates as TODOs against unmerged work — should now be a verification checklist against merged work
- Lumps Chrome + Firefox + Marketplace into one flow — user wants Chrome focus
- Doesn't mention reviewer-automations, push-since-approval, or the new E2E harness in changelog guidance
- References `docs/release-notes/v2.0.0.md` which doesn't exist

---

## File Structure

### Created
- `docs/release-notes/v2.0.0.md` — release-notes template the runbook references via `gh release create --notes-file`

### Modified
- `docs/runbooks/v2-release.md` — Chrome-focused rewrite

### Created (optional, per Task 2)
- `docs/runbooks/v2-release-firefox.md` — Firefox/AMO bits split out

---

## Task 1 — Refresh `docs/runbooks/v2-release.md` (Chrome focus)

**Files:**
- Modify: `docs/runbooks/v2-release.md`

The rewrite must follow this structure. Bash blocks must be copy-paste-ready. Each gate must be verifiable against current main state (not aspirational).

- [ ] **Step 1: Replace pre-release gates with a verification checklist**

The new gates should be runnable commands or unambiguous "is this true today" checks. Drop the speculative ones. Concretely:

```markdown
## Pre-release verification (all must be ✅ before cutting)

Run these in order. Each is a green-or-stop gate.

### Code state
- [ ] `git fetch origin && git rev-parse HEAD == git rev-parse origin/main` — on main, current
- [ ] `git status -s` empty — no uncommitted work
- [ ] `gh run list --branch main --limit 1 --json conclusion --jq '.[0].conclusion'` returns `"success"` — CI green
- [ ] `gh pr list --state open` empty (or only release-blockers explicitly deferred to v2.1)

### Test posture
- [ ] `npm run typecheck` clean
- [ ] `npx vitest run --coverage` — all tests pass, coverage meets thresholds (lines ≥95 / branches ≥88 / functions ≥95 / statements ≥95, per `vite.config.ts`)
- [ ] `npx playwright test` — 4/4 E2E green (sign-in, pr-list-state-chips, settings-persistence, reviewer-tab)

### Manual smoke (load `dist/` as unpacked extension in Chrome)
- [ ] Multi-account: sign in to one account, add a second account, switch between them. Popup, badge, settings, activity log all reflect active account.
- [ ] Settings split: open settings, confirm `global` section (ignored repos, keyboard shortcuts, GHES host) is shared and `this account (<login>)` section is per-account.
- [ ] Repo-filter chip: with 5+ repos in popup, narrow via the `[ filter ▾ ]` chip; clear restores all.
- [ ] Reviewer tab (opt-in): enable in settings; tab appears; PRs you review show up with state chips (awaiting / approved / changes / armed).
- [ ] Push-since-approval badge: PR with stale approval shows `! re-review` chip; toggle the actionable-mode sub-toggle and confirm click → re-request review fires.
- [ ] Desktop notifications: toggle ON, grant permission, trigger a rebase, see system notification. Toggle OFF, confirm no future notifications.
- [ ] Storage migration: install over a v1.0.2 build (use the build at tag v1.0.2 if available, else create a v1-shape fixture in `chrome.storage.local`). Confirm `_migration_backup_v1` key exists post-migration and existing settings are preserved.

### Listing assets
- [ ] `docs/STORE_LISTING.md` reflects v2 surface (multi-account, settings split, repo filter, reviewer tab, push-since-approval, desktop notifications)
- [ ] Screenshots refreshed for: account switcher, settings split with `this account (<login>)` chip, reviewer tab with chips, push-since-approval badge, desktop-notifications settings block. See `docs/runbooks/icons-and-screenshots.md` for sizing + naming conventions.
- [ ] Privacy/Terms pages still accurate — no new third-party services in v2

If any item fails, **stop**. Do not advance to Step 1.
```

- [ ] **Step 2: Step 1 — Bump version**

Keep the existing version-bump block. macOS sed flag is fine. Add an explicit "Chrome-only" build step that exists today: `npm run build:store` already builds both targets but you'll only upload the Chrome zip in this runbook.

```markdown
## Step 1 — Bump version

```bash
git checkout main && git pull origin main
sed -i '' 's/"version": "1\.[0-9]*\.[0-9]*"/"version": "2.0.0"/' \
  package.json manifest.json manifest.firefox.json
grep '"version"' package.json manifest.json manifest.firefox.json
```

All three lines must show `2.0.0`. If macOS sed differs, use `sed -i ''` (note the empty string).
```

- [ ] **Step 3: Step 2 — Build the Chrome artifact**

Replace the existing combined build with a Chrome-focused variant. The `build:store` script strips `manifest.key` per the comment in `vite.config.ts`. Chrome doesn't need the source zip (that's AMO-specific) — leave a note.

```markdown
## Step 2 — Build the Chrome artifact

```bash
npm run build:store        # STORE=1 build, strips manifest.key for both Chrome + Firefox
cd dist && zip -rq ../auto-rebaser-chrome.zip . && cd ..
ls -lh auto-rebaser-chrome.zip
```

The zip should be ~150–250 KB. If it's >1 MB, something pulled node_modules into the build — abort and inspect `dist/`.

Chrome Web Store does NOT require a separate source-code zip (AMO does — see `docs/runbooks/v2-release-firefox.md`).
```

- [ ] **Step 4: Step 3 — PR + merge the version bump**

Existing block is fine; tweak the commit message to reflect the actual shipped scope.

```markdown
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
```

- [ ] **Step 5: Step 4 — Tag + GitHub release**

Same shape as today, but reference the new `docs/release-notes/v2.0.0.md` (created in Task 3) and attach Chrome zip only.

```markdown
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
```

- [ ] **Step 6: Step 5 — Submit to Chrome Web Store**

Drop the Firefox + Marketplace bullets here. Chrome-only step. Be explicit about what the operator clicks in the dashboard.

```markdown
## Step 5 — Submit to Chrome Web Store

Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). Auto Rebaser appears under your items.

1. Click into the **Auto Rebaser** item → **Package** tab.
2. Click **Upload new package** → select `auto-rebaser-chrome.zip` (from Step 2).
3. The dashboard parses the manifest. Confirm:
   - Version: `2.0.0`
   - Permissions: same as v1.0.2 (no new permissions added in V2)
   - Host permissions: `https://api.github.com/*`, `https://github.com/*` (unchanged)
4. **Store listing** tab — paste the v2 short/long description from `docs/STORE_LISTING.md`. Re-upload screenshots if any have changed.
5. **Distribution** tab — confirm visibility settings unchanged (Public, or whatever v1.0.2 was on).
6. **Submit for review**. Review typically lands in <24h for an existing item with no new permissions.

You'll receive an email when review completes. The item updates automatically on user devices within ~6h of approval.
```

- [ ] **Step 7: Step 6 — Post-release**

Strip the Marketplace bit (move to Firefox doc if needed; it's already documented elsewhere). Keep the post-release verification.

```markdown
## Step 6 — Post-release verification

After Chrome approves the update:

- [ ] Install fresh on a clean profile from the store. Confirm version reads `2.0.0` in popup footer.
- [ ] Sign in via PAT and via GitHub App, verify both paths work.
- [ ] Watch the GitHub issue tracker for the next 48h for migration bugs. The `_migration_backup_v1` key buys 60 days of safe rollback (see `docs/runbooks/multi-account-migration.md`).
- [ ] Update `docs/superpowers/BACKLOG.md` §7 with the v2.0.0 ship date.
- [ ] If Firefox is on a parallel ship, cross-link from the Firefox runbook to this one's PR/tag for traceability.

## Rollback

If a critical bug surfaces in the wild:

1. **Do NOT delete the v2.0.0 store listing or unpublish** — that strands installed users on a broken version with no auto-update path.
2. Cut `v2.0.1` with a targeted fix; re-submit. Same flow as Steps 1–5.
3. If the bug is in storage migration: bump `STORAGE_VERSION` in `multi-account.ts`, write a v2→v2.1 migration that restores from `_migration_backup_v1` for affected users.
```

- [ ] **Step 8: Add cross-link to Firefox runbook**

At the top of the rewritten doc, add a one-liner pointing at the Firefox doc (created in Task 2):

```markdown
# Runbook — Cutting v2.0.0 (Chrome)

_For Firefox AMO submission, see `docs/runbooks/v2-release-firefox.md` (it can run in parallel with this; the version bump in Step 1 covers both manifests)._
```

- [ ] **Step 9: Drop now-stale "Open items" section**

The current doc ends with:

```
## Open items for the maintainer
- Decide: is v2.0.0 the right bump?
```

That question is answered (yes). Delete the section. If a future maintainer needs to revisit, the BACKLOG.md `## §7 Shipped log` entry is the audit trail.

- [ ] **Step 10: Final read-through**

Read the rewritten doc top-to-bottom as if you'd never seen it. Every bash block should be paste-runnable. Every checkbox should be a true binary decision (no "kind of" gates).

---

## Task 2 — Split Firefox/AMO content into a sibling doc

**Files:**
- Create: `docs/runbooks/v2-release-firefox.md`

The current `v2-release.md` Step 5 has a Firefox bullet:

```
Firefox AMO — submit new version → upload `auto-rebaser-firefox.zip` + `auto-rebaser-source.zip` → reviewer notes mention multi-account + the new opt-in `notifications` permission → submit. Review 1–7 days.
```

Move that into its own runbook so the Chrome doc isn't carrying it. Firefox AMO has different requirements (source zip, longer review, separate reviewer notes) and warrants its own document.

- [ ] **Step 1: Write `docs/runbooks/v2-release-firefox.md`**

Use this template:

```markdown
# Runbook — Cutting v2.0.0 (Firefox AMO)

_Run after or in parallel with `docs/runbooks/v2-release.md` (Chrome). The version bump in the Chrome runbook's Step 1 covers `manifest.firefox.json` too — don't bump twice._

## Pre-release verification

Same as the Chrome runbook's pre-release section, plus:

- [ ] `npm run build:firefox` produces `dist-firefox/` cleanly
- [ ] Firefox load-as-temporary-extension smoke: open `about:debugging` → This Firefox → Load Temporary Add-on → pick `dist-firefox/manifest.json`. Confirm popup loads, sign-in works, badge appears.

## Step 1 — Build the Firefox artifacts

```bash
npm run build:store        # if not already run for Chrome
cd dist-firefox && zip -rq ../auto-rebaser-firefox.zip . && cd ..
# AMO REQUIRES a source zip for built/transpiled extensions:
zip -rq auto-rebaser-source.zip src tests e2e scripts icons LICENSE \
  package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts \
  manifest.json manifest.firefox.json README.md
ls -lh auto-rebaser-firefox.zip auto-rebaser-source.zip
```

Verify the source zip builds cleanly in a temp dir (`unzip -d /tmp/check-src auto-rebaser-source.zip && cd /tmp/check-src && npm ci && npm run build:firefox`). AMO reviewers will run something similar.

## Step 2 — Submit to addons.mozilla.org

1. Open the [AMO developer hub](https://addons.mozilla.org/en-US/developers/) → Auto Rebaser → **Submit a new version**.
2. Upload `auto-rebaser-firefox.zip`.
3. When prompted for source code, upload `auto-rebaser-source.zip` and the build command: `npm ci && npm run build:firefox`.
4. **Reviewer notes** — paste:

   > v2.0.0 introduces multi-account support on GitHub: users can add and switch between multiple GitHub accounts within one install. No new third-party services; the extension still only contacts api.github.com / github.com (or the user's GHES host). Storage is migrated from a single-account shape to a per-account shape on first install — see `docs/runbooks/multi-account-migration.md` in the source zip for the procedure and rollback path.
   >
   > New permission requested in V2: `notifications` — used for opt-in desktop notifications (rebased / conflicted / merged / idle / ping-confirmed). The permission is requested at runtime when the user toggles notifications ON, not at install time. Default state: off.

5. Submit. Review is typically 1–7 days for AMO.

## Step 3 — Post-approval verification

- [ ] Install from AMO on a clean Firefox profile. Confirm version `2.0.0`.
- [ ] Smoke same paths as Chrome runbook's Step 6.

## Rollback

Mirror the Chrome rollback procedure. AMO supports unlisting a version, but as with Chrome, **don't** — strand-no-update is worse than the bug.
```

- [ ] **Step 2: Add cross-link from the Chrome doc back to here** (covered by Task 1 Step 8)

---

## Task 3 — Create `docs/release-notes/v2.0.0.md`

**Files:**
- Create: `docs/release-notes/v2.0.0.md` (the `gh release create --notes-file` source)

The current runbook references this file in Step 4 but it doesn't exist. Create it with the actual shipped V2 surface area.

- [ ] **Step 1: Create the directory + file**

`docs/release-notes/` doesn't exist yet:

```bash
mkdir -p docs/release-notes
```

Then write the file:

```markdown
# v2.0.0 — Multi-account, reviewer dashboard, settings split

## Highlights

- **Multi-account support.** Add multiple GitHub accounts to one install and switch between them from the popup header. Account-aware popup, badge, settings, and activity log. Per-account error isolation — a 401 on one account doesn't take down the others.
- **Reviewer dashboard (opt-in).** A second tab in the popup showing PRs where you're a requested reviewer or assignee, with state chips for *awaiting review / I approved / I requested changes / auto-merge armed*. Optional 4-gate auto-merge automation per allowlisted repo.
- **Push-since-approval badge.** PRs that received commits after their last approval surface a `! re-review` chip; optional sub-toggle promotes the chip to a click-to-re-request-review action.
- **Settings split.** Settings are now divided into *global* (shared across accounts — ignored repos, keyboard shortcuts, GHES host) vs *this account (<login>)* (everything else).
- **Header repo-filter chip.** Narrow the popup PR list to a subset of repos. Persists per-account.
- **Desktop notifications (opt-in).** Per-event toggles for rebased / conflicted / merged / idle / ping-confirmed. 1-hour throttle per (PR, event).

## Other improvements

- **Stale-PR badge with one-click reviewer ping.** `idle Nd` chip on PRs past your per-repo threshold; click to @-mention requested reviewers.
- **State machine fix.** `[updated]` no longer masks failing required checks — surfaces `pending` correctly after rebase.
- **E2E test harness.** Playwright + GitHub Actions CI covering the popup → storage → render path.
- **Storage round-trip fix.** Settings written while signed-out now persist correctly across popup reloads.

## Migration

First launch on v2.0.0 migrates v1 storage to the per-account shape. A backup of your v1 storage is preserved at `_migration_backup_v1` in `chrome.storage.local` for 60 days, enabling rollback if needed.

## Permissions

No new install-time permissions. `notifications` is requested at runtime when the user opts in.

## Acknowledgements

Thanks to everyone who reported bugs and tested early builds.

Full changelog: <github.com/bradygrapentine/auto-rebaser/compare/v1.0.2...v2.0.0>
```

- [ ] **Step 2: Verify the file is referenced correctly from the runbooks**

The Chrome runbook references `docs/release-notes/v2.0.0.md` in Steps 3 and 4. After creating the file, confirm both references resolve.

---

## Task 4 — Final verification

- [ ] **Step 1: Read all three doc files top-to-bottom**

Open in order:
1. `docs/runbooks/v2-release.md` — Chrome flow
2. `docs/runbooks/v2-release-firefox.md` — Firefox flow
3. `docs/release-notes/v2.0.0.md` — release notes

Each must be operator-runnable. No `<TBD>`, no broken cross-references, no stale gate.

- [ ] **Step 2: Confirm no other doc points at a stale path**

Run: `grep -rn "v2-release\|release-notes/v2" docs/ README.md 2>/dev/null`

Each hit should resolve to a real file post-this-PR.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/v2-release.md docs/runbooks/v2-release-firefox.md docs/release-notes/v2.0.0.md docs/plans/2026-05-11-v2-release-chrome-runbook.md
git commit -m "docs(runbook): refresh v2-release flow — Chrome focus, Firefox split, release-notes template"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin <branch>
gh pr create --title "docs(runbook): v2.0.0 Chrome release runbook + Firefox split + notes template" \
  --body "<see below>"
gh pr merge --auto --squash
```

PR body should call out:
- Why the rewrite (existing doc stale on what shipped)
- The Chrome ↔ Firefox split rationale
- That this is doc-only — no code, no tests
