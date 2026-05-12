# Store Listing Copy — Auto Rebaser v1.0.0

## Short description (≤132 chars, both stores)

> Automatically rebases your open GitHub PRs when they fall behind their base branch — plus opt-in PR housekeeping automations.

(127 chars)

## Detailed description (Chrome / Firefox)

```
Auto Rebaser keeps your open GitHub pull requests up to date without you ever clicking "Update branch."

Sign in once with the GitHub App (or a Personal Access Token) and the extension polls your authored PRs every few minutes. When a PR falls behind its base branch, it gets rebased automatically. When it merges, the branch can be deleted automatically. When auto-merge is allowed on the repo, it can be enabled automatically. When a review thread becomes outdated, it can be resolved automatically. When a PR sits idle, you can ping its reviewers with one click.

Every action is logged to the activity page so you can audit what the extension has done on your behalf. Every automation is opt-in (except auto-rebase and auto-delete, which are safe defaults). No telemetry, no third-party services — the extension only talks to github.com (or your configured GitHub Enterprise host) using your token.

FEATURES
• Auto-rebase PRs whose base branch has moved ahead
• Auto-delete merged branches
• Auto-enable auto-merge with configurable method preference (squash / rebase / merge)
• Auto-resolve review threads that no longer have an anchor line
• Stale-PR badge with configurable idle threshold (1 / 7 / 14 / 30 / 60 days)
• One-click "ping reviewers" with custom comment template
• Per-repo opt-out lists for every automation
• Keyboard shortcuts: r=poll, s=settings, ?=help, j/k=navigate, Enter=open, Esc=back
• Bounded activity log (200 entries / 30 days), entries link to their PR
• GitHub App auth (recommended) or PAT (legacy)

PRIVACY
The extension stores your token, settings, and a list of your authored PRs in chrome.storage. It contacts only api.github.com (or your configured GHES host). No analytics, no third-party servers, no data leaves your browser. Source is public at https://github.com/bradygrapentine/auto-rebaser.

WHO IT'S FOR
Engineers who maintain a steady stream of open PRs and want their housekeeping (rebase / merge / branch cleanup / nudges) to happen on its own.
```

## Categories

- **Chrome Web Store**: Developer Tools (primary)
- **Firefox AMO**: Other > Developer Tools

## Tags / keywords

`github`, `pull request`, `rebase`, `auto-merge`, `developer tools`, `code review`

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

Screenshot ideas (1280×800, take with the popup at 400px wide framed against a relevant github.com page):

1. Popup showing 3-5 PRs grouped by repo, one with `[updated]`, one with `[behind]`, one with `idle 3d` + `ping ↗`.
2. Activity log page with mixed actions (rebase, branch_deleted, auto_merge_enabled, thread_resolved, reviewer_pinged) showing entry links.
3. Settings page expanded showing automation toggles + per-repo skip lists + merge-method preference reorder.
4. Sign-in page showing "Sign in with GitHub App" + "Sign in with PAT" options.
5. Ping reviewers confirmation view with rendered comment template.

## What I need to do per store

### Chrome Web Store
1. Go to https://chrome.google.com/webstore/devconsole, pay $5 dev fee if first time.
2. New Item → upload `auto-rebaser-chrome.zip`.
3. Fill in description, screenshots, promo tile, privacy URL, category.
4. Justify each permission in the form (`alarms` for polling, `storage` for settings/cache, `optional_host_permissions` for custom GHES hosts). `identity` is NOT requested — OAuth Device Flow uses direct `fetch` against the GitHub API and does not need `launchWebAuthFlow`.
5. Submit for review. Typical review time: <1 day for simple extensions.

### Firefox AMO
1. Go to https://addons.mozilla.org/developers/.
2. Submit new add-on → upload `auto-rebaser-firefox.zip` → choose "Listed" distribution.
3. Same listing fields as Chrome.
4. Source code submission required (since the build is minified) — upload a source zip of the `src/` tree or point to GitHub.
5. Submit for review. First review: 1-7 days.
