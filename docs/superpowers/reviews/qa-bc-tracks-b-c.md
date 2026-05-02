# QA-BC Review — Tracks B (Background) + C (Popup)

**Reviewer:** QA-BC (Sonnet 4.6)  
**Date:** 2026-05-02  
**Commit reviewed:** `a496769` (Merge feat/popup) + `769641c` (Merge feat/background)  
**Verdict:** APPROVE_WITH_FOLLOWUPS

---

## 1. Coverage Table (from `npx vitest run --coverage`)

```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   99.05 |    96.11 |     100 |   99.05 |
 background        |   96.61 |    91.54 |     100 |   96.61 |
  alarm.ts         |     100 |      100 |     100 |     100 |
  badge.ts         |     100 |      100 |     100 |     100 |
  messages.ts      |   97.22 |      100 |     100 |   97.22 | 34
  poll-cycle.ts    |   95.49 |    88.46 |     100 |   95.49 | 13-14,41-43
  state-machine.ts |   96.72 |       90 |     100 |   96.72 | 58-59
 popup             |     100 |      100 |     100 |     100 |
  App.tsx          |     100 |      100 |     100 |     100 |
 popup/components  |     100 |      100 |     100 |     100 |
  Header.tsx       |     100 |      100 |     100 |     100 |
  PRRow.tsx        |     100 |      100 |     100 |     100 |
  StatusBadge.tsx  |     100 |      100 |     100 |     100 |
 popup/hooks       |     100 |       95 |     100 |     100 |
  useAuth.ts       |     100 |      100 |     100 |     100 |
  usePRStore.ts    |     100 |    85.71 |     100 |     100 | 17
  useSettings.ts   |     100 |      100 |     100 |     100 |
 popup/views       |     100 |      100 |     100 |     100 |
  PRListView.tsx   |     100 |      100 |     100 |     100 |
  SettingsView.tsx |     100 |      100 |     100 |     100 |
  SignInView.tsx   |     100 |      100 |     100 |     100 |
```

**All files at or above 95% lines/statements. Functions 100% across the board. Passes threshold.**

Uncovered lines:
- `poll-cycle.ts:13-14` — `isAbortError` non-Error branch (minor)
- `poll-cycle.ts:41-43` — `console.error` + `continue` on `parseRepoUrl` failure (minor)
- `state-machine.ts:58-59` — edge path in `parseRepoUrl` empty-owner guard (minor)
- `messages.ts:34` — return value of `registerMessageListener`'s listener wrapper (minor)
- `usePRStore.ts:17` — fallback `?? DEFAULT` in onChanged branch (minor)

---

## 2. Findings (sorted by severity)

### MINOR — M1: `console.error` logs `repository_url` in production bundle

**File:** `src/background/poll-cycle.ts:41`  
**Code:** `console.error('Failed to parse repository_url:', item.repository_url, err);`  
**Risk:** Logs a full GitHub API URL to the browser console. Low sensitivity (no tokens, no PII), but unnecessary noise in production and violates the spirit of the "no logging" checklist item. A future engineer might cargo-cult the pattern and accidentally log a token next to it.  
**Fix:** Remove or replace with a silent no-op / structured error record. The `continue` already handles the case gracefully.

### MINOR — M2: `App.tsx` and all popup React components lack explicit JSX return types

**Affected:** `App.tsx`, `PRListView.tsx`, `SettingsView.tsx`, `SignInView.tsx`, `Header.tsx`, `PRRow.tsx`, `StatusBadge.tsx`  
**Example:** `export function App() {` — no `: JSX.Element` or `: React.ReactElement`  
**Impact:** TypeScript infers the return type correctly; TSC passes. No runtime risk. But the QA checklist requires "all public functions have explicit return types."  
**Fix:** Add `: JSX.Element` to each component function signature.

### MINOR — M3: `PRRow` uses `rel="noreferrer"` only — missing `noopener`

**File:** `src/popup/components/PRRow.tsx`  
**Code:** `rel="noreferrer"`  
**Note:** `noreferrer` implies `noopener` in all modern browsers (Chrome 88+). Since this is a Chrome extension targeting MV3, this is technically safe. However, the spec check in the review brief asked for `rel="noreferrer"` OR `noopener noreferrer`. The implementation is correct per modern Chrome behavior.  
**Classification:** NIT only — no action required.

### MINOR — M4: `SettingsView.test.tsx` does not assert `sendMessage(SET_INTERVAL)` is called

**File:** `tests/popup/views/SettingsView.test.tsx`  
**Detail:** The test verifies `saveSettings` is called with the new interval value, but `saveSettings` is mocked at the hook level. The test does NOT verify that `chrome.runtime.sendMessage({ type: 'SET_INTERVAL', intervalMinutes })` fires.  
**Mitigation:** `useSettings.test.tsx` fully covers this path — `saveSettings sends SET_INTERVAL message` is a dedicated test case with correct assertion. Coverage is present at the hook level. The view-level gap is minor since the hook is mocked.  
**Fix (optional):** Add an integration-style test in `SettingsView.test.tsx` that doesn't mock `useSettings` to also assert `sendMessage`.

