# Phase 2 — Part B: UI & Validation
_Pair: `2026-05-02-phase2-part-a.md`. Contract: `2026-05-02-phase2-types-contract.md`._

**Goal:** Build the popup UI surface for Phase 2 — settings toggles, per-repo opt-out lists, last-cycle summary, and notifications-scope re-auth CTA. Run the manual sandbox validation runbook. Update README.

**Branch:** `feat/phase2-part-b` from current `main` (with `feat/phase2-endpoints-prep` already merged in).

**Tech stack:** TypeScript, React 18, `@testing-library/react`, Vitest. No new deps.

**File ownership (this part owns these files exclusively):**

| File | Status |
|---|---|
| `src/popup/components/AutomationsSettings.tsx` | NEW |
| `src/popup/components/PollSummaryFooter.tsx` | NEW |
| `src/popup/components/RepoOptOutList.tsx` | NEW |
| `src/popup/hooks/useAutomationSettings.ts` | NEW |
| `src/popup/hooks/usePollSummary.ts` | NEW |
| `src/popup/views/SettingsView.tsx` | EDIT — mount `<AutomationsSettings />` |
| `src/popup/views/PRListView.tsx` | EDIT — mount `<PollSummaryFooter />` |
| `README.md` | EDIT — Phase 2 features section |
| `docs/runbooks/phase2-validation.md` | EDIT — fill in actual test results once executed |

**Out of scope (owned by Part A):**
- Anything under `src/core/` or `src/background/`
- `manifest.json`, `src/core/auth.ts`, OAuth scope strings
- `src/github/`

---

## Cross-part dependency

Part B imports from `src/core/automations-store.ts` and `src/core/automations-types.ts` — both owned by Part A. To stay independently testable:

1. On Part B's branch, **create a stub** at `src/core/automations-store.ts` that throws on every call. Real-implementation comes from Part A's merge.
2. On Part B's branch, **create a stub** at `src/core/automations-types.ts` that re-exports the contract types (copy-paste from `plans/2026-05-02-phase2-types-contract.md` § 1, 3, 5).
3. Tests use `vi.mock('../../src/core/automations-store', ...)` (see contract § 7).
4. **At merge time:** Part A's PR overrides both stub files with the real implementation. Trivial conflict resolution (`accept incoming` from A's branch).

This keeps Part B fully testable without waiting for Part A.

---

## Tasks

Three tasks. B1 and B2 parallelizable. B3 depends on both.

### Task B1 — `<AutomationsSettings />` component
**Files (all new):**
- `src/popup/components/AutomationsSettings.tsx`
- `src/popup/components/RepoOptOutList.tsx`
- `src/popup/hooks/useAutomationSettings.ts`
- `tests/popup/components/AutomationsSettings.test.tsx`
- `tests/popup/components/RepoOptOutList.test.tsx`
- `tests/popup/hooks/useAutomationSettings.test.ts`

**`useAutomationSettings.ts`** — React hook returning `{ settings, save, loading }`. Reads via `automations-store.getAutomationSettings`. Persists via `saveAutomationSettings`. Re-renders on `chrome.storage.onChanged` for the `automation_settings` key.

