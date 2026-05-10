# Auto-Rebaser — Backlog
_Last `/backlog-sync`: 2026-05-09_

Stories are numbered to match roadmap features (1.x). Sections §0–§5 track current work; §7 is the shipped log; 🧊 is deferred/dropped. Original story specs (technical details + acceptance criteria) live below the divider as a frozen v1 reference.

---

## §0 Status board

| Status | Count |
|---|---|
| 🟢 Ready | 3 |
| ⚡ In progress | 0 |
| 🔎 In review | 0 |
| 🚧 Blocked | 0 |
| ✅ Shipped | 25 |
| 🧊 Deferred / dropped | 3 |

---

## §1 Ready

### MKT-1 — Apply rewritten store listings (Chrome + AMO)
**Status:** 🟢 Ready
**Why:** Front-loaded keywords in title + short desc are expected to lift in-store search ranking ~30–40% based on Chrome Web Store norms. Listing edits don't require a version bump or rebuild.
**How:** Apply the title, short description, long description, tag list, and screenshot captions from `docs/STORE_LISTING_REWRITES.md` to both store dashboards once the current reviews clear.
**Done when:** Both live listings show the new title and short description; expanded tag set is submitted; `docs/STORE_LISTING.md` is updated to reflect what's actually live.

### MKT-2 — Add GitHub repo topics
**Status:** 🟢 Ready
**Why:** Free SEO via GitHub's topic index — repos with relevant topics surface in topic-scoped searches and the "Explore" graph. ~1-minute change.
**How:** On the repo page → "About" → gear icon → add: `chrome-extension`, `firefox-extension`, `github-extension`, `pull-request`, `rebase`, `auto-merge`, `developer-tools`.
**Done when:** Topics visible on https://github.com/bradygrapentine/auto-rebaser.

