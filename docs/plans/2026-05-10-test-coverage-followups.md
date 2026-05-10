# Test Coverage + Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two real bugs surfaced by the reviewer-automations work (#105) and shore up test coverage on the paths the work exercises but doesn't anchor.

**Architecture:** Direct edits in a single feature branch. Four tasks, file scopes disjoint (automations-store / PRListView / new e2e file / existing reviewer integration test). TDD throughout — failing test first, fix second.

**Tech Stack:** TypeScript, Vitest, Playwright. Coverage thresholds unchanged.

---

## Background

Two bugs found during the reviewer-automations build:

1. **v1/v2 settings split bug.** `saveAutomationSettings` always calls `setGlobalSetting('ignoredRepos', ...)` and `setGlobalSetting('enableKeyboardShortcuts', ...)` even when no `active_account_id` exists, populating `global_settings` as a side effect. On reload, `getAutomationSettings` then sees `global_settings` is defined → takes the v2 branch → reads an empty `perAccount` → returns DEFAULTS, silently dropping the v1 fallback write. Reproducible with no signed-in account; surfaced by the `settings-persistence` E2E (worked around there by seeding an `active_account_id`).
2. **Reviewer-tab visibility bug.** Reviewer-tab PRs whose `state` is `current` (i.e. clean + approved, the common reviewer state) fall outside `ATTENTION_STATES` and so render as collapsed repo groups by default. The user has to click each repo header to see the rows — defeats the dashboard purpose.

Plus two test-coverage gaps:

3. **No E2E coverage for the reviewer tab.** Just-shipped feature with zero browser-level regression guard.
4. **`runReviewerPhase` error paths have no direct test.** The 404/422 "revoke from allowlist" branch and the `listReviews` / `getPRReviewDecision` exception branches exist in code but aren't anchored by tests.

---

## File Structure

### Created
- `e2e/reviewer-tab.spec.ts` — Playwright E2E for the reviewer tab

### Modified
- `src/core/automations-store.ts` — fix #1
- `tests/core/automations-store.test.ts` — regression test for #1
- `src/popup/views/PRListView.tsx` — fix #2
- `tests/popup/views/PRListView.reviewer-tab.test.tsx` — regression test for #2
- `tests/background/poll-cycle.reviewer.test.ts` — coverage for #4

---

## Task 1 — Fix v1/v2 settings split bug

**Files:**
- Modify: `src/core/automations-store.ts`
- Modify: `tests/core/automations-store.test.ts`

The fix: when there's no active account, `saveAutomationSettings` should NOT touch `global_settings`. It should write the whole blob to the v1 fallback key and stop. That way reads either find `global_settings` empty (no v2 writes ever happened) and fall through to v1, or find `global_settings` populated (post-migration; v2 path is correct because perAccount also exists).

- [ ] **Step 1: Write failing regression test**

Append to `tests/core/automations-store.test.ts`:

```ts
it('round-trips autoRebaseEnabled=false through storage when no active account is set', async () => {
  // Reproduces the bug surfaced by the settings-persistence E2E: pre-migration
  // / no-active-account path used to leak `global_settings.ignoredRepos` as a
  // side effect of save, which made the next read take the v2 branch and
  // return DEFAULTS instead of the v1-fallback write.
  const storage: Record<string, unknown> = {};
  (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockImplementation(async (keys: string | string[]) => {
    const want = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of want) if (k in storage) out[k] = storage[k];
    return out;
  });
  (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockImplementation(async (patch: Record<string, unknown>) => {
    Object.assign(storage, patch);
  });
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({}); // no active_account_id

  const next: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, autoRebaseEnabled: false };
  await saveAutomationSettings(next);
  const round = await getAutomationSettings();
  expect(round.autoRebaseEnabled).toBe(false);
});
```

Add the `import type { AutomationSettings }` if not already imported. The expected import is from `../../src/core/automations-types`.

- [ ] **Step 2: Run test — verify FAIL**

Run: `npx vitest run tests/core/automations-store.test.ts -t "round-trips autoRebaseEnabled=false"`
Expected: FAIL with `expected true to be false` (i.e. it returned the default `autoRebaseEnabled: true`).

- [ ] **Step 3: Apply the fix AND update the existing no-account test**

Before changing the code, find the existing test at `tests/core/automations-store.test.ts:137-151` titled `'writes to chrome.storage.sync under the v1 key when no active account (pre-migration)'`. It currently asserts `global_settings` IS written. After the fix that assertion is wrong — invert it:

