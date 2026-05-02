# Auto-Rebaser — Phase 2 Automations Plan
_2026-05-02_

> **⚠️ Superseded for execution.** This document remains the high-level v2 reference. Active execution is split across two parallelizable plans:
> - `2026-05-02-phase2-part-a.md` — wiring & storage
> - `2026-05-02-phase2-part-b.md` — UI & validation
> - `2026-05-02-phase2-types-contract.md` — shared type contract
>
> Endpoint and pure-logic prep is **already complete** on branch `feat/phase2-endpoints-prep` (12 files, 89 tests, 100% line coverage). See `../PHASE2_STATE.md` for current status.

> Sits on top of `2026-05-02-auto-rebaser-v2.md` (the MVP modular plan). Do **not** start this until MVP v2 is merged and stable in real use for at least one week. Each automation is independently shippable.

**Goal:** Add four post-MVP automations to eliminate residual manual PR housekeeping:

1. Auto-delete merged branch (Story 2.6)
2. Auto-enable auto-merge (Story 2.7)
3. Auto-resolve obsolete review threads (Story 2.8)
4. Auto-dismiss stale PR notifications (Story 2.9)

**Design principles**
- Every automation is **opt-in** (default OFF) except 2.6 (default ON because deleting a merged branch is recoverable via `git reflog` and the cost of a stray branch is low).
- Each automation is a single-file module under `src/background/automations/` consumed by the existing poll loop. No layer crossing.
- All four reuse the existing `core/auth-store`, `core/etag-cache`, and `github/http` modules from MVP v2 — no new HTTP plumbing.
- GraphQL is added once (for 2.7 and 2.8); REST stays for 2.6 and 2.9.
- Each automation has a kill-switch in settings AND a per-repo opt-out where applicable.
- Target ~95% test coverage. All GitHub API interactions mocked in unit tests; one happy-path integration test per automation against a live test repo.

---

## Architecture Additions

```
src/
  core/
    types.ts                    ← extend PRRecord (autoMergeEnabled, branchDeleted), Settings (4 new flags), add ResolvedThreadsStore
    constants.ts                ← add STORAGE_KEYS.resolved_threads
  github/
    graphql.ts                  ← NEW: thin GraphQL client built on github/http
    endpoints/
      repos.ts                  ← NEW: getRepo (for delete_branch_on_merge)
      git-refs.ts               ← NEW: deleteRef
      review-threads.ts         ← NEW: listReviewThreads (GraphQL), resolveReviewThread (GraphQL)
      auto-merge.ts             ← NEW: enablePullRequestAutoMerge (GraphQL)
      notifications.ts          ← NEW: listNotifications, markThreadRead, unsubscribeThread
  background/
    automations/
      delete-merged-branch.ts   ← Story 2.6
      enable-auto-merge.ts      ← Story 2.7
      resolve-obsolete-threads.ts ← Story 2.8
      dismiss-stale-notifs.ts   ← Story 2.9
    poll.ts                     ← extend: after rebase pass, run each enabled automation
  popup/
    components/
      AutomationsSettings.tsx   ← NEW: section in settings view, four toggles + per-repo opt-out lists + auto-merge method picker
```

**OAuth scope change.** Story 2.9 requires the `notifications` scope. Update `manifest.json` permissions request and the OAuth authorize URL. Existing users will need to re-authenticate the first time they enable 2.9 — gate the toggle behind a "Grant notifications access" CTA when the scope is missing.

---

## Task Breakdown

Tasks are ordered to minimize conflict between parallel agents. Tasks within the same wave can run in parallel; later waves depend on earlier ones.

### Wave 1 — Shared Foundation (sequential, single agent)

**Task 1.1 — Extend types and settings**
- Add to `core/types.ts`:
  - `Settings`: `autoDeleteMergedBranch`, `autoEnableAutoMerge`, `autoMergeMethod`, `autoResolveOutdatedThreads`, `autoDismissStaleNotifications`, `unsubscribeStalePRNotifications`, plus opt-out arrays.
  - `PRRecord`: optional `autoMergeEnabled: boolean`, `branchDeleted: boolean`, plus new states `branch-deleted`, `delete-failed`, `automerge-unsupported`.
  - New type `ResolvedThreadsStore = Record<string, number>`.
- Update `core/constants.ts`:
  - `STORAGE_KEYS.resolved_threads = 'resolved_threads'`.
  - `DEFAULT_SETTINGS` adds the seven new fields with defaults from BACKLOG.
- Tests: round-trip default settings through `chrome.storage.sync` mock; verify backward compat (loading a v1-shaped settings object yields defaults for new fields).
- **Verify:** `vitest run core/`, `tsc --noEmit`.

**Task 1.2 — GraphQL client wrapper**
- Add `src/github/graphql.ts`:
  - `graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>` posting to `https://api.github.com/graphql`, using existing `http.ts` for auth + error mapping.
  - Throws typed `GraphQLError` with the `errors` array for callers to inspect.
