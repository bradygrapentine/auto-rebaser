# Smoke-followups — three threads from the reviewer-flow live test

**Date:** 2026-05-13
**Base SHA:** dbcb5d8 (origin/main)
**Source:** Live reviewer-flow smoke session. Yielded 1 caught bug (#166 — already fixed), 4 polish round-trips (#164/#167/#168/#170/#171), and 3 outstanding threads — this plan addresses the threads.
**Plan owner:** /sprint smoke-followups
**Discipline:** /oop-style — small commits, scope-tight, pin-then-change.

## Goal

Land three tracks:

1. **T1 — Fix reviewer-tab vanishing despite `enableReviewerTab=ON`.** Diagnosed: `useAutomationSettings` only reads storage on mount and doesn't subscribe to `chrome.storage.onChanged`, so divergent state copies across component instances cause stale values to overwrite real ones on save.
2. **T2 — Add a push-since-approval visual on the reviewer-side row.** Author side already has `staleApproval`; reviewer side has the data (`lastSeenHeadSha`, `myReviewState`) but doesn't surface a chip update when author pushes new commits post-approval.
3. **T3 — Add a CI-level test that rejects 422-bait query shapes** like the OR-grouped `(A OR B)` form that broke reviewer-search for ~6 months. Plus a quick audit of remaining `/search/issues` call sites (there are 2 in src: authored + reviewer; both currently safe).

## Non-goals

- Polish-trip pattern extraction. Will surface a CLAUDE.md proposal in housekeeping, NOT as a track.
- The reviewer-tab disappearance investigation expanding into a `useSettings` refactor — keep the fix surgical (storage subscription on the existing hook).
- Restructuring AutomationSettings storage shape.
- §5 runbook reordering (the `reviewer-flow-cowork-prompt.md` is uncommitted; if T1/T2 land and the user wants it committed at the end, that's a separate add).

## Tracks

### Track 1 — fix reviewer-tab-vanishes (stale settings cache)

**Root cause:** `src/popup/hooks/useAutomationSettings.ts` reads storage once via `useEffect(..., [])` and holds a private `useState` copy. Multiple components mount the hook independently (PRListView + AutomationsSettings + others), each with its own state. When component B saves with stale fields it carried since mount, it can overwrite real values that component A wrote.

**Repro signal:** User toggles `enableReviewerTab` ON, sees tab, navigates around. Eventually some path (settings save, poll-cycle SET_SETTINGS message, etc.) writes a stale snapshot that drops the flag. Toggle off+on forces the user-visible hook to refresh by direct setState, which re-syncs.

**FILES ALLOWED:**
- `src/popup/hooks/useAutomationSettings.ts` — add `chrome.storage.onChanged` listener that refreshes state when the automations-settings key changes.
- `src/popup/hooks/useSettings.ts` — same treatment for symmetry (separate store key but identical anti-pattern, and `enableKeyboardShortcuts` lives here per multi-account substrate).
- `src/core/automations-store.ts` — only if a `STORAGE_KEY` export is needed for the listener filter.
- `tests/popup/hooks/useAutomationSettings.test.tsx` (or `.test.ts`) — new test pinning the subscription behavior.

**FILES OUT OF SCOPE:**
- Settings serialization, per-account-settings split, AutomationSettings type shape.
- The migration banner / PAT-to-App switching flow.

**Branch:** `fix/reviewer-tab-stale-settings`.

**Implementation steps:**

0. **Diagnostic step (plan-review S2 — confirm root cause before fixing).** Add a temporary `console.log` in `useAutomationSettings`'s `save` callback that prints the snapshot of `settings` it's about to write (`{ ...settings, ...patch }`), and a second log in `setSettings`'s effect indicating what storage value triggered the hydration. Reload extension, reproduce the disappearing tab, capture the logs. Two candidate causes:
   (a) Two AutomationsSettings mounts diverge; one saves stale → genuine cross-mount overwrite.
   (b) Background `SET_SETTINGS` (or per-account settings split) writes back a merged object missing `enableReviewerTab`.
   Either way the storage-onChanged subscription fix is correct, but logs confirm which path. Remove the logs before commit.
1. **Pin current behavior with a failing test first.** Mount the hook in jsdom, mutate the underlying `chrome.storage.sync` directly (both stores use `sync` — confirmed via `grep "chrome.storage" src/core/automations-store.ts src/core/settings-store.ts`), assert the hook state has NOT refreshed. (This is the bug.) Then assert the fix: after wiring an `onChanged` listener, the same mutation flows through to hook state within a microtask.
2. **Wire the listener in `useAutomationSettings`.** Inside `useEffect`, additionally register `chrome.storage.onChanged.addListener((changes, area) => …)`. Storage area is **`sync`** (confirmed for the automations-settings key). Filter on the specific key (`changes[AUTOMATION_STORAGE_KEYS.settings]` is non-nullish) before reloading. **Self-write echo guard (plan-review S1 + round-2 S5):** the listener fires for our own `saveSettings` writes too. Compare `changes[KEY].newValue` to `changes[KEY].oldValue` (NOT to local React state — local state may have already been optimistically updated by `saveSettings`, and storage.onChanged is async). When `newValue` deep-equals `oldValue`, skip `setSettings`. This catches Chrome's echo of identical writes without suppressing legitimate cross-context updates.
3. **Symmetry on `useSettings`.** Same treatment. Storage area is **`sync`** as well (confirmed via `src/core/settings-store.ts:17`). Filter on `STORAGE_KEYS.settings`. Same self-write echo guard.
4. **Cleanup.** Effect return removes the listener. Combined with the existing `let cancelled = false` for the initial-load race, the hook is now safe on unmount AND on cross-context storage writes.
5. **Verify the test from step 1 passes.**
6. **Manual repro the original symptom** post-build: open popup, settings, toggle off + on, navigate around, confirm tab persists.

**Acceptance (verifiable):**

- `tests/popup/hooks/useAutomationSettings.test.tsx` adds: `'refreshes state when chrome.storage.onChanged fires for the automations key'` — passes.
- `grep -c "chrome.storage.onChanged.addListener" src/popup/hooks/useAutomationSettings.ts` returns ≥1.
- `npm test` green; `npm run typecheck` clean.
- Manual: toggle ON, do 5 popup open/close cycles + 1 settings round-trip, Reviewer tab stays.

**Risk + mitigations:**

- *Risk:* Storage event fires while component is unmounting → setState on unmounted component warning. *Mitigation:* `let cancelled = false` flag + cleanup unsubscribes the listener.
- *Risk:* The listener fires for every storage key change in the sync area, causing extra reads. *Mitigation:* Filter on the specific key (`changes[STORAGE_KEY] != null`) before reloading.

### Track 2 — push-since-approval on reviewer-side row

**Goal:** When `bgrapentine` pushes new commits after `bradygrapentine` approved, the reviewer-side row's chip should signal "approved, but stale push" — currently it just shows `i approved` indefinitely.

**Strategy (plan-review M2 — corrected source for `approvedHeadSha`):** Add a derived `pushSinceApproval: boolean` field on the reviewer-store PR record. The SHA to compare against is **the `commit_id` recorded on the user's latest APPROVED review** — NOT `pr.head.sha` at poll time. If author pushes B between the approval (at A) and our next poll, `pr.head.sha` already equals B; using it would make `pushSinceApproval` false until ANOTHER push lands. The review's `commit_id` is the canonical anchor — it's the SHA the user actually approved.

Existing `listReviews` (`src/github/endpoints/reviews.ts`) doesn't currently extract `commit_id`. Extend the mapper to include it.

Computation:
- `approvedCommitId = myLatestApprovedReview?.commitId` (read straight from the latest APPROVED review on every poll — no need to persist separately, the source of truth is GitHub).
- `pushSinceApproval = myReviewState === 'APPROVED' && approvedCommitId != null && approvedCommitId !== pr.head.sha`.

This dodges the persistence/recovery complexity of the original plan (no `approvedHeadSha` field on the store), and naturally handles re-approve cycles: after a re-approve, the latest APPROVED review's `commit_id` is the new SHA, so `pushSinceApproval` clears until the next push.

**FILES ALLOWED:**
- `src/github/endpoints/reviews.ts` — extend `RawReview` + `ReviewSummary` with `commit_id`/`commitId`; pass it through the mapper.
- `src/background/poll-cycle.ts` — `runReviewerPhase`: derive `pushSinceApproval` from `myLatest.commitId` vs `pr.head.sha`.
- `src/core/automations-types.ts` — add `pushSinceApproval?: boolean` to `PRRecordPhaseTwo` (single field; no `approvedHeadSha` persistence needed).
- `src/popup/views/PRListView.tsx` — reviewer-tab branch only: when `pushSinceApproval`, render a stale-push chip alongside or replacing `i approved`.
- `src/popup/components/PRRow.tsx` — only if the chip needs a new render branch (otherwise PRListView passes the right reviewer chip text via `reviewerChip`).
- `tests/background/poll-cycle.reviewer.test.ts` — extend with the new field assertions.
- `tests/github/endpoints/reviews.test.ts` (if it exists) — assert `commitId` passes through; create the file if absent.

**FILES OUT OF SCOPE:**
- Author-side `staleApproval` logic (it stays untouched; this is a parallel reviewer-side computation).
- Notifications for the new state — surfacing is visual only, no SW notification.
- Settings — no new toggle; this signal is intrinsic to the reviewer flow.

**Branch:** `feat/reviewer-push-since-approval`.

**Implementation steps:**

1. **Pin the absence first.** Add a failing test to `poll-cycle.reviewer.test.ts`: simulate APPROVED review with `commitId='sha1'` + current `pr.head.sha = 'sha2'`. Assert reviewer record has `pushSinceApproval: true`. Should fail today (field doesn't exist).
2. **Extend `listReviews` to carry `commitId`.** In `src/github/endpoints/reviews.ts`, add `commit_id?: string | null` to `RawReview`, `commitId?: string` to `ReviewSummary`, and pass it through in the mapper at line 45.
3. **Extend the type.** `PRRecordPhaseTwo` gains `pushSinceApproval?: boolean`. (NO `approvedHeadSha` persistence — derived per-poll from `listReviews`.)
4. **Compute in `runReviewerPhase`.** At the spot where `myLatest` is derived (`poll-cycle.ts:661`), also extract `myLatest.commitId`. Then in the record-build section (`baseRecord`, line 671), compute:
   - `pushSinceApproval = (myReviewState === 'APPROVED' && myLatest?.commitId != null && myLatest.commitId !== pr.head?.sha)`.
   - Add the field to `baseRecord` when truthy (omit when false to keep store minimal).
5. **Render.** In PRListView's reviewer tab branch, the existing reviewer-chip code (search `reviewerChip` / similar) should switch text/color when `pushSinceApproval` is true. Default proposal: render a *second* yellow chip `[ stale push ]` adjacent to `i approved`, preserving the approval signal alongside the staleness indicator. Use the existing `state-badge` aesthetic.
6. **Re-run the test from step 1 — passes.**
7. **Manual verify in the live fixture:** PR #7 (still on `bradygrapentine/auto-rebaser-sandbox`'s closed-PR-or-reopen state? — if needed, re-open via `gh pr reopen 7` or create a new fixture). Reload extension → reviewer tab → row should display the new chip.

**Acceptance (verifiable):**

- New test passes.
- `grep -c "pushSinceApproval" src/popup/` returns ≥1 (rendered in UI).
- `grep -c "pushSinceApproval" src/background/poll-cycle.ts` returns ≥1 (derived).
- `grep -c "commitId" src/github/endpoints/reviews.ts` returns ≥1 (mapper extension).
- `npm test` green.
- Manual: live fixture row shows the stale-push chip when there's an approval + later push; a re-approval (which moves `commit_id` to current head) clears it.

**Risk + mitigations:**

- *Risk:* GitHub's `commit_id` field is technically nullable per their REST schema. *Mitigation:* Type as `string | undefined`; the `!= null` guard in the predicate handles it; mapper drops the field rather than crashing on null.
- *Risk:* `myLatest` filter excludes `COMMENTED` + `PENDING` (existing code); changes to that filter could break the assumption. *Mitigation:* Test fixture covers an approve-then-comment-then-push case to lock the contract.
- *Risk:* SW eviction — not a risk for this approach. Derived per-poll from `listReviews`, no persistence to lose.

### Track 3 — search-query 422-bait audit + regression coverage

**Goal:** Catch any other `/search/issues` queries that use unsupported syntax (the `(A OR B)` group form that broke reviewer-search for ~6 months). Plus a unit test that fails fast on the bait pattern so future additions get caught.

**Audit summary** (already done during diagnosis):
- `src/github/endpoints.ts:17` — `is:pr is:open author:@me`. SAFE.
- `src/github/endpoints/reviewer-search.ts` post-#166 — two separate queries, deduped by id. SAFE.
- No other `/search/issues` call sites in `src/`.

**FILES ALLOWED:**
- `tests/github/endpoints/search-query-shapes.test.ts` (new) — pin the constraint: any string passed to `/search/issues?q=...` must NOT contain `(... OR ...)` or other 422-bait patterns the project has discovered. Test imports both `searchAuthoredPRs` and `searchReviewerPRs` and asserts via the existing `request` mock.
- `src/github/http.ts` — *only if* a small "warn on suspicious search query" debug path is worth adding. Default: NO change to http.ts; the test alone is enough.
- `docs/runbooks/search-query-constraints.md` (new, ~30 lines) — capture the GitHub-side constraint (`OR` grouping rejected, `assignee:@me` and `review-requested:@me` must be separate queries) so future readers don't reintroduce.

**FILES OUT OF SCOPE:**
- Any new search call sites. Coverage only.
- The reviewer-search OR-grouping fix (already shipped in #166).
- GraphQL queries (different endpoint contract).

**Branch:** `chore/search-query-audit`.

**Implementation steps:**

1. Write `tests/github/endpoints/search-query-shapes.test.ts` with **two layers** (plan-review S4):
   - **Layer A — call-site spies.** Mock `request`. Call `searchAuthoredPRs` and `searchReviewerPRs`. Decode each URL's `q` param. Assert no `%20OR%20`, no `(` / `)`, presence of `is:pr` + `is:open`.
   - **Layer B — source-tree regex scan (round-2 S6 — scope clamp).** Use `fs.readdirSync` recursively over `src/github/**/*.ts` only. **Exclude `*.test.ts`** so test fixtures asserting the bad form aren't false-positive flagged. **Do NOT scan `docs/runbooks/`** for the same reason — the runbook documents the bait pattern by necessity. For each in-scope file, grep for any string literal containing `/search/issues?q=` AND ALSO `OR` or `(`. Fail the test if any match — catches future engineers who add a new search call site bypassing the existing helpers. This is a regression net, not a style guide.
2. Write the runbook `docs/runbooks/search-query-constraints.md` documenting the constraint + the reproducer (`gh api search/issues -f q="..."` returning 422 for the OR form). Keep concise.
3. `npm test` — green.

**Acceptance (verifiable):**

- New test file exists and asserts both queries pass the bait-pattern checks.
- `npm test` green.
- `docs/runbooks/search-query-constraints.md` exists with the reproducer command.

**Risk + mitigations:**

- *Risk:* Test is too narrow and misses other bait patterns (e.g., unbalanced quoting, unsupported qualifier combinations). *Mitigation:* Document this is a starter set covering the patterns we've actually hit; future bugs add to the list.

## Merge order

T1 → T2 → T3 (sequential, direct mode per global "Implementation Strategy Default"). T1 is the highest-value (real bug fix); T2 builds on T1's confidence; T3 is the easy add-on.

No file overlap between tracks.

## Execution gate

Run `/opus-on-opus docs/plans/2026-05-13-smoke-followups.md --from-sprint` before /wave. Apply must-fix findings; surface should-fix at Gate 2.

## Post-merge verification

- `git pull && npm run typecheck && npm test` clean on integrated main.
- Manual: reload extension, repeat the reviewer-tab toggle dance (T1), eyeball reviewer-tab row for the new chip on PR #7 (T2).
- Optional re-run of the reviewer-flow smoke prompt (uncommitted at `docs/runbooks/reviewer-flow-cowork-prompt.md`).

## Open questions

None — diagnoses are concrete (useAutomationSettings storage subscription absence; reviewer-side staleApproval not computed; no audit-doc for search query constraints).
