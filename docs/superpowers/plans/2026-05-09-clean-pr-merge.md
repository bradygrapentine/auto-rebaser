# Clean-PR Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop logging GitHub's "PR is in clean status" / "PR already merged" responses as red `failed`, and add an opt-in fall-through path that directly merges clean PRs via REST when auto-enable-auto-merge can't apply.

**Backlog:** MERGE-1, MERGE-2 (in `docs/superpowers/BACKLOG.md` §1 Ready)

**Design (locked):** A1 + B1 + C1 + D1 + E1 + E3
- **A1** consent gate via new `mergeCleanPRsImmediately` toggle (default off)
- **B1** SHA precondition on REST merge call
- **C1** trust GitHub server-side rejection for branch-protection edges
- **D1** method preference fallback on `405 Method Not Allowed`
- **E1** distinct activity action `auto_merged_now`
- **E3** suppress upstream `auto_merge_enabled` failure log when fall-through merges

**Tech Stack:** TypeScript, React (popup), Vitest, GitHub REST + GraphQL, existing `pr-store` / `automations-store` / `activity-log` patterns.

**Wave shape:** Single wave, three parts — execute via `/wave 2026-05-09-clean-pr-merge`.

---

## File Structure

- **Modify** `src/core/activity-log-types.ts` — add `'auto_merged_now'` action, add `'skipped'` result, optional `skipReason` field.
- **Modify** `src/popup/views/ActivityLogView.tsx` — render `skipped` neutrally and `auto_merged_now` like a success.
- **Modify** `src/core/automations-types.ts` — add `mergeCleanPRsImmediately: boolean` setting.
- **Modify** `src/core/automations-store.ts` — default `false` for new setting.
- **Modify** `src/popup/components/AutomationsSettings.tsx` — sub-toggle inside the auto-merge block.
- **Modify** `src/background/automations/enable-auto-merge.ts` — classify no-op rejections, optionally fall through to direct merge.
- **Create** `src/github/endpoints/merge-pr.ts` — REST `PUT /repos/{o}/{r}/pulls/{n}/merge` helper with `sha` precondition + method.
- **Modify** `src/background/poll-cycle.ts` — when adapter returns the new "merged-now" outcome, emit an `auto_merged_now` activity entry instead of `auto_merge_enabled`.
- **Tests:** unit tests per new module/endpoint plus an adapter integration test driving every branch.

---

## Wave 1 — MERGE-1: Reclassify no-op responses

### Part 1A — Activity log type extensions

**Files:**
- Modify: `src/core/activity-log-types.ts`
- Test: `tests/core/activity-log.test.ts` (extend existing)

- [ ] **Step 1: Failing test**

```ts
// extend tests/core/activity-log.test.ts
it('accepts auto_merged_now action', () => {
  const entry: ActivityEntry = {
    at: 1, action: 'auto_merged_now', repo: 'a/b', prNumber: 1,
    prTitle: 't', result: 'success', mergeMethod: 'SQUASH',
  };
  expect(entry.action).toBe('auto_merged_now');
});

it('accepts skipped result with reason', () => {
  const entry: ActivityEntry = {
    at: 1, action: 'auto_merge_enabled', repo: 'a/b', prNumber: 1,
    prTitle: 't', result: 'skipped', skipReason: 'already_clean',
  };
  expect(entry.result).toBe('skipped');
});
```

- [ ] **Step 2: Implement**

In `src/core/activity-log-types.ts`:
- Add `'auto_merged_now'` to the `ActivityAction` union.
- Change `result: 'success' | 'failed'` to `'success' | 'failed' | 'skipped'`.
- Add optional `skipReason?: 'already_clean' | 'already_merged'`.

- [ ] **Step 3: Run tests + typecheck**

`npx vitest run tests/core && npm run typecheck` — both green.

- [ ] **Step 4: Commit**

`git commit -m "feat(activity): add auto_merged_now action + skipped result"`

### Part 1B — Adapter: classify no-op rejections

**Files:**
- Modify: `src/background/automations/enable-auto-merge.ts`
- Test: `tests/background/automations/enable-auto-merge.test.ts` (extend or create)

- [ ] **Step 1: Failing tests**

