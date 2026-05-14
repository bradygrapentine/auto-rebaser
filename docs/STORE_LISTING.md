# Store Listing Copy — Auto Rebaser v2.0.0

## Short description (≤132 chars, both stores)

> Multi-account GitHub PR housekeeping: auto-rebase, auto-merge, reviewer dashboard, push-since-approval alerts. No servers.

(126 chars)

### Alternative short descriptions

> Keep your GitHub PRs rebased and merged automatically. Multi-account, reviewer dashboard, push-since-approval, no servers.

(124 chars)

> Browser-side GitHub PR automation: auto-rebase, auto-merge, reviewer dashboard, multi-account, push-since-approval alerts.

(124 chars)

## Detailed description (Chrome / Firefox)

```
Auto Rebaser keeps your open GitHub pull requests up to date without you ever clicking "Update branch."

Sign in with one or more GitHub accounts (App auth recommended, or PAT) and the extension polls your authored PRs every few minutes. When a PR falls behind its base branch, it gets rebased automatically. When it merges, the branch can be deleted automatically. When auto-merge is allowed on the repo, it can be enabled automatically. When a review thread becomes outdated, it can be resolved automatically. When a PR sits idle, you can ping its reviewers with one click.

v2 adds a second tab for PRs where you're a requested reviewer, with state chips for awaiting / approved / changes-requested / auto-merge-armed and an optional conservative auto-merge for repos you trust. PRs that received new commits after their last approval surface a "re-review" chip so nothing slips by. Settings split into global (shared across accounts) and per-account, so each login keeps its own opt-outs.

Every action is logged to the activity page so you can audit what the extension has done on your behalf. Every automation is opt-in (except auto-rebase and auto-delete, which are safe defaults). No telemetry, no third-party services — the extension only talks to github.com (or your configured GitHub Enterprise host) using your token.

WHAT'S NEW IN v2
• Multi-account support — add multiple GitHub accounts to one install and switch from the popup header. Per-account error isolation (a 401 on one account doesn't take down the others).
• Reviewer dashboard tab — PRs where you're a requested reviewer or assignee, with state chips and optional 4-gate auto-merge per allowlisted repo.
• Push-since-approval badge — PRs that got new commits after your last approval get a one-click re-review-request chip.
• Settings split — global (shared) vs this-account (per-login) settings. Each account keeps its own opt-out lists.
• Header repo-filter chip — narrow the popup PR list to a subset of repos. Persists per-account.
• Desktop notifications (opt-in) — per-event toggles for rebased / conflicted / merged / idle / ping-confirmed. 1-hour throttle per (PR, event).
• Stale-PR ping with one-click @-mention of requested reviewers.

CORE FEATURES (from v1, still here)
• Auto-rebase PRs whose base branch has moved ahead
• Auto-delete merged branches
• Auto-enable auto-merge with configurable method preference (squash / rebase / merge)
• Auto-resolve review threads that no longer have an anchor line
• Per-repo opt-out lists for every automation
• Keyboard shortcuts: r=poll, s=settings, ?=help, j/k=navigate, Enter=open, Esc=back
• Bounded activity log (200 entries / 30 days), entries link to their PR
• GitHub App auth (recommended) or Personal Access Token
• Works with GitHub Enterprise Server (configurable host)

PRIVACY
The extension stores your tokens, settings, and a list of your authored PRs in chrome.storage. It contacts only api.github.com (or your configured GHES host). No analytics, no third-party servers, no data leaves your browser. Notifications are opt-in and dispatched locally by the browser. Source is public at https://github.com/bradygrapentine/auto-rebaser.

WHO IT'S FOR
Engineers who maintain a steady stream of open PRs across one or more GitHub accounts (work + personal, multiple orgs) and want their housekeeping (rebase / merge / branch cleanup / reviewer nudges / re-review chips) to happen on its own without standing up a server-side bot.
```

## Categories

- **Chrome Web Store**: Developer Tools (primary)
- **Firefox AMO**: Other > Developer Tools

## Tags / keywords

`github`, `pull request`, `rebase`, `auto-merge`, `code review`, `reviewer`, `multi-account`, `developer tools`

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

For the v2-specific screenshot shopping list see `docs/runbooks/v2-screenshots-checklist.md`.

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
