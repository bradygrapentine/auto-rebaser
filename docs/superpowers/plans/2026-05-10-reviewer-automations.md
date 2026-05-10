# REVIEWER-AUTOMATIONS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reviewer dashboard tab (opt-in, default OFF) to the popup showing PRs where the user is a requested reviewer or assignee, with one conservatively-gated automation that auto-enables GitHub auto-merge once the user has approved AND is the last required gate AND the repo is on a per-repo allowlist.

**Architecture:** Adds a second search-query phase to the existing poll cycle (`runPollCycle`), gated by `enableReviewerTab`. Results land in a new `accounts.<id>.reviewerPRs` namespace (parallel to `prs`). A pure `reviewer-auto-merge-gate.ts` detector evaluates a 4-gate truth table per PR per cycle and fires the existing `enableAutoMerge` GraphQL mutation when all gates pass. Popup gains a tab bar between header and PR list when the master toggle is on. Reuses 5.2-A's `latestDecisiveStatePerLogin` helper for review-state correctness.

**Tech Stack:** TypeScript, React, Vitest, Chrome MV3 extension storage facade (`src/core/storage/multi-account.ts`), GitHub REST + GraphQL via `src/github/http.ts` and `src/github/graphql.ts`. Coverage thresholds: 95 / 88 / 95 / 95.

**Spec:** `docs/superpowers/specs/2026-05-10-reviewer-automations-design.md`

---

## File Structure

### Created
- `src/core/reviewer-auto-merge-gate.ts` — pure 4-gate truth-table function
- `src/github/endpoints/reviewer-search.ts` — `searchReviewerPRs()` paginated search
- `src/popup/hooks/useReviewerPRStore.ts` — popup-side hook reading `accounts.<id>.reviewerPRs`
- Tests for each of the above (`tests/core/`, `tests/github/endpoints/`, `tests/popup/hooks/`)
- `tests/background/poll-cycle.reviewer.test.ts` — reviewer-phase integration
- `tests/popup/views/PRListView.reviewer-tab.test.tsx` — tab + state-chip UI
- `tests/popup/components/AutomationsSettings.reviewer.test.tsx` — settings section

### Modified
- `src/core/automations-types.ts` — 3 new settings fields + 2 new PRRecord fields
- `src/core/automations-store.ts` — defaults (auto-handled by the merge-with-defaults read path) + nothing extra
- `src/background/poll-cycle.ts` — append reviewer phase after authored phase
- `src/popup/views/PRListView.tsx` — tab bar, scope split, reviewer state chips
- `src/popup/components/PRRow.tsx` — render reviewer state chip when present
- `src/popup/components/AutomationsSettings.tsx` — Reviewer automations section
- `src/core/activity-log-types.ts` — new `reviewer_auto_merge_armed` action type

---

## Task 1 — Settings + PRRecord type shape

**Files:**
- Modify: `src/core/automations-types.ts`
- Modify: `tests/core/automations-store.test.ts` (defaults verification)

- [ ] **Step 1: Write failing test for default values**

Append to `tests/core/automations-store.test.ts`:

```ts
it('exposes reviewer-automations defaults: OFF + empty allowlist', () => {
  expect(DEFAULT_AUTOMATION_SETTINGS.enableReviewerTab).toBe(false);
  expect(DEFAULT_AUTOMATION_SETTINGS.enableReviewerAutoMerge).toBe(false);
  expect(DEFAULT_AUTOMATION_SETTINGS.autoMergeReviewerOptInRepos).toEqual([]);
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npx vitest run tests/core/automations-store.test.ts -t "reviewer-automations defaults"`
Expected: FAIL — property does not exist on DEFAULT_AUTOMATION_SETTINGS.

- [ ] **Step 3: Add fields to `AutomationSettings` interface**

In `src/core/automations-types.ts`, find the existing `enableRequestRereview: boolean;` field and append:

```ts
  /**
   * REVIEWER-AUTOMATIONS — master toggle. When true the popup shows a
   * Reviewer tab and the poll cycle runs an extra search query. Default
   * false to keep existing users on the authored-only experience.
   */
  enableReviewerTab: boolean;
  /**
   * Sub-toggle: when true AND `enableReviewerTab` is true AND the PR's repo
   * is in `autoMergeReviewerOptInRepos`, fire enableAutoMerge once the user
   * is the last required gate. Default false.
   */
  enableReviewerAutoMerge: boolean;
  /**
   * Per-repo allowlist for reviewer auto-merge. Empty list disables the
   * automation even when both toggles are on. Format: "owner/repo".
   */
  autoMergeReviewerOptInRepos: string[];
```

In `DEFAULT_AUTOMATION_SETTINGS`, append:

```ts
  enableReviewerTab: false,
  enableReviewerAutoMerge: false,
  autoMergeReviewerOptInRepos: [],
```

- [ ] **Step 4: Add PRRecord fields for the reviewer phase**

In `src/core/automations-types.ts`, find the `PRRecordPhaseTwo` interface and append two fields:

```ts
  /**
   * REVIEWER-AUTOMATIONS — per-PR cache so the gate doesn't re-fire the
   * enableAutoMerge mutation every poll cycle. Set when the gate fires;
   * cleared when the head SHA changes (re-review needed).
   */
  reviewerAutoMergeArmed?: { at: number };
  /**
   * The signed-in user's latest decisive review state on a reviewer-tab PR.
   * Computed in the reviewer phase using the same latest-decisive-per-login
   * filter as 5.2-A's stale-approval detector. Drives the row state chip.
   */
  myReviewState?: 'AWAITING' | 'APPROVED' | 'CHANGES_REQUESTED';
```

- [ ] **Step 5: Run test — verify PASS**