- Tests: mock `fetch`, verify `Authorization` header, JSON body shape, error de-serialization.
- **Verify:** `vitest run github/graphql`.

### Wave 2 — Endpoints (parallel, 4 agents)

Each agent owns one file, no shared code. All consume `github/http` (REST) or `github/graphql`. All have unit tests with mocked fetch.

**Task 2A — `github/endpoints/repos.ts`**
- `getRepo(owner, repo): Promise<{ delete_branch_on_merge: boolean, allow_squash_merge, allow_merge_commit, allow_rebase_merge }>`
- Tests: 200, 404 (returns null), ETag round-trip.

**Task 2B — `github/endpoints/git-refs.ts`**
- `deleteRef(owner, repo, ref: string): Promise<'deleted' | 'already-gone'>`
- Map 204 → deleted; 404/422 → already-gone; others → throw.
- Tests cover all three branches.

**Task 2C — `github/endpoints/review-threads.ts` and `auto-merge.ts`**
- `listReviewThreads(owner, repo, number): Promise<ReviewThread[]>` via GraphQL.
- `resolveReviewThread(threadId: string): Promise<void>` via GraphQL.
- `enablePullRequestAutoMerge(prNodeId: string, mergeMethod: 'SQUASH' | 'MERGE' | 'REBASE'): Promise<{ enabled: boolean, unsupported: boolean }>` — translate 422-shaped GraphQL error into `{ unsupported: true }` rather than throwing.
- Tests: mock GraphQL responses for happy path, partial failure, unsupported method.

**Task 2D — `github/endpoints/notifications.ts`**
- `listNotifications(): Promise<Notification[]>`
- `markThreadRead(threadId: string): Promise<void>`
- `unsubscribeThread(threadId: string): Promise<void>`
- Tests cover scope-missing 403 → throws typed `MissingScopeError`.

### Wave 3 — Automations (parallel, 4 agents)

Each automation is a pure function `runAutomation({ store, settings, github }): Promise<{ updated: PRRecord[], counters: Record<string, number> }>`. The poll loop (Wave 4) wires them together. Each agent owns exactly one file under `background/automations/` plus its test file. No file overlap.

**Task 3A — `delete-merged-branch.ts` (Story 2.6)**
- Input: prior `pr_store` snapshot, current PR list.
- Detect `open → merged` transitions. For each, gate on `getRepo().delete_branch_on_merge`, fork check (`head.repo.id !== base.repo.id` → skip), opt-out list.
- Call `deleteRef`. On success → `branchDeleted: true`, state `branch-deleted`. On error → `delete-failed` (retryable next cycle).
- Tests: 8+ cases — happy path, repo auto-delete on, fork, opt-out, 404 already-gone, transient 500, kill-switch off, batch with mixed outcomes.
- **Verify:** `vitest run background/automations/delete-merged-branch --coverage` ≥ 95%.

**Task 3B — `enable-auto-merge.ts` (Story 2.7)**
- For each open authored PR with `auto_merge === null`, draft check, `mergeable_state !== 'dirty'`, opt-out check.
- Call `enablePullRequestAutoMerge` with `settings.autoMergeMethod`.
- On `unsupported`: mark PR `automerge-unsupported`, store flag, do not retry until settings change.
- On success: set `autoMergeEnabled: true`.
- Tests: 8+ cases — happy path, draft skipped, dirty skipped, opt-out skipped, unsupported method, network error retry, kill-switch off, idempotency on already-enabled PRs.

**Task 3C — `resolve-obsolete-threads.ts` (Story 2.8)**
- For each PR, list threads. Filter `isResolved=false && isOutdated=true && line=null && !resolvedThreadsStore[id]`.
- Resolve each. On success, write `resolvedThreadsStore[id] = Date.now()`.
- Counter returned for popup display.
- Tests: 8+ cases — happy resolve, anchored outdated thread skipped, already resolved skipped, previously auto-resolved (in store) skipped, individual mutation failure doesn't block siblings, kill-switch off, empty thread list, scope: only authored PRs (cross-check against `pr_store`).

**Task 3D — `dismiss-stale-notifs.ts` (Story 2.9)**
- Scope check first: if missing `notifications` OAuth scope, return immediately with `{ scopeMissing: true }`.
- List notifications, filter to `subject.type === 'PullRequest'`.
- For each: lookup PR state (prefer `pr_store`, fall back to `GET pulls/{n}` with ETag).
- If `closed || merged`: `markThreadRead`. If `unsubscribeStalePRNotifications`: also `unsubscribeThread`.
- Never touches issues, discussions, releases, or notifications for PRs the user does not author and that are not in `pr_store`.
- Tests: 10+ cases — closed PR notif marked read, merged PR notif marked read, open PR notif untouched, issue notif untouched, foreign-PR notif untouched, missing-scope path returns clean `scopeMissing`, unsubscribe sub-setting on/off, kill-switch off, partial batch failure isolation.

