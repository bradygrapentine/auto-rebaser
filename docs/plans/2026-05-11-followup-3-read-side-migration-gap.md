# FOLLOWUP-3 — Read-side migration gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `getAutomationSettings` symmetric with the PR #106 write-side fix: when no active account exists, prefer the v1 fallback regardless of whether `global_settings` is populated. Closes the silent-DEFAULTS bug for users upgrading from a pre-#106 build.

**Architecture:** Small structural change in `src/core/automations-store.ts` — `getAutomationSettings` hoists `getActiveAccountId` and forks into two branches (v2 split for signed-in, v1 fallback for signed-out). The v2 branch gates on having an active account, not just on global keys being defined. New unit test reproduces the upgrade-from-old-build scenario.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

---

## Background

PR #106 fixed the **write** side: `saveAutomationSettings` no longer leaks `global_settings` writes on the no-account path.

But the **read** side still has the masking branch (`src/core/automations-store.ts:62-80`):

```ts
const ignoredRepos = await getGlobalSetting('ignoredRepos');
const enableKeyboardShortcuts = await getGlobalSetting('enableKeyboardShortcuts');
const perAccount = await readPerAccountSettings();

if (ignoredRepos !== undefined || enableKeyboardShortcuts !== undefined || Object.keys(perAccount).length > 0) {
  // v2 branch — ignores v1 fallback even when perAccount is empty
  return { ...DEFAULT_AUTOMATION_SETTINGS, ...perAccount, ... };
}
```