```ts
it('returns skip:"already_merged" when GitHub says PR is already merged', async () => {
  // mock enablePullRequestAutoMerge to throw with message including "already merged"
  const result = await tryEnableAutoMerge(/* ...fixture... */);
  expect(result).toEqual({ kind: 'skipped', reason: 'already_merged' });
});

it('returns skip:"already_clean" when GitHub says PR is in clean status (and toggle off)', async () => {
  // mergeCleanPRsImmediately === false
  const result = await tryEnableAutoMerge(/* ...fixture with toggle off... */);
  expect(result).toEqual({ kind: 'skipped', reason: 'already_clean' });
});
```

- [ ] **Step 2: Implement**

In `src/background/automations/enable-auto-merge.ts`:
- Define a new return type `EnableAutoMergeResult = { kind: 'enabled', method } | { kind: 'merged_now', method } | { kind: 'skipped', reason } | { kind: 'failed', error }`.
- Catch the GraphQL error message; if it contains `"already merged"` → `skipped:'already_merged'`. If it contains `"in clean status"` AND toggle is OFF → `skipped:'already_clean'`. Else propagate as `failed`.
- (The "in clean status" + toggle ON case is wired in Wave 2.)

- [ ] **Step 3: Wire poll-cycle to emit `skipped` entries instead of `failed`**

In `src/background/poll-cycle.ts` where the adapter result is mapped to an `ActivityEntry`:
- On `kind === 'skipped'`, emit `{ result: 'skipped', skipReason: reason }`.
- On `kind === 'failed'`, keep current behavior.

- [ ] **Step 4: Run tests + typecheck**

`npx vitest run tests/background && npm run typecheck` — green.

- [ ] **Step 5: Commit**

`git commit -m "feat(automations): classify no-op auto-merge rejections as skipped"`

### Part 1C — Activity log UI: render skipped neutrally

**Files:**
- Modify: `src/popup/views/ActivityLogView.tsx`
- Modify: `src/popup/popup.css` (add `.entry--skipped` color)
- Test: `tests/popup/views/ActivityLogView.test.tsx` (extend)

- [ ] **Step 1: Failing test**

```tsx
it('renders skipped entries with neutral styling, not red', () => {
  render(<ActivityLogView entries={[
    { at: 1, action: 'auto_merge_enabled', repo: 'a/b', prNumber: 1,
      prTitle: 't', result: 'skipped', skipReason: 'already_clean' },
  ]} />);
  const row = screen.getByTestId('activity-row');
  expect(row).toHaveClass('entry--skipped');
  expect(row).not.toHaveClass('entry--failed');
});
```

- [ ] **Step 2: Implement**

- Map `result === 'skipped'` to a new `entry--skipped` class (subdued gray, not red).
- Render skip message inline: `"already mergeable — no action needed"` for `'already_clean'`, `"already merged"` for `'already_merged'`.

- [ ] **Step 3: Run tests + typecheck + visual**

`npx vitest run tests/popup && npm run typecheck` — green.

- [ ] **Step 4: Commit**

`git commit -m "feat(popup): render skipped activity entries with neutral styling"`

---

## Wave 2 — MERGE-2: Fall-through direct merge

### Part 2A — Settings: `mergeCleanPRsImmediately` toggle

**Files:**
- Modify: `src/core/automations-types.ts`
- Modify: `src/core/automations-store.ts`
- Test: `tests/core/automations-store.test.ts` (extend)

- [ ] **Step 1: Failing test**

```ts
it('defaults mergeCleanPRsImmediately to false', async () => {
  chrome.storage.local.get = vi.fn().mockResolvedValue({});
  const settings = await getAutomationSettings();
  expect(settings.mergeCleanPRsImmediately).toBe(false);
});
```

- [ ] **Step 2: Implement**

- Add `mergeCleanPRsImmediately: boolean` to the `AutomationSettings` interface.
- Add `mergeCleanPRsImmediately: false` to the defaults in `automations-store.ts`.

- [ ] **Step 3: Tests + typecheck**

`npx vitest run tests/core && npm run typecheck` — green.

- [ ] **Step 4: Commit**

