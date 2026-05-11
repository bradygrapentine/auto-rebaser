# Cross-account action-dot — implementation plan

**Goal:** Surface a small yellow dot on the AccountSwitcher pill when a *non-active* signed-in account has PRs that need user action.

**Architecture:** Compute an actionable-count per account inside the poll cycle (after `processedPRs` is finalized), persist via the multi-account storage facade, surface in `AccountSummary`, render a dot in `AccountSwitcher`.

**Tech stack:** TypeScript / React / vitest. No new deps.

---

## Task 1 — Storage + types

**Files:**
- Modify: `src/core/storage/multi-account.ts`
- Modify: `src/core/storage/account-summary.ts`

- [ ] **1.1 Extend `AccountState`** in `src/core/storage/multi-account.ts:45-57`. Add a new field after `reviewerPRs`. **Optional** because:
- the storage facade returns `undefined` when the key is absent
- existing AccountState literals (in tests + production) don't need to be touched if it's optional
- callers default to 0 explicitly

```ts
  /** Cross-account action-dot — count of PRs in actionable state under this
   * account, computed at the end of each poll cycle. Absent until first
   * poll; callers default to 0. Source of truth for the AccountSwitcher dot. */
  actionable_count?: number;
```

- [ ] **1.2 Extend `AccountSummary`** in `src/core/storage/account-summary.ts:12-28`. Add:

```ts
  /** PRs in actionable state under this account (poll-computed). 0 when none. */
  actionableCount: number;
```

- [ ] **1.3 Populate `actionableCount` in `getAccountSummaries`** at `src/core/storage/account-summary.ts:49-68`. Inside the loop, before the `out.push({...})`, add:

```ts
    const actionableCount =
      ((await getAccountState(id, 'actionable_count')) as number | undefined) ?? 0;
```

And include `actionableCount` in the pushed object.

- [ ] **1.4 Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **1.5 Commit**

```bash
git add src/core/storage/multi-account.ts src/core/storage/account-summary.ts
git commit -m "feat(storage): per-account actionable_count + AccountSummary field"
```

---

## Task 2 — Predicate + poll-cycle integration (test-first)

**Files:**
- Create: `src/core/actionable-pr.ts`
- Test: `tests/core/actionable-pr.test.ts`
- Modify: `src/background/poll-cycle.ts`
- Test: `tests/background/poll-cycle.test.ts`

- [ ] **2.1 Write the failing predicate test** at `tests/core/actionable-pr.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isPRActionable } from '../../src/core/actionable-pr';
import { DEFAULT_AUTOMATION_SETTINGS } from '../../src/core/automations-types';
import type { PRRecord, PRRecordPhaseTwo } from '../../src/core/automations-types';

function pr(overrides: Partial<PRRecord & PRRecordPhaseTwo> = {}): PRRecord & PRRecordPhaseTwo {
  return {
    id: 1, number: 1, title: 't', repo: 'org/r', url: 'u',
    state: 'current', lastUpdated: 0, ...overrides,
  } as PRRecord & PRRecordPhaseTwo;
}

describe('isPRActionable', () => {
  const settings = { ...DEFAULT_AUTOMATION_SETTINGS };

  it('current/updated/draft/merged/closed/error/pending → not actionable', () => {
    for (const state of ['current', 'updated', 'draft', 'merged', 'closed', 'error', 'pending'] as const) {
      expect(isPRActionable(pr({ state }), settings)).toBe(false);
    }
  });

  it('conflict → actionable', () => {
    expect(isPRActionable(pr({ state: 'conflict' }), settings)).toBe(true);
  });

  it('needs-manual → actionable', () => {
    expect(isPRActionable(pr({ state: 'needs-manual' }), settings)).toBe(true);
  });

  it('behind + autoRebaseEnabled=true + repo not opted out → NOT actionable (auto-rebase handles it)', () => {
    expect(isPRActionable(pr({ state: 'behind' }), settings)).toBe(false);
  });

  it('behind + autoRebaseEnabled=false → actionable', () => {
    expect(isPRActionable(pr({ state: 'behind' }), { ...settings, autoRebaseEnabled: false })).toBe(true);
  });

  it('behind + repo in autoRebaseOptOutRepos → actionable', () => {
    expect(
      isPRActionable(pr({ state: 'behind', repo: 'org/r' }), { ...settings, autoRebaseOptOutRepos: ['org/r'] }),
    ).toBe(true);
  });

  const staleApproval = { lastApprovedAt: 100, lastPushedAt: 200, approvers: ['alice'] };

  it('staleApproval set + enablePushSinceApproval=true → actionable', () => {
    expect(
      isPRActionable(pr({ state: 'current', staleApproval }), { ...settings, enablePushSinceApproval: true }),
    ).toBe(true);
  });

  it('staleApproval set + enablePushSinceApproval=false → NOT actionable', () => {
    expect(
      isPRActionable(pr({ state: 'current', staleApproval }), { ...settings, enablePushSinceApproval: false }),
    ).toBe(false);
  });

  it('staleApproval=null → NOT actionable (null means computed-and-cleared)', () => {
    expect(
      isPRActionable(pr({ state: 'current', staleApproval: null }), { ...settings, enablePushSinceApproval: true }),
    ).toBe(false);
  });
});
```

