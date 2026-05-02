# Phase 2 — Part A: Wiring & Storage
_Pair: `2026-05-02-phase2-part-b.md`. Contract: `2026-05-02-phase2-types-contract.md`._

**Goal:** Connect the existing automation logic (already on `feat/phase2-endpoints-prep`) to the live poll loop. Add storage for new settings + resolved-threads. Extend the OAuth scope. Surface a `PollSummary` for the UI to consume.

**Branch:** `feat/phase2-part-a` from current `main` (with `feat/phase2-endpoints-prep` already merged in).

**Tech stack:** TypeScript, Vitest. No new dependencies.

**File ownership (this part owns these files exclusively):**

| File | Status |
|---|---|
| `src/core/automations-types.ts` | NEW |
| `src/core/automations-constants.ts` | NEW |
| `src/core/automations-store.ts` | NEW |
| `src/background/poll-summary.ts` | NEW |
| `src/background/automations/orchestrator.ts` | NEW |
| `src/background/automations/adapters.ts` | NEW |
| `src/background/poll-cycle.ts` | EDIT — add automation pass after rebase pass |
| `src/core/auth.ts` (or wherever OAuth scope lives) | EDIT — add `notifications` scope (gated behind setting) |

**Out of scope (owned by Part B):**
- Anything under `src/popup/`
- `README.md`, `RUNBOOK.md`, `docs/runbooks/`

---

## Tasks

Three tasks, two parallelizable, one sequential. Sonnet subagents can handle A1 and A2 in parallel; A3 must wait for both.

### Task A1 — Storage primitives + types
**Files (all new, no v1 conflict):**
- `src/core/automations-types.ts`
- `src/core/automations-constants.ts`
- `src/core/automations-store.ts`
- `tests/core/automations-store.test.ts`

**Implementation:**
- Implement `automations-types.ts` exactly as specified in the contract doc § 1, 2, 3, 5.
- Implement `automations-constants.ts` exactly as specified in contract § 4.
- Implement `automations-store.ts` exactly as specified in contract § 6. Use `chrome.storage.sync` for `settings`, `chrome.storage.local` for `resolvedThreads`.
- TDD: write `tests/core/automations-store.test.ts` first. Cover:
  - `getAutomationSettings` returns defaults when nothing stored
  - `getAutomationSettings` merges stored partial with defaults (forward-compat)
  - `saveAutomationSettings` writes to correct key
  - `getResolvedThreads` returns `{}` when nothing stored
  - `getResolvedThreads` returns stored map
  - `saveResolvedThreads` overwrites correctly
  - At least 6 cases, ≥ 95% line coverage.

**Verify:**
```sh
npx vitest run tests/core/automations-store.test.ts --coverage
npx tsc --noEmit
```
Both must be clean. Coverage on `automations-store.ts` must be ≥ 95%.

**Subagent dispatch suitability:** YES — pure new files, no shared state with A2.

---

### Task A2 — Adapters + orchestrator + summary
**Files (all new):**
- `src/background/automations/adapters.ts` — convert v1 `PRRecord` + raw API data into the input shapes the four automations expect
- `src/background/automations/orchestrator.ts` — `runAllAutomations(prs, settings, deps): Promise<PollSummary>`
- `src/background/poll-summary.ts` — pure aggregator that combines per-automation results into a `PollSummary`
- `tests/background/automations/adapters.test.ts`
- `tests/background/automations/orchestrator.test.ts`
- `tests/background/poll-summary.test.ts`

**Implementation:**

`adapters.ts` exports:
```ts
toMergedPRInput(pr: PRRecord, detail: PullRequestDetail): MergedPRInput
toEligiblePR(pr: PRRecord, detail: PullRequestDetail): EligiblePR
toPRRef(pr: PRRecord): PRRef
toPRStateMap(prs: PRRecord[]): PRStateMap
```
Where `PullRequestDetail` is whatever shape v1's `getPR` endpoint returns — read it from `src/github/endpoints.ts` and pass through.

`orchestrator.ts` exports:
```ts
runAllAutomations(opts: {
  prs: PRRecord[];
  prDetails: Map<number, PullRequestDetail>;  // keyed by PR id
  settings: AutomationSettings;
  resolvedThreads: ResolvedThreadsStore;
  github: {                                    // injection-friendly
    getRepo: ...;
    deleteRef: ...;
    enableAutoMerge: ...;
    listThreads: ...;
    resolveThread: ...;
    listNotifications: ...;
    markRead: ...;
    unsubscribe: ...;
  };
}): Promise<{
  summary: PollSummary;
  prUpdates: Array<{ prId: number; patch: Partial<PRRecord & PRRecordPhaseTwo> }>;
  resolvedThreads: ResolvedThreadsStore;
}>
```

Order of operations inside `orchestrator.ts` (matters):
1. `enableAutoMerge` — flip auto-merge on eligible PRs first so newly-rebased PRs are eligible
2. `deleteMergedBranch` — for PRs whose state transitioned open → merged this cycle
3. `resolveObsoleteThreads`
4. `dismissStaleNotifs` — last so the notifications inbox already reflects merge actions