`git commit -m "feat(settings): add mergeCleanPRsImmediately toggle (default off)"`

### Part 2B — REST merge endpoint

**Files:**
- Create: `src/github/endpoints/merge-pr.ts`
- Test: `tests/github/endpoints/merge-pr.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { mergePR } from '../../../src/github/endpoints/merge-pr';

it('PUTs to /repos/:o/:r/pulls/:n/merge with sha + method', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ merged: true, sha: 'abc' }), { status: 200 })
  );
  await mergePR('octo', 'cat', 7, { sha: 'deadbeef', merge_method: 'squash' });
  expect(fetchSpy).toHaveBeenCalledWith(
    expect.stringMatching(/\/repos\/octo\/cat\/pulls\/7\/merge$/),
    expect.objectContaining({ method: 'PUT' }),
  );
  const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
  expect(body).toEqual({ sha: 'deadbeef', merge_method: 'squash' });
});

it('throws METHOD_NOT_ALLOWED on 405', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 405 }));
  await expect(mergePR('o', 'r', 1, { sha: 's', merge_method: 'rebase' }))
    .rejects.toThrow('METHOD_NOT_ALLOWED');
});

it('throws SHA_MISMATCH on 409', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 409 }));
  await expect(mergePR('o', 'r', 1, { sha: 's', merge_method: 'squash' }))
    .rejects.toThrow('SHA_MISMATCH');
});
```

- [ ] **Step 2: Implement**

Mirror the existing GitHub endpoint helpers in `src/github/endpoints/` for auth + base-URL handling. Export:

```ts
export type MergeMethod = 'merge' | 'squash' | 'rebase';
export async function mergePR(
  owner: string, repo: string, number: number,
  opts: { sha: string; merge_method: MergeMethod },
): Promise<{ merged: boolean; sha: string }>;
```

Map status codes: `200` → success, `405` → throw `METHOD_NOT_ALLOWED`, `409` → throw `SHA_MISMATCH`, others → throw `HTTP_<code>`.

- [ ] **Step 3: Tests + typecheck**

`npx vitest run tests/github && npm run typecheck` — green.

- [ ] **Step 4: Commit**

`git commit -m "feat(github): add merge-pr REST endpoint helper"`

### Part 2C — Adapter: fall-through merge with method preference

**Files:**
- Modify: `src/background/automations/enable-auto-merge.ts`
- Test: `tests/background/automations/enable-auto-merge.test.ts` (extend)

- [ ] **Step 1: Failing tests**

```ts
it('falls through to direct merge when toggle ON and PR in clean status', async () => {
  // mergeCleanPRsImmediately: true
  // GraphQL throws "in clean status"
  // mock mergePR success on first method
  const result = await tryEnableAutoMerge(/* fixture */);
  expect(result).toEqual({ kind: 'merged_now', method: 'SQUASH' });
});

it('falls through to next method on 405', async () => {
  // first method 'REBASE' → 405; second 'SQUASH' → success
  const result = await tryEnableAutoMerge(/* fixture */);
  expect(result).toEqual({ kind: 'merged_now', method: 'SQUASH' });
});

it('returns failed when SHA mismatches mid-flight', async () => {
  // mergePR throws SHA_MISMATCH
  const result = await tryEnableAutoMerge(/* fixture */);
  expect(result.kind).toBe('failed');
});

it('still skips when toggle OFF even if clean', async () => {
  // mergeCleanPRsImmediately: false
  const result = await tryEnableAutoMerge(/* fixture */);
  expect(result).toEqual({ kind: 'skipped', reason: 'already_clean' });
});
```

- [ ] **Step 2: Implement**

In `src/background/automations/enable-auto-merge.ts`:
- After catching the "in clean status" error, check `settings.mergeCleanPRsImmediately`.
- If true: walk `mergeMethodPreference` in order, call `mergePR` with `sha = pr.head.sha` and the current method (lowercased). On success → return `{ kind: 'merged_now', method }`. On `METHOD_NOT_ALLOWED` → continue to next method. On `SHA_MISMATCH` or other error → break and return `{ kind: 'failed', error }`.
- If preference list exhausted → return `{ kind: 'failed', error: 'NO_ALLOWED_MERGE_METHOD' }`.

