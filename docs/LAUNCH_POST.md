# Launch Posts

Three flavors. Pick based on venue. All assume the Chrome Web Store + AMO listings are live.

---

## Hacker News — Show HN

**Title (80-char limit):**

```
Show HN: Auto Rebaser – browser extension that keeps your GitHub PRs rebased
```

**Body:**

```
Auto Rebaser is a Chrome/Firefox extension that polls your authored GitHub pull requests every few minutes and rebases them automatically when their base branch moves ahead. It also handles auto-merge, branch deletion after merge, resolving outdated review threads, and one-click reviewer pings.

I built it because the existing options are server-based bots (Mergify, Kodiak, Bulldozer) that require org-admin install, repo config, and per-seat pricing. I wanted the same housekeeping for personal repos and side projects without standing up a service. Browser extension turned out to be a clean fit: runs under my account, talks only to api.github.com, no servers to host, works on GitHub Enterprise.

A few design notes that might be interesting:

- Manifest V3 service worker for the polling loop. Alarms API survives the worker getting killed; storage round-trip on every wake is fine because the data is tiny.
- GitHub App auth via OAuth Device Flow (no client secret leaks in a public extension), with a PAT fallback.
- Every automation is opt-in with per-repo skip lists, so you can enable auto-merge globally but keep it off for a couple of repos.
- Audit log of every action the extension takes, capped at 200 entries / 30 days.

Source: https://github.com/bradygrapentine/auto-rebaser
Chrome: <store URL once approved>
Firefox: <AMO URL once approved>

Happy to answer questions about MV3 quirks, Device Flow in extensions, or why polling instead of webhooks (TL;DR: webhooks need a public endpoint).
```

**Posting notes:**
- Post Tuesday/Wednesday morning Pacific (highest weekday traffic).
- Don't link-bomb. One link to source, one each to the stores.
- Be present in the thread for the first 2-3 hours — engagement keeps it on the front page.

---

## Reddit — r/github (or r/webdev / r/programming)

**Title:**

```
I built a browser extension that auto-rebases your GitHub PRs (no servers, no fees)
```

**Body:**

```
Sharing a side project I've been using daily for a few months: **Auto Rebaser**, a Chrome/Firefox extension that watches your open pull requests and auto-rebases, auto-merges, and cleans them up.

**What it does:**
- Polls your authored PRs every few minutes (configurable: 1–240 min)
- Auto-rebases when the base branch is ahead
- Auto-enables auto-merge with squash/rebase/merge preference
- Auto-deletes merged branches
- Auto-resolves outdated review threads
- One-click "ping reviewers" with a custom comment
- Stale-PR badge with configurable threshold

**What it doesn't do:**
- No servers — runs entirely in the browser, talks only to api.github.com (or your GHES host)
- No telemetry, no analytics
- No paid tiers

GitHub App auth (recommended) or a Personal Access Token. Source on GitHub. Free.

Chrome: <store URL>
Firefox: <AMO URL>
GitHub: https://github.com/bradygrapentine/auto-rebaser

Curious to hear what other GitHub-flow nits people would want automated next.
```

**Posting notes:**
- r/github is small but on-topic and high-conversion.
- r/webdev and r/programming are larger but require an interesting hook beyond "I made an extension." Lead with the design tradeoff (browser vs server).
- Avoid r/SideProject — low-quality traffic and Reddit auto-spams it.

---

## X / LinkedIn (single post)

```
Shipped a small thing: Auto Rebaser — Chrome + Firefox extension that auto-rebases and auto-merges your GitHub PRs.

No servers. No org-admin install. No per-seat pricing. Just installs under your account and runs.

Open source: https://github.com/bradygrapentine/auto-rebaser
```

**Posting notes:**
- Pin to profile for ~1 week post-launch.
- LinkedIn version: same copy, add 1 sentence on the engineering tradeoff (server-based bots vs browser extension) — LinkedIn rewards a learning angle.

---

## Sequence

1. **Day 0 (post-store-approval):** confirm both store URLs work in incognito.
2. **Day 0 evening:** post to X/LinkedIn first (low-stakes, primes the install graph).
3. **Day 1 morning Pacific:** Show HN. Stay in the thread for 2-3 hours.
4. **Day 1 afternoon:** if HN didn't catch, cross-post to r/github + r/webdev. If HN did catch, hold Reddit for Day 3.
5. **Day 7:** post install/review counts to LAUNCH_PLAN.md history.

## What to skip

- Product Hunt — fee + low-relevance audience for a dev tool.
- Press / blog outreach — not enough surface area for a single extension.
- Paid ads — install conversion economics don't work for a free extension.
