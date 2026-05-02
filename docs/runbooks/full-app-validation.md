# Runbook — Full app validation

_Goal: validate every shipped feature (Phase 1, 2, 4, 5) end-to-end on Chrome AND Firefox before tagging a release._

This is the master validation runbook. Per-feature runbooks (`chrome-smoke-test.md`, `firefox-smoke-test.md`, `github-app-setup.md`, `phase2-validation.md`) cover narrower scope; this one is the gate before publishing any new version.

## Prerequisites

- [ ] All planned waves merged to main (current expected baseline: v0.2.1 = Phase 4 + Phase 5).
- [ ] `npm test` and `npm run typecheck` clean on main.
- [ ] `npm run build:all` produces clean `dist/` and `dist-firefox/`.
- [ ] Test GitHub account with at least:
  - 3 open PRs across 2 different repos
  - 1 PR currently `behind` its base
  - 1 PR with at least one approved review (for stale-approval scenarios — only relevant if 5.2 ever ships)
  - 1 PR with merge conflicts (for `needs-manual` state)
  - 1 closed/merged PR within the last poll window (for branch deletion + notification dismissal)
  - 1 idle PR with `updated_at` >14 days ago (for stale-PR scenarios)
- [ ] PAT (classic, scope `repo`; or fine-grained: Pull requests R/W + Contents R + Metadata R + Email R)
- [ ] PAT with `repo` + `notifications` scopes (for Story 2.9 testing)
- [ ] Auto Rebaser GitHub App installed on the test account
- [ ] (Optional) GitHub Enterprise Server test instance + App registered there

## How to use this runbook

Walk it sequentially. Each row in each table is a discrete check. Mark ✅ as you go. ANY ❌ blocks release — fix or hold the tag.

For each major section, capture results in the validation log table at the bottom. Use one log row per browser per release.

---

# Section A — Build + load

## A.1 Chrome

| # | Step | Expected |
|---|---|---|
| A.1.1 | `npm run build` | Output written to `dist/`; no errors. Final line `built in <Xms>` |
| A.1.2 | `chrome://extensions` → Developer mode ON → Load unpacked → `dist/` | Extension appears with the Auto Rebaser icon. No red error banner |
| A.1.3 | Pin the icon to the toolbar | Icon visible in toolbar |
| A.1.4 | Click `service worker` in the extension card | Worker console opens, no immediate errors |

## A.2 Firefox