Run: `npx vitest run tests/core/automations-store.test.ts -t "reviewer-automations defaults"`
Expected: PASS.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 7: Update other test fixtures that spread `DEFAULT_AUTOMATION_SETTINGS`**

Run: `grep -rl 'DEFAULT_AUTOMATION_SETTINGS\|AUTOMATION_DEFAULTS' tests/ | head`

Any test that builds a hand-rolled AutomationSettings literal (not via spread) needs the three new fields. If they spread the constant, they're already covered. Add fields wherever the spread isn't used. The 5.2-A pattern (commits `fba9425`, `d7d0b16`) is a worked example.

- [ ] **Step 8: Run full suite**

Run: `npx vitest run`
Expected: 871/871 pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/automations-types.ts tests/
git commit -m "feat(reviewer): settings shape + PRRecord fields"
```

---

## Task 2 — Reviewer search endpoint

**Files:**
- Create: `src/github/endpoints/reviewer-search.ts`
- Test: `tests/github/endpoints/reviewer-search.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/github/endpoints/reviewer-search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchReviewerPRs } from '../../../src/github/endpoints/reviewer-search';
import { request } from '../../../src/github/http';

vi.mock('../../../src/github/http', () => ({ request: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

describe('searchReviewerPRs', () => {
  it('builds the review-requested OR assignee query, excludes author:@me', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await searchReviewerPRs();
    const url = (request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('is:pr');
    expect(url).toContain('is:open');
    expect(url).toContain('review-requested:%40me');
    expect(url).toContain('assignee:%40me');
    expect(url).toContain('-author:%40me');
  });

  it('aggregates pages until a short page is returned', async () => {
    const page1 = { items: Array.from({ length: 100 }, (_, i) => ({ id: i, number: i })) };
    const page2 = { items: [{ id: 999, number: 999 }] };
    (request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    const result = await searchReviewerPRs();
    expect(result.items).toHaveLength(101);
    expect((request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it('stops at the 1000-result hard cap (10 pages)', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: Array.from({ length: 100 }, (_, i) => ({ id: i, number: i })),
    });
    await searchReviewerPRs();
    expect((request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(10);
  });

  it('uses ETag caching on each page request', async () => {
    (request as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    await searchReviewerPRs();
    expect((request as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual({ useETag: true });
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npx vitest run tests/github/endpoints/reviewer-search.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the endpoint**

`src/github/endpoints/reviewer-search.ts`:

```ts
// REVIEWER-AUTOMATIONS — discovery search for PRs where the signed-in user
// is a requested reviewer or assignee, excluding PRs they authored. Mirrors
// the pagination semantics of searchAuthoredPRs in src/github/endpoints.ts.

import type { SearchResult } from '../../core/types';
import { request } from '../http';

const SEARCH_PAGE_SIZE = 100;
const SEARCH_MAX_PAGES = 10;

export async function searchReviewerPRs(): Promise<SearchResult> {
  const aggregated: SearchResult['items'] = [];
  const q = encodeURIComponent('is:pr is:open (review-requested:@me OR assignee:@me) -author:@me');
  for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
    const url = `/search/issues?q=${q}&per_page=${SEARCH_PAGE_SIZE}&page=${page}`;
    const result = await request<SearchResult>(url, { useETag: true });
    aggregated.push(...result.items);
    if (result.items.length < SEARCH_PAGE_SIZE) break;
  }
  return { items: aggregated };
}
```

- [ ] **Step 4: Run test — verify PASS**

Run: `npx vitest run tests/github/endpoints/reviewer-search.test.ts`
Expected: 4/4 pass.

Note: the test asserts on `%40me` because `encodeURIComponent('@')` returns `%40`. If the test was written against literal `@`, the assertions will fail — fix the test (the encoded form is correct).

- [ ] **Step 5: Commit**

```bash
git add src/github/endpoints/reviewer-search.ts tests/github/endpoints/reviewer-search.test.ts
git commit -m "feat(reviewer): paginated reviewer-PR search endpoint"
```

---

## Task 3 — Reviewer auto-merge gate (pure detector)

**Files:**
- Create: `src/core/reviewer-auto-merge-gate.ts`
- Test: `tests/core/reviewer-auto-merge-gate.test.ts`

This is the 4-gate truth table from spec §4. Pure function, no I/O. Reuses 5.2-A's latest-decisive-state-per-login helper.

- [ ] **Step 1: Inspect the 5.2-A helper to confirm reusable shape**

Run: `grep -n "latestDecisive\|export" src/core/stale-approval.ts | head`

Confirm: there's a helper that returns the latest decisive state per login. If it's not exported, export it without changing its body; if it's inlined, factor the small helper out into a named export in the same file. Either way, no logic change.

- [ ] **Step 2: Write failing tests — 4-gate truth table**

Create `tests/core/reviewer-auto-merge-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { evaluateReviewerAutoMergeGate, type GateInput } from '../../src/core/reviewer-auto-merge-gate';

const base: GateInput = {
  currentUserLogin: 'alice',
  prRepo: 'org/api',
  reviews: [{ login: 'alice', state: 'APPROVED', submittedAt: '2026-01-01T00:00:00Z' }],
  requestedReviewers: [],
  reviewDecision: 'APPROVED',
  enableReviewerTab: true,
  enableReviewerAutoMerge: true,
  autoMergeReviewerOptInRepos: ['org/api'],
  alreadyArmed: false,
};

describe('evaluateReviewerAutoMergeGate', () => {
  it('fires when all 4 gates pass', () => {
    expect(evaluateReviewerAutoMergeGate(base)).toEqual({ fire: true });
  });

  it('blocks when master toggle is off', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, enableReviewerTab: false })).toEqual({ fire: false, reason: 'master-off' });
  });

  it('blocks when auto-merge sub-toggle is off', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, enableReviewerAutoMerge: false })).toEqual({ fire: false, reason: 'submodule-off' });
  });

  it('blocks when repo not on allowlist', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, autoMergeReviewerOptInRepos: ['org/other'] })).toEqual({ fire: false, reason: 'not-allowlisted' });
  });

  it('blocks when user has not approved', () => {
    const input = { ...base, reviews: [{ login: 'alice', state: 'COMMENTED' as const, submittedAt: '2026-01-01T00:00:00Z' }] };
    expect(evaluateReviewerAutoMergeGate(input)).toEqual({ fire: false, reason: 'not-approved' });
  });

  it('blocks when user requested changes most recently (decisive state)', () => {
    const input = { ...base, reviews: [
      { login: 'alice', state: 'APPROVED' as const, submittedAt: '2026-01-01T00:00:00Z' },
      { login: 'alice', state: 'CHANGES_REQUESTED' as const, submittedAt: '2026-01-02T00:00:00Z' },
    ]};
    expect(evaluateReviewerAutoMergeGate(input)).toEqual({ fire: false, reason: 'not-approved' });
  });

  it('blocks when reviewDecision is not APPROVED (other gates still pending)', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, reviewDecision: 'REVIEW_REQUIRED' })).toEqual({ fire: false, reason: 'not-last-gate' });
  });

  it('blocks when requested_reviewers is non-empty', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, requestedReviewers: ['bob'] })).toEqual({ fire: false, reason: 'not-last-gate' });
  });

  it('blocks when already armed (idempotent suppression)', () => {
    expect(evaluateReviewerAutoMergeGate({ ...base, alreadyArmed: true })).toEqual({ fire: false, reason: 'already-armed' });
  });

  it('ignores COMMENTED reviews when picking decisive state', () => {
    const input = { ...base, reviews: [
      { login: 'alice', state: 'APPROVED' as const, submittedAt: '2026-01-01T00:00:00Z' },
      { login: 'alice', state: 'COMMENTED' as const, submittedAt: '2026-01-02T00:00:00Z' },
    ]};
    expect(evaluateReviewerAutoMergeGate(input)).toEqual({ fire: true });
  });
});
```

- [ ] **Step 3: Run test — verify FAIL**

Run: `npx vitest run tests/core/reviewer-auto-merge-gate.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement the gate**

Create `src/core/reviewer-auto-merge-gate.ts`:

```ts
// REVIEWER-AUTOMATIONS — pure 4-gate truth-table evaluator. Decides whether
// to fire enableAutoMerge on a reviewer PR. No I/O. Spec §4.

import type { ReviewRecord } from './stale-approval';

export interface GateInput {
  currentUserLogin: string;
  prRepo: string;
  reviews: ReviewRecord[];
  requestedReviewers: string[];
  reviewDecision: 'APPROVED' | 'REVIEW_REQUIRED' | 'CHANGES_REQUESTED' | null;
  enableReviewerTab: boolean;
  enableReviewerAutoMerge: boolean;
  autoMergeReviewerOptInRepos: string[];
  alreadyArmed: boolean;
}

export type GateReason =
  | 'master-off'
  | 'submodule-off'
  | 'not-allowlisted'
  | 'not-approved'
  | 'not-last-gate'
  | 'already-armed';

export type GateResult = { fire: true } | { fire: false; reason: GateReason };

export function evaluateReviewerAutoMergeGate(input: GateInput): GateResult {
  if (!input.enableReviewerTab) return { fire: false, reason: 'master-off' };
  if (!input.enableReviewerAutoMerge) return { fire: false, reason: 'submodule-off' };
  if (!input.autoMergeReviewerOptInRepos.includes(input.prRepo)) return { fire: false, reason: 'not-allowlisted' };
  if (input.alreadyArmed) return { fire: false, reason: 'already-armed' };

  // My-approval gate: latest decisive review by currentUserLogin must be APPROVED.
  const myReviews = input.reviews
    .filter((r) => r.login === input.currentUserLogin && r.state !== 'COMMENTED' && r.state !== 'PENDING')
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  if (myReviews[0]?.state !== 'APPROVED') return { fire: false, reason: 'not-approved' };

  // Last-gate gate: PR's overall review decision is APPROVED AND no pending requested reviewers.
  if (input.reviewDecision !== 'APPROVED') return { fire: false, reason: 'not-last-gate' };
  if (input.requestedReviewers.length > 0) return { fire: false, reason: 'not-last-gate' };

  return { fire: true };
}
```

If `ReviewRecord` is not exported from `stale-approval.ts`, add it now (one-line `export` keyword change, no body modification).

- [ ] **Step 5: Run test — verify PASS**

Run: `npx vitest run tests/core/reviewer-auto-merge-gate.test.ts`
Expected: 10/10 pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/reviewer-auto-merge-gate.ts tests/core/reviewer-auto-merge-gate.test.ts src/core/stale-approval.ts
git commit -m "feat(reviewer): 4-gate auto-merge truth-table detector"
```

---

## Task 4 — Activity log action type

**Files:**
- Modify: `src/core/activity-log-types.ts`

- [ ] **Step 1: Inspect existing action types**

Run: `grep -n "action:" src/core/activity-log-types.ts | head`

Confirm the discriminated-union shape (e.g. `{ action: 'rerequest_review'; ... }`). The new entry follows the same shape.

- [ ] **Step 2: Add the new action variant**

In `src/core/activity-log-types.ts`, add to the `ActivityEntry` union (alphabetical order or end of list — match the existing pattern):

```ts
| {
    action: 'reviewer_auto_merge_armed';
    at: number;
    repo: string;
    prNumber: number;
    prTitle: string;
    prUrl: string;
    result: 'success';
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/core/activity-log-types.ts
git commit -m "feat(reviewer): activity log action type"
```

(No separate test — type addition is verified by the integration test in Task 5 which appends an entry of this shape.)

---

## Task 5 — Poll-cycle reviewer phase + auto-merge wiring

**Files:**
- Modify: `src/background/poll-cycle.ts`
- Modify: `src/core/storage/multi-account.ts` (add new key constant)
- Test: `tests/background/poll-cycle.reviewer.test.ts`

- [ ] **Step 1: Add the storage key constant**

In `src/core/storage/multi-account.ts`, find the per-account keys constant (look for `prs`, `notif_throttle`, `pingedPRs` style entries) and add:

```ts
reviewerPRs: 'reviewerPRs',
```

Also confirm the v1→v2 migration list doesn't need an entry (the new namespace is account-scoped from day one — no v1 form exists).

- [ ] **Step 2: Write failing integration test**

Create `tests/background/poll-cycle.reviewer.test.ts`. Mirror the structure of `tests/background/poll-cycle.stale-approval.test.ts` (which already exists from 5.2-A). Use the same vi.mock pattern for `searchAuthoredPRs`, `getPR`, `runRebaseLoop`, etc., plus mock the new `searchReviewerPRs`, `enableAutoMerge`, and `evaluateReviewerAutoMergeGate`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ... standard imports + mocks (model on poll-cycle.stale-approval.test.ts)
import { runPollCycle } from '../../src/background/poll-cycle';
import { searchReviewerPRs } from '../../src/github/endpoints/reviewer-search';
import { enableAutoMerge } from '../../src/github/endpoints/auto-merge';

vi.mock('../../src/github/endpoints/reviewer-search', () => ({ searchReviewerPRs: vi.fn() }));
vi.mock('../../src/github/endpoints/auto-merge', () => ({ enableAutoMerge: vi.fn() }));

// ... usual setup ...

describe('poll-cycle — reviewer phase', () => {
  it('enableReviewerTab=false: skips searchReviewerPRs entirely', async () => {
    withSettings({ enableReviewerTab: false });
    await runPollCycle();
    expect(searchReviewerPRs).not.toHaveBeenCalled();
  });

  it('enableReviewerTab=true: runs searchReviewerPRs, writes results to reviewerPRs namespace', async () => {
    withSettings({ enableReviewerTab: true });
    (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeReviewerSearchItem({ id: 42, number: 42, repo: 'org/api' })],
    });
    // ... mock getPR to return a PR detail with reviewDecision=APPROVED, requestedReviewers=[], my review=APPROVED ...
    await runPollCycle();
    const writes = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls;
    expect(writes).toHaveLength(1);
    expect(writes[0][0][0].id).toBe(42);
  });

  it('fires enableAutoMerge once when 4 gates pass + caches reviewerAutoMergeArmed', async () => {
    // ... full happy-path setup ...
    await runPollCycle();
    expect(enableAutoMerge).toHaveBeenCalledTimes(1);
    const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
    expect(upserted.reviewerAutoMergeArmed).toMatchObject({ at: expect.any(Number) });
  });

  it('does NOT re-fire enableAutoMerge when reviewerAutoMergeArmed is already cached', async () => {
    withStore([{ id: 42, number: 42, repo: 'org/api', reviewerAutoMergeArmed: { at: Date.now() } }]);
    // ... rest of happy-path setup ...
    await runPollCycle();
    expect(enableAutoMerge).not.toHaveBeenCalled();
  });

  it('on 422 (clean status) AND mergeCleanPRsImmediately=false: log + skip, no mutation retry', async () => {
    // ... mock enableAutoMerge to throw 422 with the expected body shape ...
    await runPollCycle();
    expect(enableAutoMerge).toHaveBeenCalledTimes(1);
    // No second call, no crash, reviewerAutoMergeArmed NOT set.
  });

  it('on 404 (no permission): removes repo from autoMergeReviewerOptInRepos + emits banner state', async () => {
    // ... mock enableAutoMerge to throw 404 ...
    await runPollCycle();
    expect(saveAutomationSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoMergeReviewerOptInRepos: [] })
    );
  });

  it('appends activity log entry on successful fire', async () => {
    // ... happy-path setup ...
    await runPollCycle();
    const entries = (appendActivity as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entries).toContainEqual(expect.objectContaining({
      action: 'reviewer_auto_merge_armed',
      repo: 'org/api',
      prNumber: 42,
    }));
  });
});
```

(Test scaffolding — fixture builders, mocks, `withSettings`/`withStore` helpers — must mirror what's already in `poll-cycle.stale-approval.test.ts`. Copy and adapt, don't re-invent.)

- [ ] **Step 3: Run test — verify FAIL**

Run: `npx vitest run tests/background/poll-cycle.reviewer.test.ts`
Expected: FAIL — reviewer phase not implemented.

- [ ] **Step 4: Add the reviewer phase to `poll-cycle.ts`**

In `src/background/poll-cycle.ts`, after the authored-phase loop completes (after `upsertPRs(processedPRs)` but before the cycle's final logging), add:

```ts
// REVIEWER-AUTOMATIONS — reviewer phase. Gated on master toggle.
if (settings.enableReviewerTab) {
  const reviewerSearch = await searchReviewerPRs();
  const reviewerProcessed: Array<PRRecord & PRRecordPhaseTwo> = [];

  for (const item of reviewerSearch.items) {
    const [owner, repo] = item.repository_url.split('/').slice(-2);
    const fullName = `${owner}/${repo}`;

    // Phase-2 detail fetch reuses the same path as authored PRs.
    const pr = await getPR(owner, repo, item.number);

    // Latest decisive review state by current user.
    const reviews = await listReviews(owner, repo, item.number);
    const myReviewState = computeMyReviewState(reviews, currentUserLogin);

    // Existing armed cache lookup.
    const cached = existingReviewerPRs.find((p) => p.id === item.id);
    const alreadyArmed = cached?.reviewerAutoMergeArmed != null;

    // Gate evaluation.
    const gateResult = evaluateReviewerAutoMergeGate({
      currentUserLogin,
      prRepo: fullName,
      reviews,
      requestedReviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
      reviewDecision: pr.review_decision ?? null,
      enableReviewerTab: settings.enableReviewerTab,
      enableReviewerAutoMerge: settings.enableReviewerAutoMerge,
      autoMergeReviewerOptInRepos: settings.autoMergeReviewerOptInRepos,
      alreadyArmed,
    });

    let armedPatch: Partial<PRRecordPhaseTwo> = {};
    if (gateResult.fire) {
      try {
        await enableAutoMerge(pr.node_id, settings.mergeMethodPreference[0]);
        armedPatch = { reviewerAutoMergeArmed: { at: Date.now() } };
        await appendActivity([{
          action: 'reviewer_auto_merge_armed',
          at: Date.now(),
          repo: fullName,
          prNumber: pr.number,
          prTitle: pr.title,
          prUrl: pr.html_url,
          result: 'success',
        }]);
      } catch (err) {
        await handleReviewerAutoMergeError(err, fullName, settings);
      }
    }

    reviewerProcessed.push({
      id: item.id,
      number: pr.number,
      title: pr.title,
      repo: fullName,
      url: pr.html_url,
      state: deriveState(pr),
      lastUpdated: Date.now(),
      myReviewState,
      ...armedPatch,
      ...(cached?.reviewerAutoMergeArmed && !armedPatch.reviewerAutoMergeArmed
        ? { reviewerAutoMergeArmed: cached.reviewerAutoMergeArmed }
        : {}),
    });
  }

  await upsertReviewerPRs(reviewerProcessed);
}
```

Add `handleReviewerAutoMergeError`:

```ts
async function handleReviewerAutoMergeError(
  err: unknown,
  repoFullName: string,
  settings: AutomationSettings,
): Promise<void> {
  const status = (err as { status?: number })?.status;
  if (status === 422) {
    console.warn(`[reviewer-auto-merge] ${repoFullName}: 422 clean status — skipping`);
    return;
  }
  if (status === 404 || status === 403) {
    console.warn(`[reviewer-auto-merge] ${repoFullName}: ${status} — removing from allowlist`);
    const next = settings.autoMergeReviewerOptInRepos.filter((r) => r !== repoFullName);
    await saveAutomationSettings({ ...settings, autoMergeReviewerOptInRepos: next });
    return;
  }
  console.warn(`[reviewer-auto-merge] ${repoFullName}: error`, err);
}
```

Imports to add: `searchReviewerPRs`, `enableAutoMerge`, `evaluateReviewerAutoMergeGate`, `upsertReviewerPRs`, `appendActivity`, `listReviews`. The `currentUserLogin` and `existingReviewerPRs` come from the same per-account context already wired for the authored phase.

- [ ] **Step 5: Add `upsertReviewerPRs` storage helper**

In `src/background/pr-store.ts` (or wherever `upsertPRs` lives — `grep -rn 'export.*upsertPRs' src/`):

```ts
export async function upsertReviewerPRs(prs: Array<PRRecord & PRRecordPhaseTwo>): Promise<void> {
  await writeAccountKey('reviewerPRs', prs);
}
```

- [ ] **Step 6: Run test — verify PASS**

Run: `npx vitest run tests/background/poll-cycle.reviewer.test.ts`
Expected: 7/7 pass. If any fail, adjust fixtures/mocks until green — do NOT modify the implementation to match a broken test.

- [ ] **Step 7: Add SHA-change invalidation test + logic**

Spec §4 requires: when the head SHA changes after an arm, `reviewerAutoMergeArmed` must clear so the gate re-evaluates (the author pushed; the previous approval no longer covers the new code).

Append to `tests/background/poll-cycle.reviewer.test.ts`:

```ts
it('clears reviewerAutoMergeArmed when head SHA changes since last cycle', async () => {
  withSettings({ enableReviewerTab: true, enableReviewerAutoMerge: true, autoMergeReviewerOptInRepos: ['org/api'] });
  withReviewerStore([{
    id: 42, number: 42, repo: 'org/api',
    reviewerAutoMergeArmed: { at: Date.now() - 60_000 },
    lastSeenHeadSha: 'sha-OLD',
  } as PRRecord & PRRecordPhaseTwo]);
  (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue({
    items: [makeReviewerSearchItem({ id: 42, number: 42, repo: 'org/api' })],
  });
  (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-NEW' /* changed! */ }));
  await runPollCycle();
  const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
  expect(upserted.reviewerAutoMergeArmed).toBeUndefined();
  expect(upserted.lastSeenHeadSha).toBe('sha-NEW');
});
```

Then in `poll-cycle.ts` reviewer phase, before computing `alreadyArmed`, add the SHA-change check:

```ts
const cached = existingReviewerPRs.find((p) => p.id === item.id);
const headChanged = cached?.lastSeenHeadSha != null && cached.lastSeenHeadSha !== pr.head?.sha;
const alreadyArmed = !headChanged && cached?.reviewerAutoMergeArmed != null;
```

And include `lastSeenHeadSha: pr.head?.sha ?? cached?.lastSeenHeadSha` in the `reviewerProcessed.push(...)` shape so the next cycle has a baseline. When `headChanged`, do NOT carry forward `reviewerAutoMergeArmed`.

Run: `npx vitest run tests/background/poll-cycle.reviewer.test.ts -t "clears reviewerAutoMergeArmed"`
Expected: PASS.

- [ ] **Step 8: Run full suite**

Run: `npx vitest run`
Expected: no regressions.

- [ ] **Step 9: Commit**

```bash
git add src/background/poll-cycle.ts src/background/pr-store.ts src/core/storage/multi-account.ts tests/background/poll-cycle.reviewer.test.ts
git commit -m "feat(reviewer): poll-cycle reviewer phase + auto-merge wiring"
```

---

## Task 6 — Popup hook for reviewerPRs

**Files:**
- Create: `src/popup/hooks/useReviewerPRStore.ts`
- Test: `tests/popup/hooks/useReviewerPRStore.test.tsx`

- [ ] **Step 1: Write failing test**

Mirror `tests/popup/hooks/usePRStore.test.tsx` exactly — same mounting/listening pattern, just different storage key. Open it for the template:

Run: `cat tests/popup/hooks/usePRStore.test.tsx | head -80`

Adapt to a new test file `tests/popup/hooks/useReviewerPRStore.test.tsx` that asserts:
1. Loads `reviewerPRs` from `readAccountKey('reviewerPRs')` on mount.
2. Updates when `chrome.storage.onChanged` fires for the per-account `reviewerPRs` key.
3. Returns `[]` when nothing stored.

- [ ] **Step 2: Run test — verify FAIL**

Run: `npx vitest run tests/popup/hooks/useReviewerPRStore.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the hook**

Create `src/popup/hooks/useReviewerPRStore.ts`. Copy `src/popup/hooks/usePRStore.ts` verbatim, then:
- Rename `usePRStore` → `useReviewerPRStore`.
- Replace `readAccountKey('prs', ...)` with `readAccountKey('reviewerPRs', ...)`.
- Update return type if `usePRStore` types it (likely `PRStore`-shaped — keep the same shape).

- [ ] **Step 4: Run test — verify PASS**

Run: `npx vitest run tests/popup/hooks/useReviewerPRStore.test.tsx`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/popup/hooks/useReviewerPRStore.ts tests/popup/hooks/useReviewerPRStore.test.tsx
git commit -m "feat(reviewer): popup hook for reviewerPRs store"
```

---

## Task 7 — Popup tab UI + state chips

**Files:**
- Modify: `src/popup/views/PRListView.tsx`
- Modify: `src/popup/components/PRRow.tsx`
- Test: `tests/popup/views/PRListView.reviewer-tab.test.tsx`

- [ ] **Step 1: Write failing UI test**

Create `tests/popup/views/PRListView.reviewer-tab.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRListView } from '../../../src/popup/views/PRListView';
import { useAutomationSettings } from '../../../src/popup/hooks/useAutomationSettings';
import { usePRStore } from '../../../src/popup/hooks/usePRStore';
import { useReviewerPRStore } from '../../../src/popup/hooks/useReviewerPRStore';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';

vi.mock('../../../src/popup/hooks/useAutomationSettings');
vi.mock('../../../src/popup/hooks/usePRStore');
vi.mock('../../../src/popup/hooks/useReviewerPRStore');

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

function setSettings(over: Partial<typeof DEFAULT_AUTOMATION_SETTINGS> = {}) {
  (useAutomationSettings as ReturnType<typeof vi.fn>).mockReturnValue({
    settings: { ...DEFAULT_AUTOMATION_SETTINGS, ...over },
    save: vi.fn(),
    loading: false,
  });
}

describe('PRListView — reviewer tab', () => {
  it('renders no tab bar when enableReviewerTab=false (existing behavior)', async () => {
    setSettings({ enableReviewerTab: false });
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: null });
    (useReviewerPRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.queryByTestId('pr-tabs')).not.toBeInTheDocument();
  });

  it('renders tab bar with counts when enableReviewerTab=true', async () => {
    setSettings({ enableReviewerTab: true });
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      prs: [{ id: 1, number: 1, title: 't', repo: 'org/a', state: 'clean', url: '', lastUpdated: 0 }],
      lastPollAt: null,
    });
    (useReviewerPRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      prs: [
        { id: 100, number: 100, title: 'r', repo: 'org/b', state: 'clean', url: '', lastUpdated: 0 },
        { id: 101, number: 101, title: 'r2', repo: 'org/b', state: 'clean', url: '', lastUpdated: 0 },
      ],
      lastPollAt: null,
    });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByTestId('pr-tab-authored')).toHaveTextContent(/Authored\s*\(1\)/);
    expect(screen.getByTestId('pr-tab-reviewer')).toHaveTextContent(/Reviewer\s*\(2\)/);
  });

  it('switches list scope on tab click', async () => {
    setSettings({ enableReviewerTab: true });
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      prs: [{ id: 1, number: 1, title: 'AUTHORED-PR', repo: 'org/a', state: 'clean', url: '', lastUpdated: 0 }],
      lastPollAt: null,
    });
    (useReviewerPRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      prs: [{ id: 100, number: 100, title: 'REVIEWER-PR', repo: 'org/b', state: 'clean', url: '', lastUpdated: 0 }],
      lastPollAt: null,
    });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByText(/AUTHORED-PR/)).toBeInTheDocument();
    expect(screen.queryByText(/REVIEWER-PR/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pr-tab-reviewer'));
    expect(screen.queryByText(/AUTHORED-PR/)).not.toBeInTheDocument();
    expect(screen.getByText(/REVIEWER-PR/)).toBeInTheDocument();
  });

  it('renders the 4 reviewer state chips correctly', async () => {
    setSettings({ enableReviewerTab: true });
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: null });
    (useReviewerPRStore as ReturnType<typeof vi.fn>).mockReturnValue({
      prs: [
        { id: 1, number: 1, title: 'a', repo: 'org/a', state: 'clean', url: '', lastUpdated: 0, myReviewState: 'AWAITING' },
        { id: 2, number: 2, title: 'b', repo: 'org/a', state: 'clean', url: '', lastUpdated: 0, myReviewState: 'APPROVED' },
        { id: 3, number: 3, title: 'c', repo: 'org/a', state: 'clean', url: '', lastUpdated: 0, myReviewState: 'CHANGES_REQUESTED' },
        { id: 4, number: 4, title: 'd', repo: 'org/a', state: 'clean', url: '', lastUpdated: 0, myReviewState: 'APPROVED', reviewerAutoMergeArmed: { at: 1 } },
      ],
      lastPollAt: null,
    });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('pr-tab-reviewer'));
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText(/i approved/i)).toBeInTheDocument();
    expect(screen.getByText(/i requested changes/i)).toBeInTheDocument();
    expect(screen.getByText(/auto-merge armed/i)).toBeInTheDocument();
  });

  it('keyboard 1 / 2 switches tabs', async () => {
    setSettings({ enableReviewerTab: true, enableKeyboardShortcuts: true });
    (usePRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: null });
    (useReviewerPRStore as ReturnType<typeof vi.fn>).mockReturnValue({ prs: [], lastPollAt: null });
    render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
    await act(async () => {});
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByTestId('pr-tab-reviewer')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: '1' });
    expect(screen.getByTestId('pr-tab-authored')).toHaveAttribute('aria-selected', 'true');
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npx vitest run tests/popup/views/PRListView.reviewer-tab.test.tsx`
Expected: FAIL — no tab UI yet.

- [ ] **Step 3: Add the tab bar + scope state to `PRListView.tsx`**

In `src/popup/views/PRListView.tsx`:

- Import `useReviewerPRStore`.
- Add `const reviewerStore = useReviewerPRStore();` near the existing `usePRStore` call.
- Add `const [activeTab, setActiveTab] = useState<'authored' | 'reviewer'>('authored');`.
- Gate tab bar rendering on `settings.enableReviewerTab`.
- Add tab bar JSX between the header block and the PR list:

```tsx
{settings.enableReviewerTab && (
  <div className="pr-tabs" data-testid="pr-tabs" role="tablist">
    <button
      role="tab"
      data-testid="pr-tab-authored"
      aria-selected={activeTab === 'authored'}
      onClick={() => setActiveTab('authored')}
    >
      Authored ({prStore.prs.length})
    </button>
    <button
      role="tab"
      data-testid="pr-tab-reviewer"
      aria-selected={activeTab === 'reviewer'}
      onClick={() => setActiveTab('reviewer')}
    >
      Reviewer ({reviewerStore.prs.length})
    </button>
  </div>
)}
```

- Swap the source list based on `activeTab`:

```tsx
const visiblePRs = (activeTab === 'reviewer' ? reviewerStore.prs : prStore.prs).filter((pr) => {
  // ... existing filter logic unchanged ...
});
```

- Add keyboard shortcuts `1` / `2` via the existing `useKeyboardShortcuts` hook:

```tsx
useKeyboardShortcuts({
  enabled: settings.enableKeyboardShortcuts && settings.enableReviewerTab,
  bindings: {
    '1': () => setActiveTab('authored'),
    '2': () => setActiveTab('reviewer'),
  },
});
```

- [ ] **Step 4: Add reviewer state chip to `PRRow.tsx`**

In `src/popup/components/PRRow.tsx`, add an optional prop:

```tsx
reviewerState?: {
  myReviewState?: 'AWAITING' | 'APPROVED' | 'CHANGES_REQUESTED';
  autoMergeArmed: boolean;
};
```

Render the chip conditionally based on these flags:

```tsx
{reviewerState && (() => {
  if (reviewerState.autoMergeArmed) return <span className="pr-row__chip pr-row__chip--armed">auto-merge armed</span>;
  if (reviewerState.myReviewState === 'AWAITING') return <span className="pr-row__chip pr-row__chip--awaiting">awaiting review</span>;
  if (reviewerState.myReviewState === 'APPROVED') return <span className="pr-row__chip pr-row__chip--approved">i approved</span>;
  if (reviewerState.myReviewState === 'CHANGES_REQUESTED') return <span className="pr-row__chip pr-row__chip--changes">i requested changes</span>;
  return null;
})()}
```

In `PRListView.tsx`, pass `reviewerState` only when `activeTab === 'reviewer'`:

```tsx
<PRRow
  pr={pr}
  reviewerState={activeTab === 'reviewer' ? {
    myReviewState: (pr as PRRecord & PRRecordPhaseTwo).myReviewState,
    autoMergeArmed: !!(pr as PRRecord & PRRecordPhaseTwo).reviewerAutoMergeArmed,
  } : undefined}
  /* ... existing props ... */