### Wave 4 — Wiring (sequential, single agent)

**Task 4.1 — Poll loop integration**
- After existing rebase pass, run automations in this order: `enable-auto-merge` → `delete-merged-branch` → `resolve-obsolete-threads` → `dismiss-stale-notifs`. (Auto-merge first so newly-merged PRs are processed by branch-delete on the next cycle, not racing same-cycle.)
- Aggregate counters into a single `PollSummary` and write to `pr_store.lastPollSummary` for popup display.
- Each automation runs inside `try/catch`; one automation throwing must not prevent the others from running.
- Tests: integration test with all four automations stubbed, verifying ordering, error isolation, summary aggregation.

**Task 4.2 — Popup settings UI**
- New `AutomationsSettings.tsx` section under existing settings view.
- Four primary toggles, plus:
  - Auto-merge method dropdown (`SQUASH` / `MERGE` / `REBASE`).
  - Per-repo opt-out lists (multi-select chip input, free-text `owner/repo`).
  - "Grant notifications access" CTA when 2.9 toggle is on but scope missing.
  - Last-cycle counters displayed inline ("Resolved 3 obsolete threads, deleted 2 branches").
- Tests: `@testing-library/react` covering render, toggle persistence, scope-missing CTA appearance, counter display.

### Wave 5 — Validation (sequential, single agent)

**Task 5.1 — Live test against a sandbox repo**
- One-off integration test using a personal sandbox GitHub repo with throwaway PRs covering each automation's happy path.
- Documented manually-runnable script under `scripts/live-validate.ts`. Not part of CI.
- Update `RUNBOOK.md` with the validation procedure.

**Task 5.2 — Coverage + adversarial review**
- Run `vitest run --coverage` — fail if any new file is below 95% line coverage.
- Run `/codex-adversarial-gate` against the merged branch diff; address any must-fix findings.

---

## Execution Model

**Wave 1** — direct, single Opus session.
**Wave 2** — parallel dispatch via `/dispatch`, 4 Sonnet agents on worktree branches `feat/phase2-endpoint-{repos,git-refs,reviews-and-automerge,notifs}`. File-touch boundaries are non-overlapping by construction (each owns one new file). Merge order: any (no cross-deps).
**Wave 3** — parallel dispatch, 4 Sonnet agents on `feat/phase2-automation-{2.6,2.7,2.8,2.9}`. Each automation depends on its endpoint(s) from Wave 2; merge Wave 2 to main before dispatching Wave 3.
**Wave 4** — direct, single Opus session (touches the existing poll loop and popup — high coordination risk for parallel agents).
**Wave 5** — direct, with `/codex-adversarial-gate` invoked at the end.

**Hard rule.** Run `git fetch origin && git rev-parse origin/main` and confirm local main matches before each wave's dispatch. Print the base SHA in the dispatch prompt. Use the `subagent-heartbeat` skill for Wave 2 and Wave 3 dispatches.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| 2.6 deletes a branch the user still wants | Default-on but per-repo opt-out + global toggle. Branches recoverable via `git reflog` for 30 days. Docs in RUNBOOK. |
| 2.7 enables auto-merge on a PR the user wasn't ready to merge | Default OFF (opt-in). Skips drafts. User can disable per-PR in GitHub UI as escape hatch. |
| 2.8 resolves a thread the team still wants visible | Only resolves when `line === null` (GitHub already lost the anchor). Default OFF. Reversible by manual unresolve — and we won't auto-resolve a manually-unresolved thread. |
| 2.9 marks a notification read that the user wanted to see | Only operates on closed/merged PRs. Default OFF. Unsubscribe is a separate sub-setting also default OFF. |
| OAuth scope upgrade (`notifications`) breaks existing tokens | Detect missing scope at runtime → surface re-auth CTA, don't fail silently. |
| GraphQL rate limits differ from REST | Use the GitHub-published cost in response headers; back off on `RATE_LIMITED` GraphQL error type. |
| Forks: deleting a base-repo branch ref the user doesn't own | Same-repo guard: skip when `head.repo.id !== base.repo.id`. |

---

## Out of Scope

- Auto-merging PRs without going through GitHub's auto-merge gate (we never call the merge endpoint directly).
- Auto-resolving review threads that are not outdated.
- Bulk notification cleanup beyond stale PR notifications.
- Cross-host (GitHub Enterprise) — same Phase 3 deferral as MVP.

---

## Definition of Done

- [ ] All four automations implemented behind their settings flags
- [ ] Per-automation unit test coverage ≥ 95% line
- [ ] Poll loop integration test green
- [ ] Popup settings UI implemented and tested
- [ ] OAuth `notifications` scope flow tested manually
- [ ] Live validation against sandbox repo documented in `RUNBOOK.md`
- [ ] `/codex-adversarial-gate` clean (no must-fix)
- [ ] BACKLOG.md stories 2.6–2.9 acceptance criteria all checked
