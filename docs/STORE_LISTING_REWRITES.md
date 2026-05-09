# Store Listing Audit + Rewrites

**Audit date:** 2026-05-09
**Compares:** current copy in `docs/STORE_LISTING.md` (already submitted) vs SEO-optimized rewrites for the next listing update.

---

## Audit findings

| Field | Current | Issue | Fix |
|---|---|---|---|
| **Title** | "Auto Rebaser" | Brand-only; misses every search keyword. Chrome Web Store search heavily weights title tokens. | Add keyword tail: `Auto Rebaser — GitHub Pull Request Auto-Rebase & Auto-Merge` |
| **Short description (132 char limit)** | Starts "Automatically rebases your open GitHub PRs…" | First 60 chars is what renders in tile previews; "PRs" is fine but "GitHub" and "pull request" should both appear in the first 60 chars. | Front-load both: `Auto-rebase GitHub pull requests, auto-merge, auto-delete branches — runs in your browser, no servers.` (108 chars) |
| **Long description opener** | "Auto Rebaser keeps your open GitHub pull requests up to date…" | Brand-first. Searchers don't know the brand yet. | Lead with the verb + object: `Stop clicking "Update branch." Auto Rebaser keeps your open GitHub pull requests rebased, auto-merged, and tidy.` |
| **Keywords / tags** | github, pull request, rebase, auto-merge, developer tools, code review | Solid core, missing high-volume adjacents. | Add: `git`, `merge`, `branch`, `code review tools`, `developer productivity`, `github automation` |
| **Categories** | Developer Tools (both stores) | Correct. | No change. |
| **Screenshots** | Listed as ideas, no captions specified | Stores rank engagement; captioned screenshots get more clicks → more installs → higher rank. | Add 6-word captions overlaid on each (see below). |

### Marketplace listing (already submitted) — what to update on next iteration

The Chrome Web Store and AMO let you edit listing copy without resubmitting the build. After the current review clears, swap in the rewrites below — no version bump needed.

---

## Rewrites

### Title

```
Auto Rebaser — GitHub Pull Request Auto-Rebase & Auto-Merge
```

(57 chars, well under Chrome's 75-char limit and AMO's 50-char soft cap. If AMO truncates, fallback: `Auto Rebaser — GitHub PR Auto-Rebase & Merge` — 44 chars.)

### Short description (≤132 chars)

```
Auto-rebase GitHub pull requests, auto-merge, auto-delete branches — runs in your browser, no servers, no telemetry.
```

(116 chars. Front-loads three high-intent verb phrases, ends on a privacy hook that differentiates from server-based bots like Mergify.)

### Detailed description

```
Stop clicking "Update branch." Auto Rebaser keeps your open GitHub pull requests rebased, auto-merged, and tidy — entirely from your browser. No servers, no third-party services, no telemetry.

Sign in once with the GitHub App (recommended) or a Personal Access Token. The extension polls your authored PRs every few minutes and acts on them automatically:

• AUTO-REBASE pull requests whose base branch has moved ahead
• AUTO-MERGE PRs once checks pass, with configurable squash / rebase / merge preference
• AUTO-DELETE merged branches
• AUTO-RESOLVE outdated review threads
• PING idle reviewers with a one-click custom comment
• STALE-PR badge with configurable thresholds (1 / 7 / 14 / 30 / 60 days)

Every action is logged to an audit page. Every automation is opt-in (auto-rebase and auto-delete are safe defaults). Per-repo opt-out lists for everything. Keyboard shortcuts: r=poll, s=settings, j/k=navigate, Enter=open.

WHO IT'S FOR
Engineers who maintain a steady stream of pull requests on GitHub or GitHub Enterprise, and want their housekeeping (rebase, merge, branch cleanup, reviewer nudges) to happen on its own.

PRIVACY
Your token, settings, and PR cache live in chrome.storage. The extension contacts only api.github.com (or your configured GHES host). No analytics, no third-party servers, no data leaves your browser. Source is public at https://github.com/bradygrapentine/auto-rebaser.

COMPARE TO
Server-based GitHub bots (Mergify, Kodiak, Bulldozer) require organization admin install, repo configuration, and pay-per-seat pricing. Auto Rebaser runs as a browser extension under your account, costs nothing, and works on any repo where you have push access — including GitHub Enterprise.
```

The "COMPARE TO" block is optional but useful — searchers comparing to known competitors will hit Auto Rebaser by name in the listing index.

### Tags / keywords (expanded)

```
github, pull request, pr, rebase, auto-merge, auto-rebase, git, merge, branch,
developer tools, code review, github automation, developer productivity,
github enterprise, ghes
```

(Order matters in Chrome Web Store metadata — most relevant first.)

### Screenshot captions

| # | Frame | Caption overlay |
|---|---|---|
| 1 | Popup with mixed-state PRs | "Open PRs at a glance — rebased, behind, idle" |
| 2 | Activity log | "Every action logged. Audit-friendly." |
| 3 | Settings expanded | "Per-repo opt-outs for every automation" |
| 4 | Sign-in view | "GitHub App or PAT — your choice" |
| 5 | Ping reviewers confirm | "One click. Custom comment template." |
| 6 (NEW) | Datalist autocomplete in skip-list (PR #64) | "Type a repo — autocomplete from your open PRs" |

Screenshot 6 is new for the next release — surfaces the autocomplete feature that just shipped.

---

## What to actually do

1. **Now (no version bump needed):** edit the existing Chrome Web Store + AMO listings — title, short desc, long desc, tags. Both stores accept listing edits without rebuild.
2. **Next release (v1.0.3 or v2.0.0):** add the autocomplete screenshot.
3. **Repo side:** add GitHub topics — go to repo → "About" → gear icon → add: `chrome-extension`, `firefox-extension`, `github-extension`, `pull-request`, `rebase`, `auto-merge`, `developer-tools`. Free SEO via GitHub's topic index.
