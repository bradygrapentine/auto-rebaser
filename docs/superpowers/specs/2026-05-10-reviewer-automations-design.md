# REVIEWER-AUTOMATIONS — design spec

**Date:** 2026-05-10
**Status:** Approved (brainstorming complete)
**Backlog ref:** `docs/superpowers/BACKLOG.md` §5 REVIEWER-AUTOMATIONS
**Related:** PR #102 (Story 5.2-A push-since-approval — `src/core/stale-approval.ts` latest-decisive-per-login filter is reused here)

## §1 — Scope & non-goals

### In scope

- New popup view: **Reviewer tab** listing PRs where the user is a requested reviewer or assignee. Discovery query: `is:pr is:open (review-requested:@me OR assignee:@me) -author:@me` minus closed/merged.
- One automation, conservatively gated: **auto-enable auto-merge on a reviewer PR** when all four gates pass (master toggle, repo allowlist, my-approval, last-required-gate).
- Settings master toggle `enableReviewerTab` (default `false`). When `false`, no extra search query runs and no UI element appears — zero disruption to existing users.
- Per-repo allowlist `autoMergeReviewerOptInRepos: string[]` (default `[]`). Gates the auto-merge action; empty list disables auto-merge even with master toggle on.
- Separate auto-merge sub-toggle `enableReviewerAutoMerge` (default `false`). User can opt in to the reviewer dashboard without opting in to the automation.

### Out of scope (explicitly NOT v1)

- Auto-rebase on others' PRs — requires `Contents: write` and trips org branch-protection in common configurations.
- Branch-delete, auto-resolve-outdated-threads, ping-reviewers — N/A to the reviewer role per the §5 BACKLOG safety analysis.
- Push-since-approval re-request on others' PRs — that's the author's responsibility.
- Per-PR ad-hoc "arm auto-merge" button — the allowlist is the consent surface. Keeps UX uniform and avoids two consent models on one screen.
- Cross-account aggregation of reviewer PRs — each account scope shows its own reviewer list, matching B1/B2's per-account model.

## §2 — Discovery

A new search query runs **per account per poll cycle**, only when `enableReviewerTab=true`:

```
is:pr is:open (review-requested:@me OR assignee:@me) -author:@me
```

- **API budget impact**: +1 search query per account per cycle. GitHub REST search rate limit is 30/min/user — well below ceiling even with multiple accounts at default 5-minute polling.
- Same paging convention as the existing authored search (`SEARCH_PAGE_SIZE`, currently 50).
- Results stored under the new `accounts.<id>.reviewerPRs` namespace (separate from `accounts.<id>.prs`) so popup tab state and badge counts stay isolated.
- Phase-2 detail enrichment (mergeable state, requested reviewers, review decision) reuses the existing `getPR` / detail-fetcher path — it is PR-agnostic about author vs reviewer relationship.

## §3 — Popup UX

### Header (when `enableReviewerTab=true`)

```
┌────────────────────────────────────┐
│ ☰  auto-rebaser    @brady ▾    ⚙  │
├────────────────────────────────────┤
│ [ Authored (4) ] [ Reviewer (3) ]  │  ← new tab bar
├────────────────────────────────────┤
│ (PR list scoped to active tab)     │
```

- Tab bar component lives between the existing header and the PR list. Hidden entirely when the toggle is off.
- Active-tab state is **session-local** — popup always reopens on the Authored tab. Matches existing badge-count semantics.
- Each tab shows a count chip reflecting that scope's results filtered by the same staleness/state rules as today.
- Existing controls (search/filter chip from B2/2.5, sort, repo group expand/collapse) live **inside** each tab — they apply to the active scope, not globally.
- Keyboard shortcuts (Story 5.5): `1` / `2` switch tabs; existing `j` / `k` / `r` / `s` / `Enter` / `Esc` unchanged within whichever tab is active.

### Per-row affordances on the Reviewer tab

Reviewer rows use a different state vocabulary than authored rows because the state machine is about *my* review, not about the PR's mergeability:

| State chip | Meaning |
|---|---|
| `awaiting review` | I'm a requested reviewer, haven't reviewed yet |
| `i approved` | My latest review state is APPROVED |
| `i requested changes` | My latest review state is CHANGES_REQUESTED |
| `re-review` | Author pushed since my approval — mirror of the 5.2-A badge but on the *other* side |
| `auto-merge armed` | Allowlist + my-approval + last-gate fired; GitHub's auto-merge is enabled |

