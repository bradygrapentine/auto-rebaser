# Launch Posts — v2.0.0

Companion to `docs/LAUNCH_POST.md`. v1 is already in the Chrome Web Store + Firefox AMO with install base; v2 is a substantial update push, not a debut. Posts here are framed accordingly — no "Show HN" prefix on HN (that's reserved for first-time launches; reusing it on a v2 is the kind of thing dang flags).

---

## Hacker News — regular submission (not Show HN)

**Title (80-char limit):**

```
Auto Rebaser v2 – browser-side GitHub PR housekeeping, now multi-account
```

(74 chars)

Alternative title (front-loads the differentiator):

```
Multi-account GitHub PR housekeeping as a browser extension (no servers)
```

(72 chars)

**Body (the first comment, posted by the submitter immediately after the URL post):**

> HN doesn't have a formal "[Update]" prefix; the convention is to post the project URL as a regular link submission, then leave a top-comment with context. Keep the title descriptive, not promotional.

```
Author here. Auto Rebaser is a Chrome / Firefox extension I shipped to the Web Store last year for solo / small-team GitHub PR housekeeping — rebase when the base branch moves, enable auto-merge once it's allowed, delete merged branches, resolve outdated review threads, ping idle reviewers. v1 got a quiet ship; v2 is the version I actually wanted to use and figured was worth surfacing here.

I built it because the existing options are server-based bots (Mergify, Kodiak, Bulldozer) that require org-admin install, repo config, and per-seat pricing. I wanted the same housekeeping for personal repos and side projects without standing up a service. A browser extension turned out to be a clean fit: runs under my account, talks only to api.github.com, no servers to host, works on GitHub Enterprise.

v2 added the pieces I kept wanting after using v1 for a few months:

- Multi-account — add multiple GitHub accounts to one install and switch from the popup header. Per-account error isolation, per-account settings, per-account PR cache.
- Reviewer dashboard — second tab for PRs where I'm a requested reviewer or assignee, with state chips for awaiting / approved / changes-requested / auto-merge-armed. Optional 4-gate conservative auto-merge per allowlisted repo (master toggle off + submodule toggle off + allowlist + my approval = a deliberately narrow path before any auto-merge fires).
- Push-since-approval badge — PRs that got new commits after my last approval surface a "re-review" chip with a one-click re-request.
- Settings split — global (shared across accounts: ignored repos, keyboard shortcuts, GHES host) vs this-account (everything else). Switching accounts no longer trashes my per-repo opt-outs.
- Desktop notifications (opt-in, runtime permission) — per-event toggles, 1-hour throttle.

A few design notes that might be interesting:

- Manifest V3 service worker for the polling loop. Alarms API survives the worker getting killed; storage round-trip on every wake is fine because the data is tiny.
- GitHub App auth via OAuth Device Flow (no client secret leaks in a public extension), with a PAT fallback.
- Every automation is opt-in, with per-repo skip lists. Reviewer auto-merge is the most conservative one — four gates have to align before it fires, and a unit + e2e test pair gates each one in CI.
- The ETag cache, notification throttle, and pinged-PR throttle are all scoped per-account, so adding a second login doesn't leak request budget or nudge-throttle state across them. (This was a real regression I caught between v1 and v2 and ate one PR to fix.)
- E2E tests load the unpacked extension in headless Chromium via Playwright. 30 specs cover the popup → storage → render path and the SW poll-cycle → API surface, mocked at context.route.

Source: https://github.com/bradygrapentine/auto-rebaser
Chrome: <store URL>
Firefox: <AMO URL>

Happy to talk about MV3 quirks, Device Flow in extensions, multi-account scoping under chrome.storage, or why polling instead of webhooks (TL;DR: webhooks need a public endpoint, and a browser extension is a private client).
```

**Submission shape:**

- **URL**: post the GitHub repo `https://github.com/bradygrapentine/auto-rebaser` as the submission URL (not the Chrome Web Store link — HN downweights store links and the GitHub repo gives readers an immediate "is this real" signal).
- **Title**: from above.
- **First comment**: paste the body above as the top-level comment under your own submission. This is the standard pattern for project posts that aren't Show HN.

**Posting notes:**

- Post Tuesday or Wednesday morning Pacific (highest weekday traffic).
- Don't link-bomb. One link in the title (the URL itself), one in the comment to source, one to the store.
- Be present in the thread for the first 2–3 hours — engagement keeps it on the front page.
- If a mod retags it `[Show HN]` because you described a project they think hasn't been on HN before, that's fine — let them; just don't self-prefix.
- If asked "why not webhooks": polling is a deliberate choice. Webhooks need a public endpoint (server), which is exactly what this extension exists to avoid. The cost is a ~1–60 min freshness window, which is fine for housekeeping (rebase, auto-merge) where minutes don't matter.
- If asked "wait, didn't this already exist?": yes, v1 shipped quietly last year. v2 is the version I wanted to use, and I'm only posting it now because the multi-account + reviewer-dashboard work felt worth surfacing here.

---

## Reddit — r/github (or r/programming / r/webdev)

**Title:**

```
Auto Rebaser v2 — browser extension for multi-account GitHub PR housekeeping (no servers)
```

**Body:**

```
Sharing a side project that just hit v2: **Auto Rebaser**, a Chrome / Firefox extension that watches your open GitHub pull requests and auto-rebases, auto-merges, and cleans them up — now with multi-account support and a reviewer dashboard.

**What it does (v2):**
- Multi-account — add multiple GitHub accounts, switch from the popup header, per-account settings + PR cache + error isolation
- Reviewer dashboard tab — PRs where you're a requested reviewer / assignee, with state chips and optional conservative 4-gate auto-merge per allowlisted repo
- Push-since-approval — PRs that got new commits after your last approval surface a one-click re-review chip
- Auto-rebase when the base branch is ahead
- Auto-enable auto-merge with squash/rebase/merge preference
- Auto-delete merged branches
- Auto-resolve outdated review threads
- Stale-PR badge + one-click @-mention ping
- Optional desktop notifications (per-event, 1h throttle)

**What it doesn't do:**
- No servers — runs entirely in the browser, talks only to api.github.com (or your GHES host)
- No telemetry, no analytics
- No paid tiers, no org-admin install required

GitHub App auth (recommended) or PAT. Source on GitHub. Free.

Chrome: <store URL>
Firefox: <AMO URL>
GitHub: https://github.com/bradygrapentine/auto-rebaser

Curious to hear what other GitHub-flow nits people would want automated next — I'm noodling on a "draft-promoted-to-ready" detector and a "review-comment-resolved-but-thread-still-open" sweep for v2.1.
```

**Posting notes:**

- r/github is small but on-topic and high-conversion.
- r/programming and r/webdev are larger but require an interesting hook beyond "I made an extension." Lead with the design tradeoff (browser-side vs server-based bots) and the multi-account / reviewer-dashboard angle.
- Avoid r/SideProject — low-quality traffic, Reddit auto-spams it.

---

## X / Mastodon / Bluesky (single post)

```
Shipped Auto Rebaser v2 — Chrome + Firefox extension for GitHub PR housekeeping.

New in v2: multi-account, reviewer dashboard with conservative 4-gate auto-merge, and a "re-review" chip when a PR gets pushed after your last approval.

No servers. No org-admin install. No per-seat pricing.

Open source: https://github.com/bradygrapentine/auto-rebaser
```

**Posting notes:**

- Pin to profile for ~1 week post-launch.
- Mastodon: add `#GitHub #DevTools #BrowserExtension` at the bottom.
- Bluesky: same, with `#github` and `#opensource`.

---

## LinkedIn (single post)

```
I just shipped v2 of Auto Rebaser — a browser extension that runs the housekeeping side of GitHub PR work without standing up a server.

The interesting engineering tradeoff: server-based bots (Mergify, Kodiak, Bulldozer) require org-admin install, repo configuration, and per-seat pricing. A browser extension trades a ~5-minute freshness window for "runs under your own account, no infra, works on personal repos."

v2 adds the pieces I kept wanting after using v1 for a few months:
• Multi-account — add multiple GitHub accounts, switch from the popup header
• Reviewer dashboard — second tab for PRs where you're a requested reviewer, with optional conservative auto-merge
• Push-since-approval — re-review chips when a PR gets new commits after your last approval

Open source. No telemetry. Works on GitHub Enterprise.

https://github.com/bradygrapentine/auto-rebaser
```

**Posting notes:**

- Lead with the engineering tradeoff — LinkedIn rewards a learning angle over a feature dump.
- Tag #github #engineering #devtools.

---

## Sequence (suggested)

1. **Day 0 (post-AMO-listing-refresh):** confirm both store URLs render v2 copy + screenshots in incognito; smoke-test fresh install of v2.
2. **Day 0 evening:** post to X / Mastodon / Bluesky first (low-stakes, primes the install graph).
3. **Day 1 morning Pacific:** HN regular submission. Stay in the thread for 2–3 hours.
4. **Day 1 afternoon:** if HN didn't catch, cross-post to r/github + r/programming. If HN did catch, hold Reddit for Day 3 to avoid splitting attention.
5. **Day 2:** LinkedIn post.
6. **Day 7:** capture install / review counts and append to `docs/LAUNCH_PLAN.md` history (or a new `docs/v2-launch-retro.md`).

## What to skip

- Product Hunt — fee + low-relevance audience for a dev tool.
- Paid ads — install conversion economics don't work for a free extension.
- Press / blog outreach — too niche.

## Pre-launch checklist

- [ ] v2.0.0 live on Chrome Web Store with v2 listing copy + screenshots (URL captured)
- [ ] v2.0.0 live on Firefox AMO with v2 listing copy + screenshots (URL captured)
- [ ] Replace `<store URL>` and `<AMO URL>` placeholders in every post body above
- [ ] Confirm `docs/release-notes/v2.0.0.md` matches the GitHub release page
- [ ] Verify the HN body doesn't exceed HN's ~2000-char effective ceiling (the dropoff point where readers stop scrolling)