Each step is wrapped in `try/catch`. One throwing must not block the others.

`poll-summary.ts` exports:
```ts
buildPollSummary(rebased: number, results: AutomationResults, errors: number): PollSummary
```

**TDD coverage targets:**
- Adapters: 1 test per converter, edge cases (missing fields → undefined, fork detection)
- Orchestrator: 6+ tests — happy path, each automation throws individually (others still run), kill-switch off, ordering verified via call-order assertion
- Poll-summary: 4+ tests — counts add up, `ranAt` is current time

**Verify:**
```sh
npx vitest run tests/background/automations/adapters.test.ts tests/background/automations/orchestrator.test.ts tests/background/poll-summary.test.ts --coverage
npx tsc --noEmit
```

**Subagent dispatch suitability:** YES — independent of A1. Sonnet can work this in parallel.

---

### Task A3 — Poll cycle integration + OAuth scope
**Depends on:** A1 + A2 merged into branch.

**Files:**
- `src/background/poll-cycle.ts` — EDIT: after the existing rebase pass, build the `github` deps map, call `runAllAutomations`, persist returned `PollSummary` to `pr_store.lastPollSummary`, apply `prUpdates` to the store, save `resolvedThreads`.
- `src/core/auth.ts` — EDIT: add `notifications` to the OAuth scope string IF `automation_settings.autoDismissStaleNotifications` is true at sign-in time. Re-auth flow trigger lives in Part B.
- `src/core/constants.ts` — EDIT (small): split `OAUTH_SCOPES` into `BASE_SCOPES` and `OPTIONAL_SCOPES.notifications` so `auth.ts` can compose at runtime.
- `tests/background/poll-cycle.test.ts` — EXTEND: add 4+ tests asserting orchestrator is called, summary is persisted, kill-switches respected.
- `tests/core/auth.test.ts` — EXTEND: 2 tests for scope composition.

**Implementation rules:**
- Do NOT change v1's existing poll-cycle test cases — only add new ones. v1 must remain green.
- The orchestrator call goes AFTER the existing rebase pass and AFTER `pr_store` is updated with the new state vector.
- If orchestrator throws unexpectedly (its internal try/catch failed), log and continue — never block the next poll.

**Verify:**
```sh
npm test          # full suite
npm run typecheck
npm run lint      # if present
```

**Integration verification (manual, run once):**
1. Load extension in a Chrome dev profile.
2. Watch service worker console for "automations: ran" log line on each poll.
3. Confirm no regression in v1 rebase behavior.

**Subagent dispatch suitability:** NO — too many cross-file edits with v1 conventions. Run direct.

---

## Test plan summary

| Task | New test files | Targeted ≥ |
|---|---|---|
| A1 | 1 (`automations-store.test.ts`) | 6 cases, 95% line cov |
| A2 | 3 (adapters, orchestrator, poll-summary) | 14+ cases combined, 95% line cov |
| A3 | 0 new files; 6+ added cases to existing files | extant suites stay green |

Final `npm test` on Part A branch must show ≥ +20 tests passing relative to `main`, all green.

---

## Definition of Done

- [ ] All three tasks complete, branch CI green
- [ ] Combined coverage on new Part A code ≥ 95% line
- [ ] `npm test && npm run typecheck` clean
- [ ] PR opened against `main` titled `feat(phase2-a): wiring + storage`
- [ ] PR description links Part B PR if open
- [ ] Manual integration verification done — service worker logs confirm orchestrator runs each poll cycle

---

## Risks specific to Part A

| Risk | Mitigation |
|---|---|
| `getPR` endpoint shape doesn't carry the fields adapters need (`headRef`, `mergeable_state`, fork detection, `node_id`) | Audit `src/github/endpoints.ts` first — task A2 must extend `getPR` to fetch additional fields if missing. This is in scope. |
| Service worker doesn't tolerate the longer poll cycle (now does up to 4 extra API passes) | Each automation gates on its kill-switch — defaults keep most off (only 2.6 default-on). Worst-case poll length stays bounded. |
| `OAUTH_SCOPES` split breaks v1 sign-in for existing users | Keep `BASE_SCOPES = 'repo'` exactly equal to current `OAUTH_SCOPES`. Compose only at sign-in time. Existing tokens keep working. |

---

## Sonnet subagent dispatch template

For tasks A1 and A2 in parallel:

```
git fetch origin && git rev-parse origin/main  # confirm base SHA
# create both worktrees from same base SHA
git worktree add worktrees/phase2-a-storage -b feat/phase2-a-storage main
git worktree add worktrees/phase2-a-orchestrator -b feat/phase2-a-orchestrator main
```

Each subagent brief should include:
- Link to this plan + types contract
- Exact file ownership (from § File ownership above)
- "Heartbeat: append timestamp to `.claude/agent-status/<id>.log` every 5 min"
- Verify command and expected outcome
- "When done, push branch and report PR url"

Merge order: A1 → A2 → A3 (linear, since A3 imports both).
