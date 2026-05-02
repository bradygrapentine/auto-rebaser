# Auto-Rebaser — MVP Roadmap
_2026-05-02_

## Goal

Eliminate the manual "Update branch" click on GitHub PRs. The extension polls your open authored PRs and rebases any that are behind their base branch automatically.

---

## Phase 1 — MVP (this plan)

Standalone Chrome extension, github.com only, single authenticated user.

### Features

| # | Feature | Description |
|---|---|---|
| 1.1 | **GitHub PAT sign-in** | Paste a Personal Access Token. Stored in `chrome.storage.sync`. |
| 1.2 | **Authored PR discovery** | Polls GitHub Search API for all open PRs authored by the signed-in user across all repos. |
| 1.3 | **Auto-rebase behind PRs** | For any PR with `mergeable_state === "behind"`, calls `update-branch` with `update_method: "rebase"`. |
| 1.4 | **State tracking** | Each PR tracked as: `current`, `behind`, `updating`, `updated`, `conflict`, `needs-manual`, `error`. |
| 1.5 | **User-configurable poll interval** | `github_poll_interval`: 1m / 2m / 5m / 10m / 15m / 30m / 1h / 2h / 4h. Persisted in `chrome.storage.sync`. Default: 5m. |
| 1.6 | **Popup PR list** | Compact list of all open authored PRs with color-coded status badges. |
| 1.7 | **Poll now button** | Trigger an immediate poll cycle from the popup. |
| 1.8 | **Badge count** | Extension icon badge shows number of PRs rebased in the last poll cycle. |
| 1.9 | **ETag caching** | Caches ETag per API URL to avoid burning rate limit when nothing has changed. |
| 1.10 | **Error handling** | Auth errors prompt re-authentication. Rate limits skip the cycle. Network errors retry next poll. |

### Not in MVP

- PRs not authored by the user
- GitHub Enterprise
- Desktop notifications
- PR review or merge actions
- Backend / multi-user support

---

## Phase 2 — Polish, Distribution, and Automations

| # | Feature | Status |
|---|---|---|
| 2.1 | Firefox support (MV3, minor manifest adjustments) | not started |
| 2.2 | Chrome Web Store submission | not started |
| 2.3 | Backend proxy for OAuth token exchange (removes embedded client_secret) | not started |
| 2.4 | Desktop notifications for rebased/conflicted PRs (opt-in) | not started |
| 2.5 | Filter by repo or org | not started |
| 2.6 | **Auto-delete merged branch** — when an authored PR merges and the repo doesn't auto-delete, the extension deletes the head ref via API. Per-repo opt-out. | logic + endpoint ready (prep branch) |
| 2.7 | **Auto-enable auto-merge** — for authored PRs without auto-merge enabled, flip the toggle (squash by default, configurable) so GitHub merges as soon as required checks/reviews pass. | logic + endpoint ready (prep branch) |
| 2.8 | **Auto-resolve obsolete review threads** — when a review thread's referenced line no longer exists in the current diff, mark the thread resolved via GraphQL. | logic + endpoint ready (prep branch) |
| 2.9 | **Auto-dismiss stale PR notifications** — for notification threads whose PR is closed/merged, mark the thread as read so the inbox stays clean. | logic + endpoint ready (prep branch) |

> Features 2.6–2.9 prep is complete on `feat/phase2-endpoints-prep` (12 files, 89 tests, 100% coverage on new code). Remaining wiring + UI work is split into Part A and Part B — see `PHASE2_STATE.md`.

---

## Phase 3 — Production / Multi-user

| # | Feature |
|---|---|
| 3.1 | GitHub Enterprise host configuration |
| 3.2 | Multi-account support |
| 3.3 | Webhook-driven updates via backend (real-time instead of polling) |
| 3.4 | Usage analytics + error reporting |
| 3.5 | Subscription / billing layer |

---

## Phase 4 — Enterprise authentication (v0.2.0)

PATs are blocked or strongly discouraged at most companies. Phase 4 adds **GitHub App + OAuth Device Flow** as the primary auth method, with PAT retained as a legacy fallback.

Spec: [`specs/2026-05-02-github-app-auth-design.md`](specs/2026-05-02-github-app-auth-design.md)

| # | Feature | Notes |
|---|---|---|
| 4.1 | **GitHub App registration** | One-time manual step. Publish public listing on GitHub Marketplace. Permissions least-privilege. |
| 4.2 | **OAuth Device Flow sign-in (Chrome + Firefox)** | Two-tab UX. No backend, no client_secret. Identical implementation across browsers. |
| 4.3 | **Token refresh + storage** | 8h access token, 6mo rotating refresh token. Tokens in `chrome.storage.local` only (never `sync`). Single in-flight refresh promise. |
| 4.4 | **Dual-path auth UI** | Sign-in view offers GitHub App (default) and PAT (legacy). Migration banner for PAT users. |
| 4.5 | **Per-installation scoping** | Display which orgs/users the App is installed on. Surface "request access" flow when user has no installation. |
| 4.6 | **GHES base-URL config** | Optional `enterpriseHost` setting; toggles all OAuth + API URLs. Requires the App to also be installed on the GHES instance. |

### Known limitation

Story 2.9 (auto-dismiss stale notifications) requires user-OAuth `notifications` scope, which **GitHub Apps don't expose**. v0.2.0 disables 2.9 for App-authenticated users with a clear UI message. PAT users retain it.

### Why Phase 4 not Phase 3

Phase 3 is "production / multi-user" which implies subscription billing, analytics, and a backend. Phase 4 is auth-only and intentionally backend-free — it can ship before any of Phase 3 lands.

---

## Phase 5 — Companion automations (v0.2.1)

Four small additions in the spirit of 2.6–2.9. All UI in the toolbar popup; no admin scope; no backend.

Spec: [`specs/2026-05-02-phase5-companion-automations-design.md`](specs/2026-05-02-phase5-companion-automations-design.md)

| # | Feature | Notes |
|---|---|---|
| 5.1 | **Stale-PR badge + ping-reviewers** | Surfaces idle days on your own PRs; opt-in one-click reviewer ping with confirmation. Read-only by default. |
| 5.4 | **Smart merge-method selection** | Auto-merge picks the first user-preferred method the repo's GitHub settings allow. Replaces the global `autoMergeMethod` setting with a preference list. |
| 5.5 | **Keyboard shortcuts** | `r` refresh / `s` settings / `j k` navigate / `Enter` open / `?` help. Popup-scope only. |
| 5.6 | **Activity log** | Persistent record of every write action (rebases, branch deletes, auto-merge enables, thread resolves, notif dismissals, pings). 200-entry / 30-day cap in `chrome.storage.local`. Full-popup view with filters + Clear log; clickable footer counter as entry point. |

**Total effort: ~20 hours / ~3 days.**

### Considered and dropped

- **5.2 push-since-approval** — GitHub branch protection ("Dismiss stale approvals on new commits") covers the gating case when admins opt in. Surfacing-only didn't carry its weight.
- **5.3 flaky-CI auto-retry** — strong standalone feature but supporting infrastructure (pattern editor, activity log, GitHub App permission bump for Checks: Write + Actions: Write) is sized for a headline release. Revisit if/when flaky-CI becomes an explicit Pro-tier anchor.