/>
```

- [ ] **Step 5: Add CSS for the new chips**

In `src/popup/popup.css`, mirror the existing `pr-row__chip` patterns. Use the same color tokens as the corresponding semantic states (approved=green, changes=red, awaiting=yellow, armed=blue).

- [ ] **Step 6: Run test — verify PASS**

Run: `npx vitest run tests/popup/views/PRListView.reviewer-tab.test.tsx`
Expected: 5/5 pass.

- [ ] **Step 7: Run full suite + typecheck**

Run: `npm run typecheck && npx vitest run`
Expected: no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/popup/ tests/popup/views/PRListView.reviewer-tab.test.tsx
git commit -m "feat(reviewer): popup tab UI + state chips"
```

---

## Task 8 — Settings panel section + allowlist editor

**Files:**
- Modify: `src/popup/components/AutomationsSettings.tsx`
- Test: `tests/popup/components/AutomationsSettings.reviewer.test.tsx`

- [ ] **Step 1: Inspect existing patterns**

Look at how 5.2-A's push-since-approval section was added (`grep -n "enablePushSinceApproval" src/popup/components/AutomationsSettings.tsx`). Mirror that structure: a `<details>`-style master + nested sub-toggle.

For the allowlist editor, reuse the existing `RepoOptOutList` component pattern — it already supports add/remove + repo-suggestion autocomplete from `knownRepos`.

