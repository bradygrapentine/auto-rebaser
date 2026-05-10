# Story 5.2-A — Push-since-approval (actionable)

_Drafted: 2026-05-10 · target: v2.1.0 · effort: 2 dev days · single PR · depends on Sprint 1 merged_
_Revised 2026-05-10 after Opus plan review — see "Plan review revisions" at bottom._

> **Decision history:** the surfacing-only flavor of 5.2 was dropped (BACKLOG §🧊) because branch protection's "Dismiss stale approvals on new commits" handles gating. The actionable flavor solves a different problem: branch protection lapses the approval but does **not** re-request review. This plan covers the actionable form.

## Goal

When commits land on a PR after it was approved, surface a `! re-review` chip on the row. Clicking opens a confirmation modal (mirroring the 5.1 ping-reviewer flow); confirm posts an idempotent `POST /repos/:o/:r/pulls/:n/requested_reviewers` adding the previous approvers back into the requested-reviewers list.

## User-facing changes

| Single-account | Multi-account |
|---|---|
| New per-PR badge `! re-review` next to the existing stale badge when the latest commit's `committed_at` is later than the most-recent approving review's `submitted_at`. | Same badge; per-account toggle (B2 split) so each account can opt in independently. |
| Click → confirm modal showing "Re-request review from @alice, @bob?" with `cancel` / `re-request` buttons. | Same modal. Action throttled per-(account, PR) at 24 hours. |
| Default: badge ON; action OFF (user has to flip the action toggle in settings). | Same defaults. |

## File-touch list

### New

- `src/core/stale-approval.ts` — pure detector. Given (latest commit `committed_at`, most-recent approving review `submitted_at`, list of approver logins), returns `{ stale: boolean; approvers: string[]; lastPushedAt: number; lastApprovedAt: number } | null`.
- `src/github/endpoints/reviews.ts` — `listReviews(owner, repo, num)` (GET `/repos/:o/:r/pulls/:n/reviews?per_page=100` — single page; PRs with >100 decisive reviews are extreme outliers and degrade gracefully via the latest-per-login collapse). `requestReviewers(owner, repo, num, logins)` (POST `/repos/:o/:r/pulls/:n/requested_reviewers`). Empty `logins` is a guarded no-op (return early — never POST an empty body, which GitHub will accept as a no-op but wastes a quota call). The function maps a 422 response with `errors[].code === 'invalid'` and `field === 'reviewers'` to a structured `{ alreadyRequested: true }` result so callers don't surface a fake error to the user when the only "problem" is that the same login was already requested. PR-author-as-reviewer 422 surfaces as a real error.
- ~~`src/github/endpoints/commits.ts`~~ — **DROPPED** after plan review. We don't need a per-commit timestamp; the head-SHA cycle boundary is what defines "the push" for our purposes (a rebase resets `committer.date` but not the cycle boundary, so commit dates can produce false negatives). The detector compares approval timestamps against `lastHeadShaChangedAt` (poll-cycle wall clock when the head SHA was first observed to differ from the cached one).
- `src/core/rerequest-throttle.ts` — mirror of `src/core/ping-throttle.ts` but keyed on `<accountId>` namespace via `readAccountKey('rerequestedPRs')`. Same 24h window, same prune-on-write pattern.
- `src/popup/views/RerequestConfirmView.tsx` — confirm modal. Mirrors `PingConfirmView.tsx` shape; lists approvers, confirm button calls the endpoint + records throttle.
- `tests/core/stale-approval.test.ts`, `tests/core/rerequest-throttle.test.ts`, `tests/github/endpoints/reviews.test.ts`, `tests/popup/views/RerequestConfirmView.test.tsx`.

### Modified

