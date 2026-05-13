# Cowork smoke fixes + settings live test

**Date:** 2026-05-13
**Base SHA:** 5b70975 (origin/main)
**Source:** Cowork live-test report (Chrome+Firefox PARTIAL); user request for exhaustive settings live test.
**Plan owner:** /sprint (cowork-smoke-fixes-and-settings-test)
**Discipline:** /oop-style — small commits, pin-then-change with tests, no over-reach. **Behavior change is intentional and scoped to the named regressions** — T1 and T2 fix bugs (storage shape, event capture); T3 is pure CSS/JSX polish; T4 is doc-only.

## Goal

Land four tracks:

1. Fix the add-account regression where the first account is "dropped" because its auth lives at the legacy top-level `chrome.storage.local.auth` key while the second account writes under `accounts.<id>.auth`. The first account becomes invisible to `listAccountIds()`.
2. Fix Firefox-only keyboard shortcuts (`?`, `r`, `s`, `Esc`) being swallowed by the popup.
3. Polish the sign-in layout to match the spec from the prior smoke pass.
4. Author a new Cowork prompt that exercises every settings toggle so future smoke runs cover the settings surface end-to-end.

## Non-goals

- Closing the pre-existing e2e flake on `pr-list-state-chips.spec.ts` (separate investigation).
- Refactoring `setAuthGitHubApp` / `setAuthPAT` beyond the surgical fix in T1.
- Adding new keyboard shortcuts (T2 only restores the existing ones in Firefox).
- Restructuring the settings view (T4 only writes a runbook).
- Migrating popup callers to AccountScope (deferred per #152-#154 plan).

## Tracks

### Track 1 — fix add-account drops first account (regression #1, HIGH)

**Root cause:** First-time sign-in calls `setAuthGitHubApp` or `setAuthPAT`, both of which dispatch through `writeAccountKey('auth', auth)`. When no active account exists yet, `writeAccountKey` falls through to `chrome.storage.local.set({ auth: ... })` — writing at the top level, NOT under `accounts.<id>`. Account A's auth never enters the `accounts` namespace. When the user adds account B via `beginDeviceFlowAddAccount`, B is correctly written to `accounts.gh_B.auth`, but `listAccountIds()` only sees B. From the user's perspective, A has vanished.

The existing `tests/background/multi-account-flow.test.ts` doesn't catch this because it mocks `setAccountState`/`setAuthGitHubApp` and never validates the actual storage shape after both flows complete.

**FILES ALLOWED:**
- `src/background/auth-device-flow-runner.ts` — first-sign-in path (lines 108-117) and add-account path (lines 70-106).
- `src/core/auth-store.ts` — `setAuthGitHubApp`, `setAuthPAT` (entry points that currently fall through to the legacy top-level write).
- `tests/background/multi-account-flow.test.ts` — extend with the order-dependency repro.
- (Optional, if storage-layer migration is the cleanest landing) `src/core/storage/multi-account.ts` — read-side legacy-auth fallback in `getAuth()`.

**FILES OUT OF SCOPE:**
- `src/core/account-scope.ts` (T2 #153 substrate refactor is settled — don't touch).
- `src/popup/` — popup reads `getAuth()` via the implicit-id helper, which already handles "no active account → top-level" semantics; no popup-side change should be needed.

**Branch:** `fix/add-account-token-merge` off base SHA.

**Implementation steps:**

1. **Pin current behavior first.** Add a failing test case to `multi-account-flow.test.ts`:
   - Set up: simulate prior first-sign-in by populating `chrome.storage.local.auth = { method: 'github_app', ... }` AND no `accounts.<id>` entries AND no `active_account_id`.
   - Run `beginDeviceFlowAddAccount()` end-to-end for account B.
   - Assert: after success, `listAccountIds()` returns both A's id AND B's id (not just B). The test should FAIL on current main.
2. **Fix at the device-flow runner level.** In the add-account success path (currently `auth-device-flow-runner.ts:70-106`), before writing B's auth: detect "legacy top-level auth, no `accounts.<id>` for it" condition; if present, derive A's id from the legacy auth (fetch /user with the existing token, OR for PAT use the cached `login`), migrate `accounts.<A_id>.auth = legacyAuth`, and remove `chrome.storage.local.auth`. THEN proceed with the existing B-write.
3. **Also fix at the sign-in level for new installs going forward.** `setAuthGitHubApp(tokenSet)`: if no active account exists, fetch `/user` with the new tokenSet to derive the login, build `accountId`, write under `accounts.<id>.auth`, set active. **Same shape for `setAuthPAT(token)` — also synchronous `/user` fetch before write.** No `gh_unknown` fallback EVER. If `/user` fails, throw an explicit error and surface to the popup; the user retries sign-in. Plan-review M1: writing under `gh_unknown` is unrecoverable (stranded namespace + collision risk on second PAT sign-in).
4. **Add an atomicity helper to `multi-account.ts`.** New export: `migrateAndWriteAuth({ legacyAuth, legacyId, newId, newAuth }) → Promise<void>`. Internally does ONE `chrome.storage.local.set({...})` call that bundles: legacy-key delete (via the same set with the legacy key explicitly NOT in the new map), new `accounts.<legacyId>.auth = legacyAuth`, new `accounts.<newId>.auth = newAuth`, `active_account_id = newId`. Use this from the device-flow runner add-account success path. Plan-review M2: today's add-account does 2 separate awaits; SW eviction mid-step can land partial state.
5. **One-shot inline migration on `getAuth()` for legacy-only users.** Plan-review S1: users who never add a second account would stay legacy forever otherwise. In `multi-account.ts` `readAccountKey('auth')`, when the fallback path hits and finds a legacy `auth` AND the auth has a `login` field (App path has it after first /user fetch; PAT only after `setPATLogin`), migrate inline: derive id from login, write `accounts.<id>.auth = legacyAuth`, set active, delete top-level. If no `login` yet, leave legacy in place (next call will retry).

   **Concurrency lock** (round-2 S1): every popup + background caller hits `readAccountKey('auth')` on cold start; two concurrent reads can both observe `legacyAuth+login` and race two `storage.set` writes. Memoize the migration: `let migrationPromise: Promise<void> | null = null` module-scoped. First caller sets it and runs `migrateAndWriteAuth`. Subsequent concurrent callers `await migrationPromise` instead of dispatching a second write. Clears once resolved.
6. **Re-run the tests from step 1.** They should now PASS.

**Acceptance (verifiable):**

- New test in `multi-account-flow.test.ts`: `"add-account preserves the first account when first sign-in used legacy top-level storage"` — passes.
- New test for the atomic migration helper: `"migrateAndWriteAuth lands legacy migrate + new auth + active id in one storage.set call"` — verifies via spy that `chrome.storage.local.set` is called exactly once with all four keys (per plan-review M2 / N1).
- New test for PAT no-fallback behavior: `"setAuthPAT throws when /user fails — never writes gh_unknown"` — asserts no `accounts.gh_unknown.*` entry exists after a `/user` failure (per plan-review M1).
- `grep -c "gh_unknown" src/` returns 0.
- `grep -c "await migrateAndWriteAuth" src/background/auth-device-flow-runner.ts` returns 1.
- `npm test` green; `npm run typecheck` clean; both builds succeed.

**Behavior change documented:**

- BEFORE: first sign-in writes `chrome.storage.local.auth`; add-account silently makes the first account invisible.
- AFTER: first sign-in writes `chrome.storage.local.accounts.<id>.auth` AND sets `active_account_id`. Add-account migrates any legacy top-level auth first. Existing users on legacy shape are auto-migrated on their next add-account flow. Users with NO existing auth (fresh installs) go straight to the multi-account shape.

**Risk + mitigations:**

- *Risk:* Migration step (`accounts.<A_id>.auth = legacyAuth; delete chrome.storage.local.auth`) could leave storage in an inconsistent state mid-write under SW eviction. *Mitigation:* Do the write in a single `chrome.storage.local.set({...})` that includes both the new accounts shape AND the active-account key, AND deletes the legacy key via the same operation. Atomic.
- *Risk:* PAT sign-in path needs to fetch `/user` to derive id; the user just supplied the PAT and `/user` is the obvious next call anyway. *Mitigation:* `setAuthPAT` does `/user` synchronously before writing — same pattern the device-flow runner already uses for App auth. On `/user` failure (invalid PAT, network), throw and surface to the popup; the user retries. **Never write `accounts.gh_unknown.*` — see step 3.**

### Track 2 — Firefox keyboard shortcuts swallowed by popup (regression #2, MEDIUM)

**Root cause hypothesis (ranked by confidence):**

- **HIGH:** Firefox's built-in browser shortcuts (`?` triggers Quick-Find-Links, `/` triggers Quick-Find) intercept the keydown before our `window.addEventListener('keydown', ...)` handler sees it. Chrome doesn't.
- **MEDIUM:** Firefox popup focus model differs — `window` keydown may not fire if `document.activeElement` is `<body>`. Chrome may dispatch even when body is focused.
- **LOW:** MV3 polyfill behavior diverges in `useEffect` cleanup timing.

**FILES ALLOWED:**
- `src/popup/hooks/useKeyboardShortcuts.ts` (the only file the popup uses for keyboard binding).
- `tests/popup/hooks/useKeyboardShortcuts.test.ts` (or add one if absent).

**FILES OUT OF SCOPE:**
- All view files (HelpView, PRListView, etc.). They register bindings via the hook; the bindings stay the same.
- `src/popup/App.tsx` — no top-level wiring change.

**Branch:** `fix/firefox-popup-keyboard` off base SHA (or rebased on T1 once T1 merges).

**Implementation steps:**

1. **Diagnose-first before fix (plan-review S2).** Load `dist-firefox/` and add a temporary `console.log('[kbd-diag] active:', document.activeElement?.tagName, 'window-keydown fired:', event.key)` to the hook. Open popup, press `?`, capture the console output from SW DevTools. Two scenarios to confirm:
   - If the log fires but action doesn't: capture-phase + preventDefault is the right fix (Firefox built-in shortcut beats us in bubble phase).
   - If the log doesn't fire: focus model is the cause — `<body>` lacks focus and `window` keydown never dispatches. Fix is a `<div tabIndex={-1} ref={autofocusRef}>` on `.popup-root` so the popup has an active element.
2. **Pin current behavior first.** Add a test that dispatches `keydown` with `key === '?'` on `window` and asserts the binding fires (jsdom — pass even when real Firefox fails). Locks the contract.
3. **Apply the verified fix** based on step 1. Default ranked sequence: try capture-phase first; if step 1 says focus model, do the tabIndex/autoFocus wrapper instead. Don't bundle both speculatively.
4. **If capture-phase only**: change `window.addEventListener('keydown', handler)` to `window.addEventListener('keydown', handler, { capture: true })`.
5. **Manual verify in Firefox Dev Edition** before merge. Reload `dist-firefox/`, open popup, press `?` / `r` / `s` / `Esc` — all four fire.
6. **Remove the diagnostic log** before commit.

**Acceptance (verifiable):**

- Unit test: `tests/popup/hooks/useKeyboardShortcuts.test.ts` asserts capture-phase registration via spying on `addEventListener` calls — pass.
- `grep -n "capture: true" src/popup/hooks/useKeyboardShortcuts.ts` returns 1 hit.
- `npm test` green.
- Manual Firefox check: `?`, `r`, `s`, `Esc` all fire from the popup.

**Risk + mitigations:**

- *Risk:* Capture-phase listener may intercept keys destined for our own inputs (e.g. PAT input field). *Mitigation:* The existing `isEditableTarget` guard short-circuits before `preventDefault()`. Capture-phase doesn't change that.
- *Risk:* If both `window` and `document` listeners fire, the binding runs twice. *Mitigation:* Register on only ONE target — try `window` capture first; if Firefox still swallows, fall back to `document` capture (and remove window registration). Test on both browsers before merge.

### Track 3 — sign-in layout polish (4 layout defects, LOW)

**Source:** Cowork report measurements vs. spec.

**FILES ALLOWED:**
- `src/popup/popup.css` — `.signin` rules
- `src/popup/components/PollSummaryFooter.tsx` or wherever the footer install-count was meant to render — adding the missing line.
- `src/popup/views/PRListView.tsx` — if footer line is rendered there.

**FILES OUT OF SCOPE:**
- Sign-in layout structure (we're tuning numbers, not restructuring).
- Other view CSS.

**Branch:** `fix/signin-layout-polish` off T2's merged head.

**Implementation steps:**

1. **Vertical centering upper-bias.** Current `.signin` uses `display: flex; flex-direction: column; justify-content: center`. Upper-bias usually means asymmetric padding. Inspect computed top vs bottom padding on the popup-root containing `.signin`. Adjust: either set `.signin` padding to `0` and rely purely on flex centering, OR balance the existing `padding: 24px 32px` by computing actual content centerline. Test target: title's vertical centerline within ±5px of popup vertical centerline.
2. **Left margin 23→30.** Current side padding is 32px and content `max-width: 340px` with auto margins, so the effective gap from popup edge to button edge should be 32 + (336-340)/2 = ~30px. Cowork measured 23, which suggests either popup width != 400px in their setup OR the max-width clamp doesn't apply when content fits. Action: bump side padding from 32 → 36 and reduce max-width to 320, giving a hard 40px gap from popup edge that exceeds the spec floor.
3. **lede→button1 gap 19→28.** Lede currently has `margin-bottom: 28px`; first button has `.signin .btn--block { margin-top: 14px }`. Adjacent margins in flex don't collapse, so the total should be 42px — but Cowork measured 19. Either the rules aren't applying or Cowork measured visually-padded space, not margin space. Action: explicitly set `.signin > * + * { margin-top: 28px }` and remove the per-element margin-bottom on lede; rely on the adjacent-sibling rule for consistent gaps.
4. **Footer install count missing.** The runbook expects `via app · <count> installations`. Inspect `PollSummaryFooter` and the PRListView footer area — the via-line doesn't render. Re-add it: when `authMethod === 'github_app'`, show `via app · ${installations?.length ?? 0} installations`; when PAT, show `via @${login}`. Pass `installations` + `user.login` + `authMethod` through the same Props chain that App.tsx → PRListView already uses.

**Acceptance (verifiable):**

- Playwright snapshot test (plan-review S3): new `tests/e2e/signin-layout.spec.ts` — loads signed-out popup, asserts (a) `.signin__title`'s `offsetTop` is between 35% and 55% of popup height, (b) `.signin .btn--block` rendered width ≤ 340px, (c) lede→button1 gap matches spec ±2px via `getBoundingClientRect()`. Snapshot pins the layout against future drift.
- `grep -n "via app" src/popup/components/PollSummaryFooter.tsx OR src/popup/views/PRListView.tsx` returns ≥1 hit after the change.
- Manual: open popup signed-in, footer shows the via-line.
- `npm test` green; both builds succeed.

**Risk + mitigations:**

- *Risk:* Padding/margin changes regress the centering on the device-flow sub-view (which has more content). *Mitigation:* The same `.signin` container hosts both choice and device views; visually verify both states after the change.

### Track 4 — Cowork prompt: exhaustive settings live test (doc-only)

**Goal:** Author a paste-ready Cowork prompt that walks every settings toggle and reports back. Lives alongside the v2-smoke prompt as a second-tier validation pass for when settings logic changes.

**FILES ALLOWED:**
- `docs/runbooks/settings-smoke-cowork-prompt.md` (new)

**FILES OUT OF SCOPE:**
- All source code.
- The existing v2-smoke runbook (separate concern).

**Branch:** `docs/settings-smoke-runbook` — independent, can ship any time.

**Implementation steps:**

1. Read `src/popup/views/SettingsView.tsx` to enumerate every toggle / input / dropdown / button. Cluster by section (global, this-account, repo opt-outs, automations, notifications, etc.).
2. For each setting, write a Cowork instruction: "toggle X, verify the popup PR list / activity log / behavior changes as expected, toggle back, verify reverts." Include the fixture accounts (`bradygrapentine`, `bgrapentine`) and repos (`auto-rebaser-sandbox`, `test-repo`) from the existing v2-smoke prompt.
3. Include the same human-in-the-loop discipline — pause for any setting that requires real GitHub UI interaction (e.g. enabling notifications which prompts a permissions dialog).
4. Final report shape: `### <setting name> — PASS/FAIL` with one-line evidence.
5. Render to HTML alongside the v2-smoke prompt.

**Acceptance (verifiable):**

- `docs/runbooks/settings-smoke-cowork-prompt.md` exists, ≥80% of toggles in `SettingsView.tsx` are covered (manual review).
- `node ~/.claude/skills/runbook-to-html/generate.mjs docs/runbooks/settings-smoke-cowork-prompt.md` produces a clean HTML output.
- Prompt is paste-ready: starts after a `---` separator, fully self-contained context (no `@<file>` references that Cowork can't resolve).

**Behavior-preservation argument:** Doc-only. No code changes, no runtime impact.

## Merge order

**T1 → (T2 ∥ T3) → T4.** T1 ships first (touches storage shape, dependency for the smoke tests in §5). T2 and T3 are now **parallelized** (plan-review N2 — `useKeyboardShortcuts.ts` and `popup.css` don't overlap). T4 is doc-only; can ship any time but lands last for visibility. All four still serialize through me (direct execution, no subagent dispatch) per global "Implementation Strategy Default."

## Execution gate

Run `/opus-on-opus docs/plans/2026-05-13-cowork-smoke-fixes-and-settings-test.md --from-sprint` before dispatching anything. Apply must-fix findings; surface should-fix at Gate 2.

## Post-merge verification

- `git pull && npm run typecheck && npm test && npm run build && npm run build:firefox` on integrated main.
- Re-run the v2-smoke Cowork prompt (or just the §5 multi-account part) to verify T1's fix holds end-to-end.
- Manual Firefox keyboard test for T2.
- Manual visual check on sign-in screen for T3.
- T4 deliverable runs the new settings-smoke prompt with the user as oracle.

## Open questions

None — sufficient diagnosis was completed before writing the plan (T1 root cause traced via grep + code read; T2 fix is the obvious capture-phase + document-fallback; T3 is numeric tuning; T4 is doc-only).