- [ ] **Step 2: Write failing test**

Create `tests/popup/components/AutomationsSettings.reviewer.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationsSettings } from '../../../src/popup/components/AutomationsSettings';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../../src/core/automations-types';

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
});

describe('AutomationsSettings — reviewer section', () => {
  it('renders master toggle, OFF by default', async () => {
    render(<AutomationsSettings />);
    await act(async () => {});
    const toggle = screen.getByTestId('reviewer-tab-master');
    expect(toggle).not.toBeChecked();
  });

  it('does NOT render sub-toggle or allowlist when master is OFF', async () => {
    render(<AutomationsSettings />);
    await act(async () => {});
    expect(screen.queryByTestId('enable-reviewer-auto-merge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reviewer-allowlist')).not.toBeInTheDocument();
  });

  it('reveals sub-toggle + allowlist when master flipped ON', async () => {
    render(<AutomationsSettings />);
    await act(async () => {});
    fireEvent.click(screen.getByTestId('reviewer-tab-master'));
    await act(async () => {});
    expect(screen.getByTestId('enable-reviewer-auto-merge')).toBeInTheDocument();
    expect(screen.getByTestId('reviewer-allowlist')).toBeInTheDocument();
  });

  it('persists changes via saveAutomationSettings', async () => {
    // ... mock saveAutomationSettings, flip toggle, await, assert called with enableReviewerTab=true ...
  });
});
```