- [ ] **2.2 Run the failing test**

```bash
npx vitest run tests/core/actionable-pr.test.ts
```

Expected: FAIL — `isPRActionable` doesn't exist.

- [ ] **2.3 Implement** `src/core/actionable-pr.ts`:

```ts
// Cross-account action-dot — predicate for "this PR needs the user's
// attention now and won't self-resolve."
//
// Used by the poll cycle (computed per account, persisted via storage)
// and tested in isolation here. Kept stateless so the popup can also
// call it if a future feature needs per-PR actionable highlighting.

import type { PRRecord, PRRecordPhaseTwo, AutomationSettings } from './automations-types';

export function isPRActionable(
  pr: PRRecord & Partial<PRRecordPhaseTwo>,
  settings: AutomationSettings,
): boolean {
  // Story 5.2-A — the `staleApproval` field is the source of truth for
  // "push happened after the latest approval." Field shape per
  // automations-types.ts:210 — `staleApproval?: { lastApprovedAt; lastPushedAt; approvers } | null`.
  // Independent of state — could apply to a `current` PR with a stale approval.
  if (pr.staleApproval && settings.enablePushSinceApproval) return true;

  switch (pr.state) {
    case 'conflict':
    case 'needs-manual':
      return true;
    case 'behind': {
      const repoOptedOut = settings.autoRebaseOptOutRepos.includes(pr.repo);
      return !settings.autoRebaseEnabled || repoOptedOut;
    }
    default:
      return false;
  }
}
```

- [ ] **2.4 Verify the predicate test passes**

```bash
npx vitest run tests/core/actionable-pr.test.ts
```

Expected: all green.

- [ ] **2.5 Hook into poll cycle.** In `src/background/poll-cycle.ts`, find the block in `runPollCycleInner` that runs **immediately after** the line `await upsertPRs(processedPRs);` (currently near line 519). After `await pruneStale(...)` and `await stampPollTime()`, before the orchestrator pass at the comment `// Step 4.5: phase-2 automations`, insert:

```ts
// Cross-account action-dot — count actionable PRs under the now-active
// account and persist so the popup can render the dot without re-walking
// the store on every render. Skip the write when there's no active id
// (pre-multi-account fallback path) — setAccountState with id='' would
// poison the accounts namespace with a phantom '' row.
try {
  const activeId = await getActiveAccountId();
  if (activeId) {
    const settings = staleSettings ?? (await getAutomationSettings());
    const actionable = processedPRs.filter((p) =>
      isPRActionable(p as PRRecord & Partial<PRRecordPhaseTwo>, settings),
    ).length;
    await setAccountState(activeId, 'actionable_count', actionable);
  }
} catch (err) {
  // Best-effort — failing here must not abort the cycle.
  console.warn('[poll-cycle] actionable_count update failed', err);
}
```

Add at top of file imports:

```ts
import { isPRActionable } from '../core/actionable-pr';
import { setAccountState } from '../core/storage/multi-account';
```

(`getActiveAccountId` is already imported.) The `if (activeId)` guard is mandatory — `setAccountState` writes `accounts[id] = {...}` unconditionally; an empty-string id creates a phantom account that `listAccountIds()` would later return, corrupting the namespace on pre-multi installs. Don't soften this guard.

- [ ] **2.6 Write the failing poll-cycle integration test.**

First, check whether `tests/background/poll-cycle.test.ts` already mocks `../../src/core/storage/multi-account`:

```bash
grep -n "storage/multi-account\|setAccountState\|getActiveAccountId" tests/background/poll-cycle.test.ts
```

**Case A — no existing mock for `multi-account`:** Add this `vi.mock` block alongside the other `vi.mock(...)` calls near the top of the file:

```ts
vi.mock('../../src/core/storage/multi-account', () => ({
  getActiveAccountId: vi.fn().mockResolvedValue('gh_brady'),
  setActiveAccountId: vi.fn().mockResolvedValue(undefined),
  listAccountIds: vi.fn().mockResolvedValue(['gh_brady']),
  setAccountState: vi.fn().mockResolvedValue(undefined),
}));
```

Then add the import alongside other imports:

```ts
import { setAccountState, getActiveAccountId } from '../../src/core/storage/multi-account';
```