No automation buttons on rows — the only action is "open PR on github.com" (click anywhere on the row, same as today's authored rows). The Reviewer tab is a dashboard with one quiet background automation, not an action surface.

### Settings panel changes

A new "Reviewer automations" section in Settings (only rendered when `enableReviewerTab=true` to reduce noise):

```
─── Reviewer automations ──────────────
[✓] Show reviewer dashboard tab
    Adds a Reviewer tab to the popup with PRs
    where you're a requested reviewer or assignee.

    [✓] Auto-enable auto-merge after I approve
        Fires when I'm the last required gate.
        Allowlist repos:
        ┌──────────────────────────────┐
        │ org/api                      │
        │ org/web                      │
        │ + add repo                   │
        └──────────────────────────────┘
```

## §4 — Auto-merge gate logic

The gate runs per reviewer PR per cycle. It fires the existing `enableAutoMerge` GraphQL mutation (reused) when **all four** gates pass:

1. **Master gate** — `enableReviewerTab === true` AND `enableReviewerAutoMerge === true`.
2. **Allowlist gate** — `pr.repo` ∈ `autoMergeReviewerOptInRepos`.
3. **My-approval gate** — `latestDecisiveStatePerLogin[currentUserLogin] === 'APPROVED'`. Reuses the latest-decisive-state-per-login filter from `src/core/stale-approval.ts` (5.2-A) — same correctness model.
4. **Last-gate gate** — PR's `reviewDecision === 'APPROVED'` (GraphQL `PullRequestReviewDecision`) AND `requested_reviewers.length === 0` (no still-pending reviewers from branch protection or explicit requests).

Once fired, the result is cached on the PR record as `reviewerAutoMergeArmed: { at: number }` so we don't re-issue the mutation every cycle.

### Edge cases

- **422 "Pull request is in clean status"** (auto-merge enable refused because PR would merge immediately): fall through to `mergeCleanPRsImmediately` **only if** the user has that setting enabled. Default behavior — log and skip; user clicks merge themselves on github.com.
- **404 / no permission**: log + remove repo from allowlist with a UI banner (`auto-merge failed in org/api — removed from allowlist; re-add to retry`). Don't silently keep retrying.
- **Network error**: leave armed state untouched; retry next cycle.
- **Re-review state** (author pushed since my approval): invalidate `reviewerAutoMergeArmed`, drop back to `re-review` chip, require fresh approval before re-arming. Detection reuses the head-SHA-cycle-boundary semantics from 5.2-A.

### Activity log

New action type `reviewer_auto_merge_armed` — fields: `repo`, `prNumber`, `prTitle`, `at`. Visible in the existing activity log view (B3's account-filter chip already handles cross-account scoping correctly).

## §5 — Data flow & storage

### New storage keys

Under the `accounts.<id>` namespace, per the MA-1 multi-account storage facade:

| Key | Shape | Purpose |
|---|---|---|
| `reviewerPRs` | `Record<number, PRRecord & PRRecordPhaseTwo>` | Parallel to existing `prs`; isolated namespace |
| `reviewerAutoMergeArmed` | `Record<number, { at: number }>` | Per-PR "already armed" cache to suppress duplicate mutations |

### New global settings

In `AutomationSettings` (`src/core/automations-types.ts`):

```ts
enableReviewerTab: boolean;               // default false
enableReviewerAutoMerge: boolean;         // default false (also requires allowlist non-empty)
autoMergeReviewerOptInRepos: string[];    // default []
```

### Poll-cycle changes

- Existing `runPollCycle` gains a `reviewerPhase` after the authored phase, gated on `enableReviewerTab`. Same shape as the authored phase, different search URL, writes to `reviewerPRs` instead of `prs`.
- Phase-2 detail enrichment is shared — `getPR` and the detail-fetcher are PR-agnostic.
- The auto-merge gate runs at the end of `reviewerPhase`, only on PRs that passed all four gates and aren't already in `reviewerAutoMergeArmed`.

### Migration

- New settings default to safe-off values → forward-compatible with existing stored `AutomationSettings` shape via the merge-with-defaults pattern already in place. No schema migration needed; same pattern as 5.2-A's `enablePushSinceApproval` addition.

## §6 — Testing strategy

- **Unit**: `tests/core/reviewer-auto-merge-gate.test.ts` — pure 4-gate truth table covering all 16 combinations + the latest-decisive-per-login interaction.
- **Integration**: `tests/background/poll-cycle.reviewer.test.ts` — master toggle OFF skips query; toggle ON runs query, populates `reviewerPRs`, fires gate where applicable, caches `reviewerAutoMergeArmed`, suppresses duplicate mutations on second cycle, handles 422 / 404 / network paths.
- **UI**: `tests/popup/views/PRListView.reviewer-tab.test.tsx` — tab visibility gated by toggle, count chip rendering, tab-switch behavior, state-chip rendering for all 5 chips, keyboard shortcuts (1 / 2).
- **Endpoint**: `tests/github/endpoints/reviewer-search.test.ts` — search query construction, paging, error handling.
- **Settings UI**: `tests/popup/components/AutomationsSettings.reviewer.test.tsx` — section visibility gated by master toggle, allowlist add/remove.
- Coverage thresholds unchanged: 95 / 88 / 95 / 95 (statements / branches / functions / lines).

## §7 — Effort estimate

~3 days, single track. Suggested decomposition:

1. Storage + settings shape + types (~0.5d) — `automations-types.ts`, multi-account namespace additions, migration test
2. Reviewer search endpoint + poll-cycle reviewer phase (~1d) — `src/github/endpoints/reviewer-search.ts`, `src/background/poll-cycle.ts` reviewer phase
3. Auto-merge gate logic + activity log entry (~0.5d) — `src/core/reviewer-auto-merge-gate.ts`, activity-log type extension
4. Popup tab UI + state chips (~0.5d) — tab bar component, `PRListView` scope split, reviewer state-chip renderer
5. Settings panel UI + allowlist management (~0.5d) — `AutomationsSettings.tsx` new section, allowlist editor reusing existing repo-opt-out-list pattern

---

## Open implementation questions

(None blocking — all design decisions resolved in brainstorming. Surface these during plan-writing if any reshape scope.)

- Whether to share the tab-bar component shape with any future "Notifications" or "Activity" view, or keep it private to PRListView. Recommend: keep private until a second caller materializes.
- Whether the allowlist UI should be repo-suggestion-completing (using known repos from `accounts.<id>.knownRepos`) or pure free-text. Recommend: suggestion-completing — pattern already exists in B2's repo-filter chip.
