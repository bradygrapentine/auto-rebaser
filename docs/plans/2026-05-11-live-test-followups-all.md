# Live-test followups — full implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all 8 findings from the live-test report as 3 sequential PRs (Track C → B → A). Each PR gets its own adversarial review pass; each must land green before the next branch is cut.

**Architecture:** Three disjoint scopes. Track C is test-harness only. Track B is one behavioral change in poll-cycle. Track A is UI polish across 6 popup files. No shared files across tracks.

**Tech Stack:** TypeScript, Vitest, Playwright, React. No new dependencies.

---

## Track ordering rationale

1. **Track C first** — adds a reusable `mockPRDetail` helper to `e2e/fixtures.ts`. Lands quickly; future E2E tests benefit. No production code touched.
2. **Track B next** — real production bug (search-cap → silent `[closed]` flip). Deserves focused adversarial review pass; semantic behavior change.
3. **Track A last** — visual polish; can ride on top of B's storage changes if any (there aren't, but ordering preserves the option). UI changes have the lowest blast radius.

Sequential serial — each Track lands before the next branch is cut. No parallel dispatch (UI files would overlap if cherry-picked back).

---

## Track C — E2E fixture hardening

**Files:**
- Modify: `e2e/fixtures.ts`

The existing `mockGitHubApi` mocks `/user` and `/search/issues` (returns empty). When the SW startup poll fires, every seeded PR is "missing from search" → `transitionedFromOpen` path → `getPR` called against the mock (returns `{}` default) → flips to `[closed]`. Adding a per-PR detail helper lets future tests preserve seeded state.

- [ ] **C.1 — Add `mockPRDetail` helper export**

In `e2e/fixtures.ts`, after `mockGitHubApi`, add:

```ts
export interface MockPRDetail {
  number: number;
  /** `${owner}/${repo}` */
  repo: string;
  state?: 'open' | 'closed';
  /** Defaults to 'clean'. */
  mergeable_state?: string;
  merged?: boolean;
  draft?: boolean;
  node_id?: string;
  head_sha?: string;
  base_sha?: string;
  base_ref?: string;
  /** Extra fields merged into the response shape. */
  extra?: Record<string, unknown>;
}

/**
 * Add a `/repos/:owner/:repo/pulls/:number` route handler returning a
 * realistic open-PR detail shape. Use AFTER `mockGitHubApi` for any PR
 * that the test seeds into pr_store / reviewerPRs — without this, the
 * SW startup poll's transitionedFromOpen path will flip the seeded
 * state to `[closed]` because the default mock returns {}.
 */
export async function mockPRDetail(context: BrowserContext, prs: MockPRDetail[]): Promise<void> {
  await context.route('**/api.github.com/repos/*/*/pulls/*', async (route) => {
    const url = new URL(route.request().url());
    // path: /repos/:owner/:repo/pulls/:number
    const parts = url.pathname.split('/').filter(Boolean);
    const owner = parts[1];
    const repoName = parts[2];
    const number = parseInt(parts[4], 10);
    const match = prs.find((p) => p.number === number && p.repo === `${owner}/${repoName}`);
    if (!match) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: match.number,
        number: match.number,
        title: `PR #${match.number}`,
        html_url: `https://github.com/${match.repo}/pull/${match.number}`,
        state: match.state ?? 'open',
        mergeable_state: match.mergeable_state ?? 'clean',
        draft: match.draft ?? false,
        merged: match.merged ?? false,
        node_id: match.node_id ?? `PR_node_${match.number}`,
        base: { ref: match.base_ref ?? 'main', sha: match.base_sha ?? 'base-sha', repo: { full_name: match.repo } },
        head: { ref: 'feature', sha: match.head_sha ?? 'head-sha', repo: { full_name: match.repo } },
        ...(match.extra ?? {}),
      }),
    });
  });
}
```

The `import type { BrowserContext }` is already present at the top of the file (line 13).

- [ ] **C.2 — Run existing E2E to confirm no regression**

```bash
npm run build && npx playwright test
```

Expected: 4/4 pass. The helper is exported but not yet consumed; existing tests unaffected.

- [ ] **C.3 — Commit**

```bash
git checkout -b test/e2e-fixture-mock-pr-detail
git add e2e/fixtures.ts
git commit -m "test(e2e): add mockPRDetail fixture helper for seed-state preservation"
git push -u origin test/e2e-fixture-mock-pr-detail
gh pr create --title "test(e2e): mockPRDetail fixture helper for seed-state preservation" \
  --body "Adds a per-PR \`/repos/:owner/:repo/pulls/:number\` mock to e2e/fixtures.ts. Future live-tests can call \`mockPRDetail(context, [...])\` to preserve seeded PR state across the SW startup poll. Without this helper, every seeded PR currently flips to \`[closed]\` because the default {} response makes the transitionedFromOpen path mark the PR as closed. No production code touched; existing E2E suite unchanged (4/4 still green)."