### MERGE-1 — Reclassify no-op auto-merge attempts in activity log
**Status:** ✅ Shipped (PR #65)
**Why:** Two GitHub responses currently log as red `failed` but are not failures: `"Pull request is already merged"` (race — landed before our call) and `"Pull request is in clean status"` (PR already mergeable; GitHub refuses to enable auto-merge because there's nothing to wait on). The red entries make the audit log look alarming when the extension is doing nothing wrong.
**How:**
- In the auto-merge adapter, classify these two error strings as no-ops rather than failures.
- Either downgrade them to `result: 'skipped'` with a `reason` field, or suppress entirely once MERGE-2 ships (since MERGE-2 will replace the "in clean status" case with an actual merge).
- Update the activity log UI to render `skipped` entries in a neutral color, distinct from the red `failed` treatment.
**Done when:** No `auto_merge_enabled · failed` entries appear in the activity log for the two listed reasons; audit log visually distinguishes skip from failure.

### MERGE-2 — Fall-through direct merge when GitHub rejects auto-merge on clean PRs
**Status:** ✅ Shipped (PRs #65, #66, follow-up UI in #67–#69)
**Why:** When a PR is already mergeable (`mergeable_state === 'clean'`), GitHub's `enablePullRequestAutoMerge` mutation refuses with `"Pull request is in clean status"` because there's nothing to wait on. The extension currently logs the rejection and walks away — so PRs that are ready the moment we see them never get merged. The user's "auto-enable auto-merge" intent is to land the PR; the extension fails to do so for clean PRs.

**Design (per brainstorm 2026-05-09 — A1 + B1 + C1 + D1 + E1 + E3):**
- **A1 (consent gate):** Add a new sub-toggle under the auto-merge block: `Merge clean PRs immediately` (default OFF). Only when ON does the fall-through fire. Preserves explicit opt-in; no surprise merges for users who only ticked "auto-enable auto-merge."
- **B1 (race protection):** REST `PUT /repos/{o}/{r}/pulls/{n}/merge` call passes `sha` precondition from PR detail. New commit between detection and merge → GitHub returns `409 head-sha-mismatch`, we log and move on.
- **C1 (branch-protection edges):** Trust GitHub server-side rejection. No pre-flight check; if a custom required status appears in the gap, the merge call fails cleanly and is logged.
- **D1 (method preference):** Try `mergeMethodPreference` order. On `405 Method Not Allowed`, fall through to the next method. Same fallback pattern auto-merge already uses.
- **E1 (audit clarity):** New activity log action `auto_merged_now`, distinct from `auto_merge_enabled`. Filterable.
- **E3 (suppress upstream):** When the fall-through merge succeeds, suppress the upstream `auto_merge_enabled · "in clean status"` log entry (it's not user-actionable and clutters the audit).

**Per-repo opt-out:** reuses the existing auto-merge skip list — no new toggle.

**Cold-start / cons remaining:** none material with A1 in place. Brand-new clean PRs only direct-merge if the user explicitly opted into "merge clean PRs immediately."

**Done when:**
- New setting `mergeCleanPRsImmediately: boolean` exists in automation settings (default false), surfaced in the popup auto-merge section.
- When enabled and a clean PR triggers the rejection, extension calls REST merge with SHA precondition and logs `auto_merged_now`.
- When disabled, behavior matches today (no-op log entry, cleaned up by MERGE-1).
- Method preference fallback verified against repos that disable squash or rebase.
- Tests cover: clean-PR with toggle on (merges), clean-PR with toggle off (skips), method fallback on 405, SHA mismatch rejection.

### MKT-3 — Show HN launch post
**Status:** 🟢 Ready (Chrome live; soft-blocked on Firefox AMO approval so the post can link both stores)
**Why:** Single biggest organic-install spike for a dev tool; also drives initial install velocity which feeds back into store-search ranking.
**How:** Use the draft in `docs/LAUNCH_POST.md`. Post Tuesday or Wednesday morning Pacific. Stay in the thread for 2–3 hours to engage commenters.
**Done when:** Post is live; install count + thread URL recorded in `docs/LAUNCH_PLAN.md` history section.

### STATE-1 — Map PR badges to GitHub's `mergeable_state` truth (kill sticky-Manual bug)
**Status:** ✅ Shipped (PR #73)
**Why:** Today, a single transient 422 from `PUT …/update-branch` paints a PR `[Manual]` red, and the badge sticks across the entire CI window because GitHub returns `mergeable_state: 'unknown'` while it recomputes — and our `deriveStateFromMergeable` keeps the previous state when it sees `unknown`. Result: PRs that are actually waiting on CI on a protected branch (the `blocked` mergeable_state) display as `[Manual]`, implying user action is needed when none is.

The popup also collapses several distinct GitHub states (`blocked`, `unstable`, `draft`, `clean`, `has_hooks`) into a single `Current` bucket, losing useful signal users already understand from the GitHub UI.

**Design:**
- Add two new display states: `pending` (yellow, label `Pending`) and `draft` (muted, label `Draft`).
- Drop the dead `updating` state from the union (defined but never assigned anywhere in poll-cycle).
- Update `deriveStateFromMergeable` mapping:
  - `clean` / `has_hooks` → `current`
  - `behind` → `behind` (transient — overwritten same poll by `update-branch` outcome)
  - `dirty` → `conflict`
  - `blocked` / `unstable` → `pending`
  - `draft` → `draft`
  - `unknown` → keep `previousState` (recompute window — unchanged)
- Action-outcome states are unchanged: `update-branch` 2xx → `updated`, 422 → `needs-manual`, 409 → `conflict`, 403/404/5xx → `error`.
- The sticky-Manual bug self-resolves: once CI starts, next poll's `mergeable_state` becomes `blocked` → maps to `pending`, overwriting any stale `needs-manual`. No retry counter needed.

**Transitions overview** (for the PR doc / future reference):

| Driver | Transitions caused |
|---|---|
| GH (passive) | `current ↔ behind ↔ pending ↔ conflict ↔ draft → merged/closed` based on `mergeable_state`/`merged`/`draft` flags |
| US — auto-rebase | `behind → updated / needs-manual / conflict / error` |
| US — MERGE-2 direct merge | `current / pending → merged` (when `mergeCleanPRsImmediately` is on) |
| US — other automations | None — they set GH-side flags or post comments; resulting state changes flow back through GH on subsequent polls |

**UI:**
- `StatusBadge` gets two new label entries (`pending: 'Pending'`, `draft: 'Draft'`) and removes the `updating` entry.
- CSS adds yellow color token for `pending` (matching existing yellow used elsewhere) and a muted/grey token for `draft`.

**Done when:**
- `PRState` union no longer includes `'updating'`; includes `'pending'` and `'draft'`.
- `deriveStateFromMergeable` maps per the table above; tests cover all 8 input values (`clean`, `behind`, `dirty`, `blocked`, `unstable`, `has_hooks`, `draft`, `unknown`) including the `unknown → previousState` carry-over.
- Popup `StatusBadge` renders `Pending` (yellow) and `Draft` (muted) for the new states.
- A regression test reproduces the sticky-Manual scenario: PR with `previousState='needs-manual'` and `mergeable_state='blocked'` derives `pending`, not `needs-manual`.
- `useGroupedPRs` ATTENTION_STATES updated (drop `updating`, decide whether `pending`/`draft` should count toward the orange repo-group attention dot — leaning **no** for both, since they're informational).
- All existing tests pass with the new state union.

## §2 In progress
_(none)_

## §3 In review
_(none)_

## §4 Blocked
_(none)_

## §5 Future / unscoped
_Open for v1.1+ planning. Add new stories here with `Status: 🟢 Ready` once spec'd._

---

## §7 Shipped log

PR numbers are GitHub PR IDs in this repo. Pre-PR-1 stories landed in the `feat: initial commit — auto-rebaser v0.1.0 …` baseline (commit `1fef878`).

### Phase 1 — v0.1 baseline (initial commit)
- **1.1** GitHub OAuth Sign-in
- **1.2** Authored PR Discovery
- **1.3** Auto-Rebase Behind PRs
- **1.4** State Tracking
- **1.5** User-Configurable Poll Interval
- **1.6** Popup PR List
- **1.7** Poll Now Button
- **1.8** Badge Count
- **1.9** ETag Caching
- **1.10** Error Handling

### Phase 2 — Automations (initial commit / pre-PR-1)
- **2.6** Auto-Delete Merged Branch
- **2.7** Auto-Enable Auto-Merge
- **2.8** Auto-Resolve Obsolete Review Threads

### Phase 4 — Enterprise authentication
- **4.1** GitHub App registration & publication
- **4.2** OAuth Device Flow sign-in — PR #6
- **4.3** Token refresh + storage — PR #7
- **4.4** Dual-path auth UI — PR #8
- **4.5** Per-installation scoping & "Request access" — PR #9
- **4.6** GitHub Enterprise Server (GHES) base-URL config — PR #10

### Phase 5 — Companion automations
- **5.1** Stale-PR badge + ping reviewers — PR #4
- **5.4** Smart merge-method selection — PR #2
- **5.5** Keyboard shortcuts — PR #3
- **5.6** Activity log — PR #1

### v1.0.x follow-ups
- **MERGE-1** Reclassify no-op auto-merge attempts as `skipped` — PR #65
- **MERGE-2** Fall-through direct merge for clean PRs (`mergeCleanPRsImmediately`) — PRs #65, #66, with UI polish in #67, #68, #69
- **STATE-1** Map PR badges to GitHub `mergeable_state` truth — PR #73

---

## 🧊 Deferred / dropped

- **2.9** Auto-Dismiss Stale PR Notifications — **dropped** in PR #46. The required `notifications` PAT scope is unavailable to GitHub Apps, so the automation could only run on the legacy PAT path. Not worth maintaining.
- **5.2** push-since-approval — **dropped**. GitHub branch protection ("Dismiss stale approvals on new commits") covers gating when admins opt in; surfacing-only didn't carry its weight against the existing native option.
- **5.3** flaky-CI auto-retry — **deferred**. Supporting infrastructure (pattern editor, activity log entries, GitHub App permission bump for Checks: Write + Actions: Write) is sized for a headline release. Revisit if/when flaky-CI becomes an explicit Pro-tier anchor.

---

# Original story specs (frozen v1 reference)

The sections below are the original v1 story specs as written on 2026-05-02. They are kept verbatim for historical reference; mark live work in §1–§5 above instead of editing this section.

---

## Story 1.1 — GitHub OAuth Sign-in

**As a user, I want to sign in with GitHub so the extension can access my PRs.**

### Technical Details

- `chrome.identity.launchWebAuthFlow` opens GitHub OAuth authorize URL
- `client_id` and `client_secret` read from `import.meta.env.VITE_GITHUB_CLIENT_ID/SECRET`
- After authorization, extension exchanges `code` for access token via `POST https://github.com/login/oauth/access_token`
- Token stored in `chrome.storage.sync` under key `github_token`
- `state` param generated via `crypto.randomUUID()` and verified on redirect to prevent CSRF

### Acceptance Criteria

- [ ] Clicking "Sign in with GitHub" opens a GitHub authorization popup
- [ ] After authorizing, the popup shows the signed-in username
- [ ] Token is persisted across browser restarts
- [ ] Clicking "Sign out" clears the token and returns to the sign-in screen
- [ ] If the user cancels the OAuth flow, the extension stays on the sign-in screen with no error
- [ ] CSRF: if the returned `state` param doesn't match, auth is rejected

---

## Story 1.2 — Authored PR Discovery

**As a user, I want the extension to find all my open PRs automatically so I don't have to configure anything.**

### Technical Details

- `GET /search/issues?q=is:pr+is:open+author:@me&per_page=100`
- Response `items` array contains `{ id, number, title, html_url, repository_url }`
- `repository_url` format: `https://api.github.com/repos/{owner}/{repo}` — parse owner/repo by stripping prefix
- ETag cached in `chrome.storage.local` under key `etags`; `If-None-Match` header sent on repeat calls; 304 returns cached data

### Acceptance Criteria

- [ ] Extension discovers all open PRs authored by the signed-in user across all repos
- [ ] PRs closed or merged since the last poll are removed from the list on the next poll
- [ ] If the user has no open PRs, the popup shows "No open PRs found."
- [ ] On a 304 response, cached data is used and no additional API call is made
- [ ] API request includes `Authorization: Bearer <token>` header

---

## Story 1.3 — Auto-Rebase Behind PRs

**As a user, I want PRs that are behind their base branch to be rebased automatically.**

### Technical Details

- For each discovered PR: `GET /repos/{owner}/{repo}/pulls/{number}` → check `mergeable_state`
- If `mergeable_state === "behind"`: `PUT /repos/{owner}/{repo}/pulls/{number}/update-branch` with body `{ "update_method": "rebase" }`
- Never calls the PR merge endpoint
- 422 response → `needs-manual` state (complex history, skip)
- 409 response → `conflict` state (merge conflict, skip)

### Acceptance Criteria

- [ ] PRs with `mergeable_state === "behind"` are rebased on each poll cycle
- [ ] `update-branch` is called with `update_method: "rebase"` (never `merge`)
- [ ] A PR that successfully rebases transitions to `updated` state
- [ ] A 422 from `update-branch` transitions the PR to `needs-manual` and is not retried until state changes
- [ ] A PR with `mergeable_state === "dirty"` is marked `conflict` and never sent to `update-branch`
- [ ] Current PRs (clean, blocked, etc.) are left untouched

---

## Story 1.4 — State Tracking

**As a user, I want to see the current status of each PR so I know what the extension has done.**

### Technical Details

- `PRRecord` shape: `{ id, number, title, repo, url, state, lastUpdated, errorMessage? }`
- Stored as `{ prs: PRRecord[], lastPollAt: number | null }` in `chrome.storage.local` under key `pr_store`
- Upsert by `id` — new poll results overwrite previous state for existing PRs; PRs no longer in search results are preserved until they disappear from two consecutive polls (out of scope for MVP: just keep them)

### Acceptance Criteria

- [ ] Each PR has exactly one of these states: `current`, `behind`, `updating`, `updated`, `conflict`, `needs-manual`, `error`
- [ ] State persists across popup close/open
- [ ] State persists across browser restarts
- [ ] `lastUpdated` reflects the epoch ms of the last state change for each PR

---

## Story 1.5 — User-Configurable Poll Interval

**As a user, I want to choose how often the extension polls so I can balance freshness with API usage.**

### Technical Details

- Interval options: 1 / 2 / 5 / 10 / 15 / 30 / 60 / 120 / 240 minutes (1m–4h)
- Stored in `chrome.storage.sync` under key `settings` as `{ intervalMinutes: IntervalMinutes }` (literal union of the values above)
- Default: 5 minutes
- `chrome.alarms.create('poll', { periodInMinutes: N })` recreated when interval changes
- Popup sends `{ type: 'SET_INTERVAL', intervalMinutes: N }` message to service worker on change

### Acceptance Criteria

- [ ] Settings view has a dropdown with options: 1m, 2m, 5m, 10m, 15m, 30m, 1h, 2h, 4h
- [ ] Default interval is 5 minutes on first install
- [ ] Changing the interval immediately reschedules the alarm
- [ ] Selected interval persists across browser restarts
- [ ] Alarm continues polling at the configured interval without user interaction

---

## Story 1.6 — Popup PR List

**As a user, I want a compact popup that shows all my PRs and their current state.**

### Technical Details

- Reads from `chrome.storage.local` `pr_store` via `chrome.storage.local.onChanged` listener for live updates
- Status badge colors: `current` → grey, `behind` → amber, `updating` → blue, `updated` → green, `conflict` / `needs-manual` / `error` → red
- PR row: `[badge] owner/repo#number — title` as a link to the PR
- Footer: "Last poll: HH:MM:SS" or "Last poll: never"

### Acceptance Criteria

- [ ] Popup shows all open authored PRs with status badge and link
- [ ] Status badges use correct colors per state
- [ ] PR title links open the GitHub PR in a new tab
- [ ] "Last poll: never" shown before the first poll cycle
- [ ] Popup updates in real-time when the background service worker completes a poll cycle
- [ ] Empty state message shown when no PRs exist

---

## Story 1.7 — Poll Now Button

**As a user, I want to trigger an immediate poll without waiting for the next alarm.**

### Technical Details

- Popup button sends `{ type: 'POLL_NOW' }` via `chrome.runtime.sendMessage`
- Service worker `onMessage` listener handles `POLL_NOW` by calling `runPollCycle()`

### Acceptance Criteria

- [ ] "Poll now" button triggers an immediate poll cycle
- [ ] The popup PR list updates after the poll completes
- [ ] The "Last poll" timestamp updates after clicking "Poll now"

---

## Story 1.8 — Badge Count

**As a user, I want the extension icon to show how many PRs were rebased in the last cycle so I get passive feedback.**

### Technical Details

- `chrome.action.setBadgeText({ text: N > 0 ? String(N) : '' })` after each poll cycle
- `chrome.action.setBadgeBackgroundColor({ color: '#2da44e' })` (GitHub green)
- Badge cleared (empty string) at the start of each new poll cycle

### Acceptance Criteria

- [ ] Badge shows the count of PRs that transitioned to `updated` in the last poll cycle
- [ ] Badge is cleared (no text) when zero PRs were updated
- [ ] Badge is green (`#2da44e`)
- [ ] Badge resets at the start of each new poll cycle

---

## Story 1.9 — ETag Caching

**As a user, I want the extension to respect GitHub's rate limits so it doesn't get throttled.**

### Technical Details

- `github-client` stores `{ etag, data }` per URL in `chrome.storage.local` under key `etags`
- On each request, sends `If-None-Match: <etag>` if cached
- On 304 response, returns cached `data` without counting against rate limit
- ETags stored/retrieved transparently — callers don't need to know about caching

### Acceptance Criteria

- [ ] First request to a URL stores the ETag from the response
- [ ] Subsequent requests include `If-None-Match` header
- [ ] A 304 response returns the previously cached data
- [ ] A changed response (200) updates the stored ETag and data

---

## Story 1.10 — Error Handling

**As a user, I want the extension to handle errors gracefully so I don't need to babysit it.**

### Technical Details

| Error | Behavior |
|---|---|
| 401 / 403 | Clear token, set `AUTH_ERROR` flag in store, popup shows "Re-authenticate" |
| 422 from `update-branch` | Mark PR `needs-manual`, skip on future polls |
| 409 from `update-branch` | Mark PR `conflict`, skip |
| 429 (rate limit) | Skip current poll cycle entirely, retry on next alarm |
| Network error / 5xx | Mark affected PR `error`, retry on next alarm |
| Search returns 0 results | No-op |

### Acceptance Criteria

- [ ] 401/403 responses clear the stored token and the popup prompts re-authentication
- [ ] Rate-limited cycles are skipped silently with no user-visible error
- [ ] Network errors on individual PRs mark only those PRs as `error`; other PRs in the cycle are unaffected
- [ ] `error` PRs are retried on the next poll cycle
- [ ] `needs-manual` and `conflict` PRs are never retried automatically

---

# Phase 2 — Automations

Stories 2.6–2.9. Each is independently shippable on top of the MVP. All apply only to PRs authored by the signed-in user.

> **Status (2026-05-02):** Phase 2 (stories 2.6–2.9) is **SHIPPED on `main`**. All four automations land via the orchestrator in `src/background/automations/orchestrator.ts`, wired into `poll-cycle.ts`. UI lives under `src/popup/components/AutomationsSettings.tsx`. Live sandbox validation captured in `docs/runbooks/phase2-validation.md`.
>
> **On top of the original 2.6–2.9 spec, the following shipped:**
> - **Global `ignoredRepos`** (default `[]`) — repos here are excluded from search, transition detection, every automation, *and* the popup display (filtered immediately on save, no poll required).
> - **Per-automation skip-repos lists** — `autoDeleteOptOutRepos`, `autoMergeOptOutRepos`, `autoResolveOptOutRepos`, `autoDismissOptOutRepos`. Narrower than the global list: a repo here is excluded from one automation but still polled and shown.
> - **Repo group display** strips the owner prefix when it matches the signed-in user's login (your own repos show as `repo`, org repos still show as `org/repo`).

---

## Story 2.6 — Auto-Delete Merged Branch

**As a user, I want merged PR branches deleted automatically so my repo branch list stays clean even when the repo doesn't have "auto-delete head branches" enabled.**

### Technical Details

- On each poll, detect PRs that transitioned `open → merged` since the previous poll snapshot (compare against `pr_store`).
- For a newly-merged PR, fetch repo settings: `GET /repos/{owner}/{repo}` → `delete_branch_on_merge`. If `true`, skip (GitHub already handled it).
- Otherwise: `DELETE /repos/{owner}/{repo}/git/refs/heads/{head_branch}` where `head_branch` comes from `pull.head.ref`.
- Guard: only delete if `pull.head.repo.full_name === pull.base.repo.full_name` (same-repo branch, not a fork).
- Setting: `settings.autoDeleteMergedBranch: boolean` (default `true`). Per-repo opt-out via `settings.autoDeleteOptOutRepos: string[]`.
- New PR state: `branch-deleted` (terminal). `delete-failed` for retryable errors.
- 422 from delete (branch already gone) → treat as success.

### Acceptance Criteria

- [ ] When an authored PR merges and the repo has `delete_branch_on_merge: false`, its head branch is deleted on the next poll
- [ ] Fork-sourced PRs are never deleted
- [ ] Repos in `autoDeleteOptOutRepos` are skipped
- [ ] Setting can be toggled off globally; when off, no DELETE calls are made
- [ ] A 404 or 422 from the delete endpoint is treated as already-deleted, not an error
- [ ] PR transitions to `branch-deleted` state and is excluded from future polls

---

## Story 2.7 — Auto-Enable Auto-Merge

**As a user, I want authored PRs to auto-merge as soon as checks pass, so I don't have to come back and click merge.**

### Technical Details

- Use GraphQL `enablePullRequestAutoMerge` mutation: requires PR `node_id`, `mergeMethod` (`SQUASH` | `MERGE` | `REBASE`).
- For each open authored PR where `auto_merge === null`: call mutation with configured method.
- Setting: `settings.autoEnableAutoMerge: boolean` (default `false` — opt-in for safety) and `settings.autoMergeMethod: 'SQUASH' | 'MERGE' | 'REBASE'` (default `SQUASH`).
- Skip when: PR is draft, PR is `mergeable_state === "dirty"`, or repo doesn't allow the chosen merge method (detect via 422 response and back off — mark `automerge-unsupported`).
- New PR substate flag: `autoMergeEnabled: boolean` on `PRRecord`.
- Per-repo opt-out: `settings.autoMergeOptOutRepos: string[]`.

### Acceptance Criteria

- [ ] When enabled, an authored open non-draft PR with `auto_merge === null` has auto-merge flipped on within one poll cycle
- [ ] Draft PRs are skipped
- [ ] PRs in conflict (`dirty`) are skipped
- [ ] Default merge method is squash; user can change it in settings
- [ ] If the repo rejects the merge method (422), the PR is marked `automerge-unsupported` and not retried until settings change
- [ ] Setting defaults to OFF on first install — explicit opt-in required
- [ ] Per-repo opt-out list honored

---

## Story 2.8 — Auto-Resolve Obsolete Review Threads

**As a user, I want review comments tied to lines that no longer exist (because I rebased or revised) marked resolved automatically, so review focus stays on live discussion.**

### Technical Details

- For each authored PR that has unresolved review threads, fetch via GraphQL: `pullRequest.reviewThreads(first: 100) { nodes { id, isResolved, isOutdated, line, path } }`.
- A thread is auto-resolvable when: `isResolved === false` AND `isOutdated === true` AND `line === null` (GitHub already detected the anchor is gone).
- Resolve via GraphQL mutation: `resolveReviewThread(input: { threadId })`.
- Setting: `settings.autoResolveOutdatedThreads: boolean` (default `false` — opt-in). Some teams treat outdated comments as still-meaningful. Per-repo opt-out via `settings.autoResolveOptOutRepos: string[]`.
- Track per-thread resolution attempts in `chrome.storage.local` under `resolved_threads: { [threadId]: epochMs }` to avoid re-resolving if a teammate manually unresolves.
- Rate guard: skip thread fetch when ETag indicates no PR changes since last poll.

### Acceptance Criteria

- [ ] When enabled, threads with `isOutdated: true` and `line: null` are resolved on the next poll
- [ ] Threads that are merely outdated but still anchored to a line are NOT auto-resolved
- [ ] A thread previously auto-resolved that gets manually unresolved is not resolved again
- [ ] Setting defaults to OFF; explicit opt-in required
- [ ] Errors on individual thread mutations don't block other threads
- [ ] Counter exposed in popup: "Resolved N obsolete threads this cycle"

---

## Story 2.9 — Auto-Dismiss Stale PR Notifications

> 🧊 **Dropped (2026-05-06, PR #46).** The required `notifications` PAT scope is unavailable to GitHub Apps, so this automation could only run on the legacy PAT path. See 🧊 Deferred / dropped above.

**As a user, I want my GitHub notification inbox cleared of threads tied to PRs that are already closed or merged.**

### Technical Details

- `GET /notifications?all=false&participating=false` (unread only).
- Filter to `subject.type === 'PullRequest'`.
- For each PR notification: parse `subject.url` → `{ owner, repo, number }`. Cross-reference current `pr_store` for state, OR `GET /repos/{owner}/{repo}/pulls/{number}` (cheap with ETag) for `state` + `merged`.
- If PR is `closed` or `merged`: `PATCH /notifications/threads/{thread_id}` (marks thread as read) AND optionally `DELETE /notifications/threads/{thread_id}/subscription` if `settings.unsubscribeStalePRNotifications: true` (default `false`).
- Setting: `settings.autoDismissStaleNotifications: boolean` (default `false`). Per-repo opt-out via `settings.autoDismissOptOutRepos: string[]`.
- Scope: only PRs authored by the signed-in user OR PRs in the user's `pr_store` — never indiscriminately mark every notification.
- New scope token: notification scope requires `notifications` OAuth scope. Add to OAuth flow; if missing, surface "Re-authenticate to enable notification cleanup" in popup.

### Acceptance Criteria

- [ ] When enabled, notification threads for closed/merged PRs are marked read on each poll
- [ ] Notifications for non-PR subjects (issues, discussions, releases) are untouched
- [ ] Notifications for open PRs are untouched
- [ ] If the OAuth token is missing the `notifications` scope, the feature is disabled in the UI with a "Re-authenticate" prompt
- [ ] Setting defaults to OFF
- [ ] Unsubscribe variant is a separate sub-setting and defaults OFF

---

# Phase 4 — Enterprise authentication

Spec: `docs/superpowers/specs/2026-05-02-github-app-auth-design.md`. All Phase 4 stories ship together as v0.2.0. Setup runbook: `docs/runbooks/github-app-setup.md`.

## Story 4.1 — GitHub App registration & publication

**As an extension publisher, I want a GitHub App registered and listed on the Marketplace so users can install it on personal accounts and orgs.**

### Technical Details

- Created at https://github.com/settings/apps/new (or `https://<org>/settings/apps/new` for an org-published App).
- **Naming**: `auto-rebaser` (must be globally unique on GitHub). Lock the URL slug early.
- **Webhooks**: disabled. We poll; no inbound traffic needed.
- **Identifying & authorizing users**:
  - "Callback URL": leave blank (Device Flow doesn't redirect).
  - "Request user authorization (OAuth) during installation": **Enabled** — so the install flow also issues a user token, no separate sign-in step needed for the installer.
  - "Enable Device Flow": **Enabled**.
  - "Expire user authorization tokens": **Enabled** (8h access tokens with refresh tokens).
- **Permissions** (per spec §"GitHub App configuration"):
  - Repository: Pull requests R/W, Contents R, Metadata R.
  - Account: Email addresses R.
  - **Do NOT request** Issues, Workflows, Administration, Actions, Packages — least privilege is a Marketplace review pass/fail criterion.
- **Where can this App be installed?**: "Any account" (personal + orgs).
- **Marketplace listing**: enable when ready. Pricing: free. Categories: Developer Tools / Productivity. Same screenshots & copy as the Web Store listing, plus a permissions justification block.
- **Secrets handled**: client_id is public (ships in extension), no client_secret needed (Device Flow).

### Acceptance Criteria

- [ ] App exists at github.com/marketplace/auto-rebaser
- [ ] Permissions match the spec exactly (verifiable from public App page)
- [ ] A new user can install on a personal account in under 60 seconds
- [ ] An org owner can install with org-wide repo access
- [ ] App's `client_id` is hard-coded into the extension build under `src/core/auth-constants.ts`
- [ ] If the App is later updated to request more permissions, all installs go to "Suspended" until owners re-approve — verified at least once with a no-op permission bump

---

## Story 4.2 — OAuth Device Flow sign-in (Chrome + Firefox)

**As a user, I want to sign in with my GitHub account by entering a short code on github.com so I never paste a token.**

### Architecture

`src/core/auth-device-flow.ts` is a single module with no browser-specific code — Device Flow uses `fetch` and `chrome.tabs.create`, both polyfilled identically by Firefox under the `chrome` namespace.

```ts
export interface DeviceFlowStart {
  userCode: string;         // "ABCD-1234"
  verificationUri: string;  // "https://github.com/login/device"
  deviceCode: string;       // server-side handle, kept for polling
  intervalMs: number;       // 5000
  expiresAt: number;        // epoch ms
}

export async function startDeviceFlow(): Promise<DeviceFlowStart>;
export async function pollDeviceFlow(start: DeviceFlowStart, signal: AbortSignal): Promise<TokenSet>;
```

### Chrome implementation

1. **Popup invokes**: user clicks "Sign in with GitHub App" in the sign-in view. Popup sends `{ type: 'AUTH_BEGIN_DEVICE_FLOW' }` to the service worker.
2. **Service worker**: calls `startDeviceFlow()` → POSTs `https://github.com/login/device/code` with body `{ client_id }`. Stores the `DeviceFlowStart` in memory (NOT in storage — it's short-lived and tied to this attempt).
3. **Returns to popup** the `userCode` and `verificationUri`. Popup renders the code with a Copy button.
4. **Open verification page**: `chrome.tabs.create({ url: verificationUri })`. User completes auth there.
5. **Polling**: service worker polls `https://github.com/login/oauth/access_token` every `interval` seconds (default 5s) with `{ client_id, device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }`. GitHub returns one of:
   - `{ error: 'authorization_pending' }` → keep polling.
   - `{ error: 'slow_down' }` → increase interval by 5s, keep polling.
   - `{ error: 'expired_token' }` → abort, surface to popup.
   - `{ error: 'access_denied' }` → user cancelled, abort.
   - `{ access_token, refresh_token, expires_in, refresh_token_expires_in }` → success.
6. **On success**: persist via `setAuthGitHubApp({ accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt })` to `chrome.storage.local` (NOT sync). Send `{ type: 'AUTH_OK' }` to the popup, which transitions to the PR list.
7. **Popup closed mid-flow**: service worker keeps polling for up to 15 minutes. When user reopens, popup queries `{ type: 'AUTH_STATUS' }` and resumes the in-progress UI.
8. **Stable extension id required** for Marketplace review (the screenshot of the install URL must match across installs). Already satisfied by the existing `key` field in `manifest.json`.

### Firefox implementation

Identical code path. Only manifest differences:

1. **Stable extension UUID**: `manifest.firefox.json` already has `browser_specific_settings.gecko.id = "auto-rebaser@grapentineb.dev"`. This pins the addon-id across installs once signed by AMO.
2. **`chrome.tabs.create`**: Firefox aliases `chrome.tabs.create` → `browser.tabs.create`. No code change.
3. **`chrome.storage.local`**: same alias works.
4. **CSP**: Firefox is stricter on connect-src than Chrome. The default MV3 CSP allows `https://github.com` and `https://api.github.com`. Verify by capturing a network trace during dev — if any request is blocked by CSP, add an explicit `content_security_policy.extension_pages` override in `manifest.firefox.json`.
5. **No background page persistence**: Firefox's MV3 service worker uses `background.scripts: ["service-worker.js"]` (already configured). The polling loop must use `setTimeout`-based scheduling that survives short worker idles, or fall back to `chrome.alarms` for >30s waits. Recommendation: use `chrome.alarms` once interval > 25s, otherwise `setTimeout`.
6. **AMO review**: Device Flow is well-understood; reviewers usually approve same-day. Permissions list should NOT add `identity` (we don't use `launchWebAuthFlow`).

### Test strategy

- Unit-test `startDeviceFlow` and `pollDeviceFlow` against mocked `fetch`. Cover all 5 error responses + success.
- Integration test: hand-rolled in-memory mock GitHub server that walks the state machine `pending → pending → ok` over polling cycles.
- Manual smoke test in both browsers (see RUNBOOK §Auth-DF).

### Acceptance Criteria

- [ ] Clicking "Sign in with GitHub App" displays an 8-character code with a Copy button within 2 seconds
- [ ] A new tab opens to `https://github.com/login/device` with the code visible to the user
- [ ] Successful authorization on github.com transitions the popup to the PR list within 10 seconds
- [ ] User cancellation (closes the github.com tab without authorizing) shows a "cancelled" message in the popup, not an error
- [ ] Code expiry (15 min) shows "Code expired — start over"
- [ ] The flow works identically on Chrome and Firefox; no `if (firefox)` branches in code
- [ ] No request to any host other than `github.com` and `api.github.com`
- [ ] `client_secret` does not appear anywhere in the bundled extension (verified via `grep -ri client_secret dist/`)

---

## Story 4.3 — Token refresh + storage

**As a long-running user, I want my session refreshed automatically so I rarely sign in again.**

### Technical Details

- Storage shape (under `chrome.storage.local` key `auth`):

  ```ts
  type Auth =
    | { method: 'github_app';
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresAt: number;     // epoch ms
        refreshTokenExpiresAt: number;    // epoch ms
        installations: Array<{ id: number; account: string; type: 'User' | 'Organization' }>;
      }
    | { method: 'pat'; token: string; notificationsScopeGranted: boolean };
  ```

- Refresh trigger: any `fetch` to GitHub API checks `now > accessTokenExpiresAt - 5min`; if so, await `refreshAccessToken()` first.
- Reactive 401 path: on 401 from GitHub, single retry after refresh. Two consecutive 401s → mark refresh-token expired and notify popup.
- **Single in-flight refresh**: a module-level `let inFlight: Promise<string> | null`. All concurrent calls await the same promise. Reset to null on resolve/reject.
- **Refresh token rotation**: GitHub returns a new `refresh_token` on every refresh. Persist atomically — old refresh token is invalid the moment the new one is issued. If we crash between issuing the request and persisting the response, user must re-sign in. Acceptable for current scale.
- **Refresh token expiry** (~6 months): if `now >= refreshTokenExpiresAt`, do not even attempt refresh; clear auth and show sign-in.
- Service worker idle eviction: token state is in `chrome.storage.local`, not in module memory, so worker restart is transparent.

### Test strategy

- Mock `fetch` to return 401 first, then 200. Assert refresh ran and the API call succeeded.
- Concurrent calls test: kick off 5 parallel `fetch` wrappers when token is stale; assert exactly 1 refresh request hit GitHub.
- Refresh-token-expired test: stub `refreshTokenExpiresAt` in the past, call API, assert sign-in screen surfaced via `AUTH_EXPIRED` message.
- Persistence test: refresh, then simulate worker restart by reloading the auth-store; new tokens are read back.

### Acceptance Criteria

- [ ] An access token within 5 minutes of expiry is refreshed before the next API call
- [ ] A 401 response triggers a single refresh + retry; repeated 401 surfaces sign-in screen
- [ ] Concurrent API calls during refresh share one refresh request (verified via test)
- [ ] Refresh-token rotation: each refresh persists the new refresh token atomically
- [ ] Refresh-token expiry forces sign-in without burning a request to GitHub
- [ ] No tokens written to `chrome.storage.sync` (verified by integration test)

---

## Story 4.4 — Dual-path auth UI

**As a user, I want to choose between GitHub App and PAT, with App as the recommended default.**

### Technical Details

- `SignInView` rendered with two radio options:
  - "Sign in with GitHub App (recommended)" — calls `AUTH_BEGIN_DEVICE_FLOW`.
  - "Use a Personal Access Token (legacy)" — collapses to current PAT input.
- New users default to GitHub App. Existing PAT users keep working with no UI change until they sign out.
- **Migration banner**: PAT users see a one-time dismissible banner at top of the PR list:

  > "Your PAT works fine, but GitHub App auth is more secure and works at companies that block PATs. [Switch to GitHub App] [Dismiss]"

  Banner state stored in `chrome.storage.sync` under `migration_banner_dismissed: boolean`.
- **Settings → Account section**: shows current method and lets user switch. Switching = sign-out + re-sign-in with the other method.
- **Reauth for PAT users** (Story 2.9 notifications scope) keeps the existing CTA. App users see a different message: "Notification cleanup is unavailable when signed in via GitHub App. [Switch to PAT to enable]"

### Acceptance Criteria

- [ ] Sign-in view shows both options, with GitHub App pre-selected
- [ ] User can complete sign-in via either path
- [ ] After sign-in, popup shows which method was used ("via GitHub App" / "via PAT")
- [ ] Switching methods is a 2-click flow (sign out → sign in with other method)
- [ ] Migration banner appears for PAT users exactly once (per-device); dismissal persists
- [ ] Existing PAT users upgrading to v0.2.0 are not signed out automatically

---

## Story 4.5 — Per-installation scoping & "Request access"

**As a user whose org hasn't installed the App, I want clear guidance on how to ask my admin.**

### Technical Details

- After Device Flow success, `GET /user/installations` returns `installations: Array<{ id, account: { login, type }, repository_selection, target_type }>`.
- Cache the list in `auth.installations` to display "via GitHub App on octocat, acme-corp" in the popup.
- If the user has zero installations:
  - Popup shows empty-state with: "The Auto Rebaser App isn't installed on any account you can access. [Install on personal] [Request for an org]"
  - "Request for an org" links to `https://github.com/apps/auto-rebaser/installations/new` — GitHub's standard request flow.
- During poll cycles, if a PR's repo is not covered by any installation: PR rendered with a yellow "App not installed in <org>" badge linking to install request.
- Org-suspended installations (admin re-approval pending) show with a different badge and don't get any automation actions until re-approved.

### Acceptance Criteria

- [ ] Popup shows installations list under user info
- [ ] Zero-installations user sees install/request links, not an empty PR list
- [ ] PRs in repos without installation render with a clear "App not installed" badge
- [ ] Suspended installation: PRs render but no rebase / merge / delete attempts are made
- [ ] Re-approval of a suspended installation is reflected on the next poll without sign-in

---

## Story 4.6 — GitHub Enterprise Server (GHES) base-URL config

**As an enterprise user on a self-hosted GHES instance, I want to point the extension at my company's GitHub.**

### Technical Details

- Settings adds `enterpriseHost?: string` (e.g. `github.acme.corp`). Empty = github.com.
- All endpoints derived from a single helper:

  ```ts
  function ghOrigin(host?: string) { return host ? `https://${host}` : 'https://github.com'; }
  function ghApiOrigin(host?: string) { return host ? `https://${host}/api/v3` : 'https://api.github.com'; }
  ```

- The same `client_id` cannot be reused — GHES has its own GitHub App registry. Settings UI prompts for the GHES `client_id` when host is set. (Not a secret; safe to ship blank-by-default.)
- GraphQL endpoint differs: `https://github.com/api/graphql` vs `https://<host>/api/graphql`.
- All `host_permissions` in manifest become wildcard-restricted: we cannot statically know GHES hosts. **Solution**: at runtime, when user sets `enterpriseHost`, request optional permission `https://<host>/*` via `chrome.permissions.request`. Manifest declares `optional_host_permissions: ["*://*/*"]` (Chrome) and `optional_permissions` (Firefox).
- Token refresh and Device Flow URLs swap to GHES. Same code, different origin.

### Acceptance Criteria

- [ ] Settings exposes `enterpriseHost` field with validation (no protocol, no path)
- [ ] Setting `enterpriseHost` triggers `chrome.permissions.request` for the host; rejection reverts the setting
- [ ] All API calls (REST + GraphQL + OAuth) target the configured host
- [ ] Sign-in via Device Flow works against a real GHES test instance
- [ ] Switching between github.com and a GHES host requires sign-out + sign-in (no token cross-leakage)
- [ ] Removing `enterpriseHost` revokes the optional host permission

---

# Phase 5 — Companion automations

Spec: `docs/superpowers/specs/2026-05-02-phase5-companion-automations-design.md`. All Phase 5 stories ship together as v0.2.1. **All UI lives in the toolbar popup** — no content scripts, no options page, no secondary windows.

## Story 5.1 — Stale-PR badge + ping-reviewers

**As a user, I want my own idle PRs surfaced so I can follow up before they're forgotten — without auto-closing anyone's work.**

### Technical Details

- **No new endpoints.** PR detail already returns `updated_at` (covers commits, comments, reviews).
- At poll time, after fetching detail, compute idle days and store on the PR record:
  ```ts
  type PRRecordPhase5 = {
    staleness?: { idleDays: number; lastActivityAt: number };
  };
  ```
- Threshold resolution: `staleThresholdOverrides[fullName] ?? staleThresholdDays` (default 14).
- State machine impact: **none.** `staleness` is additive metadata; existing states (current/behind/etc.) are orthogonal.
- `hasAttention` interaction: stale does NOT trigger the orange repo-group dot by default. Setting `staleCountsAsAttention: boolean` (default `false`) lets users escalate.
- **Ping action:** `POST /repos/{owner}/{repo}/issues/{number}/comments` with body from configurable template.
- Throttle: per-PR `lastPingedAt` in `chrome.storage.local`. Disable button for 24h after a ping; show "pinged Xh ago" in the row.

### Storage

```ts
// chrome.storage.sync (settings)
{
  staleThresholdDays: 7 | 14 | 30 | 60,
  staleThresholdOverrides: Record<string, 7 | 14 | 30 | 60>,
  staleCountsAsAttention: boolean,
  enableStaleBadge: boolean,
  enablePingReviewers: boolean,
  pingTemplate: string,
}

// chrome.storage.local (throttle)
{
  pingedPRs: { [prId: number]: { at: number } },
}
```

### UI (popup-only)

- PR row: `idle 14d` muted-amber pill; format degrades past 7d (`idle 3w`, `idle 2mo`); `ping ↗` link only when permitted.
- Ping confirmation: full-popup view replacing main content. Shows the exact comment body that will post and the list of reviewers to be tagged. Cancel returns; Post comment confirms and POSTs.
- Settings: stale-badge toggle; discrete threshold (7/14/30/60); attention-escalation toggle; ping-button toggle; template textarea; "Skip repos" + per-repo threshold override list. All in the existing automations settings view — no new top-level sections.

### Acceptance Criteria

- [ ] PRs whose `updated_at` is older than the effective threshold show an `idle Nd/Nw/Nmo` badge in the popup
- [ ] Badge respects per-repo threshold override
- [ ] Stale state does NOT trigger the repo-group attention dot unless `staleCountsAsAttention` is on
- [ ] Ping button hidden when `enablePingReviewers` is off, when there are no requested reviewers, or when pinged in the last 24h
- [ ] Clicking ping shows a full-popup confirmation view with the exact comment body and reviewer list before any API call
- [ ] After confirmation, comment posts and "pinged Xh ago" appears in the row
- [ ] Cancellation in the confirmation view returns to the PR list with no API call
- [ ] No content-script injection into github.com (verified by manifest review)

---

## Story 5.4 — Smart merge-method selection

**As a user, I want auto-merge to pick the right method per repo without per-repo configuration.**

### Why this replaces the original 5.4

GitHub already exposes per-repo allowed methods (`allow_squash_merge`, `allow_merge_commit`, `allow_rebase_merge`) on `GET /repos/{owner}/{repo}` — which we already call. The right design is to consume that signal and pick the first user-preferred method the repo allows. No per-repo override list needed.

### Technical Details

- Existing repo-cache extended with the three boolean fields.
- Replace `autoMergeMethod: MergeMethod` setting with `mergeMethodPreference: MergeMethod[]` (ordered, default `['SQUASH', 'REBASE', 'MERGE']`).
- Resolution at auto-merge time:
  ```ts
  function resolveMergeMethod(
    preference: MergeMethod[],
    repo: { allow_squash_merge: boolean; allow_merge_commit: boolean; allow_rebase_merge: boolean },
  ): MergeMethod | null {
    for (const method of preference) {
      if (method === 'SQUASH' && repo.allow_squash_merge) return 'SQUASH';
      if (method === 'MERGE' && repo.allow_merge_commit) return 'MERGE';
      if (method === 'REBASE' && repo.allow_rebase_merge) return 'REBASE';
    }
    return null;
  }
  ```
- `runEnableAutoMerge` consults this for each PR. If `null`, surface a small "auto-merge skipped: no allowed method" badge on the row; do not error.
- **Migration:** existing `autoMergeMethod: 'SQUASH'` setting maps to `mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE']` on first load (existing value first, others appended in default order).

### UI (popup-only)

- Auto-merge settings block: replace the single dropdown with a reorderable list of three rows (squash / rebase / merge), each with an enable checkbox.
- Reordering: drag handles preferred; if drag is too heavy, fall back to per-row up/down arrows. Either way, popup-only.
- PR row, when no method matches: small inline `auto-merge skipped: no allowed method` badge with a tooltip explaining which methods the repo allows.

### Acceptance Criteria

- [ ] On first load after upgrade, existing `autoMergeMethod` value migrates to first slot in `mergeMethodPreference`; no user re-configuration needed
- [ ] Auto-merge picks the first preference that the repo's GitHub settings allow
- [ ] Disabling all preferences disables auto-merge globally (the kill-switch already exists; this is a no-op confirmation)
- [ ] When no preference matches a repo, a clear inline badge surfaces on affected PR rows
- [ ] Reordering preferences in settings persists and takes effect on the next poll
- [ ] No new endpoints called (uses existing repo cache)

---

## Story 5.5 — Keyboard shortcuts

**As a power user, I want to drive the popup without a mouse.**

### Technical Details

- Popup-only; no `chrome.commands` (those require user-binding via `chrome://extensions/shortcuts` and aren't worth the friction for in-popup utility shortcuts).
- Single `useKeyboardShortcuts` hook on the popup root attaches a `keydown` listener.
- Skip when `event.target` is editable (`input`, `textarea`, `select`, `contentEditable`).
- Shortcuts:
  - `r` → poll now (sends `POLL_NOW` message; spinner appears as today)
  - `s` → navigate to settings
  - `Esc` → navigate back from settings or any full-popup view (ping confirm, help)
  - `?` → open help view
  - `j` / `k` → focus next / previous visible PR row (skips PRs in collapsed repo groups)
  - `Enter` → open the focused PR via `chrome.tabs.create({ url: focusedPR.url })`
- Focus state: `focusedPRId: number | null` in popup state; visual indicator via `data-focused="true"` attribute + CSS `:focus-visible`-style rule.

### UI (popup-only)

- Help view: full-popup view replacing main content. Static table of shortcuts.
- Footer hint: small `?` icon at the right edge of the existing footer opens the help view.
- Settings: single toggle "Enable keyboard shortcuts" (default ON). No per-shortcut binding.

### Acceptance Criteria

- [ ] Pressing `r` triggers a poll; pressing `s` opens settings; pressing `Esc` returns
- [ ] `j` / `k` cycle through visible rows (collapsed-group rows skipped)
- [ ] `Enter` opens the focused PR in a new tab
- [ ] `?` opens the help view; `Esc` closes it
- [ ] Shortcuts do NOT fire when the user is typing in an input, textarea, or select
- [ ] Toggling "Enable keyboard shortcuts" off disables all bindings without reload
- [ ] Visual focus indicator visible on the focused row

---

## Story 5.6 — Activity log

**As a user, I want a persistent record of every automated action the extension takes so I can investigate when something looks surprising.**

### Technical Details

- Storage: `chrome.storage.local` under key `activity`. Format `{ entries: ActivityEntry[] }`.
- Cap: 200 entries OR 30 days, whichever hits first.
- Logged actions (write only — never read-only operations like polls, ETag-cached responses, or status checks):
  - `rebase` (Story 1.3)
  - `branch_deleted` (Story 2.6)
  - `auto_merge_enabled` (Story 2.7)
  - `thread_resolved` (Story 2.8)
  - `notification_dismissed` (Story 2.9)
  - `reviewer_pinged` (Story 5.1)
- Entry shape:
  ```ts
  type ActivityEntry = {
    at: number;            // epoch ms
    action: ActivityAction;
    repo: string;          // "owner/repo"
    prNumber: number;
    prTitle: string;       // captured at action time (titles change)
    result: 'success' | 'failed';
    errorMessage?: string;
    branchRef?: string;        // for branch_deleted
    mergeMethod?: MergeMethod; // for auto_merge_enabled
    threadId?: string;         // for thread_resolved
    reviewers?: string[];      // for reviewer_pinged
  };
  ```
- **Write path: once per poll cycle.** The orchestrator already aggregates results from every adapter at the end of `runPollCycle`. It mints `ActivityEntry[]` from those results and does **one** read-modify-write at the end of the cycle. No `appendActivity` calls scattered through adapters; existing adapters and their tests stay untouched.
- Failure mode: storage write errors are non-fatal — log to console, automations continue. Audit gap for that cycle accepted.
- Helpers: `appendActivity(newEntries: ActivityEntry[])` and `trimByCapAndAge(entries, 200, 30 * 86400_000)`.

### Why `chrome.storage.local` (not IndexedDB / sync / session)

- `chrome.storage.session`: in-memory only; defeats audit purpose.
- `chrome.storage.sync`: 100KB total / 8KB per item / 1800 ops/hr — eats the budget; tokens-class data shouldn't sync to other devices.
- IndexedDB: correct shape for time-series, wrong scale at 200 entries / 40KB. Adds ~100 LOC of versioning ceremony for no payoff. Migration path exists if log ever exceeds ~5K entries.
- `chrome.storage.local`: matches existing project convention (PR cache, ETags, throttle state); 10MB quota; adequate.

### UI (popup-only)

- **Activity log view** (full-popup view, replaces main content):
  - Action filter dropdown: `All / rebase / branch_deleted / auto_merge_enabled / thread_resolved / notification_dismissed / reviewer_pinged`.
  - Repo filter dropdown: populated from log contents.
  - Clear log button: confirmation dialog, replaces stored entries with empty array.
  - Entries: timestamp (relative <1h, absolute thereafter), repo, PR number+title, action, result, optional details (branch ref, merge method, etc.), optional error.
  - Empty state: "No activity yet. The extension logs every automated action here."
- **Footer counter clickable:** existing `rebased N · deleted M` line opens activity log filtered to today's entries. Plain `view activity (37)` link is the secondary entry point.
- **No setting to disable.** Always-on; users who want it gone use Clear log. Disabling would create a footgun ("why didn't this get logged?") and saves negligible storage.

### Privacy disclosure

`PRIVACY.md` gains one row in the storage table:

> | Activity log (action, repo, PR number, PR title, result, timestamp) | `chrome.storage.local` | Audit trail for automated actions. Capped at 200 entries / 30 days. Cleared on demand via "Clear log". Never synced. |

### Acceptance Criteria

- [ ] Every write action generates exactly one log entry per occurrence
- [ ] Failed actions log with `result: 'failed'` and an `errorMessage`
- [ ] Log writes happen **once per poll cycle**, not once per action (verified by test that runs a multi-action cycle and asserts a single `chrome.storage.local.set` call against `activity`)
- [ ] Log automatically trims to ≤ 200 entries and entries < 30 days old
- [ ] Activity log view loads in <100ms with a 200-entry log
- [ ] Action and repo filters narrow displayed entries client-side without reloading
- [ ] "Clear log" confirms before deleting and empties the store
- [ ] Footer counter line is clickable and opens the log filtered to today's date
- [ ] Storage write failure is non-fatal; automations continue, error logged to console
- [ ] No log entries are written for read-only operations
- [ ] Existing automation adapters and their tests are untouched (verified by diff review)

---

## Considered and dropped (Phase 5)

- **5.2 push-since-approval** — GitHub branch protection ("Dismiss stale approvals on new commits") covers gating when admins opt in; surfacing-only didn't carry its weight against the existing native option.
- **5.3 flaky-CI auto-retry** — supporting infrastructure (pattern editor, activity log, GitHub App permission bump for Checks: Write + Actions: Write) is sized for a headline release. Revisit if/when flaky-CI becomes an explicit Pro-tier anchor.