- [ ] **Step 3: Wire poll-cycle**

In `src/background/poll-cycle.ts`:
- On `kind === 'merged_now'`: emit one `ActivityEntry` with `action: 'auto_merged_now'`, `mergeMethod: method`, `result: 'success'`. Suppress the upstream `auto_merge_enabled` skipped entry for this PR (E3).
- On `kind === 'merged_now'` failure: emit `auto_merged_now` with `result: 'failed'` and `errorMessage`.

- [ ] **Step 4: Tests + typecheck**

`npx vitest run tests/background && npm run typecheck` — green.

- [ ] **Step 5: Commit**

`git commit -m "feat(automations): fall-through direct merge for clean PRs (opt-in)"`

### Part 2D — Popup UI: surface the new toggle

**Files:**
- Modify: `src/popup/components/AutomationsSettings.tsx`
- Test: `tests/popup/components/AutomationsSettings.test.tsx` (extend)

- [ ] **Step 1: Failing test**

```tsx
it('renders mergeCleanPRsImmediately toggle inside auto-merge block when expanded', () => {
  render(<AutomationsSettings />);
  // expand auto-merge if collapsed
  const toggle = screen.getByLabelText(/Merge clean PRs immediately/i);
  expect(toggle).not.toBeChecked();
});

it('saves mergeCleanPRsImmediately when toggled', async () => {
  render(<AutomationsSettings />);
  const toggle = screen.getByLabelText(/Merge clean PRs immediately/i);
  await userEvent.click(toggle);
  // assert saved through useAutomationSettings mock
});
```

- [ ] **Step 2: Implement**

Inside the existing auto-merge `expanded.autoMerge` block in `AutomationsSettings.tsx`, after the `MergeMethodPreferenceEditor`:

```tsx
<label className="toggle toggle--sub">
  <span className="toggle__name">Merge clean PRs immediately</span>
  <span className="toggle__hint">When a PR is already mergeable, merge it now instead of waiting for auto-merge.</span>
  <input
    type="checkbox"
    checked={settings.mergeCleanPRsImmediately}
    disabled={!settings.autoEnableAutoMerge}
    onChange={(e) => save({ mergeCleanPRsImmediately: e.target.checked })}
  />
</label>
```

- [ ] **Step 3: Tests + typecheck**

`npx vitest run tests/popup && npm run typecheck` — green.

- [ ] **Step 4: Commit**

`git commit -m "feat(popup): expose mergeCleanPRsImmediately toggle in settings"`

---

## Wave 3 — Verification + PR

- [ ] **Step 1: Full verify chain**

`npm run typecheck && npm test && npm run build:all` — all green.

- [ ] **Step 2: Manual smoke**

1. Build with `npm run build:all`, repackage zips.
2. Load unpacked in Chrome:
   - Confirm new toggle appears under auto-merge, default OFF.
   - With toggle OFF: trigger a clean PR auto-merge attempt → activity log shows neutral `skipped` entry, not red `failed`.
   - With toggle ON: trigger same scenario → activity log shows `auto_merged_now · success` and the PR is actually merged on GitHub.
3. Repeat in Firefox load-temporary-add-on.

- [ ] **Step 3: Open PR**

`gh pr create` with title `feat(automations): clean-PR fall-through merge + skipped log` and body summarizing MERGE-1 + MERGE-2 plus the manual smoke results.

- [ ] **Step 4: Update BACKLOG.md**

After PR opens: move MERGE-1 and MERGE-2 to §3 In review. After merge: move to §7 Shipped log with PR number.

---

## Risks / open questions

- **`mergeable_state` staleness.** `mergeable_state` from REST PR detail can be `'unknown'` immediately after a push while GitHub recomputes. The fall-through path keys on the GraphQL "in clean status" error string, which is GitHub's own real-time signal — acceptable.
- **Multiple PRs hit the fall-through in one cycle.** Each is independent (per-PR SHA, per-PR method); no batching needed.
- **Telemetry / analytics.** None — extension has no telemetry. The activity log is the only signal.
- **Backwards compat.** New action `'auto_merged_now'` and new result `'skipped'` are additive; old activity entries remain renderable.