gh pr merge --auto --squash
```

- [ ] **C.4 — Wait for merge + sync main**

```bash
# after merge:
git checkout main && git pull --ff-only
git branch -d test/e2e-fixture-mock-pr-detail
```

---

## Track B — Stale-state fallback (real production bug)

**Files:**
- Modify: `src/background/poll-cycle.ts` (lines 464-511)
- Modify: `tests/background/poll-cycle.test.ts` (new test for the search-cap scenario)

**The bug:** `transitionedFromOpen` calls `getPR` for any PR that disappeared from the search results. If `getPR` returns a response without `state: 'open'` (because the response is `{}`, malformed, or a soft-404), the code flips the PR to `closed`. This fires for real users hitting GitHub's 1000-result search cap: PRs at the bottom of their authored list silently flip to `[closed]` in the popup until next cycle.

**The fix:** only transition to `closed`/`merged` when GitHub *affirmatively* says the PR is no longer open. If the detail response is empty or unparseable, preserve the prior state with a `lastFetchError` flag so the popup can surface it (and the next cycle will retry).

- [ ] **B.1 — Add `lastFetchError` field to `PRRecordPhaseTwo`**

In `src/core/automations-types.ts`, find `PRRecordPhaseTwo` and append:

```ts
  /**
   * REVIEWER-AUTOMATIONS adjacent — when the poll-cycle's getPR fails for a
   * PR that disappeared from search results (e.g. GitHub search 1000-result
   * cap), preserve the prior state and stamp this. Cleared on next successful
   * fetch. Drives a small "fetch failed" hint in the row UI.
   */
  lastFetchError?: { at: number; message: string };
