# Store listing description — v2.1.0

_Paste target: Chrome Web Store "Description" + Firefox AMO "Description". Kept in sync with the live feature set; update on each release that changes user-visible behavior._

**Store variants:** the body below is the Chrome version. For **Firefox AMO**, change the one storage reference in the PRIVACY section — "live in chrome.storage" → "live in browser storage" (everything else is identical). AMO Summary field limit is 250 chars; CWS has no per-version changelog field, so the Description is the only user-facing copy on both stores.

---

**Short tagline**

Auto-rebase GitHub pull requests, surface the ones that need you, auto-merge, multi-account, reviewer dashboard — runs in your browser, no servers, no telemetry.

---

**Description**

Stop clicking "Update branch." Auto Rebaser keeps your open GitHub pull requests rebased, auto-merged, and tidy — and surfaces the ones that actually need your hand — entirely from your browser. No servers, no third-party services, no telemetry.

Sign in with one or more GitHub accounts (App auth recommended, or PAT) and the extension polls your authored PRs every few minutes and acts on them automatically:

• AUTO-REBASE pull requests whose base branch has moved ahead — and hold off when required checks are red instead of rebasing into a known-broken branch
• AUTO-MERGE PRs once checks pass, with configurable squash / rebase / merge preference
• AUTO-DELETE merged branches
• AUTO-RESOLVE outdated review threads
• PING idle reviewers with a one-click custom comment
• STALE-PR badge with configurable thresholds (1 / 7 / 14 / 30 / 60 days)

NEW IN v2.1

• "NEEDS YOU" TRIAGE — a section at the top of the popup that collects only the PRs waiting on you: merge conflicts, rebase-rejected branches, PRs that need a manual resolve, and push-since-approval re-reviews. Each row deep-links straight to where the work is. PRs the automations already handle stay out of it.
• AUTOMATION FILTERS (opt-in) — scope which PRs the cleanup automations touch: allow/deny by repo, skip draft PRs, include/exclude by label. Filtered PRs stay visible in your list — the automations just skip them quietly. Label fields autocomplete from the labels already on your PRs.
• CI-AWARE REBASING — when CI is the blocker, the PR row shows the failing check names, clickable through to the run (trusted GitHub / GHES links only). Notifications deep-link straight to the PR they're about.

FROM v2

• MULTI-ACCOUNT — add multiple GitHub accounts to one install and switch from the popup header. Per-account error isolation (a 401 on one account doesn't take down the others). Per-account settings, per-account PR cache.
• REVIEWER DASHBOARD — second tab for PRs where you're a requested reviewer or assignee, with state chips for awaiting / approved / changes-requested / auto-merge-armed. Optional 4-gate conservative auto-merge per allowlisted repo.
• PUSH-SINCE-APPROVAL — PRs that got new commits after your last approval surface a one-click "re-review" chip.
• SETTINGS SPLIT — global (shared across accounts: ignored repos, keyboard shortcuts, GHES host) vs this-account (everything else). Switching accounts no longer trashes your per-repo opt-outs.
• REPO FILTER — narrow the popup PR list to a subset of repos. Persists per-account.
• DESKTOP NOTIFICATIONS (opt-in) — per-event toggles for rebased / conflicted / merged / idle / ping-confirmed. Per-account throttle. Runtime-granted permission; default OFF.

Every action is logged to an audit page (200 entries / 30 days, with entry links to the PR). Every automation is opt-in except auto-rebase and auto-delete (safe defaults). Per-repo opt-out lists for every automation. Keyboard shortcuts: r=poll, s=settings, ?=help, j/k=navigate, Enter=open, Esc=back.

WHO IT'S FOR
Engineers who maintain a steady stream of pull requests across one or more GitHub accounts (work + personal, multiple orgs) on GitHub or GitHub Enterprise, and want their housekeeping (rebase, merge, branch cleanup, reviewer nudges, re-review chips) to happen on its own — while the handful of PRs that need a human decision get pushed to the top instead of buried.

PRIVACY
Your tokens, settings, and PR cache live in chrome.storage; the short-lived GitHub App access token is held in session storage. The extension contacts only api.github.com (or your configured GHES host). No analytics, no third-party servers, no data leaves your browser. Notifications are opt-in and dispatched locally by the browser. Source is public at https://github.com/bradygrapentine/auto-rebaser.

COMPARE TO
Server-based GitHub bots (Mergify, Kodiak, Bulldozer) require organization admin install, repo configuration, and pay-per-seat pricing. Auto Rebaser runs as a browser extension under your account, costs nothing, and works on any repo where you have push access — including GitHub Enterprise. Multi-account support means one install covers your work GitHub, your personal GitHub, and any other accounts you maintain.
