# Auto Rebaser v2.0.0 — Store Submission + Announcement

End-to-end runbook for the post-release v2 push. Picks up where `docs/runbooks/v2-release.md` ended (tag pushed, GitHub release published, zips built at repo root). Walks through screenshots, Chrome Web Store listing finalization, Firefox AMO listing finalization, GitHub repo SEO, store approval wait, then announcement on HN / Reddit / X / Mastodon / Bluesky / LinkedIn.

> Note: v1 already shipped to both stores under `autorebaser@gmail.com` with a small install base. v2 is a substantial update push, not a debut. Announcement framing throughout treats v2 as a "what's new" rollout (no Show HN prefix on HN — see `docs/LAUNCH_POST_V2.md`). `> Cowork:` blocks delegate the per-channel posting work to a remote agent.

> Status (2026-05-15): v2.0.0 binary is already live on both stores. Chrome listing copy + screenshots reflect v2. **AMO listing metadata (copy + screenshots) is still v1-era** — §4 below covers the refresh. No version upload needed; only listing-page metadata edits.

## 1. Prerequisites

- [ ] On `main`, current with `origin/main`, working tree clean

```bash
git fetch origin && git status -s && git log --oneline -3
```

- [ ] `v2.0.0` tag is published and both store zips exist (for AMO source-zip rebuilds if needed)

```bash
git tag --list v2.0.0 && ls -lh auto-rebaser-chrome.zip auto-rebaser-firefox.zip
```

