# Store Listing Copy — Auto Rebaser v2.0.0

Reflects the SEO recommendations from `docs/STORE_LISTING_REWRITES.md` (2026-05-09 audit) plus the v2 surface area. Both the Chrome Web Store and AMO accept listing edits without a rebuild, so this copy can land independent of the v2 zip upload.

## Title

```
Auto Rebaser — GitHub PR Auto-Rebase, Auto-Merge & Multi-Account
```

(63 chars. Under Chrome's 75-char limit and well under AMO's 50-char soft cap is preferable; for AMO use the fallback below.)

AMO fallback (≤50 chars):

```
Auto Rebaser — GitHub PR Auto-Rebase & Merge
```

(44 chars)

## Short description (≤132 chars, both stores)

```
Auto-rebase GitHub pull requests, auto-merge, multi-account, reviewer dashboard — runs in your browser, no servers, no telemetry.
```

(127 chars. Front-loads three high-intent verb phrases + v2's multi-account angle, ends on the privacy hook that differentiates from server-based bots.)

### Alternative short descriptions

```
Multi-account GitHub PR housekeeping: auto-rebase, auto-merge, reviewer dashboard, push-since-approval alerts. No servers.
```

(124 chars)

```
Stop clicking "Update branch." Browser-side GitHub PR auto-rebase, auto-merge, reviewer dashboard. Multi-account, no servers.
```

(126 chars)

## Detailed description (Chrome / Firefox)

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

## Categories

- **Chrome Web Store**: Developer Tools (primary)
- **Firefox AMO**: Other > Developer Tools

## Tags / keywords (order matters — most relevant first)

```
github, pull request, pr, rebase, auto-merge, auto-rebase, multi-account,
code review, reviewer, git, merge, branch, developer tools,
github automation, developer productivity, github enterprise, ghes
```

## Required URLs

- **Privacy policy URL**: https://bradygrapentine.github.io/auto-rebaser/PRIVACY
- **Support / homepage URL**: https://github.com/bradygrapentine/auto-rebaser
- **Source URL** (Firefox requires this for review): https://github.com/bradygrapentine/auto-rebaser

## Promo / screenshot assets

Required dimensions:

| Asset | Chrome Web Store | Firefox AMO |
|---|---|---|
| Icon | 128×128 (already at `icons/icon128.png`) | 64×64 (Firefox auto-resizes from 128) |
| Screenshots | 1280×800 or 640×400 (1+ required, max 5) | 1280×800 (max 10, no min count) |
| Small promo tile | 440×280 (Chrome only, optional but recommended) | n/a |
| Large promo tile | 920×680 or 1400×560 (Chrome optional) | n/a |
| Marquee promo tile | 1400×560 (Chrome optional, top-tier listings) | n/a |

For the v2-specific screenshot shopping list see `docs/runbooks/v2-screenshots-checklist.md`. Captioned screenshots (overlay 6-8 words) rank better than uncaptioned — engagement signal feeds back into store search position.

## Permission justifications (Chrome Web Store form)

The Chrome Web Store form asks you to justify each permission. Suggested copy:

- **`alarms`** — schedules the periodic poll of GitHub's `/search/issues` for the signed-in user's authored and reviewer PRs. Required so the extension keeps PR state up to date in the background.
- **`storage`** — persists per-account auth tokens, per-account settings, the cached PR list, the activity log, throttle state for one-click reviewer nudges, and the ETag cache that keeps `/search/issues` calls efficient. Required for the extension to remember anything across popup closes and service-worker restarts.
- **Host permission `https://api.github.com/*`** — the only host the extension contacts for non-GHES users. Required to poll PRs, fire rebase / auto-merge / branch-delete / thread-resolve mutations, and post reviewer ping comments.
- **Host permission `https://github.com/*`** — used for the GitHub App device-flow sign-in handoff (the user pastes a device code into github.com/login/device).
- **Optional host permission `https://*/*`** — requested at runtime only when the user configures a GitHub Enterprise Server host. Default OFF; only granted by users on self-hosted GitHub.
- **Optional permission `notifications`** — requested at runtime when the user opts in to desktop notifications. Default OFF; only granted by users who toggle notifications ON in settings.

`identity` is NOT requested — OAuth Device Flow uses direct `fetch` against the GitHub API and does not need `launchWebAuthFlow`.

## What I need to do per store

### Chrome Web Store

1. Go to https://chrome.google.com/webstore/devconsole.
2. Open the existing Auto Rebaser listing → **Package** tab → **Upload new package** → select `auto-rebaser-chrome.zip` (built per `docs/runbooks/v2-release.md` Step 2).
3. Confirm the parsed manifest: version `2.0.0`, permissions unchanged from v1.0.2 (no new install-time permissions in v2).
4. **Store listing** tab → paste the v2 short + detailed descriptions above. Re-upload screenshots from the v2 checklist.
5. **Distribution** tab → confirm visibility unchanged.
6. **Submit for review.** Existing-item update with no new permissions usually reviews in <24h.

### Firefox AMO

1. Go to https://addons.mozilla.org/developers/ → Auto Rebaser → **Submit a new version**.
2. Upload `auto-rebaser-firefox.zip`. Source zip required (built per `docs/runbooks/v2-release-firefox.md`).
3. Paste the v2 reviewer notes per `docs/runbooks/v2-release-firefox.md` Step 2 — call out the new opt-in `notifications` permission so reviewers don't flag it.
4. Re-upload screenshots if any have changed.
5. Submit. First v2 review: 1–7 days.

## GitHub repo SEO (free, while you're at it)

The repo's `About` block on GitHub gets indexed by GitHub's topic search. From the repo page → Settings (gear icon next to About) → add topics:

```
chrome-extension, firefox-extension, github-extension, pull-request, rebase,
auto-merge, multi-account, developer-tools, github-automation
```

These show up under https://github.com/topics/* and bring incidental traffic.