| # | Step | Expected |
|---|---|---|
| A.2.1 | `npm run build:firefox` | Output written to `dist-firefox/`; no errors |
| A.2.2 | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist-firefox/manifest.json` | Add-on listed; no validation errors |
| A.2.3 | Click Inspect on the temp add-on | Background-script console opens |

---

# Section B — PAT auth (regression — Phase 1)

| # | Step | Expected |
|---|---|---|
| B.1 | Open popup. Sign-in view shows two options: "GitHub App (recommended)" and "Personal Access Token" | Both visible; GitHub App pre-selected |
| B.2 | Switch to PAT, paste valid token, click Save | Transitions to PR list view; user info shown |
| B.3 | Worker console: `await chrome.storage.local.get('auth')` | Returns `{ method: 'pat', token: '...', notificationsScopeGranted: <bool> }` |
| B.4 | Worker console: `await chrome.storage.sync.get('auth')` | Returns `{}` — PAT must NOT be in sync |
| B.5 | Click sign-out (toolbar `log-out` button) | Returns to sign-in view; storage cleared |

---

# Section C — GitHub App Device Flow auth (Phase 4 — Stories 4.2, 4.3, 4.4)

| # | Step | Expected |
|---|---|---|
| C.1 | Sign-in view, GitHub App option selected, Continue | Full-popup view shows 8-character code (e.g. `ABCD-1234`) with Copy button |
| C.2 | Note the code; new tab opens to `github.com/login/device` | New tab present |
| C.3 | Paste code, Authorize on github.com | Within 10 seconds, popup transitions to PR list |
| C.4 | Worker console: `await chrome.storage.local.get('auth')` | `{ method: 'github_app', accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, installations: [...] }` |
| C.5 | `await chrome.storage.sync.get('auth')` | `{}` — tokens NOT in sync |
| C.6 | Header shows "via GitHub App" indicator | Visible |
| C.7 | Header lists installations (if 4.5 shipped) | Visible |

## C.8 Token refresh path

| # | Step | Expected |
|---|---|---|
| C.8.1 | Worker console: force-expire access token: `chrome.storage.local.get('auth').then(({auth}) => chrome.storage.local.set({ auth: { ...auth, accessTokenExpiresAt: 0 } }))` | No error |
| C.8.2 | Click toolbar refresh icon | Network panel shows POST to `github.com/login/oauth/access_token` followed by API call(s); both succeed |
| C.8.3 | Re-check storage | New `accessToken` AND new `refreshToken` (rotation) |

## C.9 Refresh-token expiry path

| # | Step | Expected |
|---|---|---|
| C.9.1 | Force-expire refresh token: `chrome.storage.local.get('auth').then(({auth}) => chrome.storage.local.set({ auth: { ...auth, refreshTokenExpiresAt: 0 } }))` | No error |
| C.9.2 | Click refresh icon | Popup returns to sign-in view; NO refresh request fired (verify in network panel) |

## C.10 Cancel + expiry edge cases

| # | Step | Expected |
|---|---|---|
| C.10.1 | Begin Device Flow, close the github.com tab without authorizing | Popup eventually shows "Sign-in cancelled" message |
| C.10.2 | Begin Device Flow, leave github.com tab open >15 min before authorizing | Popup shows "Code expired — start over" |

## C.11 Concurrent-fetch refresh race (Phase 4 Story 4.3)

| # | Step | Expected |
|---|---|---|
| C.11.1 | Force-expire access token. From worker console, fire 5 concurrent API requests via `for (let i = 0; i < 5; i++) fetch(...)` | Network panel shows exactly **one** POST to `oauth/access_token`; all 5 API calls succeed (one shared refresh) |

---

# Section D — Phase 1 MVP behaviors (regression)

| # | Step | Expected |
|---|---|---|
| D.1 | Popup shows all open authored PRs grouped by repo | Groups visible; `behind` PRs auto-expanded; `current` collapsed |
| D.2 | Click a `behind` PR's row | Repo group expands; PR row shows `behind` badge |
| D.3 | Force a poll via toolbar refresh button | Spinner shows; behind PR transitions through `updating` → `updated` |
| D.4 | Toolbar badge updates to count of rebased PRs | Badge text matches |
| D.5 | Conflict PR shows `needs-manual` (or `conflict`) | Correct state surfaced |
| D.6 | Open Settings → poll interval | Options 1/5/15/30 m visible; current value selected |
| D.7 | Change interval to 1m → wait → next poll fires at the new cadence | Verified by network panel timing |
| D.8 | Set per-repo opt-out for one repo | That repo's PRs skipped on the next poll |

---

# Section E — Phase 2 automations (regression)

| # | Step | Expected |
|---|---|---|
| E.1 | Open Settings → Automations | New `h2` heading "automations" matching "general" styling (set during recent UX rebrand) |
| E.2 | All five automation blocks visible: Ignored repos, Auto-delete, Auto-merge, Auto-resolve threads, Dismiss notifications | Visible |
| E.3 | Auto-delete merged branches: enable; merge a PR; next poll deletes head branch | Verified via GitHub repo branches page |
| E.4 | Footer shows `deleted owner/repo:branch` after the deletion | Visible |
| E.5 | Auto-enable auto-merge: enable; eligible PR has auto-merge enabled on next poll | Verified on github.com PR page |
| E.6 | Auto-resolve outdated review threads: enable; outdated thread (line=null, isOutdated, !isResolved) gets resolved | Verified on github.com PR page |
| E.7 | Auto-dismiss stale PR notifications: enable (PAT only — App users see "unavailable" message); closed-PR notification gets marked read | Verified at github.com/notifications |

---

# Section F — Phase 4 Per-installation scoping (Story 4.5)

| # | Step | Expected |
|---|---|---|
| F.1 | Sign in via GitHub App on a test account that has the App installed in one org but a PR in a different org's repo | Popup PR list shows both PRs; the uninstalled-org PR has an "App not installed" badge |
| F.2 | Click "Request access" link on the badge | New tab opens to `github.com/apps/auto-rebaser/installations/new` |
| F.3 | (If you have an org admin account) suspend the installation | Next poll: PRs from suspended-install repo show "Suspended" badge; no automation actions taken |
| F.4 | Re-enable the installation | Next poll: badges clear; automations resume |

---

# Section G — Phase 4 GHES (Story 4.6) — only if GHES test instance available

| # | Step | Expected |
|---|---|---|
| G.1 | Settings → set `enterpriseHost` to GHES host (e.g. `github.acme.corp`) | `chrome.permissions.request` prompt fires for `https://<host>/*` |
| G.2 | Approve the permission | Setting persists |
| G.3 | Sign out, sign in via Device Flow on the GHES App | Device Flow URLs target `<ghes_host>` not github.com; sign-in completes |
| G.4 | Poll cycle hits `<ghes_host>/api/v3/...` not `api.github.com` | Verified in network panel |
| G.5 | Clear `enterpriseHost` | Optional permission revoked; auth requires re-sign-in |