**Case B — existing mock present:** add `setAccountState: vi.fn().mockResolvedValue(undefined)` to its factory; reuse the existing import.

Then append this describe block at the end of the file:

```ts
describe('cross-account action-dot — actionable_count persistence', () => {
  it('writes actionable_count=1 to the active account when one conflict PR is present', async () => {
    (getActiveAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('gh_brady');
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 5, number: 5 }),
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 5, number: 5, mergeable_state: 'dirty' }), // → state: 'conflict'
    );

    await runPollCycle();

    expect(setAccountState).toHaveBeenCalledWith('gh_brady', 'actionable_count', 1);
  });

  it('does NOT write actionable_count when there is no active account (single-account fallback path)', async () => {
    (getActiveAccountId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 5, number: 5 }),
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 5, number: 5, mergeable_state: 'dirty' }),
    );

    await runPollCycle();

    expect(setAccountState).not.toHaveBeenCalledWith(expect.anything(), 'actionable_count', expect.any(Number));
  });

  it('writes actionable_count=0 when all PRs are clean', async () => {
    (getActiveAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('gh_brady');
    (searchAuthoredPRs as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeSearchResult({ id: 5, number: 5 }),
    );
    (getPR as ReturnType<typeof vi.fn>).mockResolvedValue(
      makePR({ id: 5, number: 5, mergeable_state: 'clean' }),
    );

    await runPollCycle();

    expect(setAccountState).toHaveBeenCalledWith('gh_brady', 'actionable_count', 0);
  });
});
```

**Heads-up about the outer multi-account loop:** `runPollCycle` itself calls `listAccountIds` and iterates. If `listAccountIds` returns `[]` (the fallback path) the outer loop is skipped and `runPollCycleInner` runs once without going through `setActiveAccountId`. The Case-A mock above returns `['gh_brady']` so the multi-account path *is* exercised and `setActiveAccountId('gh_brady')` runs — confirm by reading lines 92-130 of `poll-cycle.ts` before finalizing the test. If those assertions don't fit the mocking shape, adjust by mocking `listAccountIds` to `[]` and asserting the same via the single-account inner path; the spec applies equally.

- [ ] **2.7 Run integration test, verify FAIL → implement → verify PASS**

```bash
npx vitest run tests/background/poll-cycle.test.ts -t "action-dot"
```

- [ ] **2.8 Run full suite to catch regressions**

```bash
npx vitest run
```

Expected: still 916+ green (+2 new = 918+).

- [ ] **2.9 Commit**

```bash
git add src/core/actionable-pr.ts src/background/poll-cycle.ts tests/core/actionable-pr.test.ts tests/background/poll-cycle.test.ts
git commit -m "feat(poll): per-account actionable_count via isPRActionable predicate"
```

---

## Task 3 — AccountSwitcher dot rendering

**Files:**
- Modify: `src/popup/components/AccountSwitcher.tsx`
- Modify: `src/popup/popup.css`
- Test: `tests/popup/components/AccountSwitcher.test.tsx`

- [ ] **3.1 Read existing component**

```bash
sed -n '1,200p' src/popup/components/AccountSwitcher.tsx | head -100
```

Find:
- where the pill (closed-state button) is rendered
- where each dropdown row is rendered, including the existing `account-switcher__dot account-switcher__dot--suspended` markup

- [ ] **3.2 Add `--attention` dot variant in `src/popup/popup.css`**

Find:
```css
.account-switcher__dot--suspended { background: var(--term-yellow); }
```

Add directly after:
```css
.account-switcher__dot--attention { background: var(--term-yellow); }
.account-switcher__pill-attention {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--term-yellow);
  margin-left: 4px;
  flex: 0 0 auto;
  display: inline-block;
  vertical-align: middle;
}
```

- [ ] **3.3 Render the dot on the pill** when any non-active account has `actionableCount > 0`. In `AccountSwitcher.tsx`, inside the closed-state pill JSX, after the existing login + dropdown caret, add:

```tsx
{accounts.some((a) => a.id !== activeId && a.actionableCount > 0) && (
  <span
    className="account-switcher__pill-attention"
    aria-label="Another account has PRs needing attention"
    data-testid="account-switcher-pill-attention"
  />
)}
```

- [ ] **3.4 Render the dot on each dropdown row** with `actionableCount > 0`. In the row JSX, alongside the existing `suspended` dot, conditionally add:

```tsx
{account.actionableCount > 0 && (
  <span
    className="account-switcher__dot account-switcher__dot--attention"
    aria-label="PRs need attention on this account"
    data-testid={`account-switcher-row-attention-${account.id}`}
  />
)}
```