- [ ] **Step 3: Run test — verify FAIL**

Run: `npx vitest run tests/popup/components/AutomationsSettings.reviewer.test.tsx`
Expected: FAIL — section not rendered.

- [ ] **Step 4: Add the section to `AutomationsSettings.tsx`**

Insert after the push-since-approval section (or anywhere logically grouped with "automations on others' PRs"):

```tsx
<section className="automation-block">
  <h3>Reviewer automations</h3>
  <label>
    <input
      type="checkbox"
      data-testid="reviewer-tab-master"
      checked={settings.enableReviewerTab}
      onChange={(e) => save({ ...settings, enableReviewerTab: e.target.checked })}
    />
    Show reviewer dashboard tab
  </label>
  <p className="muted">
    Adds a Reviewer tab to the popup with PRs where you're a requested reviewer or assignee.
  </p>

  {settings.enableReviewerTab && (
    <div className="automation-block__sub">
      <label>
        <input
          type="checkbox"
          data-testid="enable-reviewer-auto-merge"
          checked={settings.enableReviewerAutoMerge}
          onChange={(e) => save({ ...settings, enableReviewerAutoMerge: e.target.checked })}
        />
        Auto-enable auto-merge after I approve
      </label>
      <p className="muted">Fires when I'm the last required gate.</p>
      <RepoOptOutList
        data-testid="reviewer-allowlist"
        label="Allowlist repos"
        repos={settings.autoMergeReviewerOptInRepos}
        onChange={(next) => save({ ...settings, autoMergeReviewerOptInRepos: next })}
      />
    </div>
  )}
</section>
```