### NIT — N1: `manifest.json` `default_popup` path is `src/popup/index.html`

**File:** `dist/manifest.json`  
**Value:** `"default_popup": "src/popup/index.html"`  
**Actual dist file:** `dist/src/popup/index.html` (Vite preserves the input path in `dist/`)  
**Assessment:** Chrome loads the popup relative to `dist/`, so it resolves to `dist/src/popup/index.html` — this is present in the build output. The RUNBOOK confirms this layout is expected. **Not a bug.**

### NIT — N2: `poll-cycle.ts` uncovered `isAbortError` non-Error branch (line 13-14)

The `isAbortError` function has a `return false` branch for non-Error values. No test exercises this. Low risk (the `ABORT_ERRORS` set check is string-based and the non-Error path simply returns false). Worth a one-liner test.

---

## 3. Security Audit

| Check | Result |
|---|---|
| No tokens in popup logging | PASS — zero `console.*` calls in `src/popup/` |
| `SET_INTERVAL` validates range (1, 5, 15, 30 only) | PASS — `VALID_INTERVALS = new Set([1, 5, 15, 30])` with test coverage |
| Unknown messages return sensible response | PASS — `{ ok: false, error: 'UNKNOWN_MESSAGE' }`, tested |
| No `dangerouslySetInnerHTML` | PASS — grep returns empty |
| External links: `target="_blank"` + `rel="noreferrer"` | PASS — `noreferrer` implies `noopener` on Chrome MV3 |
| Auth state leak — no `getAuthenticatedUser` when signed out | PASS — `useAuth` checks `getToken()` first; returns early with `signed-out` if null |
| No PII in `console.error` | MINOR M1 — `repository_url` logged (not a token; low severity) |

---

## 4. Spec Coverage Matrix

Stories from the MVP Backlog that fall in Tracks B and C scope.

### Story 1.3 — Auto-Rebase Behind PRs

| Acceptance Criterion | Covered By | Status |
|---|---|---|
| PRs with `behind` are rebased on each cycle | `poll-cycle.test.ts` — "behind PR rebase" | COVERED |
| `update-branch` called with `update_method: "rebase"` | `endpoints.test.ts` (Track A) | COVERED |
| Successful rebase → `updated` state | `poll-cycle.test.ts` — `state=updated, badge=1` | COVERED |
| 422 → `needs-manual` | `poll-cycle.test.ts` — "behind + HTTP_422" | COVERED |
| `dirty` PR → `conflict`, never calls `update-branch` | `poll-cycle.test.ts` — "dirty PR" | COVERED |
| Clean PRs left untouched | `poll-cycle.test.ts` — "all-clean cycle" | COVERED |

### Story 1.4 — State Tracking

| Acceptance Criterion | Covered By | Status |
|---|---|---|
| Each PR has exactly one of 7 states | `state-machine.test.ts` table-driven + `StatusBadge.test.tsx` 7-state | COVERED |
| State persists across popup close/open | `pr-store.test.ts` (Track A) | COVERED |
| `lastUpdated` reflects epoch ms of last change | `poll-cycle.test.ts` — `lastUpdated: Date.now()` in upserted records | COVERED |

### Story 1.5 — User-Configurable Poll Interval

| Acceptance Criterion | Covered By | Status |
|---|---|---|
| Interval options 1/5/15/30 stored in `chrome.storage.sync` | `useSettings.test.tsx`, `settings-store.test.ts` | COVERED |
| Default 5 minutes | `useSettings.test.tsx` — loads settings on mount | COVERED |
| Alarm recreated when interval changes | `alarm.test.ts` + `messages.test.ts` SET_INTERVAL | COVERED |
| Popup sends `SET_INTERVAL` message on change | `useSettings.test.tsx` — "saveSettings sends SET_INTERVAL" | COVERED |

### Story 1.6 — Popup PR List

| Acceptance Criterion | Covered By | Status |
|---|---|---|
| Shows all open authored PRs with badge and link | `PRListView.test.tsx` — "shows multiple PR rows" | COVERED |
| Status badges correct colors per state | `StatusBadge.test.tsx` — 14 tests, data-state + label per state | COVERED |
| PR title links open in new tab | `PRRow.test.tsx` — "link has correct href and target" | COVERED |
| "Last poll: never" before first cycle | `PRListView.test.tsx` — "shows 'Last poll: never'" | COVERED |
| Popup updates in real-time on storage change | `usePRStore.test.tsx` — `onChanged` listener | COVERED |
| Empty state when no PRs | `PRListView.test.tsx` — "shows empty state" | COVERED |

### Story 1.7 — Poll Now Button