```

- [ ] **B.2 — Write the failing test**

First, ensure the test file imports `PRRecord` and `PRRecordPhaseTwo`. Find the existing line:

```ts
import type { PRStore, SearchResult, PullRequest } from '../../src/core/types';
```

and append directly after it:

```ts
import type { PRRecord, PRRecordPhaseTwo } from '../../src/core/automations-types';
```

Then append this test inside the existing top-level `describe('runPollCycle', () => { ... })` block (match the surrounding conventions — direct `(<mock> as ReturnType<typeof vi.fn>).mockResolvedValue(...)` calls; no helpers):

```ts
it('search-cap: PR drops from search + getPR returns malformed detail → preserve prior state, stamp lastFetchError', async () => {
  // Reproduces the 1000-result search-cap scenario: a previously-tracked PR
  // is absent from this cycle's search results AND getPR returns an empty
  // body. Pre-fix the code would mark state='closed'. Post-fix we keep the
  // prior state (e.g. 'current') and surface a fetch-error flag.
  (getAutomationSettings as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_AUTOMATION_SETTINGS);
  (getResolvedThreads as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (runAllAutomations as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (loadStore as ReturnType<typeof vi.fn>).mockResolvedValue({
    prs: [
      {
        id: 99, number: 99, title: 'silent dropout',
        repo: 'org/heavy', url: 'https://github.com/org/heavy/pull/99',
        state: 'current', lastUpdated: 0,
      } as PRRecord & PRRecordPhaseTwo,
    ],
    lastPollAt: null,
  } as PRStore);
  (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
  // getPR returns an empty object — the production path that flagged this.
  (getPR as ReturnType<typeof vi.fn>).mockResolvedValue({} as PullRequest);

  await runPollCycle();

  const upserted = (upsertPRs as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<PRRecord & PRRecordPhaseTwo>;
  const dropout = upserted.find(p => p.id === 99);
  expect(dropout).toBeDefined();
  expect(dropout!.state).toBe('current'); // preserved, NOT 'closed'
  expect(dropout!.lastFetchError).toMatchObject({
    at: expect.any(Number),
    message: expect.stringMatching(/missing|unparseable|empty|state field/i),
  });
});
```

If the existing test file doesn't already wrap tests in a top-level `describe`, append the `it(...)` at file root — match what's there.

- [ ] **B.3 — Run test, verify FAIL**

```bash
npx vitest run tests/background/poll-cycle.test.ts -t "search-cap"
```

Expected: FAIL — `state` is `'closed'`, `lastFetchError` is undefined.

- [ ] **B.4 — Apply the fix**

In `src/background/poll-cycle.ts`, locate the block starting around line 493:

```ts
// Only stamp merged/closed when GitHub agrees the PR is actually closed.
if (detail.state === 'open') {
  processedPRs.push({ ...carry, lastUpdated: Date.now() } as PRRecord);
  continue;
}

const merged = detail.merged === true || detail.merged_at != null;
const mergedAtMs = detail.merged_at ? Date.parse(detail.merged_at) : carry.mergedAt;

processedPRs.push({
  ...carry,
  state: merged ? 'merged' : 'closed',
  lastUpdated: Date.now(),
  ...(merged && mergedAtMs ? { mergedAt: mergedAtMs } : {}),
  ...(detail.head?.ref !== undefined ? { headRef: detail.head.ref } : {}),
  ...(detail.head?.repo?.full_name !== undefined
    ? { sameRepo: detail.head.repo.full_name === prev.repo }
    : {}),
} as PRRecord);
```

Replace with:

```ts
// Only stamp merged/closed when GitHub *affirmatively* says the PR is
// closed or merged. A malformed/empty detail (e.g. search-1000-cap soft
// dropout) preserves prior state with a fetch-error flag — without this
// guard, every search-cap miss flips to [closed] silently.
const detailHasState = typeof detail.state === 'string';
const detailHasMerge = detail.merged === true || detail.merged_at != null;

if (detail.state === 'open') {
  processedPRs.push({
    ...carry,
    lastUpdated: Date.now(),
    lastFetchError: undefined, // clear any prior error
  } as PRRecord);
  continue;
}

if (!detailHasState && !detailHasMerge) {
  // Malformed / empty response — preserve prior state, stamp error.
  processedPRs.push({
    ...carry,
    lastUpdated: Date.now(),
    lastFetchError: { at: Date.now(), message: 'detail response missing state field' },
  } as PRRecord);
  continue;
}

// GitHub said the PR is closed or merged. Honor it.
const merged = detailHasMerge;
const mergedAtMs = detail.merged_at ? Date.parse(detail.merged_at) : carry.mergedAt;

processedPRs.push({
  ...carry,
  state: merged ? 'merged' : 'closed',
  lastUpdated: Date.now(),
  ...(merged && mergedAtMs ? { mergedAt: mergedAtMs } : {}),
  ...(detail.head?.ref !== undefined ? { headRef: detail.head.ref } : {}),
  ...(detail.head?.repo?.full_name !== undefined
    ? { sameRepo: detail.head.repo.full_name === prev.repo }
    : {}),
} as PRRecord);
```

- [ ] **B.5 — Run failing test, verify PASS**

```bash
npx vitest run tests/background/poll-cycle.test.ts
```

Expected: full file green, including new test.

- [ ] **B.6 — Run full suite**

```bash
npm run typecheck && npx vitest run
```

Expected: clean.

- [ ] **B.7 — Commit + PR**

```bash
git checkout -b fix/poll-cycle-search-cap-fallback
git add src/background/poll-cycle.ts src/core/automations-types.ts tests/background/poll-cycle.test.ts
git commit -m "fix(poll-cycle): preserve prior state when getPR detail is malformed (search-cap fallback)"
git push -u origin fix/poll-cycle-search-cap-fallback
gh pr create --title "fix(poll-cycle): preserve prior state on malformed getPR detail (search-cap fallback)" \
  --body "**Bug:** When a tracked PR drops out of GitHub's authored-search results (e.g. the user has >1000 open PRs and the cap clips the bottom of the list) AND \`getPR\` returns an empty/malformed detail, the poll cycle flips the PR to \`[closed]\`. Surfaced by the live-test report (P3.7).

**Fix:** \`transitionedFromOpen\` now requires GitHub to *affirmatively* say the PR is closed or merged (via \`detail.state\` or \`merged*\` fields). When the detail is missing both, preserve the prior state with a \`lastFetchError: { at, message }\` stamp so the next cycle retries. New unit test in poll-cycle.test.ts seeds the search-cap scenario and asserts state preservation.

Surfaced by the live-test report from session 2026-05-11."
gh pr merge --auto --squash
```

- [ ] **B.8 — Wait for merge + sync main**

```bash
git checkout main && git pull --ff-only
git branch -d fix/poll-cycle-search-cap-fallback
```

---

## Track A — Header + UI polish

Bundle of 6 small UI items. Each is self-contained but they all live in `src/popup/`. Single PR.

**Files:**
- Modify: `src/popup/components/Header.tsx`
- Modify: `src/popup/components/MigrationBanner.tsx`
- Modify: `src/popup/components/PRRow.tsx`
- Modify: `src/popup/views/PRListView.tsx`
- Modify: `src/popup/views/ActivityLogView.tsx`
- Modify: `src/popup/popup.css`
- Modify: tests where assertions break

### A.1 — Activity log timestamp consistency (P1.2)

The current `formatTime` jumps from `Nm ago` to absolute `new Date(at).toLocaleString()` at the 60-minute boundary. Add hour/day buckets.

- [ ] **A.1.1 — Update `formatTime` in `src/popup/views/ActivityLogView.tsx`**

Replace lines 28-33:

```ts
function formatTime(at: number, now: number = Date.now()): string {
  const ageMs = now - at;
  if (ageMs < 60_000) return 'just now';
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)}h ago`;
  if (ageMs < 7 * 86_400_000) return `${Math.floor(ageMs / 86_400_000)}d ago`;
  // Older than a week — short calendar date with no time of day.
  const d = new Date(at);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

- [ ] **A.1.2 — Update the existing test for the new buckets**

Find `tests/popup/views/ActivityLogView.test.tsx`. Any test asserting on the absolute-date format may need updates. Likely:

```bash
grep -n "toLocaleString\|formatTime\|h ago\|d ago" tests/popup/views/ActivityLogView.test.tsx
```

Add a new test:

```ts
it('formats ages across all buckets (minutes / hours / days / older)', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-10T12:00:00Z'));
  try {
    const now = Date.now();
    mountWith([
      e({ at: now - 30 * 60_000, prNumber: 1 }),       // 30m
      e({ at: now - 3 * 3_600_000, prNumber: 2 }),     // 3h
      e({ at: now - 2 * 86_400_000, prNumber: 3 }),    // 2d
      e({ at: now - 14 * 86_400_000, prNumber: 4 }),   // 2w → short date
    ]);
    await act(async () => {});
    const list = screen.getByTestId('activity-list');
    expect(within(list).getByText(/30m ago/i)).toBeInTheDocument();
    expect(within(list).getByText(/3h ago/i)).toBeInTheDocument();
    expect(within(list).getByText(/2d ago/i)).toBeInTheDocument();
    // Older than 1w: short date format, no "ago"
    expect(within(list).getByText(/Apr 26|26/i)).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
```

### A.2 — Migration banner — compact one-line variant (P2.4)

The banner is already dismissible but takes ~60px before dismissal. Make the default compact (one line, smaller buttons); the existing "dismiss" button still hides it.

- [ ] **A.2.1 — Rewrite `src/popup/components/MigrationBanner.tsx`**

Replace the JSX body (keep imports + hooks):

```tsx
return (
  <div className="migration-banner migration-banner--compact" data-testid="migration-banner" role="region" aria-label="Auth migration suggestion">
    <span className="migration-banner__hint">PAT auth — </span>
    <button
      type="button"
      className="migration-banner__action"
      onClick={onSwitchToApp}
    >
      switch to GitHub App ›
    </button>
    <button
      type="button"
      className="migration-banner__dismiss"
      onClick={dismiss}
      data-testid="migration-banner-dismiss"
      aria-label="Dismiss"
    >
      ×
    </button>
  </div>
);
```

- [ ] **A.2.2 — Replace the banner CSS in `src/popup/popup.css`**

Find the existing `.migration-banner` rules:

```bash
grep -n "migration-banner" src/popup/popup.css
```

Replace with:

```css
.migration-banner--compact {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; font-size: 11px;
  border-bottom: 1px solid var(--term-border);
  color: var(--term-fg-muted);
}
.migration-banner__hint { color: var(--term-fg-muted); }
.migration-banner__action {
  background: transparent; border: none; color: var(--term-cyan);
  cursor: pointer; padding: 0; font: inherit;
}
.migration-banner__action:hover { color: var(--term-cyan-hot, #79f2eb); }
.migration-banner__dismiss {
  margin-left: auto;
  background: transparent; border: none; color: var(--term-fg-muted);
  cursor: pointer; padding: 0 4px; font-size: 14px; line-height: 1;
}
.migration-banner__dismiss:hover { color: var(--term-fg); }
```

(Drop any legacy `.migration-banner__actions`, full-width container rules.)

### A.3 — Header title doesn't wrap (P1.1) + single-account login indicator (P1.3)

The header's title element wraps when extras (filter chip + log-out) eat horizontal space. Two fixes in tandem:
- Title gets `white-space: nowrap` + a min-width: 0 sibling that flexes
- Single-account case (when AccountSwitcher isn't rendered) gets a small `@<login>` indicator before the log-out button

- [ ] **A.3.1 — Update `src/popup/components/Header.tsx`**

Insert before the `user && <button ... log-out ... >` block:

```tsx
{!accounts || accounts.length <= 1 ? (
  user && (
    <>
      <span className="header__user" data-testid="header-user">@{user.login}</span>
      <button type="button" aria-label="Sign out" onClick={onSignOut} className="btn">
        log-out
      </button>
    </>
  )
) : (
  <AccountSwitcher ... />  // existing multi-account branch, unchanged
)}
```

(Mirror the existing branching exactly — read the file end-to-end before editing.)

- [ ] **A.3.2 — Update CSS for header title nowrap + new indicator**

In `src/popup/popup.css`, find the header title rules:

```bash
grep -n "header.*h1\|popup-header\|header__" src/popup/popup.css
```

Add / adjust:

```css
.popup-header__title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 0 1 auto;
}
.header__user {
  font-size: 11px;
  color: var(--term-cyan);
  padding: 2px 6px;
  border: 1px solid var(--term-border);
  border-radius: 3px;
  white-space: nowrap;
}
```

(Tune to match the existing header layout; pick the actual selector name from the existing CSS.)

### A.4 — Reviewer tab bar below migration banner (P2.5)

Today the tab bar renders before the migration banner. Swap the order in `PRListView.tsx`.

- [ ] **A.4.1 — Reorder in `src/popup/views/PRListView.tsx`**

Find the JSX inside `<div className="view-body">`. The tab bar appears immediately after, then the migration banner. Swap so the banner is first:

```tsx
<div className="view-body">
  {authMethod === 'pat' && (
    <MigrationBanner onSwitchToApp={onSignOut} />
  )}
  {settings.enableReviewerTab && (
    <div className="pr-tabs" data-testid="pr-tabs" role="tablist">
      ...existing tab-bar JSX...
    </div>
  )}
  ...
</div>
```

Existing reviewer-tab tests (`tests/popup/views/PRListView.reviewer-tab.test.tsx`) only assert on existence/visibility of the tab bar, not on document order, so they should pass unchanged.

### A.5 — PR row title truncation (P2.6)

PR row titles wrap to 2 lines when chips are present. Force single-line truncation.

- [ ] **A.5.1 — Update CSS in `src/popup/popup.css`**

Find `.pr-row__title` (line ~398 based on prior grep):

```css
.pr-row__title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1 1 auto;
}
```

Confirm the parent `.pr-row` is a flex container with `min-width: 0` on the child — otherwise overflow won't kick in. Adjust if needed.

### A.6 — Run full verify

- [ ] **A.6.1 — Typecheck + tests + build**

```bash
npm run typecheck && npx vitest run && npm run build
```

Expected: all green. Some existing snapshot / textContent tests may need minor updates after the timestamp format change and the header user-indicator addition. Update them in place — the new format is the desired behavior.

- [ ] **A.6.2 — Manual smoke**

Load `dist/` as an unpacked extension in Chrome. Verify:
- Migration banner is one line at top
- Header title doesn't wrap with 5+ repos + filter chip
- Activity log shows `Nm ago` / `Nh ago` / `Nd ago` / short-date format
- Reviewer tab bar appears below banner when both visible
- Long PR titles truncate with ellipsis, chips never wrap to a second row

### A.7 — Commit + PR

- [ ] **A.7.1 — Commit + push + arm merge**

```bash
git checkout -b ui/live-test-polish
git add src/popup/ tests/popup/views/ActivityLogView.test.tsx
git commit -m "ui(popup): live-test polish — header wrap, activity timestamps, migration banner, PR truncation"
git push -u origin ui/live-test-polish
gh pr create --title "ui(popup): live-test polish — header / timestamps / migration banner / row truncation" \
  --body "Six UI fixes from the live-test report. No new features.

- **P1.1** Header title gets nowrap + ellipsis; no longer wraps to 2 lines when filter chip is present.
- **P1.2** Activity log timestamps consistent: \`Nm\` → \`Nh\` → \`Nd\` → short date. Old jump from minutes to absolute is gone.
- **P1.3** Single-account header shows \`@<login>\` indicator next to log-out (multi-account case unchanged — AccountSwitcher already shows it).
- **P2.4** Migration banner compact one-line variant. Still dismissible via × button.
- **P2.5** Reviewer tab bar renders below the migration banner. Visual hierarchy: account-level first, scope-level second.
- **P2.6** PR row titles truncate with ellipsis on overflow; chips never pushed to a second visual row.

Surfaced by the live-test report from session 2026-05-11."
gh pr merge --auto --squash
```

- [ ] **A.7.2 — Wait for merge + cleanup**

```bash
git checkout main && git pull --ff-only
git branch -d ui/live-test-polish
```

---

## Out of scope

- Migration banner auto-dismissal logic (already dismissible via button; the compact form addresses the prominence concern). A future row in BACKLOG.md could add "auto-dismiss after N popup opens" if the compact form still feels intrusive.
- Header layout responsive at <320px popup widths — Chrome's popup is fixed at ~360px so we don't optimize narrower.
- E2E test re-runs against the live-test scenarios using the new `mockPRDetail` helper from Track C — adding those is a follow-up sprint (would re-validate the report findings under faithful state).