Upgrade-from-pre-#106 path:
1. User on old build saves settings while signed-out → old leaky save writes `global_settings.ignoredRepos: []` AND the v1 blob.
2. User upgrades to new build (PR #106 + this fix).
3. On read, `global_settings` is still populated from step 1 → v2 branch fires → `perAccount` empty → DEFAULTS, v1 blob silently dropped.

Severity is small (the user's actual saved settings are in the v1 blob; a single re-save under the fixed build clears the issue). But the silent-drop is the same class of bug the write-side fix addressed, and closing it symmetrically is cheap.

---

## File Structure

### Modified
- `src/core/automations-store.ts` — gate the v2 branch on having an active account
- `tests/core/automations-store.test.ts` — new test reproducing the upgrade scenario

No new files. No UI surface.

---

## Task 1 — Failing regression test

**Files:**
- Modify: `tests/core/automations-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append after the existing round-trip test:

```ts
it('upgrade-from-old-build: returns v1 fallback values when global_settings is leaked and no active account', async () => {
  // Reproduces FOLLOWUP-3: a user who saved settings on a pre-#106 build
  // has both `global_settings` (leaked write-side) AND the v1 fallback
  // blob in storage. On the new build, getAutomationSettings should
  // prefer v1 — the user's actual settings — instead of returning DEFAULTS
  // because the v2 branch fires on the leaked globals.
  const storage: Record<string, unknown> = {
    global_settings: { ignoredRepos: [], enableKeyboardShortcuts: true },
    [AUTOMATION_STORAGE_KEYS.settings]: {
      ...DEFAULT_AUTOMATION_SETTINGS,
      autoRebaseEnabled: false,
      mergeCleanPRsImmediately: true,
    },
  };
  chrome.storage.sync.get = vi.fn(async (keys: unknown) => {
    if (keys == null) return { ...storage };
    const want = Array.isArray(keys) ? (keys as string[]) : [keys as string];
    const out: Record<string, unknown> = {};
    for (const k of want) if (k in storage) out[k] = storage[k];
    return out;
  }) as typeof chrome.storage.sync.get;
  chrome.storage.local.get = vi.fn().mockResolvedValue({}); // no active_account_id

  const result = await getAutomationSettings();
  expect(result.autoRebaseEnabled).toBe(false);
  expect(result.mergeCleanPRsImmediately).toBe(true);
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npx vitest run tests/core/automations-store.test.ts -t "upgrade-from-old-build"`

Expected: FAIL — `autoRebaseEnabled` is `true` (default), not `false` (v1 value). This proves the v2 branch is firing on the leaked globals and returning DEFAULTS.

---

## Task 2 — Apply the fix

**Files:**
- Modify: `src/core/automations-store.ts`

The fix: gate the v2 branch on having an active account. When no active account, fall through to v1 regardless of whether `global_settings` is populated (it's leakage from an old build, not a v2 commitment).

- [ ] **Step 1: Apply the change**

In `src/core/automations-store.ts`, change `getAutomationSettings`:

```ts
export async function getAutomationSettings(): Promise<AutomationSettings> {
  const id = await getActiveAccountId();

  if (id) {
    // v2 split shape — active account exists, perAccount is the source of
    // truth alongside global_settings.
    const ignoredRepos = await getGlobalSetting('ignoredRepos');
    const enableKeyboardShortcuts = await getGlobalSetting('enableKeyboardShortcuts');
    const perAccount = await readPerAccountSettings();
    const merged: AutomationSettings = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      ...perAccount,
      ...(ignoredRepos !== undefined ? { ignoredRepos } : {}),
      ...(enableKeyboardShortcuts !== undefined ? { enableKeyboardShortcuts } : {}),
    };
    return merged;
  }

  // No active account — read from the v1 single-key fallback. Symmetric with
  // saveAutomationSettings's no-account path (PR #106). Any `global_settings`
  // present is leakage from a pre-#106 build and should be ignored.
  const result = await chrome.storage.sync.get(AUTOMATION_STORAGE_KEYS.settings);
  const stored = ((result ?? {})[AUTOMATION_STORAGE_KEYS.settings] ?? undefined) as
    | (Partial<AutomationSettings> & { autoMergeMethod?: MergeMethod })
    | undefined;
  if (!stored) return { ...DEFAULT_AUTOMATION_SETTINGS };

  const merged: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, ...stored };
  if (!stored.mergeMethodPreference) {
    const migrated = migrateMergeMethod(stored as Record<string, unknown>);
    if (migrated) merged.mergeMethodPreference = migrated;
  }
  delete (merged as Partial<AutomationSettings> & { autoMergeMethod?: MergeMethod }).autoMergeMethod;
  return merged;
}
```

- [ ] **Step 2: Run new test — verify PASS**

Run: `npx vitest run tests/core/automations-store.test.ts`
Expected: 13/13 pass (12 existing + 1 new).

- [ ] **Step 3: Verify no regression**

Run: `npx vitest run`
Expected: full suite green.

Pay particular attention to:
- Existing test `'returns DEFAULT_AUTOMATION_SETTINGS when nothing stored'` — still passes (no active account, no v1 blob → DEFAULTS).
- Existing test `'merges stored partial with defaults (forward-compat...)'` — still passes (no active account, v1 blob present → merged).
- Existing test `'writes to chrome.storage.sync under the v1 key when no active account'` — still passes (only tests save side).
- The round-trip test from PR #106 — still passes (no active account end-to-end).
- Any test that seeded `global_settings` directly to drive the v2 read path now needs to ALSO seed an active account or v1 fallback. Watch for these in `tests/core/automations-store.test.ts` and grep more broadly.

- [ ] **Step 4: Grep for v2-path test dependencies that might break**

Run: `grep -rn "global_settings\|getAutomationSettings\|setGlobalSetting" tests/ | head -30`

Read each match. Tests that mock `getGlobalSetting` returning a value AND expect that to drive `getAutomationSettings`' return need to also seed an active account, otherwise they now flow through v1.

If any tests rely on the old "leaked globals override v1 even with no account" behavior, update them — that was the bug.

- [ ] **Step 5: Typecheck + full suite**

```bash
npm run typecheck && npx vitest run
```
Expected: clean.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 7: E2E sanity**

The settings-persistence E2E still seeds an active account so it exercises the v2 path. Should pass unchanged.

```bash
npx playwright test e2e/settings-persistence.spec.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/core/automations-store.ts tests/core/automations-store.test.ts
git commit -m "fix(automations-store): prefer v1 fallback on read when no active account (FOLLOWUP-3)"
```

---

## Task 3 — Final verification + PR

- [ ] **Step 1: Full verify chain**

```bash
npm run typecheck && npx vitest run && npm run build && npx playwright test
```

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin <branch>
gh pr create --title "..." --body "..."
gh pr merge --auto --squash
```

PR body must call out:
- The upgrade-from-old-build scenario this closes
- That this is the read-side companion to PR #106
- That no UI surface changes; pure storage-layer fix

---

## Out of scope

- Active-cleanup of leaked `global_settings` keys on the no-account path. The fix above makes the leakage benign **on that path** — when no active account exists the read goes through v1 and ignores any populated globals. A future one-shot cleanup could remove the orphaned keys for tidiness but isn't load-bearing.
- The signed-in case where `global_settings` is populated is **intentional**, not leakage — globals are shared across accounts by design (the v2 split's whole point). A fresh account inheriting `ignoredRepos` from globals is correct behavior, not a bug.
- Tests that explicitly drive `getAutomationSettings` via mocked globals while signed-in — those don't hit the bug and don't need changes.
