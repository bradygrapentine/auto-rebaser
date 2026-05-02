# Phase 2 — State of v2 Features
_Updated 2026-05-02 (Phase 2 shipped — historical doc)_

> **Phase 2 is complete and on `main`.** This file is kept for historical context. For the current shape of the automations, see `BACKLOG.md` (stories 2.6–2.9 + the post-ship additions block) and the source under `src/background/automations/`.

## TL;DR (final)

| Track | Status |
|---|---|
| Endpoints + pure-logic prep | ✅ merged |
| Part B — Popup UI & summary | ✅ merged |
| Part A — Wiring & Storage | ✅ merged |
| Sandbox validation | ✅ run, results in `docs/runbooks/phase2-validation.md` |

Post-ship, the four automations also gained per-repo skip lists and a global `ignoredRepos` filter. See BACKLOG.

---


This document is the entry point for picking up Phase 2 work. It captures what's already prepped, where it lives, and how the remaining work is split into two parallelizable parts.

---

## Where we are

Phase 1 (MVP) is **complete on `main`** — three layers (core, background, popup) merged, runbook in `RUNBOOK.md`, OAuth + poll loop + popup verified.

Phase 2 (v2 automations) prep is **complete on `feat/phase2-endpoints-prep`** in the worktree at `worktrees/phase2-endpoints-prep/`. Net-new files only — zero edits to v1 modules — so this branch can rebase onto current `main` cleanly.

### Phase 2 features (per `ROADMAP.md` 2.6–2.9)

| # | Feature | Story | Prep status |
|---|---|---|---|
| 2.6 | Auto-delete merged branch | Story 2.6 | Pure logic + endpoints **done** |
| 2.7 | Auto-enable auto-merge | Story 2.7 | Pure logic + endpoints **done** |
| 2.8 | Auto-resolve obsolete review threads | Story 2.8 | Pure logic + endpoints **done** |
| 2.9 | Auto-dismiss stale PR notifications | Story 2.9 | Pure logic + endpoints **done** |

### What "prep done" means

12 net-new files, 89 tests, 100% line coverage on all Phase 2 code. Two commits on `feat/phase2-endpoints-prep`:

**Endpoints + GraphQL layer**
- `src/github/http-extra.ts` — `requestNoBody` for 204/205 responses
- `src/github/graphql.ts` — typed GraphQL client + `GraphQLError`
- `src/github/endpoints/repos.ts` — `getRepo` (`delete_branch_on_merge`)
- `src/github/endpoints/git-refs.ts` — idempotent `deleteRef`
- `src/github/endpoints/auto-merge.ts` — `enablePullRequestAutoMerge` with unsupported-method detection
- `src/github/endpoints/review-threads.ts` — list + resolve via GraphQL
- `src/github/endpoints/notifications.ts` — list / markRead / unsubscribe

**Automation logic (pure DI, no v1 imports)**
- `src/background/automations/delete-merged-branch.ts` (Story 2.6)
- `src/background/automations/enable-auto-merge.ts` (Story 2.7)
- `src/background/automations/resolve-obsolete-threads.ts` (Story 2.8)
- `src/background/automations/dismiss-stale-notifs.ts` (Story 2.9)

**Validation runbook**
- `docs/runbooks/phase2-validation.md` — sandbox-repo manual procedure

---

## What remains

The pure logic and HTTP plumbing exist. What's missing is **wiring** (storage, settings, poll-loop integration) and **UI** (popup settings + summary). Plus a validation pass.

This remaining work is split into two **file-disjoint** parts that can run in parallel sessions:

| Part | Owns | New files | Edits to v1 |
|---|---|---|---|
| **A — Wiring & Storage** | core storage + background orchestration | 5 | `src/background/poll-cycle.ts` only |
| **B — UI & Validation** | popup components + docs | 4 | `src/popup/views/SettingsView.tsx`, `src/popup/views/PRListView.tsx`, `README.md` |

The two parts share **no source files**. The contract between them is `docs/superpowers/plans/2026-05-02-phase2-types-contract.md` — a single source of truth for type shapes, function signatures, and storage keys.

### Plan documents
- **Contract:** `plans/2026-05-02-phase2-types-contract.md` — read first, both parts compile against this
- **Part A:** `plans/2026-05-02-phase2-part-a.md` — wiring & storage (3 parallelizable subagent tasks)
- **Part B:** `plans/2026-05-02-phase2-part-b.md` — UI & validation (3 parallelizable subagent tasks)
- **Original v2 plan** (superseded for execution, kept for reference): `plans/2026-05-02-phase2-automations.md`

---

## How to start

### Preconditions (both parts)

1. `main` should be at or past commit `a496769` (Track C / popup merged) AND `feat/phase2-endpoints-prep` should be merged or rebased into `main`. If prep is not yet on `main`:
   ```sh
   git checkout main
   git pull --rebase  # pull latest if v1 still moving
   git merge --no-ff feat/phase2-endpoints-prep
   ```
2. Confirm `npm test` passes locally on `main` (full suite green).
3. Read the **types contract** doc — it's short, ~80 lines.

### Starting Part A

```sh
git checkout main
git checkout -b feat/phase2-part-a
# Open plans/2026-05-02-phase2-part-a.md and follow tasks A1 → A3.
```

### Starting Part B

```sh
git checkout main
git checkout -b feat/phase2-part-b
# Open plans/2026-05-02-phase2-part-b.md and follow tasks B1 → B3.
```

### Merge order

Either part can land first. Each PR's tests pass on its own because Part B uses `vi.mock` to stub Part A's `automations-store` until they integrate. After both are merged, run the integration smoke test described in Part A § "Integration verification."

---

## Worktree branch cleanup

After `feat/phase2-endpoints-prep` is rebased into `main`:

```sh
git worktree remove worktrees/phase2-endpoints-prep
git branch -D feat/phase2-endpoints-prep  # only after the merge commit lands
```

If anything was force-removed by mistake, the work lives in commits on the branch — not lost.