| File | Change |
|---|---|
| `src/core/automations-types.ts` | Add `enablePushSinceApproval: boolean` (default ON) and `enableRequestRereview: boolean` (default OFF). |
| `src/core/automations-types.ts` (PRRecordPhaseTwo) | Add `staleApproval?: { lastApprovedAt: number; lastPushedAt: number; approvers: string[] } \| null` — populated when detector fires; explicit `null` is the "negative cache" written when the detector ran and found nothing (so we don't refetch every cycle). `lastSeenHeadSha?: string` and `lastHeadShaChangedAt?: number` are also added: tracking the SHA across cycles is what tells us a push happened, and the cycle-boundary timestamp is what we compare approvals against (NOT `commit.committer.date`, which is dev-clock and can predate the approval after a rebase). |
| `src/core/storage/multi-account.ts` (AccountState) | Add `rerequestedPRs: RerequestStore` to mirror `pingedPRs`. |
| `src/core/auth-store.ts` (`clearAuth`) | Drop `rerequestedPRs` alongside `pingedPRs` on sign-out. |
| `src/background/poll-cycle.ts` | After fetching PR detail (the existing `prDetails` pass), gate by `enablePushSinceApproval` AND a head-SHA-changed-since-last-cycle check. When gated, call `listReviews` + `listPRCommits`, run the detector, and write `staleApproval` onto the processedPRs entry. Cache approvers across cycles via the prior record so we don't re-fetch when the head SHA is stable. |
| `src/popup/components/PRRow.tsx` (or wherever the existing badges live) | Render a `! re-review` chip when `pr.staleApproval` is defined AND `enablePushSinceApproval` is true. Click → onRerequest(pr). When the action toggle is off, render the chip as a passive label (no click handler). |
| `src/popup/views/PRListView.tsx` | New `rerequest` view-state mirroring the existing `ping` view-state: when set, render `RerequestConfirmView`; on success, return to list and refresh throttle. |
| `src/popup/components/AutomationsSettings.tsx` | New section "Push-since-approval" with two toggles: master `enablePushSinceApproval` (badge), sub `enableRequestRereview` (action). Mirrors existing 5.1 stale-badge / ping toggles. |
| `src/core/activity-log-types.ts` | Add `'rerequest_review'` to the `ActivityAction` union; the existing `reviewers?: string[]` field is reused. |
| `src/popup/views/ActivityLogView.tsx` | Add `'rerequest_review'` to the action label map so the new entries render with a human-readable label (mirrors how `'reviewer_pinged'` is handled). |
| `tests/popup/views/PRListView.test.tsx` | New describe block: badge appears when `staleApproval` defined; click fires onRerequest. |

### Detection algorithm

```ts
// Pseudocode for src/core/stale-approval.ts
type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED' | 'COMMENTED' | 'PENDING';

export interface StaleApprovalInput {
  /** Wall-clock at which the cached head SHA last changed (i.e. when the push was first observed by the poll cycle). */
  lastPushedAt: number | null;
  /** ALL reviews from GET /repos/:o/:r/pulls/:n/reviews, including DISMISSED/CHANGES_REQUESTED/COMMENTED. The detector filters them. */
  reviews: Array<{ login: string; state: ReviewState; submittedAt: number }>;
}

export function detectStaleApproval(input: StaleApprovalInput): {
  stale: boolean;
  approvers: string[];
  lastApprovedAt: number;
  lastPushedAt: number;
} | null {
  if (!input.lastPushedAt) return null;
  if (input.reviews.length === 0) return null;

  // Step 1 — compute each reviewer's LATEST review (any state). A user who
  // APPROVED then later requested CHANGES is no longer an approver. A user
  // whose APPROVED review was DISMISSED by branch protection is also out.
  const latestByLogin = new Map<string, { state: ReviewState; submittedAt: number }>();
  for (const r of input.reviews) {
    if (r.state === 'COMMENTED' || r.state === 'PENDING') continue; // non-decisive
    const cur = latestByLogin.get(r.login);
    if (!cur || r.submittedAt > cur.submittedAt) {
      latestByLogin.set(r.login, { state: r.state, submittedAt: r.submittedAt });
    }
  }

  // Step 2 — keep only those whose latest decisive state is APPROVED.
  const currentApprovers: Array<[string, number]> = [];
  for (const [login, latest] of latestByLogin) {
    if (latest.state === 'APPROVED') currentApprovers.push([login, latest.submittedAt]);
  }
  if (currentApprovers.length === 0) return null;

  // Step 3 — stale iff every current approver approved before the push.
  const allStale = currentApprovers.every(([, ts]) => ts < input.lastPushedAt!);
  if (!allStale) return null;

  return {
    stale: true,
    approvers: currentApprovers.map(([login]) => login),
    lastApprovedAt: Math.max(...currentApprovers.map(([, ts]) => ts)),
    lastPushedAt: input.lastPushedAt,
  };
}
```

The poll cycle calls this once per PR per cycle. The result lands on `processedPRs[i].staleApproval`; the popup reads it.

### When the detector runs

Fetching reviews per PR per cycle is expensive. Three gates short-circuit:

1. **Feature toggle:** `settings.enablePushSinceApproval === false` → skip entirely. Zero extra API calls.
2. **Head-SHA negative cache:** carry `lastSeenHeadSha` AND `staleApproval` (which can be `null` to mark "checked, not stale"). If the PR detail's `head.sha` matches the carried `lastSeenHeadSha`, reuse the carried `staleApproval` value verbatim — including the `null` case. Steady-state cost on a 30-PR install: zero extra calls.
3. **First-look:** when no `lastSeenHeadSha` exists yet (newly-discovered PR or first cycle after migration), fetch reviews once and persist the result (including `null`).

When the head SHA changes between cycles: stamp `lastHeadShaChangedAt = Date.now()`, then run the detector against fresh `listReviews` data. The detector compares approval timestamps to that wall-clock value, NOT to commit dates.

This bounds extra `listReviews` calls per cycle to: (count of PRs whose head SHA changed) + (count of newly-discovered PRs). For a stable 30-PR install, that's typically zero.

### Throttle store

Mirror of `pingedPRs` exactly:

```ts
// src/core/rerequest-throttle.ts
export type RerequestStore = Record<number /* prId */, { at: number }>;
const RE_REQUEST_THROTTLE_MS = 24 * 60 * 60 * 1000;

export async function recordRerequest(prId: number): Promise<void>;
export async function isThrottled(store: RerequestStore, prId: number): boolean;
export async function hoursSinceLastRerequest(...): number | null;
export async function clearRerequestStore(): Promise<void>;
```

Wired into `clearAuth` so sign-out drops it.

### Activity log

One new action: `rerequest_review`. Reuses `reviewers?: string[]` (already present for `reviewer_pinged`). Both success and failed entries are written. Same shape as 5.1's ping flow.

## Test cases

### Unit — `tests/core/stale-approval.test.ts`

- Returns null when there are zero reviews
- Returns null when `lastPushedAt` is missing
- Returns null when at least one current approver approved AFTER the push
- Returns stale=true with correct approvers when every current approver approved before the push
- Collapses multiple reviews from the same reviewer to the latest decisive state
- A reviewer who APPROVED then later requested CHANGES is NOT counted as an approver (latest-decisive-state-per-login)
- A reviewer whose APPROVED review was DISMISSED is NOT counted as an approver
- COMMENTED reviews are ignored entirely (don't influence latest-state calculation)
- `lastApprovedAt` is the latest current-approver timestamp (not the earliest, not a dismissed one)
- A bot reviewer (`type: 'Bot'`) is currently treated as a regular approver (pin the behavior; future polish PR can flip it)

### Unit — `tests/github/endpoints/reviews.test.ts`

- `listReviews` calls the correct path with `per_page=100`
- Maps the response shape to `{ login, state, submittedAt: number }`, including DISMISSED + CHANGES_REQUESTED
- `requestReviewers` posts the expected body shape; returns the parsed response on success
- Empty `logins` array short-circuits — does NOT call the network
- 422 with `errors[].code === 'invalid'` on field `reviewers` returns `{ alreadyRequested: true }` (idempotent path)
- Other 4xx/5xx responses bubble as thrown errors (with the message)

### Unit — `tests/core/rerequest-throttle.test.ts`

- Same coverage matrix as `ping-throttle.test.ts` (record / isThrottled / prune / clear / hoursSince)

### Component — `tests/popup/views/RerequestConfirmView.test.tsx`

- Renders the approver list (`@alice, @bob`)
- Confirm calls `requestReviewers` with the right args, then `recordRerequest`, then `appendActivity` with action=`rerequest_review`, then `onSuccess`
- Failed POST writes a failed activity entry with the error message
- Esc + cancel button both call `onCancel`

### Integration — `tests/popup/views/PRListView.test.tsx`

- Badge appears on rows with `staleApproval` defined when `enablePushSinceApproval=true`
- Badge is hidden when `enablePushSinceApproval=false`
- Badge has no click handler when `enableRequestRereview=false`
- Clicking the badge sets the rerequest view-state and renders the modal

### Integration — `tests/background/poll-cycle.test.ts`

- When `enablePushSinceApproval=false`: zero `listReviews` calls; existing `staleApproval` data on the prior PR record is preserved as-is
- When `enablePushSinceApproval=true` AND head SHA unchanged AND prior `staleApproval` is `null` (negative cache hit): zero `listReviews` calls; the `null` is carried forward
- When `enablePushSinceApproval=true` AND head SHA unchanged AND prior `staleApproval` is populated: zero `listReviews` calls; the cached value is carried forward
- When `enablePushSinceApproval=true` AND `lastSeenHeadSha` is missing entirely (newly-discovered PR): one `listReviews` call; result (or `null`) persisted; `lastSeenHeadSha` + `lastHeadShaChangedAt` stamped
- When `enablePushSinceApproval=true` AND head SHA changed since last cycle: one `listReviews` call; `lastHeadShaChangedAt` updated to the cycle's `Date.now()`; detector compares approvals against that wall-clock value

## Risks and unknowns

| Risk | Mitigation |
|---|---|
| `listReviews` paginates; a noisy PR with 100+ reviews would hit a second page. | Use `per_page=100` and only one page. Approvals are rare relative to comments; 100 reviews on a single PR is already a smell, and the detector's "latest per login" reduces the practical row count further. |
| `requestReviewers` is not strictly idempotent — it accepts `reviewers` as additive. Posting the same login twice is a no-op per GitHub docs, but the response is non-empty. | Test the fixture, document the "no-op on duplicate" behavior in the function docstring. |
| Bot reviewers (Renovate, Dependabot) approving and counting as approvers. | Initial scope: include them. They show up in the modal; user can mentally skip. Future polish: filter `type === 'Bot'` if real users complain. |
| Reviewers who approved but later left the org. | The POST will return an error; we surface the message in the failed activity entry and the modal. No retry. |
| Branch protection's "Dismiss stale approvals" already cleared the approval, so by the time we look there are no APPROVED reviews left. | The `lastApprovedAt` < `lastPushedAt` check still fires from `submitted_at` history; GitHub returns dismissed approvals in the reviews list with `state === 'DISMISSED'`. We must filter to `state === 'APPROVED'` only — dismissed reviews don't count. |

## Acceptance

- [ ] Stale-approval badge appears within 1 poll cycle of a push-after-approval scenario in a sandbox repo.
- [ ] Clicking the badge (when action toggle is on) posts exactly one re-request and clears the badge until the next push.
- [ ] Action toggle OFF → badge renders as a passive label, no click handler.
- [ ] Master toggle OFF → no extra API calls; no badge regardless of state.
- [ ] All Sprint 1 tests still pass.
- [ ] Coverage stays above the 95/88/95/95 thresholds.
- [ ] Bundle delta < 3% (stricter than the 5% Sprint 1 budget — this is one feature).

## Out of scope

- Filtering bot reviewers (deferred to a polish follow-up).
- Surfacing "this approver left the org" inline rather than via the failed-activity log.
- Auto-re-requesting on push without confirmation (dangerous; never).
- Migrating the throttle data on sign-out across accounts (sign-out already drops account state).

## Plan review revisions (2026-05-10)

Applied after Opus plan review:
- **Push-time semantics** — switched from `commit.committer.date` (dev-clock, can predate approval after a rebase) to `lastHeadShaChangedAt` (poll-cycle wall-clock when head SHA was first observed to differ).
- **Negative cache** — `staleApproval` field is now `…|null` so "checked, not stale" is a persistable value. Without this, every PR without a prior verdict would refetch every cycle.
- **Algorithm correctness** — pseudocode rewritten to compute each reviewer's latest *decisive* state (APPROVED / CHANGES_REQUESTED / DISMISSED), then keep only those whose latest is APPROVED. The original "any historical approval" reading would mis-count reviewers who approved then later requested changes.
- **`requestReviewers` 422 handling** — POST is NOT a silent no-op on duplicate logins; it returns 422. The endpoint maps a 422 with `errors[].field === 'reviewers'` and `errors[].code === 'invalid'` to `{ ok: true, alreadyRequested: true }`. The PR-author-as-reviewer 422 has the same shape, so we cannot discriminate from the response alone — instead we rely on the upstream guarantee that PR authors cannot appear in `approvers` (GitHub rejects self-approval reviews). Other status codes bubble as thrown errors.
- **Commits endpoint dropped** — we don't need a per-commit timestamp once push-time is the cycle boundary; the commits.ts module and its test file are removed from the touch list.
- **Tests** — added DISMISSED-only history, CHANGES_REQUESTED-after-APPROVED, COMMENTED-noise, bot-reviewer behavior pin, negative-cache short-circuit, and newly-discovered-PR cases.
- **Activity log renderer** — explicit touch on `ActivityLogView.tsx` for the `'rerequest_review'` label.