---

# Section H — Phase 5 Stale-PR badge + ping (Story 5.1)

| # | Step | Expected |
|---|---|---|
| H.1 | PR with `updated_at` >14d ago renders with `idle 14d` (or `idle 3w` if older) badge | Visible; muted amber color; secondary to state badge |
| H.2 | Format degrades correctly: 7d → "1w", 21d → "3w", 60d → "2mo" | All format correctly |
| H.3 | Settings → stale threshold = 30d; previously-shown 14d PR no longer carries the badge | Badge clears on threshold change |
| H.4 | Per-repo override 7d for one repo; 8d-idle PR in that repo shows the badge | Override respected |
| H.5 | `staleCountsAsAttention=false` (default): repo group dot stays gray for stale-only repos | Confirmed |
| H.6 | Toggle `staleCountsAsAttention=true`: repo group dot turns orange | Confirmed |
| H.7 | Click `ping ↗` link on a stale PR with reviewers | Full-popup confirmation view appears |
| H.8 | Confirmation view shows exact comment body and reviewer list | Visible |
| H.9 | Cancel → returns to PR list, no API call (verified in network panel) | Confirmed |
| H.10 | Confirm → POST `/issues/{n}/comments` fires; comment appears on github.com | Confirmed |
| H.11 | Row now shows "pinged Xm ago"; ping link disabled | Confirmed |
| H.12 | Wait or force `lastPingedAt` to >24h ago via worker console; ping link re-enabled | Confirmed |

---

# Section I — Phase 5 Smart merge-method (Story 5.4)

| # | Step | Expected |
|---|---|---|
| I.1 | Settings → Auto-merge: preference list shows three rows (squash / rebase / merge) with reorder controls | Visible |
| I.2 | Existing user upgrade: previous `autoMergeMethod: 'SQUASH'` migrated to `mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE']` automatically | Confirmed by `chrome.storage.sync.get('automation_settings')` |
| I.3 | Reorder: drag REBASE to top → save → eligible PR in a repo that allows rebase auto-enables auto-merge with `REBASE` method | Verified on github.com |
| I.4 | Disable squash + merge in preference list, leave rebase only; PR in a repo that does NOT allow rebase shows "auto-merge skipped: no allowed method" inline badge | Visible |
| I.5 | Tooltip on the badge explains which methods the repo allows | Confirmed |

---

# Section J — Phase 5 Keyboard shortcuts (Story 5.5)

| # | Step | Expected |
|---|---|---|
| J.1 | Press `r` → toolbar spinner spins, poll fires | Confirmed |
| J.2 | Press `s` → settings view | Confirmed |
| J.3 | Press `Esc` → back to PR list | Confirmed |
| J.4 | Press `?` → help view (full-popup, replaces main content) | Confirmed |
| J.5 | Press `Esc` from help view → back to PR list | Confirmed |
| J.6 | Press `j` → first visible PR row gets focus ring | Confirmed |
| J.7 | Press `j` again → next row | Confirmed |
| J.8 | Press `k` → previous row | Confirmed |
| J.9 | `j` skips PRs in collapsed repo groups | Confirmed |
| J.10 | Press `Enter` on a focused row → opens PR in new tab | Confirmed |
| J.11 | Click into the search/text field (if any) → press `r` → poll does NOT fire | Confirmed (skip-when-typing rule) |
| J.12 | Footer `?` icon → opens help view | Confirmed |
| J.13 | Settings → "Enable keyboard shortcuts" off → none of the above fire | Confirmed |

---

# Section K — Phase 5 Activity log (Story 5.6)