Note: `RepoOptOutList` is named "opt-out" but functions as a generic repo-list editor. If renaming to `RepoList` is trivial, prefer that (one-shot search/replace plus a test update). Otherwise leave the name and use it as-is.

- [ ] **Step 5: Run test — verify PASS**

Run: `npx vitest run tests/popup/components/AutomationsSettings.reviewer.test.tsx`
Expected: pass.

- [ ] **Step 6: Run full suite + coverage**

Run: `npx vitest run --coverage`
Expected: all green; coverage ≥ 95 / 88 / 95 / 95.

- [ ] **Step 7: Commit**

```bash
git add src/popup/components/AutomationsSettings.tsx tests/popup/components/AutomationsSettings.reviewer.test.tsx
git commit -m "feat(reviewer): settings panel section + allowlist editor"
```

---

## Task 9 — Final verification + build

- [ ] **Step 1: Run full verify chain**

```bash
npm run typecheck && npx vitest run --coverage && npm run build
```

Expected: typecheck clean, all tests pass, coverage ≥ thresholds, build succeeds.

- [ ] **Step 2: Smoke-test manually (optional)**

Load the unpacked extension in Chrome. Open Settings, flip the master toggle, confirm the Reviewer tab appears. Add a repo to the allowlist. Trigger a poll cycle (Poll Now). Confirm the activity log shows a `reviewer_auto_merge_armed` entry when conditions are met on a real PR you reviewed.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/reviewer-automations
gh pr create --title "feat: reviewer-automations — reviewer dashboard tab + conservative auto-merge" --body "$(cat docs/superpowers/specs/2026-05-10-reviewer-automations-design.md | head -30)..."
```

- [ ] **Step 4: Arm auto-merge (one attempt)**

```bash
gh pr merge --auto --squash
```

If branch protection blocks, hand off to the user with PR URL + `gh pr checks` status.