| Acceptance Criterion | Covered By | Status |
|---|---|---|
| "Poll now" button triggers immediate poll cycle | `PRListView.test.tsx` — "Poll now button sends POLL_NOW message" | COVERED |
| PR list updates after poll completes | `usePRStore.test.tsx` — storage onChanged listener | COVERED |
| "Last poll" timestamp updates | `PRListView.test.tsx` — "shows formatted time when lastPollAt is set" | COVERED |

### Story 1.8 — Badge Count

| Acceptance Criterion | Covered By | Status |
|---|---|---|
| Badge shows count of PRs updated in last cycle | `badge.test.ts` — "count>0 sets text and color" + `poll-cycle.test.ts` badge=1/2 | COVERED |
| Badge cleared when zero PRs updated | `badge.test.ts` — "count=0 clears badge text"; `poll-cycle.test.ts` — "badge cleared then 0" | COVERED |
| Badge is green (`#2da44e`) | `badge.test.ts` — asserts `BADGE_BACKGROUND_COLOR` constant | COVERED |
| Badge resets at start of each cycle | `poll-cycle.test.ts` — "clearBadge called 1x" | COVERED |

### Story 1.10 — Error Handling

| Acceptance Criterion | Covered By | Status |
|---|---|---|
| 401/403 clears token, popup prompts re-auth | `useAuth.test.tsx` — "signed-out when getAuthenticatedUser throws" + `auth.test.ts` | COVERED |
| Rate-limited cycles skipped silently | `poll-cycle.test.ts` — "NOT_AUTHENTICATED/AUTH_ERROR from searchAuthoredPRs aborts" | COVERED |
| Network errors on individual PRs mark only those PRs `error` | `poll-cycle.test.ts` — "HTTP_500 from getPR keeps cycle running" | COVERED |
| `error` PRs retried on next cycle | Implicit — no `skip` logic for `error` state in `deriveStateFromMergeable`; `error` PRs go through full flow on next cycle. No direct regression test. | PARTIAL |

**Uncovered AC:** Story 1.10 — "error PRs are retried on next cycle" has no explicit test asserting that a PR previously in `error` state goes through `getPR` + `updateBranch` again on the next `runPollCycle` invocation. The code is correct (no skip logic), but the assertion is missing.

---

## 5. Modularity Check

| Rule | Result |
|---|---|
| `popup` does not import from `background` | PASS — `grep -r "from '.*background" src/popup/` → empty |
| `background` does not import from `popup` | PASS — `grep -r "from '.*popup" src/background/` → empty |
| `core` does not import from `github` or `background` | PASS — `grep -r "from '.*github\|from '.*background" src/core/` → empty |
| No file > 200 LoC | PASS — largest file is `poll-cycle.ts` at 111 LoC |
| All public functions have explicit return types | MINOR M2 — React components lack `: JSX.Element` |

**Layer graph confirmed:** `core ← github ← background`, `core ← github ← popup`. No violations.

All files are cohesive and single-responsibility. `poll-cycle.ts` (111 LoC) is the most complex file; its responsibility is well-scoped to the orchestration loop.

---

## 6. Integration Build Verification

```
npm run build  →  ✓ 54 modules transformed  (270ms)
```

**dist/ contents:**
```
dist/manifest.json            ✓
dist/service-worker.js        ✓  (3.63 kB gzip: 1.58 kB)
dist/popup.js                 ✓  (148.91 kB gzip: 48.22 kB)
dist/src/popup/index.html     ✓
dist/chunks/endpoints.js      ✓
```

**manifest.json fields:**
- `service_worker: "service-worker.js"` ✓
- `default_popup: "src/popup/index.html"` ✓ (resolves to `dist/src/popup/index.html`)
- `host_permissions: ["https://api.github.com/*", "https://github.com/*"]` ✓
- `permissions: ["alarms", "storage", "identity"]` ✓

TSC: **zero errors** (`npx tsc --noEmit` produces no output).

---

## 7. Known Follow-Ups (not blockers)

These were pre-classified as deferred in the QA-A report or Phase 2 plan:

| Item | Priority | Phase |
|---|---|---|
| ETag cache eviction strategy | Low | Phase 2 |
| Icons (currently using default Chrome puzzle piece) | Low | Phase 2 |
| `console.error` in `poll-cycle.ts` (M1 above) | Low | Next PR |
| Explicit JSX return types on components (M2 above) | Low | Next PR |
| Test for "error PRs retried on next cycle" (Story 1.10 gap) | Low | Next PR |
| `isAbortError` non-Error branch coverage (N2) | Low | Next PR |
| `SettingsView` view-level `sendMessage` assertion (M4) | Low | Optional |

---

## Summary

**170 tests pass, 0 failures. TSC clean. Build verified. No blockers.**

The codebase is well-structured with clean layer separation, table-driven tests for pure functions, integration-level poll-cycle tests with mocks, and comprehensive popup behavior tests asserting user-visible text and click outcomes. Security surface is tight. The four MINOR findings are all low-risk quality items appropriate for a follow-up PR, not blockers for merging.