- [ ] `docs/STORE_LISTING.md` reflects v2 (short desc mentions multi-account; detailed desc includes the "Stop clicking 'Update branch.'" lead)
- [ ] `PRIVACY.md` and `docs/PRIVACY.md` reflect v2 (multi-account scoping table, notifications permission disclosure)
- [ ] `docs/LAUNCH_POST_V2.md` HN section is the non-Show-HN format (per PR #182)
- [ ] [GitHub release for v2.0.0](https://github.com/bradygrapentine/auto-rebaser/releases/tag/v2.0.0) is live with notes + both zips attached

## 2. Capture v2 screenshots

Manual — needs a real signed-in browser with both fixture accounts. Full shopping list with framing notes is in `docs/runbooks/v2-screenshots-checklist.md`.

- [ ] Both `bradygrapentine` and `bgrapentine` signed in to the unpacked v2 build in Chrome
- [ ] Popup window resized to ~400×600
- [ ] Capture canvas prepped (1280×800 backdrop in Preview / Photopea)
- [ ] **Shot 1**: multi-account switcher dropdown expanded — save as `marketing/chrome/screenshot-01-multi-account-switcher.png`
- [ ] **Shot 2**: PR list with `[updated]` / `[behind]` / `[pending]` state chips + one `idle Nd` pill — save as `screenshot-02-pr-list-with-state-chips.png`
- [ ] **Shot 3**: reviewer tab with 2–3 rows showing chip variants — save as `screenshot-03-reviewer-tab.png`
- [ ] **Shot 4**: PR row with `! re-review` chip rendered — save as `screenshot-04-push-since-approval.png`
- [ ] **Shot 5**: settings page showing global + this-account section headers in same frame — save as `screenshot-05-settings-split.png`
- [ ] **Shot 6**: activity log with filter set to `all accounts`, mixed entries — save as `screenshot-06-activity-log-with-filter.png`
- [ ] (Optional) Crush PNGs to keep listing weight down — requires `brew install optipng` first

```bash
optipng -o5 marketing/chrome/*.png marketing/firefox/*.png
```

- [ ] Copy Chrome shots into `marketing/firefox/` (Firefox AMO accepts identical screenshots if rendering matches)

```bash
cp marketing/chrome/*.png marketing/firefox/
```

> Note: macOS screenshot filenames use a non-breaking space (U+00A0) between the time and `AM`/`PM`, which trips up plain `mv 'Screenshot ... AM.png'`. Use a glob (`mv marketing/*'3.07.07'* marketing/chrome/screenshot-01-...png`) instead.

> Tip: popup-native screenshots are 1904 px tall, Chrome's preferred dimensions are 1280×800. Either submit as-is (accepted, just non-standard) or pad onto a 1280×800 backdrop with `sips`/Preview for a more polished look.

> Watch: don't include private repo names, internal PR titles, or coworkers' usernames/avatars. Use only `bradygrapentine/auto-rebaser-sandbox` and `bgrapentine/test-repo` PRs.

## 3. Chrome Web Store — verify v2 listing

The v2.0.0 binary is already published at [chromewebstore.google.com/detail/auto-rebaser/fcbanfgcfcjmhnoanachedlpbopiodpi](https://chromewebstore.google.com/detail/auto-rebaser/fcbanfgcfcjmhnoanachedlpbopiodpi). This section confirms the listing-page copy and screenshots reflect v2 and submits any pending listing edits.

- [ ] Open the [Auto Rebaser CWS dashboard page](https://chrome.google.com/webstore/devconsole) signed in as `autorebaser@gmail.com`
- [ ] Confirm published version: `2.0.0`, listing status **Published**
- [ ] **Store listing** tab — verify short description matches the v2 line from `docs/STORE_LISTING.md`:

```
Auto-rebase GitHub pull requests, auto-merge, multi-account, reviewer dashboard — runs in your browser, no servers, no telemetry.
```

- [ ] Verify detailed description matches the v2 version from `docs/STORE_LISTING.md` (starts with "Stop clicking 'Update branch.'")
- [ ] Verify title is `Auto Rebaser — GitHub PR Auto-Rebase, Auto-Merge & Multi-Account`
- [ ] Verify screenshots are the 6 v2 shots from `marketing/chrome/` (multi-account switcher visible in shot 1)
- [ ] **Privacy practices** tab — [privacy policy URL](https://bradygrapentine.github.io/auto-rebaser/PRIVACY) resolves and serves the v2-updated content
- [ ] If any of the above is stale, edit + **Submit listing changes** (separate review track from binary updates, usually clears <24h)

> Tip: listing-only edits (no package change) clear review faster than package updates. Don't bundle a copy fix with a future v2.0.1 — keep tracks separate.

## 4. Firefox AMO — listing metadata refresh

v2.0.0 binary is already live at [addons.mozilla.org/en-US/firefox/addon/auto-rebaser/](https://addons.mozilla.org/en-US/firefox/addon/auto-rebaser/), but the listing page still shows v1 copy and v1 screenshots. This section refreshes the listing metadata only — **no version upload required**.

- [ ] Open the [AMO developer hub](https://addons.mozilla.org/en-US/developers/) signed in as `autorebaser@gmail.com`
- [ ] Click **Auto Rebaser** → **Edit Product Page** (NOT "Submit a new version")

> Watch: AMO has two distinct edit flows — "Submit a new version" (binary upload, requires review) and "Edit Product Page" (metadata only, instant or near-instant). Use the second one. The first would trigger a needless v2.0.0-rebuild review cycle.

- [ ] **Summary** field — select all, delete, paste the v2 short description:

```
Auto-rebase GitHub pull requests, auto-merge, multi-account, reviewer dashboard — runs in your browser, no servers, no telemetry.
```

- [ ] **Description** field — select all, delete, paste the v2 detailed description:

```
Stop clicking "Update branch." Auto Rebaser keeps your open GitHub pull requests rebased, auto-merged, and tidy — entirely from your browser. No servers, no third-party services, no telemetry.

Sign in with one or more GitHub accounts (App auth recommended, or PAT) and the extension polls your authored PRs every few minutes and acts on them automatically:

• AUTO-REBASE pull requests whose base branch has moved ahead
• AUTO-MERGE PRs once checks pass, with configurable squash / rebase / merge preference
• AUTO-DELETE merged branches
• AUTO-RESOLVE outdated review threads
• PING idle reviewers with a one-click custom comment
• STALE-PR badge with configurable thresholds (1 / 7 / 14 / 30 / 60 days)

v2 adds the pieces I kept wanting after using v1 for a few months:

• MULTI-ACCOUNT — add multiple GitHub accounts to one install and switch from the popup header. Per-account error isolation (a 401 on one account doesn't take down the others). Per-account settings, per-account PR cache.
• REVIEWER DASHBOARD — second tab for PRs where you're a requested reviewer or assignee, with state chips for awaiting / approved / changes-requested / auto-merge-armed. Optional 4-gate conservative auto-merge per allowlisted repo.
• PUSH-SINCE-APPROVAL — PRs that got new commits after your last approval surface a one-click "re-review" chip.
• SETTINGS SPLIT — global (shared across accounts: ignored repos, keyboard shortcuts, GHES host) vs this-account (everything else). Switching accounts no longer trashes your per-repo opt-outs.
• REPO FILTER CHIP — narrow the popup PR list to a subset of repos. Persists per-account.
• DESKTOP NOTIFICATIONS (opt-in) — per-event toggles for rebased / conflicted / merged / idle / ping-confirmed. 1-hour throttle per (PR, event). Runtime-granted permission; default OFF.

Every action is logged to an audit page (200 entries / 30 days, with entry links to the PR). Every automation is opt-in except auto-rebase and auto-delete (safe defaults). Per-repo opt-out lists for every automation. Keyboard shortcuts: r=poll, s=settings, ?=help, j/k=navigate, Enter=open, Esc=back.

WHO IT'S FOR
Engineers who maintain a steady stream of pull requests across one or more GitHub accounts (work + personal, multiple orgs) on GitHub or GitHub Enterprise, and want their housekeeping (rebase, merge, branch cleanup, reviewer nudges, re-review chips) to happen on its own.

PRIVACY
Your tokens, settings, and PR cache live in chrome.storage. The extension contacts only api.github.com (or your configured GHES host). No analytics, no third-party servers, no data leaves your browser. Notifications are opt-in and dispatched locally by the browser. Source is public at https://github.com/bradygrapentine/auto-rebaser.

COMPARE TO
Server-based GitHub bots (Mergify, Kodiak, Bulldozer) require organization admin install, repo configuration, and pay-per-seat pricing. Auto Rebaser runs as a browser extension under your account, costs nothing, and works on any repo where you have push access — including GitHub Enterprise. v2's multi-account support means one install covers your work GitHub, your personal GitHub, and any other accounts you maintain.
```

- [ ] **Categories** — confirm only "Web Development" is checked. Don't add a second; the other dev-tool-adjacent options dilute targeting.
- [ ] **Email** — leave as `autorebaser@gmail.com`. Don't switch the contact email during this update; do that as a separate edit later if at all.
- [ ] **Website** — leave as `https://github.com/bradygrapentine/auto-rebaser`.

- [ ] **Screenshots** section — delete all 5 existing v1 shots, then upload these 8 v2 shots from `marketing/firefox/` in order. Shot 1 is the hero (AMO uses the first screenshot in search results) so the multi-account switcher must be first. For each, paste the caption into AMO's caption field after upload.

- [ ] Upload `marketing/firefox/screenshot-01-multi-account-switcher.png`

```
Multi-account switcher dropdown — toggle between GitHub accounts from the popup header.
```

- [ ] Upload `marketing/firefox/screenshot-02-pr-list-with-state-chips.png`

```
Authored PRs list with [updated] / [behind] / [pending] state chips and idle-day badges.
```

- [ ] Upload `marketing/firefox/screenshot-03-reviewer-tab.png`

```
Reviewer tab — PRs where you're a requested reviewer, with awaiting / approved / changes-requested chips.
```

- [ ] Upload `marketing/firefox/screenshot-05-settings-split.png`

```
Settings page split into global (shared) and this-account sections so account switching doesn't trash your opt-outs.
```

- [ ] Upload `marketing/firefox/screenshot-06-activity-log-with-filter.png`

```
Activity log filtered to "all accounts" — bounded 200-entry audit trail of every automated action.
```

- [ ] Upload `marketing/firefox/screenshot-07-keyboard-shortcuts.png`

```
Keyboard shortcuts overlay: r poll · s settings · j/k navigate · Enter open · ? help · Esc back.
```

- [ ] Upload `marketing/firefox/screenshot-08-automation-toggles.png`

```
Automation toggles per category — auto-rebase, auto-merge, auto-delete, auto-resolve, and per-repo opt-outs.
```

- [ ] Upload `marketing/firefox/screenshot-09-notifications-and-reviewer-toggles.png`

```
Opt-in desktop notifications and reviewer auto-merge gates — every automation is off by default and per-event configurable.
```

> Note: shot-04 (push-since-approval) is intentionally absent — shot 09 (notifications + reviewer toggles) covers the same territory.

- [ ] **Additional Details → Tags** — skip. AMO's Tags is a fixed consumer-category allowlist (ad blocker, dark mode, password manager, vpn, etc.) with no entries that fit a GitHub developer tool. Leave Tags as **None**. The Description text + Web Development category do the search-relevance work that Tags would do on CWS.

- [ ] Save all changes. AMO listing-only edits propagate near-instantly (no human review for metadata-only updates on an already-approved add-on).

- [ ] Verify in an incognito window: open the [public AMO listing](https://addons.mozilla.org/en-US/firefox/addon/auto-rebaser/) and confirm the new Summary renders and the multi-account switcher is the first screenshot.

> Ask: "fetch https://addons.mozilla.org/en-US/firefox/addon/auto-rebaser/ and report the rendered Summary text and the first 3 lines of Description. If the text mentions multi-account and reviewer dashboard, report 'REFRESHED'. Otherwise report 'STALE' and quote what the page actually contains."

## 5. GitHub repo SEO

Free indexed traffic via [github.com/topics](https://github.com/topics).

- [ ] Open the [Auto Rebaser repo](https://github.com/bradygrapentine/auto-rebaser)
- [ ] Click the gear icon next to **About** in the right sidebar
- [ ] Add topics (most-relevant first):

```
chrome-extension, firefox-extension, github-extension, pull-request, rebase,
auto-merge, multi-account, developer-tools, github-automation
```

- [ ] Verify the About block lists them
- [ ] Confirm the "Website" field points to the Chrome Web Store listing URL

## 6. Confirm both listings are v2-current

- [ ] Chrome Web Store listing renders v2 copy + v2 screenshots (verified in §3)
- [ ] AMO listing renders v2 copy + v2 screenshots (verified in §4 after edit propagates)
- [ ] Install fresh on a clean Chrome profile from the store and verify version `2.0.0` in popup footer
- [ ] Install fresh on a clean Firefox profile and same check
- [ ] **Capture both live URLs** for every announcement post below:
  - Chrome: `https://chromewebstore.google.com/detail/auto-rebaser/fcbanfgcfcjmhnoanachedlpbopiodpi`
  - Firefox: `https://addons.mozilla.org/en-US/firefox/addon/auto-rebaser/`

> Ask: "in ~/projects/auto-rebaser, fetch both store URLs above and confirm both list version 2.0.0. Report back with both URLs and the rendered short description for each, so I can spot any remaining staleness before announcing."

## 7. Announce on Hacker News

Per [docs/LAUNCH_POST_V2.md](../LAUNCH_POST_V2.md) § Hacker News. **Not** Show HN — v1 already shipped at this URL.

- [ ] Pick the post window: Tuesday or Wednesday, 8–10am Pacific
- [ ] Confirm the live Chrome Web Store URL is captured for the comment
- [ ] Submit to [news.ycombinator.com/submit](https://news.ycombinator.com/submit):
   - **URL**: `https://github.com/bradygrapentine/auto-rebaser`
   - **Title**: `Auto Rebaser v2 – browser-side GitHub PR housekeeping, now multi-account` (74 chars)

> Cowork: "Open `~/projects/auto-rebaser/docs/LAUNCH_POST_V2.md`. Take the body of the HN section (the part inside the ``` block under 'Body (the first comment...)'). Replace `<store URL>` with the live Chrome Web Store URL I'll paste at the end of this message, and `<AMO URL>` with the live AMO URL. Format for HN (no markdown bold/headers — HN uses plain text with paragraph breaks and `-` for bullets). Return the final text in a single code block ready to paste. Live URLs: <CHROME_URL> <AMO_URL>"

- [ ] Paste the prepared comment as the first reply under your own submission
- [ ] Stay in the thread for 2–3 hours — engagement (replies to genuine questions) keeps it on the front page

> Tip: if asked "wait, didn't this already exist?" — answer honestly: yes, v1 shipped quietly last year, v2 felt worth surfacing because of the multi-account + reviewer-dashboard work. The "didn't this exist" question is in the FAQ at the bottom of LAUNCH_POST_V2.md.

> Watch: don't engage with bad-faith comments. Engage with sincere technical questions. If a mod retags as `[Show HN]`, leave it; just don't self-prefix.

## 8. Announce on Reddit

Three subreddits, slightly different tone for each. Cowork can adapt the same source post per channel.

### 8a. r/github

- [ ] Open [r/github submit](https://www.reddit.com/r/github/submit) (text post)

> Cowork: "Open `~/projects/auto-rebaser/docs/LAUNCH_POST_V2.md` § Reddit. Adapt the body for r/github specifically: terse, technical, leads with the multi-account feature since that subreddit cares most about workflow tools. Title: 'Auto Rebaser v2 — browser extension for multi-account GitHub PR housekeeping (no servers)'. Replace <store URL> and <AMO URL> placeholders with the URLs at the end of this message. Return the title and body in two separate code blocks ready to paste. Live URLs: <CHROME_URL> <AMO_URL>"

- [ ] Paste, submit, stay for replies

### 8b. r/webdev

- [ ] Open [r/webdev submit](https://www.reddit.com/r/webdev/submit)

> Cowork: "Open `~/projects/auto-rebaser/docs/LAUNCH_POST_V2.md` § Reddit. Adapt for r/webdev: lead with the engineering tradeoff (browser-side vs server-based bots), since r/webdev rewards a learning-angle post over a feature list. Title: 'Built a browser extension that runs GitHub PR housekeeping client-side (no servers) — v2 ships multi-account'. Body: ~150 words, focus on the design choice. Use the URLs at the end of this message. Return title and body in two separate code blocks. Live URLs: <CHROME_URL> <AMO_URL>"

- [ ] Paste, submit, stay for replies

### 8c. r/programming

- [ ] Open [r/programming submit](https://www.reddit.com/r/programming/submit) (link post pointing to the GitHub repo)

> Cowork: "Open `~/projects/auto-rebaser/docs/LAUNCH_POST_V2.md`. r/programming is link-only — no body, just a title. Pick the most compelling title from the LAUNCH_POST_V2 candidates (or improve them): the title needs to telegraph a specific engineering choice (e.g. 'GitHub PR housekeeping via Manifest V3 extension instead of a server-side bot — v2 adds multi-account'). Return three title candidates ranked by predicted upvote-to-comment ratio."

- [ ] Pick a title, submit `https://github.com/bradygrapentine/auto-rebaser` as the link
- [ ] Be ready to defend the design choice in comments

> Watch: r/programming downvotes anything that smells like self-promotion. Stay strictly on the technical-choice angle.

## 9. Announce on X / Mastodon / Bluesky

Per LAUNCH_POST_V2 § X / Mastodon / Bluesky. Single post per platform.

- [ ] Confirm live store URL is in your clipboard

> Cowork: "Open `~/projects/auto-rebaser/docs/LAUNCH_POST_V2.md` § X / Mastodon / Bluesky. Take the source post and produce three platform-specific variants: (1) X — 280 chars max, no hashtags in the body. (2) Mastodon — 500 chars, add `#GitHub #DevTools #BrowserExtension` at the bottom. (3) Bluesky — 300 chars, add `#github` and `#opensource`. All three include the live Chrome Web Store URL at the end. Live URL: <CHROME_URL>. Return as three code blocks labeled `X:`, `Mastodon:`, `Bluesky:`."

- [ ] Post to [X](https://x.com/compose/post)
- [ ] Post to [Mastodon](https://mastodon.social/) (or your chosen instance)
- [ ] Post to [Bluesky](https://bsky.app/)
- [ ] Pin each to profile for ~1 week

## 10. Announce on LinkedIn

Engineering-tradeoff angle. LinkedIn rewards "I learned X" framing over feature dumps.

- [ ] Open [LinkedIn share](https://www.linkedin.com/feed/?shareActive=true) (or use the create-post button)

> Cowork: "Open `~/projects/auto-rebaser/docs/LAUNCH_POST_V2.md` § LinkedIn. Polish the existing draft: keep the server-vs-browser-extension tradeoff as the lead, tighten the v2 feature list to 3 bullets max, end with a soft CTA ('open source, link in comments'). Add a separate first-comment text that contains the actual links (LinkedIn deprioritizes posts with outbound links in the body; put them in a self-comment instead). Live URL: <CHROME_URL>. Return two code blocks: 'Post body:' and 'First comment:'."

- [ ] Paste the post body, submit
- [ ] Immediately self-comment with the link block
- [ ] Tag relevant hashtags: `#github #engineering #devtools`

> Tip: post LinkedIn on Day 2 (after HN + Reddit have absorbed the first wave). LinkedIn's algorithm rewards engagement over ~24h windows so spacing this out doesn't cost reach.

## 11. Post-announcement monitoring

- [ ] Watch the GitHub repo for new stars / issues / PRs in the 48h after each announcement
- [ ] Watch the Chrome Web Store install count daily for the first week

> Ask: "in ~/projects/auto-rebaser, hit `gh api repos/bradygrapentine/auto-rebaser` and report star count, open issue count, watcher count. Run it now to set a baseline I'll diff against later."

- [ ] Reply to install-base feedback within 24h while it's hot
- [ ] Check Chrome Web Store reviews tab daily for the first week
- [ ] Update [LAUNCH_PLAN.md history](../LAUNCH_PLAN.md) with install counts at Day 7

## 12. Sign-off

- [ ] v2.0.0 live on Chrome Web Store with v2 listing copy + screenshots (URL captured + verified)
- [ ] v2.0.0 live on Firefox AMO with v2 listing copy + screenshots (URL captured + verified)
- [ ] HN submission posted with first-comment context
- [ ] Reddit posts in r/github, r/webdev, r/programming
- [ ] X / Mastodon / Bluesky posts live + pinned
- [ ] LinkedIn post + first-comment link
- [ ] GitHub repo topics updated
- [ ] Day-7 install / review snapshot captured to LAUNCH_PLAN.md

> Note: a v2.0.1 patch release would skip §4 (AMO copy already refreshed) and §5 + §11 (topics already set, monitoring continues from baseline). Both stores accept in-place package replacements; CWS within 24h of submit, AMO via "Submit a new version".