```ts
it('writes to chrome.storage.sync under the v1 key when no active account (pre-migration)', async () => {
  chrome.storage.sync.get = vi.fn().mockResolvedValue({});
  chrome.storage.local.get = vi.fn().mockResolvedValue({});
  chrome.storage.sync.set = vi.fn().mockResolvedValue(undefined);
  const settings: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, autoEnableAutoMerge: true };
  await saveAutomationSettings(settings);
  // No active account → v1 single-key write only. global_settings must NOT
  // be touched (writing it would make the next read take the v2 branch and
  // return DEFAULTS because perAccount is empty).
  expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  expect(chrome.storage.sync.set).toHaveBeenCalledWith({
    [AUTOMATION_STORAGE_KEYS.settings]: settings,
  });
});
```

Then in `src/core/automations-store.ts`, change `saveAutomationSettings` to take the v1 fallback path EARLY when no active account, and skip global-settings writes in that branch:

```ts
export async function saveAutomationSettings(s: AutomationSettings): Promise<void> {
  const id = await getActiveAccountId();
  if (!id) {
    // Pre-migration / no-active-account path — write the v1 single-key blob
    // and DO NOT touch global_settings. Touching it would make getAutomationSettings
    // take the v2 branch on the next read, with an empty perAccount, silently
    // dropping the write we just made.
    await chrome.storage.sync.set({ [AUTOMATION_STORAGE_KEYS.settings]: s });
    return;
  }

  // v2 path: split into global + per-account writes.
  await setGlobalSetting('ignoredRepos', s.ignoredRepos);
  await setGlobalSetting('enableKeyboardShortcuts', s.enableKeyboardShortcuts);

  const perAccount: Partial<PerAccountSettings> = {};
  for (const [k, v] of Object.entries(s)) {
    if (!isGlobalKey(k)) {
      (perAccount as Record<string, unknown>)[k] = v;
    }
  }
  await writePerAccountSettings(perAccount);
}
```

- [ ] **Step 4: Run test — verify PASS**

Run: `npx vitest run tests/core/automations-store.test.ts`
Expected: all pass (including the new test).

- [ ] **Step 5: Update the E2E workaround comment**

DO NOT remove the `active_account_id` seed from `e2e/settings-persistence.spec.ts`. The test's sanity assertion at line ~57 (`expect(v2Global).toBeDefined()`) verifies that the v2 path *does* populate `global_settings` when an account exists — exactly the path the fix preserves. Removing the seed would break that assertion.

Instead, update the comment block at lines 12-19 to reflect that the bug is now fixed and the seed is kept for v2-path parity rather than as a workaround:

```ts
// Seed an active account so saveAutomationSettings exercises the v2
// per-account split path (writes to per_account_settings:<id> + global_settings).
// The v1/v2 split bug that previously dropped the write on the no-account
// path was fixed; that scenario is covered by the unit test in
// tests/core/automations-store.test.ts. This E2E focuses on the multi-account
// v2 round-trip.
```

- [ ] **Step 6: Build + run E2E**