**`<AutomationsSettings />`** — controlled-component section rendered inside `<SettingsView />`:
- 4 primary toggles, one per Story 2.6–2.9
- Auto-merge method dropdown (only enabled when 2.7 toggle is on)
- Per-feature `<RepoOptOutList />` for 2.6 and 2.7
- Sub-toggle for 2.9: "Also unsubscribe" (visible only when 2.9 is on)
- "Grant notifications access" CTA when `autoDismissStaleNotifications` is true and `notificationsScopeGranted` is false. Clicking this should send a `RuntimeMessage` `{ type: 'REAUTH', scopes: ['notifications'] }` to the service worker. (Service worker handler is Part A's territory; this UI just sends the message.)

**`<RepoOptOutList />`** — controlled list of `owner/repo` strings. Add input + chip display + remove buttons. Validates `owner/repo` format on add.

**TDD coverage targets:**
- AutomationsSettings: 8+ tests — render with defaults, toggle each setting persists, dropdown disabled when parent toggle off, CTA appears only when scope missing, message dispatch on CTA click
- RepoOptOutList: 5+ tests — empty render, add valid repo, reject invalid input, remove existing entry, no duplicates
- useAutomationSettings: 4+ tests — initial load returns defaults, save updates store, re-render on storage change

**Verify:**
```sh
npx vitest run tests/popup/components/AutomationsSettings.test.tsx tests/popup/components/RepoOptOutList.test.tsx tests/popup/hooks/useAutomationSettings.test.ts --coverage
npx tsc --noEmit
```

**Subagent dispatch suitability:** YES — independent of B2.

---

### Task B2 — `<PollSummaryFooter />` + summary hook
**Files (all new):**
- `src/popup/components/PollSummaryFooter.tsx`
- `src/popup/hooks/usePollSummary.ts`
- `tests/popup/components/PollSummaryFooter.test.tsx`
- `tests/popup/hooks/usePollSummary.test.ts`

**`usePollSummary.ts`** — reads `pr_store.lastPollSummary` (an existing field per the contract; Part A populates it). Re-renders on `chrome.storage.local` change. Returns `PollSummary | null`.

**`<PollSummaryFooter />`** — small footer rendered inside `<PRListView />` below the existing "Last poll: ..." line:
- "Rebased N · Branches deleted N · Auto-merge enabled N · Threads resolved N · Notifications dismissed N · Errors N"
- Hide zero-count items (or render greyed)
- When `lastPollSummary` is null: render nothing (don't break v1's empty state)

**TDD coverage targets:**
- PollSummaryFooter: 5+ tests — full counters, all-zero state hidden, single-counter render, error state visible, null-summary renders nothing
- usePollSummary: 3+ tests — initial null, returns stored value, re-renders on update

**Subagent dispatch suitability:** YES — independent of B1.

---

### Task B3 — View integration + README + runbook execution
**Depends on:** B1 + B2 merged into branch. Also benefits from Part A being merged but doesn't strictly require it (stubs work).

**Files:**
- `src/popup/views/SettingsView.tsx` — EDIT: import + mount `<AutomationsSettings />` below existing settings controls. Touch only the JSX bottom; do not move v1 elements.
- `src/popup/views/PRListView.tsx` — EDIT: import + mount `<PollSummaryFooter />` below the existing "Last poll" line.
- `README.md` — EDIT: add a "Phase 2 features" section with one paragraph per automation, plus a link to the runbook.
- `docs/runbooks/phase2-validation.md` — EDIT: fill in date + outcomes after executing the runbook against a live sandbox repo.
- `tests/popup/views/SettingsView.test.tsx` — EXTEND: 1 test asserting `<AutomationsSettings />` renders.
- `tests/popup/views/PRListView.test.tsx` — EXTEND: 1 test asserting `<PollSummaryFooter />` renders.

**Validation execution:**
- Walk through each test in `docs/runbooks/phase2-validation.md` against a personal sandbox repo. Mark each ✓ / ✗ with notes. Required only when Part A is also merged.
- If Part A is not yet merged, defer this section; everything else in B3 can complete.

**Verify:**
```sh
npm test
npm run typecheck
```

**Subagent dispatch suitability:** Partial. View edits + README → YES (separate subagents). Runbook execution → NO (requires browser + GitHub auth, can't be subagent-driven).

---

## Test plan summary

| Task | New test files | Targeted ≥ |
|---|---|---|
| B1 | 3 (AutomationsSettings, RepoOptOutList, useAutomationSettings) | 17+ cases combined, 95% line cov |
| B2 | 2 (PollSummaryFooter, usePollSummary) | 8+ cases combined, 95% line cov |
| B3 | 0 new files; 2 added cases | extant suites stay green |

Final `npm test` on Part B branch must show ≥ +25 tests passing relative to `main`, all green.

---

## Definition of Done

- [ ] All three tasks complete, branch CI green
- [ ] Combined coverage on new Part B code ≥ 95% line
- [ ] `npm test && npm run typecheck` clean
- [ ] Sandbox validation runbook executed end-to-end (only required after Part A merges)
- [ ] PR opened against `main` titled `feat(phase2-b): UI + validation`
- [ ] PR description links Part A PR if open
- [ ] README "Phase 2 features" section reads cleanly to a new user

---

## Risks specific to Part B

| Risk | Mitigation |
|---|---|
| Part A's `automations-store` not yet on the branch when B's tests run | Stub file + `vi.mock`. Documented in § Cross-part dependency above. |
| `<SettingsView />` JSX has v1-specific layout we shouldn't disrupt | Mount as a new sibling section at bottom — never restructure existing children. |
| `<PRListView />` already has a "Last poll" footer — risk of visual collision | Place `<PollSummaryFooter />` immediately AFTER the last-poll line, same footer container. Keep visual weight minimal. |
| Re-auth CTA dispatches a message Part A's service worker doesn't yet handle | Acceptable — unhandled messages fall through. The CTA is a no-op until Part A ships. Don't block release of Part B on this. |
| New components clash with v1's CSS conventions | Use the same className patterns already in v1's components (read `src/popup/components/*.tsx` first). No CSS-in-JS, no new global rules. |

---

## Sonnet subagent dispatch template

For tasks B1 and B2 in parallel:

```sh
git fetch origin && git rev-parse origin/main  # confirm base SHA
git worktree add worktrees/phase2-b-settings -b feat/phase2-b-settings main
git worktree add worktrees/phase2-b-summary -b feat/phase2-b-summary main
```

Each subagent brief should include:
- Link to this plan + types contract + Part A plan (so the agent knows the cross-part contract)
- Exact file ownership
- "Heartbeat: append timestamp to `.claude/agent-status/<id>.log` every 5 min"
- "If you need anything from `automations-store`, mock it with `vi.mock` per contract § 7. Do not implement that file."
- Verify command + expected outcome
- "When done, push branch and report PR url"

Merge order: B1 → B2 → B3.
