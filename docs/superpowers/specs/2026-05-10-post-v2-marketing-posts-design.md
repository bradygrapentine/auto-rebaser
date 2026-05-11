# Post-v2 marketing posts — handoff spec for Claude Cowork

**Status:** Backlog — post-v2.0.0 ship
**Owner:** Brady
**Handoff target:** Claude Cowork

## Goal

After v2.0.0 of Auto Rebaser ships (Chrome Web Store + AMO), generate a batch of marketing posts that Brady can hand off to Claude Cowork for distribution. Cowork handles posting cadence and channel-specific tweaks; this spec defines what to produce.

## Why this is a Cowork handoff (not a /sprint task)

Generation is one-shot creative work, not iterative engineering. The repo's job is to:

1. Produce raw post drafts as MD files in `docs/marketing/v2-launch/`.
2. Include enough context (feature list, screenshots, link bundle) that Cowork can adapt per channel without re-reading the codebase.
3. Stop. Distribution is Cowork's job.

## Inputs the generator needs

Pulled from these existing artifacts at v2.0.0 ship time:

- `docs/release-notes/v2.0.0.md` — canonical feature list
- `docs/STORE_LISTING.md` — short/long description, value props
- `docs/runbooks/v2-release.md` — feature surface (multi-account, settings split, repo filter, reviewer tab, push-since-approval, desktop notifications)
- `tmp/live-test-screens/*.png` (refreshed) — screenshots for image-bearing channels
- Chrome Web Store URL + Firefox AMO URL (filled after store approvals)
- GitHub release URL: `https://github.com/bradygrapentine/auto-rebaser/releases/tag/v2.0.0`

## Outputs to produce

Each as its own MD file under `docs/marketing/v2-launch/`. All written from Brady's voice (solo indie dev shipping a free Chrome extension), no enterprise marketing tone.

| File | Channel | Length | Notes |
|---|---|---|---|
| `01-twitter-launch-thread.md` | X / Twitter | 6–10 tweet thread | Hook → problem → demo gif callouts → feature highlights (1 per tweet) → CTA with both store links |
| `02-hn-show-hn-post.md` | Hacker News (Show HN) | Title + 200–400 word body | Lead with what it does + why you built it; link to GitHub repo, not store (HN audience preference). Mention multi-account + reviewer tab as the v2 deltas |
| `03-reddit-r-chrome-r-github.md` | r/chrome, r/github, r/programming | 2 variants, ~300 words each | More casual; OK to mention specific pain (squash-merge rebase fatigue) |
| `04-linkedin-post.md` | LinkedIn | ~200 words | Professional framing; focus on time-saved-per-week angle |
| `05-product-hunt-listing.md` | Product Hunt | Tagline + description + gallery captions | Coordinate launch day; needs hunter or self-launch |
| `06-blog-post-v2-launch.md` | Personal blog / dev.to | 800–1200 words | Long-form: origin story, what v1 missed, what v2 adds, screenshots inline, lessons learned |
| `07-changelog-summary.md` | Email newsletter / changelog | 150 words | Plain text, for any mailing list or in-extension update toast |

## Shared content blocks (write once, reuse)

To avoid each post diverging:

- **One-line pitch:** "Auto Rebaser keeps your GitHub PRs current — squash-merge friction, gone."
- **30-word elevator:** [TBD at generation time — extract from STORE_LISTING.md]
- **Feature bullets (v2 deltas vs v1):**
  - Multi-account (sign in to work + personal GitHub at once)
  - Reviewer dashboard (PRs assigned to you, not just authored)
  - Push-since-approval re-review nudges
  - Per-account settings split
  - Optional desktop notifications
- **Three "demos worth showing"** (link to screenshots):
  1. Account switcher in popup
  2. Reviewer tab with state chips
  3. Push-since-approval `! re-review` badge
- **Links bundle:** Chrome store, AMO, GitHub repo, GitHub release, privacy page

Put these in `00-shared-content.md` so each post references the same block.

## Generation procedure (when v2 ships)

1. Confirm v2.0.0 is live on Chrome Web Store + AMO (or note "AMO pending review" as a footnote).
2. Create `docs/marketing/v2-launch/` and write `00-shared-content.md` first.
3. Generate posts 01–07 in parallel. Each post is self-contained — Cowork should be able to read any one file and post it without cross-referencing.
4. Commit on `marketing/v2-launch` branch, open a PR titled `marketing: v2 launch post drafts` with the file tree in the body.
5. Hand the PR URL to Claude Cowork. Cowork handles per-channel adaptation, scheduling, and posting.

## Out of scope

- Paid ads / sponsored content (Cowork's call if they want to)
- Localization beyond English (defer to v2.1 if there's user demand)
- Influencer outreach lists (not part of this handoff)
- A/B test variants (Cowork picks if they want variants)
- Analytics tracking links (use plain store URLs; if Cowork wants UTM tags they add them)

## Acceptance

- All 7 post files exist in `docs/marketing/v2-launch/`
- `00-shared-content.md` exists and is referenced (not duplicated) by each post
- Every link in every post resolves (no `TBD` URLs in final output — fill or omit)
- No screenshot referenced that doesn't exist on disk
- PR opened, URL handed to Cowork

## When to start

Begin the day v2.0.0 hits Chrome Web Store (Step 5 of `docs/runbooks/v2-release.md`). Don't pre-write while AMO is still mid-review — the link bundle stays incomplete and the posts drift.