```bash
npm run build && npx playwright test e2e/settings-persistence.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Run full vitest suite**

Run: `npx vitest run`
Expected: no regressions.

- [ ] **Step 8: Commit**

```bash
git add src/core/automations-store.ts tests/core/automations-store.test.ts e2e/settings-persistence.spec.ts
git commit -m "fix(automations-store): don't write global_settings without an active account"
```

---

## Task 2 — Reviewer-tab "current" PRs visibility

**Files:**
- Modify: `src/popup/views/PRListView.tsx`
- Modify: `tests/popup/views/PRListView.reviewer-tab.test.tsx`

The fix: when `activeTab === 'reviewer'`, force-expand every repo group regardless of `hasAttention`. The reviewer dashboard's whole purpose is to show "what's on your plate as a reviewer" — collapsing approved-and-clean PRs hides the most-relevant rows behind an extra click.

- [ ] **Step 1: Write failing UI test**

Append to `tests/popup/views/PRListView.reviewer-tab.test.tsx`:

```tsx
it('auto-expands reviewer-tab repo groups even when all PRs are state=current', async () => {
  // Reviewer-tab PRs are usually `current` (clean, approved, waiting for
  // other gates) — outside ATTENTION_STATES. Collapsing them by default
  // defeats the dashboard purpose. The reviewer tab must always render rows
  // expanded.
  setSettings({ enableReviewerTab: true });
  setStores([], [pr({ id: 99, number: 99, repo: 'org/x', title: 'CLEAN-PR', state: 'current' })]);
  render(<PRListView onSettings={vi.fn()} onSignOut={vi.fn()} />);
  await act(async () => {});
  fireEvent.click(screen.getByTestId('pr-tab-reviewer'));
  await act(async () => {});
  // The row must be visible without expanding the group.
  expect(screen.getByText('CLEAN-PR')).toBeInTheDocument();
});
```

Note: the existing `pr()` factory uses `state: 'behind'` as default — this test overrides to `state: 'current'` explicitly to reproduce the bug.

- [ ] **Step 2: Run test — verify FAIL**

Run: `npx vitest run tests/popup/views/PRListView.reviewer-tab.test.tsx -t "auto-expands"`
Expected: FAIL — `CLEAN-PR` not in document (group collapsed).

- [ ] **Step 3: Apply the fix**

In `src/popup/views/PRListView.tsx`, find the `groups.map((g) => {` render loop. Change the `expanded` computation to force-expand on the reviewer tab:

```tsx
groups.map((g) => {
  const defaultExpanded = activeTab === 'reviewer' ? true : g.hasAttention;
  const expanded = isExpanded(g.repo, defaultExpanded);
  return (
    <RepoGroup
      // ...existing props unchanged...
    />
  );
})
```

Also update `flatVisiblePRs` so keyboard nav (j/k) reflects the same default:

```tsx
const flatVisiblePRs = useMemo(() => {
  const out: typeof prs = [];
  for (const g of groups) {
    const defaultExpanded = activeTab === 'reviewer' ? true : g.hasAttention;
    if (isExpanded(g.repo, defaultExpanded)) out.push(...g.prs);
  }
  return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [groups, toggled, activeTab]);
```

- [ ] **Step 4: Verify the `useMemo` deps array literally includes `activeTab`**

The Step 3 diff for `flatVisiblePRs` adds `activeTab` to the closure body. The deps array must also include it, otherwise the memoized result becomes stale on tab switch and keyboard nav (j/k) sees the wrong PR set. Confirm the final line reads:

```tsx
}, [groups, toggled, activeTab]);
```

- [ ] **Step 5: Run test — verify PASS**

Run: `npx vitest run tests/popup/views/PRListView.reviewer-tab.test.tsx`
Expected: all 5 tests pass (existing 4 + new auto-expand test).

- [ ] **Step 6: Full vitest + typecheck**

```bash
npm run typecheck && npx vitest run
```
Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/popup/views/PRListView.tsx tests/popup/views/PRListView.reviewer-tab.test.tsx
git commit -m "fix(popup): auto-expand reviewer-tab groups regardless of attention state"
```

---

## Task 3 — E2E coverage for the reviewer flow

**Files:**
- Create: `e2e/reviewer-tab.spec.ts`

A Playwright test seeded with `enableReviewerTab: true` + a small reviewer PR store, asserting tab bar visibility, tab swap, and chip rendering. Doesn't drive the poll cycle (Task 1 already covers the storage path); this test verifies the popup-side wiring stays intact.

- [ ] **Step 1: Inspect existing fixtures + tests for the patterns to mirror**

Skim `e2e/settings-persistence.spec.ts` (auth seeding via `active_account_id`) and `e2e/pr-list-state-chips.spec.ts` (chip + group-expand assertions). The reviewer test combines both: seed v2 account state with both `pr_store` and `reviewerPRs` namespaces.

- [ ] **Step 2: Write the test**

Create `e2e/reviewer-tab.spec.ts`:

```ts
// REVIEWER-AUTOMATIONS — popup-level E2E for the reviewer tab.
//
// Seeds v2 multi-account storage with a small set of reviewer PRs, flips on
// the master toggle in settings, and asserts: tab bar visible with the right
// counts, scope swap on click, chips render, groups auto-expand on the
// reviewer tab even for state='current' rows.

import { test, expect, mockGitHubApi } from './fixtures';

test('signed-in: reviewer tab renders rows with chips and auto-expands current-state PRs', async ({ context, popupPage }) => {
  await mockGitHubApi(context);

  // Seed v2 account state. Both `pr_store` (authored — empty here) and
  // `reviewerPRs` live under accounts.<id>.* . The active_account_id matches.
  await popupPage.evaluate(async () => {
    const id = 'gh_e2e-user';
    await chrome.storage.local.set({
      auth: { method: 'pat', token: 'fake-token-for-e2e' },
      active_account_id: id,
      accounts: {
        [id]: {
          login: 'e2e-user',
          method: 'pat',
          token: 'fake-token-for-e2e',
          pr_store: { prs: [], lastPollAt: Date.now() },
          reviewerPRs: {
            prs: [
              {
                id: 201, number: 201, title: 'I-APPROVED',
                repo: 'org/api', url: 'https://github.com/org/api/pull/201',
                state: 'current', lastUpdated: Date.now(),
                myReviewState: 'APPROVED',
              },
              {
                id: 202, number: 202, title: 'CHANGES-REQUESTED',
                repo: 'org/api', url: 'https://github.com/org/api/pull/202',
                state: 'current', lastUpdated: Date.now(),
                myReviewState: 'CHANGES_REQUESTED',
              },
              {
                id: 203, number: 203, title: 'AUTO-MERGE-ARMED',
                repo: 'org/web', url: 'https://github.com/org/web/pull/203',
                state: 'current', lastUpdated: Date.now(),
                myReviewState: 'APPROVED',
                reviewerAutoMergeArmed: { at: Date.now() },
              },
            ],
            lastPollAt: Date.now(),
          },
        },
      },
    });
    // Enable the reviewer tab via settings sync storage.
    await chrome.storage.sync.set({
      'per_account_settings:gh_e2e-user': { enableReviewerTab: true },
      per_account_settings_index: ['gh_e2e-user'],
    });
  });
  await popupPage.reload();
  await popupPage.waitForLoadState('domcontentloaded');

  // Tab bar visible with counts.
  await expect(popupPage.getByTestId('pr-tab-authored')).toHaveText(/Authored\s*\(0\)/);
  await expect(popupPage.getByTestId('pr-tab-reviewer')).toHaveText(/Reviewer\s*\(3\)/);

  // Switch to reviewer tab; groups must auto-expand even though all rows are
  // state='current'.
  await popupPage.getByTestId('pr-tab-reviewer').click();
  await expect(popupPage.getByText('I-APPROVED')).toBeVisible();
  await expect(popupPage.getByText('CHANGES-REQUESTED')).toBeVisible();
  await expect(popupPage.getByText('AUTO-MERGE-ARMED')).toBeVisible();

  // Chips render their respective testids.
  await expect(popupPage.getByTestId('reviewer-chip-approved').first()).toBeVisible();
  await expect(popupPage.getByTestId('reviewer-chip-changes')).toBeVisible();
  await expect(popupPage.getByTestId('reviewer-chip-armed')).toBeVisible();

  // Authored tab → zero PRs, no reviewer chips visible.
  await popupPage.getByTestId('pr-tab-authored').click();
  await expect(popupPage.getByText('I-APPROVED')).not.toBeVisible();
});
```

Note: the test depends on Task 2's auto-expand fix. If Task 2 hasn't landed yet, this test will fail at the "rows visible" step — that's the right ordering: Task 2 closes a real bug, Task 3 anchors that fix at the E2E level.

- [ ] **Step 3: Build extension**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Run new E2E test**

Run: `npx playwright test e2e/reviewer-tab.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run full E2E suite**

Run: `npx playwright test`
Expected: all tests pass (4 total: sign-in, pr-list-state-chips, settings-persistence, reviewer-tab).

- [ ] **Step 6: Commit**

```bash
git add e2e/reviewer-tab.spec.ts
git commit -m "test(e2e): reviewer-tab dashboard smoke test"
```

---

## Task 4 — Unit coverage for reviewer-phase error paths

**Files:**
- Modify: `tests/background/poll-cycle.reviewer.test.ts`

Three new scenarios extending the existing reviewer integration test file:

1. `enableAutoMerge` returns `unsupported + "not allowed" reason` → the repo is removed from `autoMergeReviewerOptInRepos` via `saveAutomationSettings`.
2. `listReviews` throws → reviewer phase continues with empty review data, doesn't fire (gate sees no approval), doesn't crash.
3. `getPRReviewDecision` throws → reviewer phase treats decision as `null` (REVIEW_REQUIRED), gate doesn't fire.

- [ ] **Step 1: Write the three new tests**

Append inside the existing `describe('poll-cycle — reviewer phase', () => { ... })` block in `tests/background/poll-cycle.reviewer.test.ts`:

```ts
it('on enableAutoMerge "not allowed" failure: revokes repo from allowlist via saveAutomationSettings', async () => {
  withSettings({
    enableReviewerTab: true,
    enableReviewerAutoMerge: true,
    autoMergeReviewerOptInRepos: ['org/api'],
  });
  (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
  (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
  (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
    { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
  ]);
  (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');
  (enablePullRequestAutoMerge as ReturnType<typeof vi.fn>).mockResolvedValue({
    enabled: false,
    unsupported: true,
    reason: 'Pull request auto-merge is not allowed for this repository',
  });

  await runPollCycle();

  expect(saveAutomationSettings).toHaveBeenCalledTimes(1);
  const persisted = (saveAutomationSettings as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(persisted.autoMergeReviewerOptInRepos).toEqual([]);
  // No arm cached — the next cycle will see the empty allowlist and skip.
  const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
  expect(upserted.reviewerAutoMergeArmed).toBeUndefined();
});

it('on listReviews error: phase proceeds with empty review data; gate does not fire', async () => {
  withSettings({
    enableReviewerTab: true,
    enableReviewerAutoMerge: true,
    autoMergeReviewerOptInRepos: ['org/api'],
  });
  (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
  (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
  (listReviews as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
  (getPRReviewDecision as ReturnType<typeof vi.fn>).mockResolvedValue('APPROVED');

  await runPollCycle();

  // No crash; row was written with default AWAITING (no review data); gate
  // didn't fire because the my-approval check failed.
  expect(enablePullRequestAutoMerge).not.toHaveBeenCalled();
  // Guard: the row MUST have been upserted. Otherwise the next assertion
  // would throw a TypeError on undefined and mask a real crash as a test
  // error instead of a failure.
  expect(upsertReviewerPRs).toHaveBeenCalledTimes(1);
  const upserted = (upsertReviewerPRs as ReturnType<typeof vi.fn>).mock.calls[0][0][0];
  expect(upserted.myReviewState).toBe('AWAITING');
});

it('on getPRReviewDecision error: gate treats decision as null and does not fire', async () => {
  withSettings({
    enableReviewerTab: true,
    enableReviewerAutoMerge: true,
    autoMergeReviewerOptInRepos: ['org/api'],
  });
  (searchReviewerPRs as ReturnType<typeof vi.fn>).mockResolvedValue(reviewerSearch(42));
  (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(makePR({ headSha: 'sha-CUR' }));
  (listReviews as ReturnType<typeof vi.fn>).mockResolvedValue([
    { login: 'alice', state: 'APPROVED', submittedAt: Date.now() - 60_000 },
  ]);
  (getPRReviewDecision as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('graphql failure'));

  await runPollCycle();

  expect(enablePullRequestAutoMerge).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run new tests — verify PASS**

Run: `npx vitest run tests/background/poll-cycle.reviewer.test.ts`
Expected: 10/10 pass (existing 7 + 3 new).

These should pass without code changes — they're anchoring existing implementation behavior. If any FAILs, the implementation has a real gap that this task should fix, not the test.

- [ ] **Step 3: Run full suite**

Run: `npx vitest run`
Expected: no regressions.

- [ ] **Step 4: Commit**

```bash
git add tests/background/poll-cycle.reviewer.test.ts
git commit -m "test(reviewer): cover poll-cycle error paths (revoke, listReviews fail, decision fail)"
```

---

## Out of scope (acknowledged, not fixed here)

- **Migration read-side gap.** Task 1 fixes only the *write* path. A user with `global_settings` already populated (e.g. partial v2 migration, lost `active_account_id` after a browser profile reset) will still have `getAutomationSettings` take the v2 branch, read an empty `perAccount`, and return DEFAULTS. The read-side fix would require either reseting `global_settings` when no account exists, or having `getAutomationSettings` prefer the v1 fallback when both `perAccount` is empty and the perAccountSettingsIndex has no entry for the active account. Worth a separate follow-up; not addressed here to keep this sprint scoped.

---

## Task 5 — Final verification + PR

- [ ] **Step 1: Full verify chain**

```bash
npm run typecheck && npx vitest run && npm run build && npx playwright test
```

Expected: typecheck clean, all vitest tests pass, build succeeds, all E2E tests pass.

- [ ] **Step 2: Push branch + open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "fix + test: settings-store v1/v2 split + reviewer-tab visibility + coverage" --body "..."
```

PR body should call out:
- The two real bugs fixed
- The two test-coverage gaps closed
- That all four were surfaced by the just-shipped reviewer-automations work

- [ ] **Step 3: Arm auto-merge (one attempt)**

```bash
gh pr merge --auto --squash
```

If branch protection blocks, hand off with PR URL + `gh pr checks` status.