- [ ] **3.5 Tests** in `tests/popup/components/AccountSwitcher.test.tsx`. Read the existing test file to match its mounting convention. Add three cases:

```ts
it('renders pill attention dot when a non-active account has actionableCount > 0', () => {
  render(<AccountSwitcher accounts={[
    { id: 'gh_brady', login: 'brady', avatarUrl: '', method: 'pat', host: '', suspended: false, actionableCount: 0 },
    { id: 'gh_work', login: 'work', avatarUrl: '', method: 'pat', host: '', suspended: false, actionableCount: 2 },
  ]} activeId="gh_brady" onSwitch={vi.fn()} onAddAccount={vi.fn()} onSignOut={vi.fn()} onSignOutAll={vi.fn()} />);
  expect(screen.getByTestId('account-switcher-pill-attention')).toBeInTheDocument();
});

it('does NOT render pill attention dot when only the ACTIVE account has actionableCount > 0', () => {
  render(<AccountSwitcher accounts={[
    { id: 'gh_brady', login: 'brady', avatarUrl: '', method: 'pat', host: '', suspended: false, actionableCount: 3 },
    { id: 'gh_work', login: 'work', avatarUrl: '', method: 'pat', host: '', suspended: false, actionableCount: 0 },
  ]} activeId="gh_brady" onSwitch={vi.fn()} onAddAccount={vi.fn()} onSignOut={vi.fn()} onSignOutAll={vi.fn()} />);
  expect(screen.queryByTestId('account-switcher-pill-attention')).not.toBeInTheDocument();
});

it('renders dropdown row dot only for accounts with actionableCount > 0', async () => {
  const user = userEvent.setup();
  render(<AccountSwitcher accounts={[
    { id: 'gh_brady', login: 'brady', avatarUrl: '', method: 'pat', host: '', suspended: false, actionableCount: 0 },
    { id: 'gh_work', login: 'work', avatarUrl: '', method: 'pat', host: '', suspended: false, actionableCount: 1 },
  ]} activeId="gh_brady" onSwitch={vi.fn()} onAddAccount={vi.fn()} onSignOut={vi.fn()} onSignOutAll={vi.fn()} />);
  // Open the dropdown (click the pill or whatever the existing tests do).
  await user.click(screen.getByRole('button', { name: /brady/i }));
  expect(screen.queryByTestId('account-switcher-row-attention-gh_brady')).not.toBeInTheDocument();
  expect(screen.getByTestId('account-switcher-row-attention-gh_work')).toBeInTheDocument();
});
```

(Adapt the dropdown-open invocation to match what existing tests in the file already do — read first.)

- [ ] **3.6 Run tests**

```bash
npx vitest run tests/popup/components/AccountSwitcher.test.tsx
```

- [ ] **3.7 Commit**

```bash
git add src/popup/components/AccountSwitcher.tsx src/popup/popup.css tests/popup/components/AccountSwitcher.test.tsx
git commit -m "ui(account-switcher): cross-account action-dot on pill + dropdown rows"
```

---

## Task 4 — Verify + ship

- [ ] **4.1 Full local green**

```bash
npm run typecheck && npx vitest run && npm run build
```

Expected: all green.

- [ ] **4.2 Build + manual smoke (Chrome)**

Load `dist/` unpacked. Two-account scenario:
- Sign in two accounts (one with a conflicted/needs-manual/opt-out-behind PR, the other clean)
- While viewing the clean account: dot on the pill, dot on the dirty account's dropdown row
- Switch to the dirty account: dot on the pill disappears

- [ ] **4.3 Push + PR + auto-merge**

```bash
git push -u origin sprint/cross-account-action-dot
gh pr create --title "feat: cross-account action-dot on AccountSwitcher" \
  --body "Surfaces a yellow dot on the AccountSwitcher pill when a non-active signed-in account has PRs needing user action (conflict / needs-manual / opt-out behind / pushSinceApproval). Per-account count computed each poll cycle via the new isPRActionable predicate, persisted via the multi-account storage facade, surfaced through AccountSummary. Reviewer-tab PRs intentionally excluded — this is 'authored work waiting on you,' not 'someone wants you to review.'

Spec: docs/superpowers/specs/2026-05-11-cross-account-action-dot-design.md
Plan: docs/superpowers/plans/2026-05-11-cross-account-action-dot.md"
gh pr merge --auto --squash
```

- [ ] **4.4 Sync + cleanup**

```bash
git checkout main && git pull --ff-only
git branch -d sprint/cross-account-action-dot
```

---

## Out of scope (per spec)

- Numeric count on the dot
- System-level desktop notification (we already have those for state transitions)
- Reviewer-tab cross-account dot
- Per-repo actionable surfacing inside an account (already exists via `.repo-group__attention-dot`)
- Configurability of the predicate
