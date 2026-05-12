# Auto-Rebaser

A local-first browser extension that polls a user's authored GitHub pull requests and runs three automations against them: rebase-when-behind, delete-merged-branches, and enable-auto-merge / resolve-obsolete-threads. No backend.

## Language

### Cycle structure

**Authored PR**:
A PR whose author is the extension user. The scope filter for every poll — non-authored PRs are ignored entirely.
_Avoid_: my PR, owned PR

**Poll Cycle**:
One periodic scan of all **Authored PRs**, triggered by the configured alarm interval (1m–4h). Composed of **Phase 1** then **Phase 2**.
_Avoid_: tick, sweep, run

**Phase 1**:
The first half of a **Poll Cycle** — the rebase half. Each **Authored PR** transitions through the **PR State** machine.

**Phase 2**:
The second half of a **Poll Cycle** — the automation half. The **Orchestrator** dispatches `delete-merged-branch`, `enable-auto-merge`, and `resolve-obsolete-threads`.
_Avoid_: orchestrator pass (the Orchestrator is the dispatcher; Phase 2 is the cycle half that contains it)

**Orchestrator**:
The Phase 2 dispatcher.
_Avoid_: scheduler, runner

### PR identity & state

**Mergeable State**:
GitHub's enum for a PR's rebase readiness — `behind`, `dirty`, `clean`, `draft`, `blocked`, `has_hooks`, `unstable`, `unknown`. Sourced from the API; never derived locally.
_Avoid_: rebase status, merge status

**PR State**:
The local string-enum status persisted in **PRStore** for each tracked PR. Distinct from **Mergeable State**: this one is locally machine-managed.
_Avoid_: status (always qualify which one)

**PRStore**:
The browser-extension storage layer that persists each tracked PR's **PR State** and Phase-2 patch fields across **Poll Cycles**.

**Update Branch**:
The rebase operation, named after GitHub's `PUT /repos/{owner}/{repo}/pulls/{number}/update-branch` API call.
_Avoid_: rebase (the verb), sync, fast-forward

### Staleness

**Idle Days**:
Calendar days since a PR's `updated_at`. The raw count.

**Stale PR**:
An **Authored PR** whose **Idle Days** meet or exceed its repo's stale threshold (3–60d, per-repo or global).
_Avoid_: old PR, abandoned PR

### Repo opt-outs

**Globally Ignored Repo**:
A repo invisible in the popup and untouched by every automation. The hard opt-out.

**Per-Automation Skip List**:
A narrower opt-out — the repo is still polled and displayed, but one specific automation skips it (e.g. `autoMergeOptOutRepos`).
_Avoid_: blocklist, exclusion list (be specific about scope)

### Merge & threads

**Merge Method Preference**:
Ordered list (`SQUASH`, `MERGE`, `REBASE`) — `enable-auto-merge` picks the first method the repo allows.

**Review Thread**:
A per-PR comment thread anchored to a line of code. GitHub flags it `outdated` when that line no longer exists.
_Avoid_: comment thread (drops the review-anchor distinction), discussion

**Suspended Installation**:
A GitHub App installation an owner has suspended. Persists in the installations cache until reinstated.
_Avoid_: disabled, revoked

### Multi-account

**Account**:
A signed-in GitHub identity. Each Account has its own auth token, **PRStore**, **Activity Log** entries, and per-account automation settings. Stored under `chrome.storage.local.accounts.<id>`.
_Avoid_: user (overloaded — also means the GitHub login), profile

**Account Id**:
Stable id derived from host + login (`gh_<login>` for cloud, `gh_<host>_<login>` for GHES). Source of truth for routing reads/writes through `readAccountKey` / `writeAccountKey`.
_Avoid_: account key, account name

**Active Account**:
The single Account currently surfaced in the popup. Stored at `chrome.storage.local.active_account_id`. Switched by the user via the **Account Switcher**; the background **Poll Cycle** iterates every Account regardless of which is active (using an in-memory override, never writing the active key mid-cycle).
_Avoid_: current account, selected account (in code — fine in user-facing copy)

**Account Switcher**:
Popup header dropdown listing every signed-in Account with `Switch`, `+ Add account`, `Sign out <login>`, `Sign out all`. The `+ Add account` row is hidden when the Active Account is PAT-authed (PAT and GitHub App accounts can't coexist).
_Avoid_: account picker, account menu

## Relationships

- A **Poll Cycle** runs **Phase 1** then **Phase 2**; **Phase 2** contains the **Orchestrator**.
- The **Orchestrator** dispatches three automations, each filtered by its own **Per-Automation Skip List**.
- A PR's **Mergeable State** drives transitions in its **PR State** during **Phase 1**.
- An **Update Branch** call transitions **PR State** `behind` → `updating` → `updated` on success, or `conflict` / `needs-manual` / `error` on failure.
- A **Stale PR** is an **Authored PR** whose **Idle Days** ≥ its repo's stale threshold; this gates the ping-reviewer link and the repo group's "needs attention" badge.
- A **Globally Ignored Repo** suppresses everything; a **Per-Automation Skip List** entry suppresses one automation only.
- A **Suspended Installation** forces every automation to no-op for that owner's PRs without changing **PR State**.
- Every **Account** has an isolated **PRStore** and **Activity Log** namespace; the **Account Switcher** flips the **Active Account** which the popup reads against. The **Poll Cycle** iterates every **Account** each tick — the **Active Account** is only a UI surface, not a polling filter.

## Example dialogue

> **Dev:** "If a PR is `behind`, why didn't we run **Update Branch** this cycle?"
> **Domain expert:** "Check three things in order — is the repo on a **Per-Automation Skip List** for rebase? Is there a **Suspended Installation** for that owner? And did **Phase 1** error out before reaching it? **Globally Ignored Repos** wouldn't even appear, so if you see the PR in the popup, it's not that."

## Flagged ambiguities

- **"rebase" vs "Update Branch"** — `updateBranch()` is the API call; `action: 'rebase'` is the state-machine action; both name the same operation. Resolved: use **Update Branch** when discussing the operation; "rebase" only as casual shorthand.
- **"branch-deleted" vs "delete-merged-branch"** — The automation is `delete-merged-branch`; the resulting PR State patch field is `branchDeleted`. Resolved: deletion is conditional on prior merge detection — the field name reflects post-condition, the automation reflects intent.
- **"obsolete" vs "outdated" threads** — GitHub's API field is `isOutdated`; product copy says "obsolete." Resolved: use **Outdated** when referring to the API value; "obsolete" only in user-facing strings.
- **Mergeable State vs PR State** — Both are string enums. Resolved: **Mergeable State** is GitHub-sourced and read-only; **PR State** is local and machine-managed. Never conflate them in code or comments.
