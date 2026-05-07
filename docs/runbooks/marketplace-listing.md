# Runbook — GitHub Marketplace Listing (MP-1)

_Ships **immediately** against v1.0.2 main, in parallel with V2 work — per the revised V2 plan post-strategic-review._

GitHub Marketplace is separate from Chrome Web Store / Firefox AMO. It's the listing on https://github.com/marketplace that surfaces the GitHub App side of Auto Rebaser to GitHub users browsing for tools. The browser extension and the GitHub Marketplace app share an identity (the App registration) but have distinct distribution channels.

The Marketplace review takes 5–10 business days regardless of code state. Shipping now against v1.0.2 captures that wait time at zero opportunity cost.

## Prerequisites

- v1.0.2 is live on Chrome Web Store + Firefox AMO (in flight as of 2026-05-07).
- The GitHub App is already registered (per Story 4.1 from v1).
- The repo `bradygrapentine/auto-rebaser` is public (already done for v1.0.2 — Chrome's reachability check forced this).
- `docs/TERMS.md` must exist and be served at HTTP 200 (see Step 4 below — there's a known gotcha).

## Step 1 — Prerequisites & navigation

Marketplace requires the GitHub App to be **owned by an organization** AND **publicly installable** (visibility = Public). Both have non-obvious UI locations:

- **Transfer App from personal → org:** App settings → left sidebar → **Advanced** (NOT the bottom of the main page) → **Transfer ownership**. Then accept the transfer from the org-side `Settings → Developer settings → GitHub Apps` page.
- **Make App public:** App settings → left sidebar → **Advanced** → "Danger zone" → **Make public** button. (Field renamed: docs may still say "Where can this GitHub App be installed?" / "Any account" — current UI calls it Public/Private under Danger zone.)
- **No verified-publisher requirement for Free listings.** Verified publisher is paid-only (also: paid requires ≥100 installs).

Once both prerequisites are met, navigate to https://github.com/marketplace/new → click **Create draft listing** next to `auto-rebaser`.

## Step 2 — Listing description (Naming and links section)

| Field | Value | Notes |
|---|---|---|
| Listing name | `Auto Rebaser` | |
| Very short description | `Automatically rebases your open GitHub PRs when they fall behind their base branch — plus opt-in PR housekeeping.` | 125-char hard limit |
| Primary category | `Code review` | |
| Secondary category | `Project management` | |
| Supported languages | **leave blank** | this field is for *programming languages* (TS, Python, etc.), not human languages — Auto Rebaser is language-agnostic |
| Customer support URL ★ | `https://github.com/bradygrapentine/auto-rebaser/issues` | required |
| Documentation URL | `https://github.com/bradygrapentine/auto-rebaser#readme` | optional |
| Company URL / Status URL | leave blank | optional |

## Step 3 — Logo and feature card

The "feature card" is the rectangle on `/marketplace`. GitHub overlays your logo on top of a background image you provide.

| Field | Value | Notes |
|---|---|---|
| Logo | `icons/icon512.png` | |
| **Background image** | 965×482 PNG (NOT 1280×640) | generate via `/tmp/marketplace_feature_card.py` — same dotted-backdrop style as Chrome screenshots |
| Badge background color | `ffffff` | |
| Text color | **Dark text** | matches light-gray dotted backdrop |

## Step 4 — Listing details

The form has TWO description fields:

- **Introductory description** (≤500 chars) — top-of-listing hook, plain prose, no markdown headers
- **Detailed description** (400–2000 chars, markdown) — body. The default Copilot template MUST be wiped and replaced.

Use the long-form copy from `docs/STORE_LISTING.md` adapted with `## What it does`, `## Built for`, `## Privacy`, `## Source`, `## Controls` sections.

## Step 5 — Product screenshots

- **Required:** at least 1 screenshot, ≥1200px wide.
- **All screenshots must share the same aspect ratio** (else GitHub page-jumps between them).
- v1.0.2: 5 screenshots letterboxed onto 1280×640 via `/tmp/resize_screenshots_marketplace.py`.

## Step 6 — Pricing plan

Required — even for free apps, a "plan" must exist on the listing.

- **Plan name:** `Free`
- **Description:** `All features. No paid tier. Source available at github.com/bradygrapentine/auto-rebaser.`
- **Free trial:** N/A
- **Bullet points** (visible on the listing):
  - Auto-rebase your authored PRs when they fall behind
  - Auto-delete merged branches, auto-enable auto-merge, auto-resolve outdated threads
  - Stale-PR badge, idle-PR ping, keyboard shortcuts
  - Per-repo opt-out lists; bounded activity log
  - Everything stored locally; no telemetry

(GitLab + multi-account are v3/v2 roadmap items — don't promise them on the v1.0.2 listing.)

## Step 7 — Webhook (required even for free apps)

⚠️ **Runbook correction (2026-05-07):** The publish checklist DOES require a webhook even for Free-only listings. Without one, "Set up webhook" stays at the orange-dot incomplete state and submission is blocked.

For a no-backend free app, the working pattern is to point at a static HTTPS URL that returns 200 with valid SSL and **uncheck "Active"** so events never actually deliver:

| Field | Value |
|---|---|
| Payload URL | `https://bradygrapentine.github.io/auto-rebaser/PRIVACY` (200, valid SSL, GitHub-owned) |
| Content type | `application/json` |
| Secret | blank |
| Active | **unchecked** |

Click **Create webhook**. The publish checklist's "Set up webhook" item turns green.

If the listing is later upgraded with a paid plan, swap this for a real backend endpoint that handles `marketplace_purchase` events per https://docs.github.com/en/apps/github-marketplace/using-the-github-marketplace-api-in-your-app.

## Step 8 — Verifying URLs

GitHub Marketplace requires:
- **Privacy policy URL:** `https://bradygrapentine.github.io/auto-rebaser/PRIVACY` (already public from v1).
- **Terms of service URL:** `https://bradygrapentine.github.io/auto-rebaser/TERMS` — added in PR #62. Verify with:
  ```
  curl -sI https://bradygrapentine.github.io/auto-rebaser/TERMS | head -1
  ```
  Both URLs confirmed 200 as of 2026-05-07.

  ⚠️ **HTTP 200 gotcha.** Marketplace requires 200, not a redirect. If a future Pages config change introduces `/TERMS` → 301 → `/TERMS.html`, either (a) submit the redirect target instead, or (b) add a `_config.yml` with `permalink: /:path`.

- **Customer support URL:** `https://github.com/bradygrapentine/auto-rebaser/issues`
- **Status page URL:** N/A for a client-side extension; leave blank.

## Step 9 — Submit for review

1. Bottom of the listing draft → **Request verification**.
2. GitHub reviews Marketplace listings **manually**. Typical review time: **5–10 business days**.
3. Reviewer questions arrive via email. Common: "How does the App handle scope X?", "Confirm no telemetry."

## Step 7 — Post-approval

- Add Marketplace badge to `README.md`:
  ```markdown
  [![GitHub Marketplace](https://img.shields.io/badge/marketplace-Auto%20Rebaser-blue)](https://github.com/marketplace/auto-rebaser)
  ```
- Update `docs/STORE_LISTING.md` to reference the live Marketplace URL.
- Note in `BACKLOG.md` §7: `MP-1: GitHub Marketplace listing — shipped <date>`.

## TERMS.md template

```markdown
# Auto Rebaser — Terms of Service

**Last updated:** <date>

Auto Rebaser ("the extension") is provided free of charge under the MIT License.

## Use at your own risk

The extension performs automated actions (rebase, branch deletion, auto-merge, comment posting) on your behalf using credentials you provide. You are responsible for understanding what each automation does before enabling it. All automations are opt-in (except auto-rebase and auto-delete, which are documented as safe defaults).

## No warranty

Provided "as is" without warranty of any kind. The maintainer is not liable for accidental rebases, deleted branches, posted comments, or any other automated action — even if the extension behaves unexpectedly.

## Termination

You may stop using the extension at any time by uninstalling it; this clears all locally stored data. The maintainer reserves the right to discontinue the project without notice.

## Source

Source is published at https://github.com/bradygrapentine/auto-rebaser. You may inspect, fork, or self-modify per the MIT License.

## Contact

grapentineb@gmail.com
```

## What this runbook does NOT cover

- **Paid Marketplace plans.** Out of scope for V2 (non-trader status).
- **Marketplace webhook handlers.** Only relevant for paid plans.
- **GitLab equivalent listing.** GitLab does not have an analogous "Marketplace" surface for browser extensions. The Auto Rebaser GitLab integration is discoverable only through the Chrome/Firefox stores. If GitLab launches a Marketplace later, follow this runbook's pattern.