| # | Step | Expected |
|---|---|---|
| K.1 | Trigger a poll cycle that performs at least one action of each type (rebase, branch delete, auto-merge enable, thread resolve, notification dismiss). Worker console: `await chrome.storage.local.get('activity')` | Returns `{ entries: ActivityEntry[] }` with one entry per action |
| K.2 | Verify exactly **one** `chrome.storage.local.set` call to key `activity` in the cycle (network/storage trace via worker DevTools) | Confirmed (one write per cycle, not per action) |
| K.3 | Failed action (e.g. deletion of an already-deleted branch) logs with `result: 'failed'` and `errorMessage` | Confirmed |
| K.4 | Click the footer counter line | Activity log view opens, filtered to today's date |
| K.5 | "View activity (N)" secondary link in footer also opens the log | Confirmed |
| K.6 | Activity log: action filter dropdown narrows entries client-side | Confirmed; no new storage reads |
| K.7 | Repo filter dropdown populated from log contents; narrows entries | Confirmed |
| K.8 | "Clear log" button → confirm dialog → entries cleared | Confirmed; `chrome.storage.local.get('activity')` returns `{ entries: [] }` |
| K.9 | Force a storage write failure: stub `chrome.storage.local.set` to throw via worker console; trigger a poll | Console error logged; automations still complete; activity row for this cycle missing (acceptable per spec) |
| K.10 | Trim invariant: stuff 250 entries via worker console → next poll trims to ≤200 most-recent | Confirmed |
| K.11 | Age trim: backdate 50 entries to 31 days ago → next poll drops them | Confirmed |
| K.12 | Empty state: clear log → reopen view → "No activity yet. The extension logs every automated action here." | Visible |
| K.13 | Reviewer ping (5.1) generates a `reviewer_pinged` entry with `reviewers: [...]` populated | Confirmed |

---

# Section L — Cross-browser sanity

| # | Step | Expected |
|---|---|---|
| L.1 | Sign in via GitHub App on Chrome and Firefox simultaneously against the same GitHub account | Both succeed; github.com shows one App authorization, not two |
| L.2 | Each browser independently sees its own activity log; logs do NOT sync (storage.local is per-browser) | Confirmed |
| L.3 | A behind PR rebases on whichever browser polls first; the other browser's next poll sees the updated state | Confirmed |

---

# Section M — Privacy + permissions audit

| # | Step | Expected |
|---|---|---|
| M.1 | `grep -ri client_secret dist/ dist-firefox/` | No matches |
| M.2 | Manifest permissions: `["alarms", "storage"]` for both Chrome and Firefox; host permissions limited to `api.github.com` and `github.com` (plus optional GHES) | Confirmed |
| M.3 | Network panel during a full poll cycle: only requests to `api.github.com` and `github.com` | Confirmed |
| M.4 | `PRIVACY.md` updated with the activity-log row | Confirmed |
| M.5 | No `chrome.storage.sync` writes for tokens, activity log, or PR titles | Confirmed via worker console inspection |

---

# Validation log

Append one row per browser per release tag:

| Date | Tag | Browser+ver | Auth method | All sections ✅? | Deviations / notes |
|---|---|---|---|---|---|
| 2026-MM-DD | v0.2.0 | Chrome 128 | GitHub App | yes | — |
| 2026-MM-DD | v0.2.0 | Chrome 128 | PAT | yes | — |
| 2026-MM-DD | v0.2.0 | Firefox 130 | GitHub App | yes | — |
| 2026-MM-DD | v0.2.0 | Firefox 130 | PAT | yes | — |
| 2026-MM-DD | v0.2.1 | Chrome 128 | GitHub App | yes | — |
| 2026-MM-DD | v0.2.1 | Firefox 130 | GitHub App | yes | — |

A row marked `no` blocks the release.

---

# Red flags

- **"Most checks pass, ship it."** — every ❌ is a real defect. Don't aggregate.
- **"GitHub Marketplace listing isn't approved yet, can't validate App auth."** — App is usable for installs without listing approval. Validate against `github.com/apps/auto-rebaser` directly.
- **"GHES section skipped because no test instance."** — explicitly mark Section G as N/A in the log row, not "passed."
- **"Activity log shows 250 entries; that's fine, more is better."** — no, the trim invariant is part of the contract. Investigate.
- **"Tokens appeared in `chrome.storage.sync` once but I cleared it."** — log a deviation; cleared-after-the-fact doesn't mean it didn't happen. Investigate the write path.
- **"Firefox CSP blocks one of the requests; I'll fix it post-release."** — no. Auth is the entry point; fix or hold the tag.
