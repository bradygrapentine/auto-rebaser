# Auto-Rebaser — Backlog
_Last `/backlog-sync`: 2026-06-02 (**§5 polish/reliability sweep shipped** — baseline `/sprint`, 4 serial-direct tracks (opus-on-opus 2 cycles, 3 must-fix caught at plan time): **CT-3c** #283 (label-filter `<datalist>` autocomplete via `useKnownLabels`), **SEC-11** #284 (notification click-target URL guard at persist+sink, GHES-only), **CT-6+CT-7** #282 (reviewer headSha guard + `searchAuthoredPRs` partial-search isolation; CT-7 gained a preserve-on-partial fix beyond plan — `pruneStale` would else evict the absent PRs), **TRIAGE-POLISH** #285 (attention-dot `role`, shared `capCiList` helper, boundary test, N13b comment). **Ready=0.** **Blocked=0.** **Shipped=96.** Char wall 36/36 byte-identical. **OPS-2 confirmed already shipped** (#221/#223/#225+#227); **11 of 13 gate nits dead** (deleted preview files) — only N13b shipped, N7 dropped (mis-anchored); capture-first StatusContext fixture deferred. **Release status unchanged: bump manifest 2.0.0→2.1.0 → store submission** is the only remaining release step.)_

Stories are numbered to match roadmap features (1.x). Sections §0–§5 track current work; §7 is the shipped log; 🧊 is deferred/dropped. Original story specs (technical details + acceptance criteria) live below the divider as a frozen v1 reference.

---

## §0 Status board

| Status | Count |
|---|---|
| 🟢 Ready | 0 |
| ⚡ In progress | 0 |
| 🔎 In review | 0 |
| 🚧 Blocked | 0 |
| ⏸ Held | 1 |
| ✅ Shipped | 88 |
| 🧊 Deferred / dropped | 6 |

---

## §1 Ready

_**§1 is empty by design after the 2026-06-01 scope trim.** A large batch of features sits on `main`, unreleased since v2.0.0 — that, not new features, is the priority: **live-test the post-v2.0.0 batch → bump version → submit to stores.** Scope trimmed: preview stays basic (PREVIEW-3/4/5/6/10 → 🧊), DIGEST hidden from the release, TRIAGE frozen (ship-as-is, no more triage work). The §5 polish/reliability candidates (CT-3c, SEC-11, CT-6, CT-7, TRIAGE-POLISH) SHIPPED 2026-06-02 (§7). Remaining §5: capture-first StatusContext fixture (deferred — needs a real legacy-status `gh api` capture), flaky-e2e (unfiled). OPS-5/REVIEWER-3/REVIEWER-4 → 🧊._

## §2 In progress
_(none)_

## §3 In review
_(none)_

## §4 Blocked
_(none — SPIKE-1 cleared the queue: PREVIEW-1/DIGEST-1 → §1 Ready, OPS-5/REVIEWER-3/REVIEWER-4 → 🧊. See `docs/decisions/2026-06-01-spike-1-deferred-feature-verdicts.md`.)_

## §5 Future / unscoped
_Open for v1.2+ planning. Add new stories here with `Status: 🟢 Ready` once spec'd._

- _**OPS-6** 🟢 Ready — Chrome store package must strip the manifest `key`. `manifest.json` carries a `"key"` (committed since 1fef878, used for a stable `load unpacked` dev ID). The Chrome Web Store now **hard-rejects** an upload whose `key` doesn't match the published item's store key ("key field value in the manifest doesn't match the current item") — hit during the v2.1.0 submission (v2.0.0 slipped through when CWS silently ignored the field). Add a `package:chrome` npm script that: builds (`vite build`), copies `dist/`→staging, removes `key` from the staged `manifest.json` (`jq 'del(.key)'`/python), zips the staged **contents** (manifest at root, `-x '*.map'`) to `auto-rebaser-chrome-<version>.zip`. Keep `key` in the repo manifest (dev) and in the Firefox/source zips (Firefox ignores it; source must be true). Mirror as `package:firefox` for symmetry (no key-strip needed there). Acceptance: `unzip -p auto-rebaser-chrome-*.zip manifest.json | grep -c '"key"'` → 0; version + `manifest_version` intact; CWS upload succeeds. Low effort, prevents a recurring manual fix each release._
- _**REL-1** ⏸ Held (trigger: **after 2026-06-09**) — Confirm v2.1.0 is **live on both stores**. The v2.1.0 release runbook (`docs/runbooks/2026-06-02-v2.1.0-release.md`) was completed 2026-06-02: tag pushed, GitHub release published with corrected store zips, Chrome + Firefox AMO submissions filed (store review is async — Chrome usually hours, AMO can take days). On/after 2026-06-09, verify both listings show 2.1.0 as the live published version. Chrome: <https://chromewebstore.google.com/detail/auto-rebaser/fcbanfgcfcjmhnoanachedlpbopiodpi>. Firefox AMO: <https://addons.mozilla.org/firefox/addon/auto-rebaser/>. Acceptance: both stores report 2.1.0 live → update memory `project_v2_pending_approval.md` and BACKLOG §0; if either is still pending/rejected, capture the reviewer reason and file a follow-up. (Also outstanding from the runbook: AMO listing-copy refresh per `marketing/store-listing-description.md`.)_

_**Scope decision 2026-06-01 — preview stays BASIC.** The dry-run preview ships as-is (just enough that users find the page and see what's there). No further preview work for now → **PREVIEW-3/4/5/6 and PREVIEW-10 deferred to 🧊** (dedicated-view/inline-badges, multi-account aggregate, persist-last-preview, opt-in direct-merge probe, execute-path per-PR `getRepo` degradation). The PREVIEW-7/8/9 gate-cluster follow-ups SHIPPED (§7); report `.claude/state/gate-cluster-review-preview-1-dry-run.md`._
- _~~13 residual gate-report nits~~ RESOLVED 2026-06-02: **11 of 13 were dead** (N1–N6, N8–N12 + most of N13 targeted `runPreview`/`PreviewView`/`usePreview`/`preview-gather`, all DELETED in #277). N13b (char-test "byte-identity" comment over-claim) shipped #285. N7 dropped — mis-described (comment at `merge-clean.ts:30`, not :42; `merge-clean.char.test.ts` exists, greps fine)._

_**DIGEST-1 — hidden from the release (2026-06-01 scope trim).** Deemed not necessary for now. The `App.tsx` `onDigest` wiring is commented out so the "this week" footer button + `d` shortcut don't render; `DigestView`/`useDigest`/`computeDigest`/`'digest'` route all remain on main — re-enable by restoring the one prop._

_**TRIAGE — frozen (2026-06-01 scope trim).** TRIAGE-1/2 ("Needs you" surface + skip-reason) ship as-is; NO further triage work and no commitment to the broader "command center" direction until deliberately revisited. (Flagged as serious long-term scope.)_

_~~**CT-3c** — label-filter autocomplete~~ SHIPPED 2026-06-02 (#283 — see §7)._

_**Audit follow-ups (2026-06-01 release-readiness audit, should-fix)** — file: `docs/audits/2026-06-01-release-readiness-audit.md`:_
- _~~**SEC-11** — validate the CT-4 click-target URL~~ SHIPPED 2026-06-02 (#284 — guard at persist+sink via `isSafeExternalUrl`; see §7)._
- _~~**CT-6** — reviewer-phase missing-`headSha` guard~~ SHIPPED 2026-06-02 (#282 — see §7)._
- _~~**CT-7** — per-page error isolation in `searchAuthoredPRs`~~ SHIPPED 2026-06-02 (#282 — partial flag + preserve-on-partial; see §7)._

_The audit's 11 nits (a11y focus-visible/contrast, the orphaned `RepoFilter` dead code, stale comments, `PRRecordPhaseTwo` grab-bag) are recorded in the audit doc; promote individually if they become release-relevant._

_**TRIAGE-POLISH** (post-wave review follow-up) — a/b/d SHIPPED 2026-06-02 (#285, §7); (c) deferred:_
- _~~a11y attention-dot `role="img"`~~ SHIPPED #285._
- _~~"+N more" dedup → `capCiList`~~ SHIPPED #285._
- _**capture-first gap** (DEFERRED) — TRIAGE-2's `StatusContext` fixture branch is schema-sourced (this repo is all-GitHub-Actions); a single real `gh api` capture against any legacy-status repo would close it. Left parked: the schema-sourced fixture works today._
- _~~`NeedsYouSurface` CI-cap boundary test at exactly 2~~ SHIPPED #285._

_(SEC-9 and SEC-10 shipped 2026-05-17 via PR #198 — see §7 below. OPS-2 SHIPPED 2026-05-29 via #221/#223/#225 (+OPS-4 #227): vite^6/vitest^4, all OSV `[[IgnoredVulns]]` cleared, OSV green + a required check. Nothing outstanding.)_

_(Shipped 2026-05-14 to §7: SEC-1, SEC-2, SEC-3, SEC-4, SEC-6, SEC-8. SEC-9 part 1 + SEC-1 regression fix shipped 2026-05-17 via #194/#195/#196/#197 — see §7 below. Remaining follow-ups: SEC-9 part 2 (workflow edit), SEC-10 (after dep-graph toggle).)_

---

## §7 Shipped log

PR numbers are GitHub PR IDs in this repo. Pre-PR-1 stories landed in the `feat: initial commit — auto-rebaser v0.1.0 …` baseline (commit `1fef878`).

### 2026-06-02 — §5 polish/reliability sweep (CT-3c, SEC-11, CT-6/7, TRIAGE-POLISH)
_Baseline `/sprint`; plan `docs/plans/2026-06-02-ct3c-sec11-ct6-7-polish.md`. opus-on-opus 2 cycles — cycle 1 caught 3 must-fix at PLAN time (all premise errors, fixed before any code): SEC-11 threaded a non-existent in-scope `enterpriseHost` (→ `getGlobalSetting`), N7 mis-anchored, `useKnownLabels` read `.labels` off `PRRecord` which lacks it (→ `PRRecordPhaseTwo` widen). Cycle 2 clean. Diagnose-first pruning: OPS-2 dropped (already shipped), 11/13 gate nits dead (deleted preview files), N7 dropped, TRIAGE-POLISH(c) deferred. 4 serial-direct PRs, file-disjoint; +25 tests, char wall 36/36 byte-identical, integrated suite 1237._
- **CT-3c** Label-filter autocomplete. New `useKnownLabels()` hook (distinct trimmed label names across `usePRStore().prs`, widened to `PRRecordPhaseTwo` for `.labels`, deduped case-insensitively, sorted) + a `<datalist>` on `LabelList` (optional `suggestions` prop, filters already-added values), mirroring `useKnownRepos`→`RepoOptOutList`. No new endpoint/permission. PR #283.
- **SEC-11** Guard the CT-4 notification click-target URL through the existing `isSafeExternalUrl(url, enterpriseHost)` (https: + host ∈ {github.com, configured `enterpriseHost`}) at BOTH `persistClickTarget` (drop before store) AND `handleNotificationClick` (re-validate at the sink before `chrome.tabs.create`, purging a pre-guard/tampered entry). `enterpriseHost` via `getGlobalSetting`. github.com unaffected; closes the GHES-only data:/javascript:/off-host exposure. PR #284.
- **CT-6** Reviewer-arming `headChanged` guarded with `headSha != null` so a transient undefined head no longer reads as "changed" → no per-cycle re-fire of `enableAutoMerge` + spurious activity entry (mirrors the authored path ~:437). PR #282.
- **CT-7** `searchAuthoredPRs` isolates a transient failure on a page AFTER the first: returns aggregated-so-far flagged `partial: true` instead of throwing (account-fatal RATE_LIMITED/AUTH/403 + page-1 errors still propagate). Poll skips open→closed transition-detection on `partial` AND — **beyond the plan** — re-affirms the search-absent open PRs so `pruneStale` (keyed on `processedPRs` ids) doesn't EVICT them (without that preserve, a partial cycle would delete the PRs — worse than a false close). Pending-deletion runs regardless. PR #282.
- **TRIAGE-POLISH** (a) PRRow attention-dot `role="img"` (color-only cue → AT-accessible); (b) extracted the duplicated "first-N + +K more" cap into `core/ci-format.ts` `capCiList<T>` (shares slice/overflow only — PRRow's per-name SEC-11 link-folding untouched); (d) NeedsYouSurface boundary test at exactly 2 names. N13b — clarified the `delete-branch.char.test.ts` "byte-identity gate" comment (a diff-review discipline, not an assertion). PR #285.

### 2026-06-02 — Release-prep (remove dry-run + needs-you fixes + v2.1.0 notes)
_Baseline `/sprint`; plan `docs/plans/2026-06-02-remove-dryrun-needsyou-release.md`. opus-on-opus cycle 1 clean (0 must-fix / 2 should-fix / 3 nit; removal boundary verified — every removed symbol referenced only by deleted/edited files, char wall stays byte-identical). Serial-direct (opus-direct) T1→T2→T3; gated on a PASSING manual live-test of the post-v2.0.0 batch._
- **REMOVE-PREVIEW** Removed the dry-run/preview USER SURFACE entirely (the SPIKE-1→PREVIEW-1 feature, judged not worth maintaining for the release): deleted `PreviewView`/`usePreview`/`preview-gather` + `runPreview`/`OrchestratorOpts.mode`/`OrchestratorResult.preview`/`PREVIEW_NOW`/`PreviewProjection`/`DESTRUCTIVE_KINDS`/the `'preview'` route + "dry run" footer button + `p` shortcut + all 9 preview-only test files. **KEPT** the decision/execution machinery the EXECUTE path now depends on — `decide*` predicates, `buildEligiblePRs`/`buildMergedPRInputs`, `selectAutomationCandidates`, and the 36-test characterization wall (stayed **byte-identical**, the proof execute behavior is unchanged). `buildEligiblePRs` collapsed to plain throw-propagation (the preview-only `degradePerPR` flag removed). One execute-unchanged test moved into `orchestrator.test.ts` (flaky `getRepo` → enable aborts, `summary.errors++`, no enable call). Suite 1211; both targets build. PR #277.
- **NEEDS-YOU-FIX** (a) The "open conflicts" / "resolve conflict" / "! conflict" actions built `${pr.url}/conflicts`, which 404s/redirects — fixed to link to `pr.url` (the PR page surfaces the resolve CTA natively) in BOTH source sites (`triage-actions.ts` conflict + rebase-rejected cases, AND `PRRow.tsx:176` — the second site found via grep-all-call-sites). (b) Top space above the "Needs you" surface didn't match the side padding → added `.view-body > .needs-you-surface:first-child { margin-top: -4px; }` per the existing `:first-child` padding-negation convention. Tests updated in 3 files (triage-actions / NeedsYouSurface / PRRow) to expect `pr.url`. PR #278.
- **RELEASE-NOTES-2.1.0** Authored `docs/release-notes/v2.1.0.md` from the merged PRs since the v2.0.0 store-launch closeout (the `v2.0.0` tag predates SEC-1/2/3/4 + CONFLICT-1, but those shipped in the launch closeout #193, so the notes start after). Grouped by theme: "Needs you" triage (TRIAGE-1/2), automation filters + `filtered` chip (CT-3), CI-aware rebasing (CT-1/CT-2), notification deep-links (CT-4), per-account throttling (CT-5), settings-partition (OPS-3), session-storage tokens (SEC-5), polling-reliability. Excludes the removed dry-run/preview + the hidden digest. Version bump + store submit flagged as the follow-up. PR #279.
- **FILTERED-CHIP-REMOVE** Removed the CT-3 `filtered` chip from `PRRow` (surface only) — for consistency with the other repo-scoping settings (ignore-repo, header repo-filter) which suppress *silently* with no badge. The auto-action filter machinery (`evaluateAutoActionFilter` at `poll-cycle.ts:302`) is UNCHANGED — denied/draft/label PRs are still skipped by automations, just no longer chip-flagged. Dropped the unused `useAutomationSettings`/`evaluateAutoActionFilter` imports from `PRRow`; deleted `PRRow.ct3-filtered.test.tsx` (chip-only); char wall untouched. Suite 1206; both targets build. Release notes updated to match.

### 2026-06-01 — PREVIEW-7/8/9 (gate-cluster follow-ups)
_Baseline `/sprint` ("plan and backlog enhancement"); plan `docs/plans/2026-06-01-preview-7-8-9-followups.md`. 3 opus-on-opus cycles (cycle 1: 1 must-fix/3 should-fix/2 nit; cycle 2 clean; Gate-2 "fix first" re-scoped PREVIEW-7 to preview-only → cycle 3: 0 must-fix/1 should-fix/2 nit, all patched). Serial-direct (opus-direct) T3→T1→T2; post-wave verify on integrated main GREEN (coverage exit 0, funcs 88.17%)._
- **PREVIEW-9** Covered the shipped-untested `usePreview` hook (`usePreview.test.ts`: ok / not-ok / no-data / Error-reject / non-Error-reject / fires-once-on-mount / `run()` re-fires; `'PREVIEW_FAILED'` extracted to a module const) + a no-mutation assertion in `preview-gather.test.ts` (none of `deleteRef`/`enablePullRequestAutoMerge`/`resolveReviewThread`/`mergePR` fire during gather). Cleared the coverage gate: functions 87.73→88.26% (>88 floor). PR #271.
- **PREVIEW-7** Restored the shared-adapter invariant: execute now routes through `buildEligiblePRs`/`buildMergedPRInputs` (the byte-equivalent inline copies removed) so execute + preview feed `decide*` identical adapted objects. `buildEligiblePRs` gained a `degradePerPR` flag — **preview-only** (default `false`): preview drops a flaky repo's PR instead of blanking; execute keeps its all-or-nothing throw-propagation **byte-identical** (char wall 36/36 unchanged). `decideDirectMerge` dropped its redundant `prs` param (`number` rides on `eligible.number`, `adapters.ts:78`). New tests pin both preview-degrades and execute-unchanged (a path the char wall does NOT cover). Execute per-PR degradation deferred → **PREVIEW-10** (§5). PR #272.
- **PREVIEW-8** a11y: `aria-live="polite"` results region in `PreviewView` (sibling of the DRY-RUN banner's `role="status"`, no double-announce) + group titles `h3→h2` (flat hierarchy, no `h1`) + `sr-only` destructive text association; `DigestView` body-wrapper `aria-live` for the loading→loaded swap; `.sr-only` clip-rect utility added to popup.css. PR #273.

### 2026-06-01 — DIGEST-1 (weekly activity digest)
_Baseline `/sprint` (judge-free single-pass plan; 1 opus-on-opus cycle — 0 must-fix, 3 should-fix + 3 nit folded pre-Gate-2; clean inline 7b–7f post-wave cluster, 0 must-fix). Plan: `docs/plans/2026-06-01-digest-1-weekly-digest.md`._
- **DIGEST-1** Read-only "this week" popup view aggregating the EXISTING activity-log store into per-action counts over a rolling 7-day window, headlined "Auto-rebased N PRs this week". New pure `computeDigest(entries, {now})` (`src/core/activity-digest.ts`) — windowed grouping by action + success/failed/skipped tally, `now` injected (no clock read in core → deterministic), inclusive lower bound (`at >= since`), `byAction` sorted total-desc/action-asc with zero-count actions omitted; `useDigest` reuses `useActivityLog({scope:'account'})` + `computeDigest` at the `Date.now()` boundary (no settings hook / `usePRStore` → sidesteps the documented mock ripple); `DigestView` + App/PRListView wiring (footer "this week" button, `d` shortcut, `'digest'` route) + popup.css. NO new storage/type/endpoint/permission/persisted field. +18 tests (pure-core hard-literals/boundary/ordering, `useDigest` hook, `DigestView` render, App routing); suite 1228 green; both targets build. PR #269. _(Coverage `test:coverage` pre-existing-red on main from `usePreview.ts` 0% (#266 → PREVIEW-9); DIGEST raised funcs 87.55→87.73%; coverage is not a CI gate.)_

### 2026-06-01 — PREVIEW-1 (dry-run / preview mode)
_Planned via `--ultracode` (judge-panel plan + refute panel; 1 must-fix CRITICAL-2 closed pre-gate — store-merged delete-branch under-report — + 8 should-fix/9 nit applied). Shipped as a strictly-serial 4-track wave (total file overlap forbade parallel). Post-wave `--deep` gate cluster (5 role-primed reviewers): **ship-with-todo, 0 must-fix / 9 should-fix / 13 nit** → 3 follow-up rows (PREVIEW-7/8/9, §5). Report: `docs/plans/2026-06-01-preview-1-dry-run.md`, gate artifacts `.claude/state/gate-cluster-review-preview-1-dry-run.md`._
- **PREVIEW-1** Read-only "dry run" showing exactly which automation actions WOULD fire without touching GitHub. The load-bearing invariant — **preview computes the EXACT action set execution would perform** — is structural, not asserted-after-the-fact: each automation gained a `decide*` predicate backed by a single shared per-PR decision the `run*` execute path also calls, so the two provably cannot drift. **T0 #263** — characterization wall (36 byte-identical literal tests pinning each automation's decision+bookkeeping pre-refactor; the git-show divergence guard). **T1a #264** — extracted `selectAutomationCandidates` (suspended-owner + `evaluateAutoActionFilter` suppression) into `src/core/automations-filter.ts`, one shared definition for poll-cycle + preview. **T1b #265** — the decision/execution split: `decideEnableAutoMerge`/`decideDeleteMergedBranch`/`decideResolveObsoleteThreads`/`decideDirectMerge` + `planned-action.ts` seam (`PlannedAction` union, `PreviewProjection`); the provably-dead MERGE-2 null-method branch dropped. **T2 #266** — `runAllAutomations({mode:'preview'})` read-only branch (never calls `decideDirectMerge`; flags direct-merge `directMergePreviewable:false` + candidate-id superset since clean-status is unknowable read-only); `preview-gather.ts` read-only assembler (open-search ∪ store-merged-pending-deletion through the shared candidate filter — closes input divergence both directions, incl. the CRITICAL-2 store-merged inclusion); `PREVIEW_NOW` message (existing SEC-1 gate covers it); `PreviewView` + `usePreview` (ephemeral state, sidesteps the settings-read mock ripple) + footer "dry run" button / `p` shortcut / `'preview'` routing. +18 tests (read-only 4-mutating-dep-throw proof, normalized preview≡execute equivalence, direct-merge superset, both-direction gather parity, messages routing, view render, App routing). Full suite 1210 green; char wall byte-identical; Chrome + Firefox build.

### 2026-06-01 — SPIKE-1 (deferred-feature triage)
_Read-only investigation spike (baseline `/sprint`: judge-free single-pass plan, 1 opus-on-opus cycle — 0 must-fix, 3 should-fix applied pre-gate). Verdict doc: `docs/decisions/2026-06-01-spike-1-deferred-feature-verdicts.md`._
- **SPIKE-1** Investigate the 5 §4-blocked v1.2 features for utility vs cost. Four-axis method (client-side feasibility / effort vs current architecture / redundancy / value×risk), every codebase claim file:line-cited. Verdicts: **PREVIEW-1 → build** (L; needs a decision/execution-split refactor first — `orchestrator.ts:87` interleaves decide+execute), **DIGEST-1 → build** (S–M; activity-log data already exists), **OPS-5 → defer** (narrow to rate-aware backoff, drop quiet-hours; no proactive `X-RateLimit` read exists today), **REVIEWER-3 → drop** (redundant w/ branch-protection code-owner auto-request; parser cost + write-blast), **REVIEWER-4 → drop** (redundant w/ shipped Story 5.1 ping at higher social blast). Net: 2 build → §1 Ready, 1 defer + 2 drop → 🧊. Cleared the entire §4 Blocked queue. PR _(this branch)_. Plan: `docs/plans/2026-06-01-spike-1-deferred-feature-verdicts.md`

### 2026-06-01 — v1.2 "PR command center" (TRIAGE pair)
_Scoped from the 2026-06-01 feature assessment. Planned via judge-panel `--ultraplan` (integration-first angle won — it grew the 2-row chunk into a 3-track wave: a tiny shared **T0 base** lets T1/T2 be strictly file-disjoint with zero inter-rebase), 1 opus-on-opus cycle (0 must-fix, 3 should-fix applied pre-gate), then a post-wave a11y/robust/test-quality review (0 must-fix)._
- **TRIAGE-1** "Needs you" PR triage surface. Promotes the per-PR action-dot into a first-class popup surface listing the PRs the auto-rebaser can't self-resolve, each with the ONE next action as a deep link. New pure `triageActionFor()` (`src/core/triage-actions.ts`) mirrors `isPRActionable`'s branch order with a `never`-typed exhaustiveness guard + a runtime one-to-one cross-module fixture; new standalone `NeedsYouSurface.tsx` (never touches PRRow — disjoint from T2); rendered above the grouped list, gated to the authored tab; deep links derive from `pr.url` (trusted origin, no guard needed). Read-only, no new write endpoint. Optional `pr.ciFailures` soft-join lights up automatically once T2 persists it (zero merge coupling). PRs #257 (+ T0 base #256). Plan: `docs/plans/2026-06-01-triage-pr-command-center.md`
- **TRIAGE-2** Surface the CI-failure reason on skipped PRs. CT-2 silently skipped auto-rebase on CI-red PRs; now the failing check name + link is shown. New `getPRStatusRollupDetail()` extends the rollup GraphQL with `statusCheckRollup.contexts` (CheckRun/StatusContext union, **capture-first** fixture from a real #209 OSV-Scanner FAILURE), returns `{ state, failures }` normalized to `{ name, url }` (fresh literal — no `__typename` leak), complete failing-enum sets, bounded at 5. Poll-cycle's rebase-path read switches to the detail variant — ONE round-trip; gate decision unchanged (`.state`); `ciFailures` persisted ALWAYS-SET (CT-3 labels discipline) inside the fail-open try/catch. `PRRow` chip threads `useSettings()` for `enterpriseHost`; **SEC-11 fold** — each API-sourced URL passes the new pure `isSafeExternalUrl` (T0) or degrades to plain text. Defensive `getGlobalSetting` guard (root-cause fix for the new render-path read). PR #258. Post-wave test-hardening (anti-tautology) #259.
- **T0 base** (#256) — shared substrate: `PRRecordPhaseTwo.ciFailures?` field + pure `isSafeExternalUrl(url, enterpriseHost?)` guard (https + exact-hostname allowlist; full hard-literal rejection matrix). Integration-first: made T1/T2 strictly file-disjoint.

### 2026-06-01 — release-readiness pre-release chunk (audit follow-up)
_Source: `docs/audits/2026-06-01-release-readiness-audit.md` (6-reviewer deep audit). 2 verified multi-account correctness must-fixes + the CT-3 test gaps. Planned via judge-panel `--ultraplan` (risk-first won), 2 opus-on-opus cycles, shipped as 3 file-disjoint tracks. NOTE: these reuse the `OPS-3`/`TEST-1` id prefixes already in §7 (the older CI-deadlock OPS-3 #213 and settings-split TEST-1 #106) — disambiguate by PR# + this date._
- **CT-5** Account-scope the CT-4 notification throttle. `notify()` read/wrote its throttle via the `@deprecated`-for-SW implicit-id `readAccountKey`/`writeAccountKey('notif_throttle')` instead of the threaded `AccountScope`; since `runPollCycle` iterates every account with its own `scope`, account A's throttle map clobbered account B's (cross-account notification suppression, defeated further by MV3 SW eviction). Fix threads `scope?` as the **4th** `notify()` param (AFTER `now=Date.now()`, so existing positional-`now` callers don't break — the must-fix opus-on-opus caught in cycle 1); throttle routes through two new `AccountScope` delegators (`readNotifThrottle`/`writeNotifThrottle` → `readAccountKeyFor`/`writeAccountKeyFor`); both poll-cycle callsites pass `undefined, scope`; `throttleKey` repo-qualified → `${repo}#${prNumber}:${event}`. SW path fully scoped (grep-clean excluding the intentional `scope===undefined` popup fallback in notifications.ts). 4 new tests (cross-account isolation, repo-qualification, same-key throttle). Plan: `docs/plans/2026-06-01-ct5-ops3-test1-prerelease.md` — PR #251
- **OPS-3** Single-source the global/per-account settings partition. `enableIgnoredRepos` was in `GLOBAL_KEYS` (so excluded from the per-account write by `isGlobalKey`) but the v2 global write/read only handled `ignoredRepos`+`enableKeyboardShortcuts` — so `enableIgnoredRepos=false` was stored nowhere and reverted to `DEFAULT=true` on read (re-activating ignored repos against intent); v1→v2 migration lost it on the next save. Fix: a single exported `GLOBAL_AUTOMATION_KEYS` tuple drives `isGlobalKey`, the save loop, both read paths (`getAutomationSettings` + `getAutomationSettingsFor` via new `readGlobalAutomationSettings`), AND migration's `stripGlobalKeys` + global-promotion loop. 2 new store tests (false survives save→read; save writes exactly the tuple keys, hard-literal) + 1 migration test (lands in global not per-account). Plan: same — PR #252
- **TEST-1** Close the CT-3 filter test gaps. The skip-drafts Seam-1 test was tautological (a draft derives `action:'none'` in `deriveStateFromMergeable` before the rebase path, so `updateBranch` is never called regardless of `skipDraftPRs`); Seam-2 (persisted-`isDraft`/labels, the only place non-rebase automations are suppressed) had only deny-repo coverage; no multi-gate interaction test existed. Replaced the tautological test with 3 genuine Seam-2 candidate-exclusions through `runPollCycle` (persisted-draft, exclude-label, include-label-miss — each with a selective control PR) + a gate-interaction matrix (CT-3-suppressed behind PR skips BOTH `updateBranch` and the CT-2 `getPRStatusRollup` fetch; `denyRepos`+prior `rebase-rejected`@same-SHA re-affirms `rebase-rejected` and re-persists `rebaseRejectedAtSha`). Net +2 cases in the file; integrated main 1103 suite, typecheck clean, coverage exit 0. Plan: same — PR #253

### 2026-06-01 — v1.1 "Control & Trust" wave
- **CT-3** Per-repo allow/deny + draft/label filters — the v1.1 capstone. One GLOBAL auto-action filter, ONE pure predicate fed once per PR, consulted at TWO enforcement seams in the poll cycle; suppressed PRs stay visible but every automation skips them. Planned via judge-panel `--ultraplan` (risk-first won), reviewed 2 opus-on-opus cycles, shipped as 4 serial tracks. **T1** (#243): surfaced PR `labels` on the `PullRequest`/`PRRecordPhaseTwo` types + a hard-literal `gh api` fixture (de-risk spike). **T2** (#246): pure `evaluateAutoActionFilter(input, settings) → {suppressed, reason}` (`src/core/automations-filter.ts`) — precedence repo > draft > label, deny-wins, non-empty allow-list requires membership, case-insensitive, undefined-labels→`[]`; + 5 inert-by-default `AutomationSettings` fields (`allowRepos`/`denyRepos`/`skipDraftPRs`/`includeLabels`/`excludeLabels`); 100% module coverage. **T3** (#247): wired into `poll-cycle.ts` at Seam 1 (fold `filterVerdict.suppressed` into `rebaseSkipped` — same fall-through as CT-2 `ciRed`) + Seam 2 (exclude from the `runAllAutomations` candidate list, computed from the persisted record); persists name-only labels ALWAYS-SET so the current poll overrides any `phaseTwoCarry` stale value (the CT-1 footgun); fails open via `DEFAULT_AUTOMATION_SETTINGS`; predicate called at exactly 2 sites. **T4** (#248): popup "Filters" section (skip-drafts toggle, allow/deny via `RepoOptOutList` + known-repo suggestions, include/exclude via new free-text `LabelList`) + a live-recomputed `[filtered]` chip in `PRRow` (D6 — same predicate, no persisted flag). Inert by default; zero migration (`getAutomationSettings` always merges defaults, so pre-CT-3 stored settings get the new keys). opus cycle-1 caught a per-account merge-site miscitation, the labels-carry staleness footgun, a missing value-import, and the rg call-site guard. 38 new tests across the 4 tracks; final integrated main 1093 suite, typecheck clean, coverage exit 0, both builds + e2e green. Plan: `docs/plans/2026-06-01-ct-3-repo-draft-label-filters.md` — PRs #243, #246, #247, #248
- **CT-4** Notification click-to-open-PR. The notification *firing* system (events, dedupe/throttle, per-account toggles, permission gate, tests) already shipped as Story 2.4 — verify-row found CT-4 ~75% done, with only the "clicking a notification opens the PR" clause unmet (no `onClicked` handler existed; `notify()` discarded the `notificationId`). Re-scoped at Gate 1 to that gap. `notify()` now captures the chrome-generated `notificationId` and persists a GLOBAL `chrome.storage.local` map `{ id → PR-URL }` (bounded to 50 most-recent, append-then-slice; removed on click), only when the payload carries a `url`. A top-level `chrome.notifications.onClicked` listener in `service-worker.ts` opens the URL via `chrome.tabs.create` (no new permission — neither manifest has `tabs`), clears the notification, drops the entry. Persisting in storage + top-level listener both survive MV3 SW eviction between fire and click. `NotifPayload` gains optional `url`; the two poll-cycle callsites thread `e.prUrl`/`pr.url` (urlless → graceful no-op). All best-effort — never changes `notify()`'s return or blocks the cycle (Story 2.4 contract preserved). opus-on-opus 2 cycles — cycle 1 caught the test-stub-yields-no-id gap (fix: local mockImplementation, no setup.ts edit), an unstubbed `chrome.notifications.clear` (guarded `clear?.()`), and an insertion-order underspecification; cycle 2 a storage-mislabel wording fix (global `chrome.storage.local`, not the per-account `readAccountKey`). 6 new tests (id-persist, no-url-no-target, click-opens+clears+removes, click-miss-noop, map-bounded, persist-failure-swallowed); 1050 suite, typecheck clean, coverage exit 0, both builds, e2e green. Plan: `docs/plans/2026-06-01-ct-4-notification-click.md` — PR #241
- **CT-2** CI-green gate before auto-rebase. Auto-rebasing a behind PR whose CI is already red wastes Actions minutes — a rebase won't make a PR failing for non-staleness reasons mergeable. New GraphQL endpoint `getPRStatusRollup` (`src/github/endpoints/status-check-rollup.ts`) mirrors `pr-review-decision.ts` (the other half of GitHub's mergebox): queries the PR's last commit's `statusCheckRollup.state` by `node_id` — one call unifying legacy commit-statuses AND check-runs. Before rebasing a behind PR, read the rollup; suppress the rebase only on a positive `FAILURE`/`ERROR`; `SUCCESS`/`PENDING`/`EXPECTED`/no-checks(`null`) proceed; a fetch failure fails OPEN. Fetched only for a PR about to be rebased (gated behind `action==='rebase' && !rebaseSkipped && !rebaseBackedOff`) — non-behind PRs cost nothing. CI-red PRs stay visibly `behind` (fall-through to the `nextState` default, like `rebaseSkipped` — no new chip/state) and re-check fresh next cycle; no persisted field. Accepted tradeoff (Gate 2): a stale-red PR's helpful rebase is suppressed — bounded (still visible/manually-rebaseable; out-of-date branch drives `mergeable_state` not the rollup). Capture-first: shape pinned to a hard-literal fixture from real `gh api graphql` responses (#237 SUCCESS, #195 FAILURE). opus-on-opus 2 cycles — cycle 1 caught a wrong mock-target (gate test must mock the `status-check-rollup` subdir module directly, not the barrel) + a false barrel-re-export premise (the GraphQL precedent isn't in the barrel); both folded. 13 tests (6 endpoint + 7 gate incl. fails-open + gate-is-rebase-only); 1044 suite, typecheck clean, coverage exit 0, e2e green. Plan: `docs/plans/2026-06-01-ct-2-ci-green-gate.md` — PR #239
- **CT-1** Conflict-aware rebase backoff. A `rebase-rejected` PR (CONFLICT-1, HTTP_422) stayed "behind base", so every poll re-derived `action: 'rebase'` and re-called `updateBranch` → another 422 → wasted Actions minutes + log noise with no change in outcome. Fix: track the head SHA at which the rebase was rejected (`rebaseRejectedAtSha?` on `PRRecord`); while the PR is `rebase-rejected` and head SHA is unchanged, suppress the `updateBranch` call (no API call, no `updatedCount++`, no activity entry) and re-affirm the `! conflict` chip. Any user push moves `pr.head.sha`, clears the backoff, re-attempts once. The SHA persists via a single conditional spread at the lone record write keyed on `finalState === 'rebase-rejected'` (covers fresh-422 AND backed-off-carry); dropped from the `phaseTwoCarry` destructure so it can't leak into a non-rejected outcome. opus-on-opus 2 cycles — cycle 1 caught the carry-through stuck-forever leak (the "omit when undefined" clear was a no-op because the write auto-spreads the prior record) + a backed-off-mislabeled-as-`behind` chip loss; both folded. 4 TDD cases (backoff holds / clears on push / carry-through cleared / fresh persists); 1031 tests, typecheck clean, coverage exit 0, e2e green. Plan: `docs/plans/2026-06-01-ct-1-conflict-aware-backoff.md` — PR #237

### 2026-06-01 — found-bug fixes
- **auto-poll spinner on open** The popup auto-polls on open when data is stale (`PRListView` mount effect) but that path sent `POLL_NOW` without engaging the optimistic spinner, and the real `pollInProgress` flag flips true→false too fast on a zero-PR cycle to render — so the refresh icon never animated on open (only the manual button spun). Unified both triggers through one `requestPoll()` that sets the 500ms optimistic spin + sends `POLL_NOW`; reuses the #233 unmount-cleanup ref (no new leak). Added tests: auto-polls-AND-spins-when-stale + does-not-auto-poll-when-fresh (guards the PERF-1 over-poll loop); updated the button/App tests that rendered stale data (button now correctly shows the disabled "Polling" state on open). 1027 tests, coverage clean, 0 unhandled. Surfaced in the same live-test pass as #233. — PR #235
- **poll-spinner timeout leak** `PRListView.handlePollNow` scheduled a 500ms `setTimeout(setOptimisticPolling(false))` (optimistic spinner-hold) with no cleanup; closing the popup — or tearing down the test env — within 500ms fired setState on an unmounted component (no-op-but-wrong in prod; an intermittent `ReferenceError: window is not defined` unhandled error after vitest tore down jsdom, which it flags as a false-positive-test risk). Fix: `useRef` the timer + clear-before-reschedule + `useEffect` unmount cleanup. Pre-existing since #146 (optimistic spinner), not a recent regression; intermittent (timer-vs-teardown race) so a narrow passed/failed grep missed it. RED-verified fake-timer test (fails `expected 1 to be +0` without the fix); 1025 tests, `test:coverage` x2 clean (0 unhandled markers). Surfaced by a user screenshot during the DOC-1/COVERAGE-1 live-test pass. — PR #233

### 2026-05-28/29 — self-hosted CI hardening + PR-state stale-chip fixes
- **DOC-1** Backfill v2 architecture decisions into `docs/decisions/` (held only the SEC-5 ADR). 5 retrospective ADRs, each anchored to a cited source file verified against the tree at authoring time: (1) local-first/no-backend (MV3 SW + `chrome.storage`, no server), (2) multi-account state isolation + per-account sync keys (the `per_account_settings:<id>` separate-key choice exists because `chrome.storage.sync` `QUOTA_BYTES_PER_ITEM` is 8192 — verbatim in `multi-account.ts`), (3) OAuth Device Flow via GitHub App / PAT legacy (auth *mechanism*; cross-links the SEC-5 token-*storage* ADR rather than overlapping), (4) single-source dual-browser build (`TARGET=firefox` switch; `key`-strip is `STORE=1`-gated, not browser-target), (5) host-derived URLs for GHES + per-request `assertGithubOrigin` SSRF guard. Index appended (6 decisions), `last-indexed` bumped. opus-on-opus 1 cycle (0 must-fix — it independently verified all 5 anchors live; 2 should-fixes folded: corrected the `key`-strip attribution from "Web Store" to `STORE=1`, pinned exact line anchors). The row's premise was STALE at pick time (claimed index was `[TODO]`; SEC-5 had already populated it) — caught at verify-row, plan adjusted to append. Doc-only, no code. Plan: `docs/plans/2026-05-30-doc-1-backfill-v2-adrs.md` — PR #231
- **COVERAGE-1** Restore honest green on `npm run test:coverage` after coverage-v8 3's AST remap (#223) dropped the globals below the 95/94/88/95 floors (non-gating — CI runs `vitest run`). Hybrid, deliberate (not a silent floor-drop): (1) excluded `src/core/types.ts` (174 lines, 0 runtime exports — a pure-type file v8 scored 0%, same class as `**/*.d.ts`); (2) closed a **real** gap — `etag-cache.ts` 73%→100% via 4 tests covering the per-account scoping branch (the cross-account-leak guard every prior test left unexercised); (3) recalibrated floors to measured honest globals lines/stmts 95→92, functions 94→88, **branches held at 88** (the integrity signal it's a measurement recalibration, not a relaxed bar), with a dated in-config rationale + a re-derive warning if `test:coverage` ever becomes required. `test:coverage` exit 0 (92.34/88.39/88.71/92.34); 1024 tests; typecheck clean; no `src/**` logic touched. opus-on-opus 2 cycles — cycle 1 caught the plan naming a non-existent `repos-store.ts` + treating existing test files as new adds; re-scoped step 3 to read the live report. Plan: `docs/plans/2026-05-30-coverage-1-thresholds.md` — PR #229
- **OPS-4** Promote `OSV Scanner` to `main`'s branch-protection required-checks set (ruleset `16056686`) — unblocked by OPS-2 completing (OSV now green, zero suppressions). Applied via `gh api` GET→jq-projection→PUT with a pre-validated rollback body; verified post-PUT that all 5 rule types survived and the set is exactly the original 5 + `OSV Scanner` (6), enforcement active, strict/dnoc false, bypass empty — nothing weakened. #227 was the first PR to merge *through* the 6-check gate (OSV green). opus-on-opus 2 cycles — cycle 1 caught that the rollback re-PUT used the raw GET (read-only fields → would fail when needed); fixed to a pre-validated projection. Runbook `docs/runbooks/2026-05-29-ops-1-required-checks.md` committed (was untracked) with the four OSV-exclusion directives reversed. Completes the OPS-1→OPS-2→OPS-4 security-gate arc. Plan: `docs/plans/2026-05-30-ops-4-osv-required-check.md` — PR #227 (runbook) + ruleset change
- **OPS-2 stage (c) — COMPLETES OPS-2** Upgrade vite `5.4.21 → 6.4.2` (pulls esbuild `0.25.12` + rollup `4.60.2` transitively) + ws `8.20.0 → 8.21.0` (ws is under **jsdom** `^8.18.0`, NOT vite — the row's prior attribution was wrong; `npm update ws` lifted it). vitest stayed 3.2.4 (accepts vite 6), `@vitejs/plugin-react` stayed 4.7.0 (already vite-6 compatible) — no other bumps. **Cleared all 3 `[[IgnoredVulns]]` from `osv-scanner.toml`** — the four advisories (vite GHSA-4w7w, esbuild GHSA-67mh, ws GHSA-58qx, + the Rollup-4 GHSA-mw96 that vite 6 brought into range, resolved 4.60.2 ≥ 4.59.0 fix — caught by opus-on-opus) are now **genuinely fixed, not suppressed**. Proven with a local `osv-scanner scan` ("No issues found") pre-push and the CI OSV job green (7s) with zero exceptions. MV3 build output structurally verified for both targets; 1020/1020, typecheck, 30 e2e. File kept (with `--config` flag) as a documented home for future time-boxes; no `security.yml` edit. **Follow-up: OPS-4** (promote OSV to required-checks, now unblocked). Plan: `docs/plans/2026-05-29-ops-2c-vite-6.md` — PR #225
- **OPS-2 stage (b)** Upgrade vitest `2.1.9 → 3.2.4` + `@vitest/coverage-v8` lockstep; **vite held at 5.4.21** (vitest 3 carries vite as a direct dep `^5||^6||^7` → dedupes to 5, no dual-vite). Swapped `vite.config.ts` `defineConfig` import `'vite'` → `'vitest/config'` (vitest 3 narrowed the `test:`-block augmentation on the bare path; runtime-identical for `vite build`) — the opus-on-opus reviewer flagged this as the #1 likely break and it was exactly right; with the swap, typecheck clean and 1020/1020 with zero test changes, both builds, 30 e2e. Non-gating coverage drift: coverage-v8 3's AST remap (`ast-v8-to-istanbul`) now measures ~92% lines/stmts, ~88.7% fns vs the 95/94/88/95 floors — CI runs `vitest run` (no coverage) so it doesn't gate; thresholds left untouched (filed COVERAGE-1). opus-on-opus 1 cycle (0 must-fix; 2 should-fixes folded: elevate the import swap to expected + assert green via exit code not reporter-grep). Plan: `docs/plans/2026-05-29-ops-2b-vitest-3.md` — PR #223
- **OPS-2 stage (a)** Upgrade vitest `1.6.1 → 2.1.9` + `@vitest/coverage-v8` lockstep; **vite held at 5.4.21** (vitest 2 peers `vite ^5` → no dual-vite typecheck hazard, that's deferred to stage c). First of OPS-2's three staged dep-major bumps. vitest 2 flips the default test pool `threads → forks`; the full suite passed green on `forks` with zero config or test changes (no `pool: 'threads'` pin, no fake-timer fixes) — 1020/1020 unit (count unchanged), typecheck clean (`defineConfig` from `'vite'` still types the `test:` block), Chrome+Firefox builds, 30 e2e. Dependency delta was the standard vitest-2 ecosystem (mocker/runner/snapshot + glob/cliui reporter stack); OSV stayed green (no new advisory). opus-on-opus cleared the plan in one cycle (0 must-fix; 3 should-fixes on the vite-major acceptance guard + npm-ci-lock-staging + a fake-timer triage bucket, all folded in). OPS-2 remains Ready at stage (b) [vitest 2→3]. Plan: `docs/plans/2026-05-29-ops-2a-vitest-2.md` — PR #221
- **SEC-5** Access token → `chrome.storage.session` (off-disk), refresh token + metadata stay in `chrome.storage.local`. The token was a field on the per-account `Auth` blob in local; SEC-5 routes every Auth writer (`setAuthGitHubApp`/`For`, `setInstallations`/`For`, `migrateAndWriteAuth` — the last covers first sign-in AND the add-account runner transitively) through a `splitAccessToken` funnel that blanks the blob's `accessToken` to `''` and stashes the real token in session keyed `access_token:<accountId>`; readers overlay it back; `ensureFreshToken` re-acquires after SW/browser-restart eviction (guard after the refresh-expiry check); `getToken`→`null` when absent; `clearAuth`/`removeAccount`/`github_app→PAT` switch clear the session token. PAT stays in local. opus-on-opus (2 cycles — caught the incomplete writer set) + fresh-Opus security diff review (caught a stale-token-on-method-switch edge, fixed). New behavioral stateful-mock tests; 1020 green; the new SEC-7 auth-gate passed on the PR. ADR: `docs/decisions/2026-05-29-access-token-session-storage.md`. OWASP A04/A07/A01 — PR #219
- **PERF-1** Fire `POLL_NOW` at most once per popup mount. A zero-PR account self-sustained a re-poll loop: the poll cycle's own `stampPollTime` writes the accounts container → `chrome.storage.onChanged` → `useKnownRepos.refresh()` → still-empty → `POLL_NOW` → `runPollCycle()` (unthrottled, `messages.ts:51`) → … wasting GitHub API quota + battery; this was the root cause behind the #209 e2e POLL_NOW storm. Fix: a `useRef` once-per-mount guard (initial refresh bootstraps one poll; later self-induced storage writes refresh the list but never re-poll). TDD red→green; 1010 suite green. Plan: `docs/plans/2026-05-29-sec7-perf1.md` — PR #216
- **SEC-7** Advisory auth-diff security gate in PR CI. New `scripts/security-gate-auth.sh` + path-filtered `security-gate-pr.yml` (on PRs touching `src/core/auth*`/`src/github/http*`, ubuntu) asserting three concrete invariants from shipped SEC work: (a) no `storage.sync.set` of tokens in auth core, (b) no token identifier in `console.*`, (c) every `src/github/http*` references `assertGithubOrigin`. `/security-gate` is a Claude skill that can't run in CI, so this is the curated static-checker substitute. Advisory (NOT in the required set — promotion is a runbook follow-up). Verified: exits 0 clean, trips on each seeded violation. Runbook: `docs/runbooks/2026-05-29-sec-7-auth-gate.md` — PR #217
- **OPS-2 (interim)** Time-box the dev-only OSV advisories (vite/esbuild/ws) in `osv-scanner.toml` so the Security gate goes GREEN on main without waiting on the dep-major upgrade — unblocks OSV joining OPS-1's required-checks set. The full vite 6 + vitest 3 upgrade (OPS-2, now Low) remains as the durable fix to remove the time-box allowlist before it expires — PR #215
- **OPS-3** Move the `test` job from `runs-on: self-hosted` to `ubuntu-latest`. The job's `actions/setup-node@v4` step deadlocked on the self-hosted Mac under concurrent multi-project host load — zero output for ~20 min until the timeout cap killed it (the #211 merge commit `70999b7`, run `26651477975`); recovered only by a manual re-run on the idle host. Since `test` is an OPS-1 required check, a recurrence blocks every merge. Fix mirrors the e2e move (#209), pulling the contended host off the required-check critical path; job id `test` kept so the required-check binding holds; Security workflow stays self-hosted. Validated: `test` ran green on ubuntu in 55s. Plan: `docs/plans/2026-05-29-ops-3-test-runner-deadlock.md` — PR #213
- **OPS-1** Required status checks on the `main` ruleset. The ruleset (id 16056686) enforced PR-only/linear-history but required ZERO checks, so PRs could merge on red CI (2026-05-17 incident). Added a `required_status_checks` rule for `test`, `e2e`, `npm audit (critical)`, `Gitleaks secret scan`, `Dependency review` (OSV held off until OPS-2; strict/up-to-date off; 0 approvals so the solo owner can still merge). Verified via a throwaway failing-test PR (#210) showing `mergeStateStatus=BLOCKED` with all 5 checks resolving to real runs (no ghost-check lock). Runbook: `docs/runbooks/2026-05-29-ops-1-required-checks.md`. Config change, no code PR.
- **e2e on ubuntu** Pinned the `e2e` job to `ubuntu-latest` (test + security stay self-hosted) after the trace showed the MV3 popup click hanging on "waiting for scheduled navigations" — a `POLL_NOW` re-poll storm (empty known-repos) that never lets the page go network-idle on the contended Mac. `noWaitAfter` on popup clicks + `video: off` + bounded fixture teardown as defense-in-depth. #204 (timeout) and the first cut of #209 (video) were wrong levers. Filed PERF-1 for the underlying product loop — PR #209
- **e2e timeout** Raise Playwright per-test timeout 30s→60s for the self-hosted Mac runner. The budget also bounds MV3 persistent-context teardown (retain-on-failure video/trace) — the slow path under CI load — so the failure was teardown-bound, not body-bound (the test runs ~5s idle) — PR #204
- **CI ops** Add `timeout-minutes` to `test` (15) + `e2e` (20) jobs (both inherited the 360-min default, so a hung job sat red for hours); e2e trace now uploads on `always()` not `failure()` so a timeout/cancel still yields a trace (the gap that left #204's red run undiagnosable) — PR #205
- **authored stale-chip** Authored-PR transition re-fetch now stamps `closed` on `HTTP_404` — authoritative for a search-absent PR and cap-safe (a 1000-result-cap-dropped *open* PR returns 200, not 404). Fixes a legacy `needs-manual` record frozen as a permanent `[manual]` chip that should read `[closed]` — PR #206
- **REVIEWER-2** Reviewer-PR store transition detection + prune. The reviewer phase wrote results additively (`upsertReviewerPRs`) with no transition-to-closed detection and no prune — the mirror of the authored phase's logic was simply absent. A reviewer-tracked PR merged/closed manually dropped out of the `is:open` reviewer search and its stale chip stuck forever (same bug class as the authored #206, but worse: froze at *any* state, not just legacy `needs-manual`). Fix mirrors the authored phase: re-fetch search-absent reviewer PRs to stamp `merged`/`closed` (404 → `closed`, per #206's cap-safe rule), carry one cycle, then prune via new `pruneStaleReviewer`. Found while diagnosing #206. — PR #207

### 2026-05-17 — CONFLICT-1 + SEC-9/10 + incident follow-ups
- **CONFLICT-1** Rebase-rejected state + clickable conflict chip — PR #195 (new `'rebase-rejected'` PRState distinct from `'conflict'`/`'needs-manual'`; HTTP_422 maps to it; popup chip links to `/conflicts` UI; per-account-scoped via existing PRRecord round-trip)
- **SEC-9 part 1** Bump vitest 1.6.0→1.6.1, vite 5.4.1→5.4.21, @vitejs/plugin-react 4.3.1→4.7 — PR #194
- **SEC-9 hotfix** Bump @vitest/coverage-v8 1.6.0→1.6.1 to fix npm-ci ERESOLVE peer-dep mismatch — PR #196
- **SEC-1 regression fix** Drop over-restrictive `sender.tab !== undefined` check from `isAuthorizedSender`; URL-origin check is sufficient. Closes 3-day-old CI red on main caused by SEC-1 (#188) rejecting popup-as-tab senders used by 11 e2e specs — PR #197
- **SEC-9 part 2 + SEC-10** Drop `continue-on-error: true` from OSV Scanner and Dependency review jobs in `.github/workflows/security.yml` after Dependency Graph was enabled at repo level. Both jobs now hard-gate. Surfaced residual dev-only advisories (vite 5.4.21 → 6.4.2, esbuild 0.21.5 → 0.25.0) tracked as OPS-2 — PR #198

### Phase 1 — v0.1 baseline (initial commit)
- **1.1** GitHub OAuth Sign-in
- **1.2** Authored PR Discovery
- **1.3** Auto-Rebase Behind PRs
- **1.4** State Tracking
- **1.5** User-Configurable Poll Interval
- **1.6** Popup PR List
- **1.7** Poll Now Button
- **1.8** Badge Count
- **1.9** ETag Caching
- **1.10** Error Handling

### Phase 2 — Automations (initial commit / pre-PR-1)
- **2.6** Auto-Delete Merged Branch
- **2.7** Auto-Enable Auto-Merge
- **2.8** Auto-Resolve Obsolete Review Threads

### Phase 4 — Enterprise authentication
- **4.1** GitHub App registration & publication
- **4.2** OAuth Device Flow sign-in — PR #6
- **4.3** Token refresh + storage — PR #7
- **4.4** Dual-path auth UI — PR #8
- **4.5** Per-installation scoping & "Request access" — PR #9
- **4.6** GitHub Enterprise Server (GHES) base-URL config — PR #10

### Phase 5 — Companion automations
- **5.1** Stale-PR badge + ping reviewers — PR #4
- **5.4** Smart merge-method selection — PR #2
- **5.5** Keyboard shortcuts — PR #3
- **5.6** Activity log — PR #1

### v1.0.x follow-ups
- **MERGE-1** Reclassify no-op auto-merge attempts as `skipped` — PR #65
- **MERGE-2** Fall-through direct merge for clean PRs (`mergeCleanPRsImmediately`) — PRs #65, #66, with UI polish in #67, #68, #69
- **STATE-1** Map PR badges to GitHub `mergeable_state` truth — PR #73
- **BEHIND-1** Detect "behind" via base SHA comparison when `mergeable_state` masks it — PR #78
- **DRAFT-1** `pr.draft=true` overrides `mergeable_state` so draft PRs render as Draft regardless of pending checks — PR #79
- **REBASE-OPT-OUT** Global `autoRebaseEnabled` toggle + per-repo `autoRebaseOptOutRepos` skip list — PR #80
- **MERGE-CLEAN-SKIP** Separate per-repo skip list for the merge-clean-immediately fall-through, surfaced as its own settings section — PRs #81, #82
- **MKT-2** GitHub repo topics added (auto-merge, chrome-extension, developer-tools, firefox-extension, github-extension, pull-request, rebase) — 2026-05-09
- **DOCS-RUNBOOK-STATE** State-machine validation runbook (`docs/runbooks/state-machine-validation.md`) covering STATE-1 / BEHIND-1 / DRAFT-1 / REBASE-OPT-OUT / MERGE-CLEAN-SKIP — PR #83
- **UI-SETTINGS-SPACING** Equalize heading→content spacing across all settings sections (drop 4px first-of-type pad on automation-block) — PR #84
- **ACTIVITY-FILTERS** Replace today-only checkbox with date input + `today` toggle button; add Newest / Oldest / Repo sort dropdown — PR #85

### V2 Sprint 1 — multi-account + repo filter + desktop notifications (2026-05-10)
- **MA-1** Multi-account storage facade + v1→v2 migration (per-account namespaces, `_migration_backup_v1` escape hatch, sync-quota split, etags dropped) — PR #91
- **B1** Account-switcher header + add-account device-flow + multi-account poll loop with per-account error boundary and aggregated badge — PR #94
- **B2** Settings split into `global` (cross-account: poll interval, ignored repos, keyboard shortcuts, GHES host) vs `this account (<login>)` (everything else) with active-login suffix — PR #95
- **B3** Activity log `this account · all accounts` filter chip (default `this`); merged scope tags non-active rows with `[login]` and adds `accountId?: string` to `ActivityEntry` — PR #96
- **2.5** Header repo-filter chip — `[ filter (N) ▾ ]` checkbox dropdown narrows popup PR list to chosen subset; persists per-account; display-only (polling unchanged) — PR #98
- **2.4** Desktop notifications (rebased / conflicted / merged / idle / ping-confirmed) — opt-in master + per-event toggles; runtime `notifications` permission requested on enable; 1-hour throttle per (PR, event) at `accounts.<id>.notif_throttle`; pulled forward from Sprint 2 — PR #99

### V2 Sprint 2 — push-since-approval (2026-05-10)
- **5.2-A** Push-since-approval actionable badge + idempotent reviewer re-request (`POST /pulls/:n/requested_reviewers`). Detector uses head-SHA-cycle-boundary as push-time (not committer-date); negative-cache `staleApproval: result | null` to skip per-cycle listReviews fan-out; first-observation safety (no detection on uncached PRs); 24h per-PR throttle gates badge actionable→passive. Settings: `enablePushSinceApproval` master (default ON, badge-only) + `enableRequestRereview` (default OFF, opt-in click). 3-stage adversarial Opus review (plan / TDD / code) caught and fixed 2 must-fix bugs pre-merge — PR #102

### V2 Sprint 3 — state-machine fix + test harness + reviewer-automations (2026-05-10)
- **STATE-2** `[updated]` masking fix: re-derive PR state after a successful rebase using fresh `mergeable_state`; only keep `updated` when post-rebase result is `current` / `unknown`. Surfaces failing required checks (`blocked` → Pending) instead of masking them — PR #103
- **E2E-1** Playwright E2E test harness + GitHub Actions CI pipeline. Three smoke tests (sign-in view, post-rebase regression for #103, settings persistence across popup reload). MV3 service-worker registration handled via `--headless=new` + persistent context. CI runs typecheck + vitest + build + e2e on every PR — PR #104
- **REVIEWER-AUTOMATIONS** Reviewer dashboard tab (opt-in, default OFF) showing PRs where the user is a requested reviewer or assignee. Conservatively-gated 4-gate auto-merge automation: master toggle + sub-toggle + per-repo allowlist + (my-approval AND `reviewDecision=APPROVED` AND no remaining requested-reviewers). Head-SHA-change invalidation clears the arm cache so a fresh push re-opens the gate. New pure detector with 10 truth-table unit tests; 7-test integration suite for the new poll-cycle phase — PR #105
- **FOLLOWUP-1 / FOLLOWUP-2 / TEST-1 / TEST-2** Settings-store v1/v2 split bug fix (saveAutomationSettings no longer leaks `global_settings` writes on the no-active-account path, so the v1 fallback write isn't silently dropped on read) + reviewer-tab visibility fix (force-expand groups regardless of attention state when on the reviewer tab) + new E2E for the reviewer-tab popup flow + 3 new integration tests anchoring previously-untested reviewer-phase error paths. Out of scope: read-side migration gap (separate followup) — PR #106
- **CHORE-1** UTC-midnight test flake fix in `ActivityLogView.test.tsx`. Two date-filter tests used `Date.now() - 60_000` for fixture timestamps + `toLocalDateString(Date.now())` for the "today" boundary, which broke on UTC runners during the ~minute spanning midnight (caught at 2026-05-11T00:00:27Z). Now pinned via `vi.useFakeTimers` + `vi.setSystemTime` — PR #108
- **MULTI-ACCOUNT-STABILITY** Cross-account PR leak + add-account-logout-first + popup-PR-disappear root-cause fix. Threads `accountId` explicitly through the SW poll cycle (all per-account stores + every endpoint), converts the in-flight refresh dedup to a per-accountId `Map`, captures `addingAccount` + abortSignal in the device-flow closure to survive SW eviction mid-flow. T1 storage variants — PR #148. T2 poll-cycle threading — PR #149. T3 add-account closure capture + integration test — PR #150.
- **FOLLOWUP-3** Settings-store read-side migration gap. Read-side companion to PR #106: `getAutomationSettings` now forks on `getActiveAccountId()` (signed-in → v2 split, signed-out → v1 fallback), ignoring any populated `global_settings` on the no-account path as pre-#106 leakage. Closes the silent-DEFAULTS upgrade scenario — PR #109
- **OOP-MSA** Multi-account substrate /oop pass (invariant-preserving). Collapses the implicit/explicit-id store fork onto an `AccountScope` class — 21 methods, each a 1-line delegation to its `*For` helper. Brands `AccountId` (type-only, zero runtime cost). Deletes the dead SW-eviction override machinery (40 lines, zero callers post-#149). Net `poll-cycle.ts` −28 lines; cross-account isolation test (the #149 pinning oracle) passes unchanged. T1 — PR #152. T2 — PR #153. T3 — PR #154. Plan: `docs/plans/2026-05-12-oop-multi-account-substrate.md`.

### Sprint `sec-hardening` — 2026-05-14 (post-OWASP review)

OWASP review (`docs/security/2026-05-14-owasp-review.md`) flagged 8 SEC items. This sprint shipped 6 of them (the 5 in the chunk; SEC-2+6 paired as one PR). SEC-5 and SEC-7 carried forward. SEC-9 + SEC-10 added as follow-up debt from the SEC-3 implementation. Plan: `docs/plans/2026-05-14-sec-hardening.md`.

- **SEC-1** Validate `chrome.runtime.onMessage` sender. Adds `isAuthorizedSender()` guard in `src/background/messages.ts` — rejects synchronously if `sender.tab !== undefined` (web-page/content-script), `sender.id !== chrome.runtime.id` (foreign extension), or `sender.url` doesn't start with `chrome.runtime.getURL('')`. 4 new tests + manifest `externally_connectable` absence asserted — PR #188
- **SEC-2 + SEC-6** Tighten `validateHost` + add `assertGithubOrigin` at all 5 auth-attaching fetch sites. Validator now rejects oversize labels, `..`, leading/trailing `.`/`-`, single-label hosts. Helper fails-closed when settings read fails (no token leak to attacker host even on storage tamper). Touched 6 source files + 4 test files; 22 new unit tests; 991/991 green — PR #189
- **SEC-3** Supply-chain + secret scanning workflow. `.github/workflows/security.yml` with audit (npm audit --omit=dev --audit-level=critical), OSV scanner (SHA-pinned `google/osv-scanner-action/osv-scanner-action@9a49870…`), gitleaks (SHA-pinned `gitleaks/gitleaks-action@ff98106…`), dependency-review. `.gitleaks.toml` allowlist for the Chrome extension public signing key. Initial PR + 2 follow-ups to land the OSV subpath fix, gitleaks toml shape, and `continue-on-error: true` on OSV (pending SEC-9) and dep-review (pending SEC-10) — PRs #184, #187, #191
- **SEC-4** Explicit CSP in both manifests. Chrome gets the object form `extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'"`; Firefox falls back to the v2-compatible string form because `strict_min_version` is 115 < 121 (CSP object form support). Both bundles build clean, 972/972 unit + 30/30 e2e green — PR #186
- **SEC-8** Threat model & storage section in `PRIVACY.md` (root + `docs/`). Covers unencrypted `chrome.storage.local`, refresh-token rotation, per-device scope, GitHub revocation path, no server-side component. README links to it — PR #185

### V2 launch — store listings + announcement push (2026-05-15)

- **MKT-1** Apply rewritten store listings (Chrome + AMO). Chrome listing went live with v2 copy + 6 v2 screenshots on 2026-05-14 alongside the v2.0.0 binary. AMO listing metadata (Summary, Description, 8 v2 screenshots with captions, categories) refreshed 2026-05-15 via "Edit Product Page" — no version upload needed since v2.0.0 binary was already approved. Runbook + paste-ready blocks: `docs/runbooks/v2-store-submit-and-announce.md` §3 (Chrome verify) + §4 (AMO refresh).
- **MKT-3** v2 launch announcement push across HN / Reddit (r/github, r/webdev, r/programming) / X / Mastodon / Bluesky / LinkedIn. Regular HN submission (not Show HN — v1 had been on CWS at the same URL since last year). Source content + per-channel adaptation in `docs/LAUNCH_POST_V2.md`. Runbook §§7–10.

---

## 🧊 Deferred / dropped

- **2.9** Auto-Dismiss Stale PR Notifications — **dropped** in PR #46. The required `notifications` PAT scope is unavailable to GitHub Apps, so the automation could only run on the legacy PAT path. Not worth maintaining.
- **5.2 (surfacing-only flavor)** push-since-approval — **dropped**. GitHub branch protection ("Dismiss stale approvals on new commits") covers gating when admins opt in; surfacing-only didn't carry its weight against the existing native option. The **actionable** flavor (5.2-A) is alive in §1 — it's a different feature (idempotent reviewer re-request), so the §🧊 entry here only records the death of the surfacing-only form.
- **5.3** flaky-CI auto-retry — **deferred**. Supporting infrastructure (pattern editor, activity log entries, GitHub App permission bump for Checks: Write + Actions: Write) is sized for a headline release. Revisit if/when flaky-CI becomes an explicit Pro-tier anchor.
- **OPS-5** Quiet hours / rate-aware polling — **deferred (narrowed)** by SPIKE-1 (`docs/decisions/2026-06-01-spike-1-deferred-feature-verdicts.md`). Quiet-hours **dropped** (redundant with the already user-configurable poll interval, Story 1.5; not worth the timezone/DST edge cases). The only part worth a future build is a **rate-aware backoff** — there's currently NO proactive `X-RateLimit-Remaining` read (`src/github` only throws reactive `RATE_LIMITED` on 429/403), so it's net-new; promote only on a real multi-account throttling report.
- **REVIEWER-3** Auto-request reviewers from CODEOWNERS — **dropped** by SPIKE-1. The write path is free (`reviews.ts:86 requestReviewers()`) but the net-new CODEOWNERS glob/team/precedence parser cost + a GitHub-write social-blast risk are not justified: branch-protection's "Require review from Code Owners" already auto-requests code owners for exactly the repos that maintain a CODEOWNERS file (high redundancy; only the narrow CODEOWNERS-without-the-rule case is net-new).
- **REVIEWER-4** Nudge-stale-PR comment — **dropped** by SPIKE-1. Redundant with the shipped Story 5.1 reviewer-ping (`ping-throttle.ts`, @-mentions `requested_reviewers`) at strictly higher cost — an auto public bump comment is the highest social-blast of the assessed five. If ever wanted, a *local-only* popup nudge reminder (no GitHub write) is a fresh, separately-scoped idea, not this row.

---

# Original story specs (frozen v1 reference)

The sections below are the original v1 story specs as written on 2026-05-02. They are kept verbatim for historical reference; mark live work in §1–§5 above instead of editing this section.

---

## Story 1.1 — GitHub OAuth Sign-in

**As a user, I want to sign in with GitHub so the extension can access my PRs.**

### Technical Details

- `chrome.identity.launchWebAuthFlow` opens GitHub OAuth authorize URL
- `client_id` and `client_secret` read from `import.meta.env.VITE_GITHUB_CLIENT_ID/SECRET`
- After authorization, extension exchanges `code` for access token via `POST https://github.com/login/oauth/access_token`
- Token stored in `chrome.storage.sync` under key `github_token`
- `state` param generated via `crypto.randomUUID()` and verified on redirect to prevent CSRF

### Acceptance Criteria

- [ ] Clicking "Sign in with GitHub" opens a GitHub authorization popup
- [ ] After authorizing, the popup shows the signed-in username
- [ ] Token is persisted across browser restarts
- [ ] Clicking "Sign out" clears the token and returns to the sign-in screen
- [ ] If the user cancels the OAuth flow, the extension stays on the sign-in screen with no error
- [ ] CSRF: if the returned `state` param doesn't match, auth is rejected

---

## Story 1.2 — Authored PR Discovery

**As a user, I want the extension to find all my open PRs automatically so I don't have to configure anything.**

### Technical Details

- `GET /search/issues?q=is:pr+is:open+author:@me&per_page=100`
- Response `items` array contains `{ id, number, title, html_url, repository_url }`
- `repository_url` format: `https://api.github.com/repos/{owner}/{repo}` — parse owner/repo by stripping prefix
- ETag cached in `chrome.storage.local` under key `etags`; `If-None-Match` header sent on repeat calls; 304 returns cached data

### Acceptance Criteria

- [ ] Extension discovers all open PRs authored by the signed-in user across all repos
- [ ] PRs closed or merged since the last poll are removed from the list on the next poll
- [ ] If the user has no open PRs, the popup shows "No open PRs found."
- [ ] On a 304 response, cached data is used and no additional API call is made
- [ ] API request includes `Authorization: Bearer <token>` header

---

## Story 1.3 — Auto-Rebase Behind PRs

**As a user, I want PRs that are behind their base branch to be rebased automatically.**

### Technical Details

- For each discovered PR: `GET /repos/{owner}/{repo}/pulls/{number}` → check `mergeable_state`
- If `mergeable_state === "behind"`: `PUT /repos/{owner}/{repo}/pulls/{number}/update-branch` with body `{ "update_method": "rebase" }`
- Never calls the PR merge endpoint
- 422 response → `needs-manual` state (complex history, skip)
- 409 response → `conflict` state (merge conflict, skip)

### Acceptance Criteria

- [ ] PRs with `mergeable_state === "behind"` are rebased on each poll cycle
- [ ] `update-branch` is called with `update_method: "rebase"` (never `merge`)
- [ ] A PR that successfully rebases transitions to `updated` state
- [ ] A 422 from `update-branch` transitions the PR to `needs-manual` and is not retried until state changes
- [ ] A PR with `mergeable_state === "dirty"` is marked `conflict` and never sent to `update-branch`
- [ ] Current PRs (clean, blocked, etc.) are left untouched

---

## Story 1.4 — State Tracking

**As a user, I want to see the current status of each PR so I know what the extension has done.**

### Technical Details

- `PRRecord` shape: `{ id, number, title, repo, url, state, lastUpdated, errorMessage? }`
- Stored as `{ prs: PRRecord[], lastPollAt: number | null }` in `chrome.storage.local` under key `pr_store`
- Upsert by `id` — new poll results overwrite previous state for existing PRs; PRs no longer in search results are preserved until they disappear from two consecutive polls (out of scope for MVP: just keep them)

### Acceptance Criteria

- [ ] Each PR has exactly one of these states: `current`, `behind`, `updating`, `updated`, `conflict`, `needs-manual`, `error`
- [ ] State persists across popup close/open
- [ ] State persists across browser restarts
- [ ] `lastUpdated` reflects the epoch ms of the last state change for each PR

---

## Story 1.5 — User-Configurable Poll Interval

**As a user, I want to choose how often the extension polls so I can balance freshness with API usage.**

### Technical Details

- Interval options: 1 / 2 / 5 / 10 / 15 / 30 / 60 / 120 / 240 minutes (1m–4h)
- Stored in `chrome.storage.sync` under key `settings` as `{ intervalMinutes: IntervalMinutes }` (literal union of the values above)
- Default: 5 minutes
- `chrome.alarms.create('poll', { periodInMinutes: N })` recreated when interval changes
- Popup sends `{ type: 'SET_INTERVAL', intervalMinutes: N }` message to service worker on change

### Acceptance Criteria

- [ ] Settings view has a dropdown with options: 1m, 2m, 5m, 10m, 15m, 30m, 1h, 2h, 4h
- [ ] Default interval is 5 minutes on first install
- [ ] Changing the interval immediately reschedules the alarm
- [ ] Selected interval persists across browser restarts
- [ ] Alarm continues polling at the configured interval without user interaction

---

## Story 1.6 — Popup PR List

**As a user, I want a compact popup that shows all my PRs and their current state.**

### Technical Details

- Reads from `chrome.storage.local` `pr_store` via `chrome.storage.local.onChanged` listener for live updates
- Status badge colors: `current` → grey, `behind` → amber, `updating` → blue, `updated` → green, `conflict` / `needs-manual` / `error` → red
- PR row: `[badge] owner/repo#number — title` as a link to the PR
- Footer: "Last poll: HH:MM:SS" or "Last poll: never"

### Acceptance Criteria

- [ ] Popup shows all open authored PRs with status badge and link
- [ ] Status badges use correct colors per state
- [ ] PR title links open the GitHub PR in a new tab
- [ ] "Last poll: never" shown before the first poll cycle
- [ ] Popup updates in real-time when the background service worker completes a poll cycle
- [ ] Empty state message shown when no PRs exist

---

## Story 1.7 — Poll Now Button

**As a user, I want to trigger an immediate poll without waiting for the next alarm.**

### Technical Details

- Popup button sends `{ type: 'POLL_NOW' }` via `chrome.runtime.sendMessage`
- Service worker `onMessage` listener handles `POLL_NOW` by calling `runPollCycle()`

### Acceptance Criteria

- [ ] "Poll now" button triggers an immediate poll cycle
- [ ] The popup PR list updates after the poll completes
- [ ] The "Last poll" timestamp updates after clicking "Poll now"

---

## Story 1.8 — Badge Count

**As a user, I want the extension icon to show how many PRs were rebased in the last cycle so I get passive feedback.**

### Technical Details

- `chrome.action.setBadgeText({ text: N > 0 ? String(N) : '' })` after each poll cycle
- `chrome.action.setBadgeBackgroundColor({ color: '#2da44e' })` (GitHub green)
- Badge cleared (empty string) at the start of each new poll cycle

### Acceptance Criteria

- [ ] Badge shows the count of PRs that transitioned to `updated` in the last poll cycle
- [ ] Badge is cleared (no text) when zero PRs were updated
- [ ] Badge is green (`#2da44e`)
- [ ] Badge resets at the start of each new poll cycle

---

## Story 1.9 — ETag Caching

**As a user, I want the extension to respect GitHub's rate limits so it doesn't get throttled.**

### Technical Details

- `github-client` stores `{ etag, data }` per URL in `chrome.storage.local` under key `etags`
- On each request, sends `If-None-Match: <etag>` if cached
- On 304 response, returns cached `data` without counting against rate limit
- ETags stored/retrieved transparently — callers don't need to know about caching

### Acceptance Criteria

- [ ] First request to a URL stores the ETag from the response
- [ ] Subsequent requests include `If-None-Match` header
- [ ] A 304 response returns the previously cached data
- [ ] A changed response (200) updates the stored ETag and data

---

## Story 1.10 — Error Handling

**As a user, I want the extension to handle errors gracefully so I don't need to babysit it.**

### Technical Details

| Error | Behavior |
|---|---|
| 401 / 403 | Clear token, set `AUTH_ERROR` flag in store, popup shows "Re-authenticate" |
| 422 from `update-branch` | Mark PR `needs-manual`, skip on future polls |
| 409 from `update-branch` | Mark PR `conflict`, skip |
| 429 (rate limit) | Skip current poll cycle entirely, retry on next alarm |
| Network error / 5xx | Mark affected PR `error`, retry on next alarm |
| Search returns 0 results | No-op |

### Acceptance Criteria

- [ ] 401/403 responses clear the stored token and the popup prompts re-authentication
- [ ] Rate-limited cycles are skipped silently with no user-visible error
- [ ] Network errors on individual PRs mark only those PRs as `error`; other PRs in the cycle are unaffected
- [ ] `error` PRs are retried on the next poll cycle
- [ ] `needs-manual` and `conflict` PRs are never retried automatically

---

# Phase 2 — Automations

Stories 2.6–2.9. Each is independently shippable on top of the MVP. All apply only to PRs authored by the signed-in user.

> **Status (2026-05-02):** Phase 2 (stories 2.6–2.9) is **SHIPPED on `main`**. All four automations land via the orchestrator in `src/background/automations/orchestrator.ts`, wired into `poll-cycle.ts`. UI lives under `src/popup/components/AutomationsSettings.tsx`. Live sandbox validation captured in `docs/runbooks/phase2-validation.md`.
>
> **On top of the original 2.6–2.9 spec, the following shipped:**
> - **Global `ignoredRepos`** (default `[]`) — repos here are excluded from search, transition detection, every automation, *and* the popup display (filtered immediately on save, no poll required).
> - **Per-automation skip-repos lists** — `autoDeleteOptOutRepos`, `autoMergeOptOutRepos`, `autoResolveOptOutRepos`, `autoDismissOptOutRepos`. Narrower than the global list: a repo here is excluded from one automation but still polled and shown.
> - **Repo group display** strips the owner prefix when it matches the signed-in user's login (your own repos show as `repo`, org repos still show as `org/repo`).

---

## Story 2.6 — Auto-Delete Merged Branch

**As a user, I want merged PR branches deleted automatically so my repo branch list stays clean even when the repo doesn't have "auto-delete head branches" enabled.**

### Technical Details

- On each poll, detect PRs that transitioned `open → merged` since the previous poll snapshot (compare against `pr_store`).
- For a newly-merged PR, fetch repo settings: `GET /repos/{owner}/{repo}` → `delete_branch_on_merge`. If `true`, skip (GitHub already handled it).
- Otherwise: `DELETE /repos/{owner}/{repo}/git/refs/heads/{head_branch}` where `head_branch` comes from `pull.head.ref`.
- Guard: only delete if `pull.head.repo.full_name === pull.base.repo.full_name` (same-repo branch, not a fork).
- Setting: `settings.autoDeleteMergedBranch: boolean` (default `true`). Per-repo opt-out via `settings.autoDeleteOptOutRepos: string[]`.
- New PR state: `branch-deleted` (terminal). `delete-failed` for retryable errors.
- 422 from delete (branch already gone) → treat as success.

### Acceptance Criteria

- [ ] When an authored PR merges and the repo has `delete_branch_on_merge: false`, its head branch is deleted on the next poll
- [ ] Fork-sourced PRs are never deleted
- [ ] Repos in `autoDeleteOptOutRepos` are skipped
- [ ] Setting can be toggled off globally; when off, no DELETE calls are made
- [ ] A 404 or 422 from the delete endpoint is treated as already-deleted, not an error
- [ ] PR transitions to `branch-deleted` state and is excluded from future polls

---

## Story 2.7 — Auto-Enable Auto-Merge

**As a user, I want authored PRs to auto-merge as soon as checks pass, so I don't have to come back and click merge.**

### Technical Details

- Use GraphQL `enablePullRequestAutoMerge` mutation: requires PR `node_id`, `mergeMethod` (`SQUASH` | `MERGE` | `REBASE`).
- For each open authored PR where `auto_merge === null`: call mutation with configured method.
- Setting: `settings.autoEnableAutoMerge: boolean` (default `false` — opt-in for safety) and `settings.autoMergeMethod: 'SQUASH' | 'MERGE' | 'REBASE'` (default `SQUASH`).
- Skip when: PR is draft, PR is `mergeable_state === "dirty"`, or repo doesn't allow the chosen merge method (detect via 422 response and back off — mark `automerge-unsupported`).
- New PR substate flag: `autoMergeEnabled: boolean` on `PRRecord`.
- Per-repo opt-out: `settings.autoMergeOptOutRepos: string[]`.

### Acceptance Criteria

- [ ] When enabled, an authored open non-draft PR with `auto_merge === null` has auto-merge flipped on within one poll cycle
- [ ] Draft PRs are skipped
- [ ] PRs in conflict (`dirty`) are skipped
- [ ] Default merge method is squash; user can change it in settings
- [ ] If the repo rejects the merge method (422), the PR is marked `automerge-unsupported` and not retried until settings change
- [ ] Setting defaults to OFF on first install — explicit opt-in required
- [ ] Per-repo opt-out list honored

---

## Story 2.8 — Auto-Resolve Obsolete Review Threads

**As a user, I want review comments tied to lines that no longer exist (because I rebased or revised) marked resolved automatically, so review focus stays on live discussion.**

### Technical Details

- For each authored PR that has unresolved review threads, fetch via GraphQL: `pullRequest.reviewThreads(first: 100) { nodes { id, isResolved, isOutdated, line, path } }`.
- A thread is auto-resolvable when: `isResolved === false` AND `isOutdated === true` AND `line === null` (GitHub already detected the anchor is gone).
- Resolve via GraphQL mutation: `resolveReviewThread(input: { threadId })`.
- Setting: `settings.autoResolveOutdatedThreads: boolean` (default `false` — opt-in). Some teams treat outdated comments as still-meaningful. Per-repo opt-out via `settings.autoResolveOptOutRepos: string[]`.
- Track per-thread resolution attempts in `chrome.storage.local` under `resolved_threads: { [threadId]: epochMs }` to avoid re-resolving if a teammate manually unresolves.
- Rate guard: skip thread fetch when ETag indicates no PR changes since last poll.

### Acceptance Criteria

- [ ] When enabled, threads with `isOutdated: true` and `line: null` are resolved on the next poll
- [ ] Threads that are merely outdated but still anchored to a line are NOT auto-resolved
- [ ] A thread previously auto-resolved that gets manually unresolved is not resolved again
- [ ] Setting defaults to OFF; explicit opt-in required
- [ ] Errors on individual thread mutations don't block other threads
- [ ] Counter exposed in popup: "Resolved N obsolete threads this cycle"

---

## Story 2.9 — Auto-Dismiss Stale PR Notifications

> 🧊 **Dropped (2026-05-06, PR #46).** The required `notifications` PAT scope is unavailable to GitHub Apps, so this automation could only run on the legacy PAT path. See 🧊 Deferred / dropped above.

**As a user, I want my GitHub notification inbox cleared of threads tied to PRs that are already closed or merged.**

### Technical Details

- `GET /notifications?all=false&participating=false` (unread only).
- Filter to `subject.type === 'PullRequest'`.
- For each PR notification: parse `subject.url` → `{ owner, repo, number }`. Cross-reference current `pr_store` for state, OR `GET /repos/{owner}/{repo}/pulls/{number}` (cheap with ETag) for `state` + `merged`.
- If PR is `closed` or `merged`: `PATCH /notifications/threads/{thread_id}` (marks thread as read) AND optionally `DELETE /notifications/threads/{thread_id}/subscription` if `settings.unsubscribeStalePRNotifications: true` (default `false`).
- Setting: `settings.autoDismissStaleNotifications: boolean` (default `false`). Per-repo opt-out via `settings.autoDismissOptOutRepos: string[]`.
- Scope: only PRs authored by the signed-in user OR PRs in the user's `pr_store` — never indiscriminately mark every notification.
- New scope token: notification scope requires `notifications` OAuth scope. Add to OAuth flow; if missing, surface "Re-authenticate to enable notification cleanup" in popup.

### Acceptance Criteria

- [ ] When enabled, notification threads for closed/merged PRs are marked read on each poll
- [ ] Notifications for non-PR subjects (issues, discussions, releases) are untouched
- [ ] Notifications for open PRs are untouched
- [ ] If the OAuth token is missing the `notifications` scope, the feature is disabled in the UI with a "Re-authenticate" prompt
- [ ] Setting defaults to OFF
- [ ] Unsubscribe variant is a separate sub-setting and defaults OFF

---

# Phase 4 — Enterprise authentication

Spec: `docs/superpowers/specs/2026-05-02-github-app-auth-design.md`. All Phase 4 stories ship together as v0.2.0. Setup runbook: `docs/runbooks/github-app-setup.md`.

## Story 4.1 — GitHub App registration & publication

**As an extension publisher, I want a GitHub App registered and listed on the Marketplace so users can install it on personal accounts and orgs.**

### Technical Details

- Created at https://github.com/settings/apps/new (or `https://<org>/settings/apps/new` for an org-published App).
- **Naming**: `auto-rebaser` (must be globally unique on GitHub). Lock the URL slug early.
- **Webhooks**: disabled. We poll; no inbound traffic needed.
- **Identifying & authorizing users**:
  - "Callback URL": leave blank (Device Flow doesn't redirect).
  - "Request user authorization (OAuth) during installation": **Enabled** — so the install flow also issues a user token, no separate sign-in step needed for the installer.
  - "Enable Device Flow": **Enabled**.
  - "Expire user authorization tokens": **Enabled** (8h access tokens with refresh tokens).
- **Permissions** (per spec §"GitHub App configuration"):
  - Repository: Pull requests R/W, Contents R, Metadata R.
  - Account: Email addresses R.
  - **Do NOT request** Issues, Workflows, Administration, Actions, Packages — least privilege is a Marketplace review pass/fail criterion.
- **Where can this App be installed?**: "Any account" (personal + orgs).
- **Marketplace listing**: enable when ready. Pricing: free. Categories: Developer Tools / Productivity. Same screenshots & copy as the Web Store listing, plus a permissions justification block.
- **Secrets handled**: client_id is public (ships in extension), no client_secret needed (Device Flow).

### Acceptance Criteria

- [ ] App exists at github.com/marketplace/auto-rebaser
- [ ] Permissions match the spec exactly (verifiable from public App page)
- [ ] A new user can install on a personal account in under 60 seconds
- [ ] An org owner can install with org-wide repo access
- [ ] App's `client_id` is hard-coded into the extension build under `src/core/auth-constants.ts`
- [ ] If the App is later updated to request more permissions, all installs go to "Suspended" until owners re-approve — verified at least once with a no-op permission bump

---

## Story 4.2 — OAuth Device Flow sign-in (Chrome + Firefox)

**As a user, I want to sign in with my GitHub account by entering a short code on github.com so I never paste a token.**

### Architecture

`src/core/auth-device-flow.ts` is a single module with no browser-specific code — Device Flow uses `fetch` and `chrome.tabs.create`, both polyfilled identically by Firefox under the `chrome` namespace.

```ts
export interface DeviceFlowStart {
  userCode: string;         // "ABCD-1234"
  verificationUri: string;  // "https://github.com/login/device"
  deviceCode: string;       // server-side handle, kept for polling
  intervalMs: number;       // 5000
  expiresAt: number;        // epoch ms
}

export async function startDeviceFlow(): Promise<DeviceFlowStart>;
export async function pollDeviceFlow(start: DeviceFlowStart, signal: AbortSignal): Promise<TokenSet>;
```

### Chrome implementation

1. **Popup invokes**: user clicks "Sign in with GitHub App" in the sign-in view. Popup sends `{ type: 'AUTH_BEGIN_DEVICE_FLOW' }` to the service worker.
2. **Service worker**: calls `startDeviceFlow()` → POSTs `https://github.com/login/device/code` with body `{ client_id }`. Stores the `DeviceFlowStart` in memory (NOT in storage — it's short-lived and tied to this attempt).
3. **Returns to popup** the `userCode` and `verificationUri`. Popup renders the code with a Copy button.
4. **Open verification page**: `chrome.tabs.create({ url: verificationUri })`. User completes auth there.
5. **Polling**: service worker polls `https://github.com/login/oauth/access_token` every `interval` seconds (default 5s) with `{ client_id, device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }`. GitHub returns one of:
   - `{ error: 'authorization_pending' }` → keep polling.
   - `{ error: 'slow_down' }` → increase interval by 5s, keep polling.
   - `{ error: 'expired_token' }` → abort, surface to popup.
   - `{ error: 'access_denied' }` → user cancelled, abort.
   - `{ access_token, refresh_token, expires_in, refresh_token_expires_in }` → success.
6. **On success**: persist via `setAuthGitHubApp({ accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt })` to `chrome.storage.local` (NOT sync). Send `{ type: 'AUTH_OK' }` to the popup, which transitions to the PR list.
7. **Popup closed mid-flow**: service worker keeps polling for up to 15 minutes. When user reopens, popup queries `{ type: 'AUTH_STATUS' }` and resumes the in-progress UI.
8. **Stable extension id required** for Marketplace review (the screenshot of the install URL must match across installs). Already satisfied by the existing `key` field in `manifest.json`.

### Firefox implementation

Identical code path. Only manifest differences:

1. **Stable extension UUID**: `manifest.firefox.json` already has `browser_specific_settings.gecko.id = "auto-rebaser@grapentineb.dev"`. This pins the addon-id across installs once signed by AMO.
2. **`chrome.tabs.create`**: Firefox aliases `chrome.tabs.create` → `browser.tabs.create`. No code change.
3. **`chrome.storage.local`**: same alias works.
4. **CSP**: Firefox is stricter on connect-src than Chrome. The default MV3 CSP allows `https://github.com` and `https://api.github.com`. Verify by capturing a network trace during dev — if any request is blocked by CSP, add an explicit `content_security_policy.extension_pages` override in `manifest.firefox.json`.
5. **No background page persistence**: Firefox's MV3 service worker uses `background.scripts: ["service-worker.js"]` (already configured). The polling loop must use `setTimeout`-based scheduling that survives short worker idles, or fall back to `chrome.alarms` for >30s waits. Recommendation: use `chrome.alarms` once interval > 25s, otherwise `setTimeout`.
6. **AMO review**: Device Flow is well-understood; reviewers usually approve same-day. Permissions list should NOT add `identity` (we don't use `launchWebAuthFlow`).

### Test strategy

- Unit-test `startDeviceFlow` and `pollDeviceFlow` against mocked `fetch`. Cover all 5 error responses + success.
- Integration test: hand-rolled in-memory mock GitHub server that walks the state machine `pending → pending → ok` over polling cycles.
- Manual smoke test in both browsers (see RUNBOOK §Auth-DF).

### Acceptance Criteria

- [ ] Clicking "Sign in with GitHub App" displays an 8-character code with a Copy button within 2 seconds
- [ ] A new tab opens to `https://github.com/login/device` with the code visible to the user
- [ ] Successful authorization on github.com transitions the popup to the PR list within 10 seconds
- [ ] User cancellation (closes the github.com tab without authorizing) shows a "cancelled" message in the popup, not an error
- [ ] Code expiry (15 min) shows "Code expired — start over"
- [ ] The flow works identically on Chrome and Firefox; no `if (firefox)` branches in code
- [ ] No request to any host other than `github.com` and `api.github.com`
- [ ] `client_secret` does not appear anywhere in the bundled extension (verified via `grep -ri client_secret dist/`)

---

## Story 4.3 — Token refresh + storage

**As a long-running user, I want my session refreshed automatically so I rarely sign in again.**

### Technical Details

- Storage shape (under `chrome.storage.local` key `auth`):

  ```ts
  type Auth =
    | { method: 'github_app';
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresAt: number;     // epoch ms
        refreshTokenExpiresAt: number;    // epoch ms
        installations: Array<{ id: number; account: string; type: 'User' | 'Organization' }>;
      }
    | { method: 'pat'; token: string; notificationsScopeGranted: boolean };
  ```

- Refresh trigger: any `fetch` to GitHub API checks `now > accessTokenExpiresAt - 5min`; if so, await `refreshAccessToken()` first.
- Reactive 401 path: on 401 from GitHub, single retry after refresh. Two consecutive 401s → mark refresh-token expired and notify popup.
- **Single in-flight refresh**: a module-level `let inFlight: Promise<string> | null`. All concurrent calls await the same promise. Reset to null on resolve/reject.
- **Refresh token rotation**: GitHub returns a new `refresh_token` on every refresh. Persist atomically — old refresh token is invalid the moment the new one is issued. If we crash between issuing the request and persisting the response, user must re-sign in. Acceptable for current scale.
- **Refresh token expiry** (~6 months): if `now >= refreshTokenExpiresAt`, do not even attempt refresh; clear auth and show sign-in.
- Service worker idle eviction: token state is in `chrome.storage.local`, not in module memory, so worker restart is transparent.

### Test strategy

- Mock `fetch` to return 401 first, then 200. Assert refresh ran and the API call succeeded.
- Concurrent calls test: kick off 5 parallel `fetch` wrappers when token is stale; assert exactly 1 refresh request hit GitHub.
- Refresh-token-expired test: stub `refreshTokenExpiresAt` in the past, call API, assert sign-in screen surfaced via `AUTH_EXPIRED` message.
- Persistence test: refresh, then simulate worker restart by reloading the auth-store; new tokens are read back.

### Acceptance Criteria

- [ ] An access token within 5 minutes of expiry is refreshed before the next API call
- [ ] A 401 response triggers a single refresh + retry; repeated 401 surfaces sign-in screen
- [ ] Concurrent API calls during refresh share one refresh request (verified via test)
- [ ] Refresh-token rotation: each refresh persists the new refresh token atomically
- [ ] Refresh-token expiry forces sign-in without burning a request to GitHub
- [ ] No tokens written to `chrome.storage.sync` (verified by integration test)

---

## Story 4.4 — Dual-path auth UI

**As a user, I want to choose between GitHub App and PAT, with App as the recommended default.**

### Technical Details

- `SignInView` rendered with two radio options:
  - "Sign in with GitHub App (recommended)" — calls `AUTH_BEGIN_DEVICE_FLOW`.
  - "Use a Personal Access Token (legacy)" — collapses to current PAT input.
- New users default to GitHub App. Existing PAT users keep working with no UI change until they sign out.
- **Migration banner**: PAT users see a one-time dismissible banner at top of the PR list:

  > "Your PAT works fine, but GitHub App auth is more secure and works at companies that block PATs. [Switch to GitHub App] [Dismiss]"

  Banner state stored in `chrome.storage.sync` under `migration_banner_dismissed: boolean`.
- **Settings → Account section**: shows current method and lets user switch. Switching = sign-out + re-sign-in with the other method.
- **Reauth for PAT users** (Story 2.9 notifications scope) keeps the existing CTA. App users see a different message: "Notification cleanup is unavailable when signed in via GitHub App. [Switch to PAT to enable]"

### Acceptance Criteria

- [ ] Sign-in view shows both options, with GitHub App pre-selected
- [ ] User can complete sign-in via either path
- [ ] After sign-in, popup shows which method was used ("via GitHub App" / "via PAT")
- [ ] Switching methods is a 2-click flow (sign out → sign in with other method)
- [ ] Migration banner appears for PAT users exactly once (per-device); dismissal persists
- [ ] Existing PAT users upgrading to v0.2.0 are not signed out automatically

---

## Story 4.5 — Per-installation scoping & "Request access"

**As a user whose org hasn't installed the App, I want clear guidance on how to ask my admin.**

### Technical Details

- After Device Flow success, `GET /user/installations` returns `installations: Array<{ id, account: { login, type }, repository_selection, target_type }>`.
- Cache the list in `auth.installations` to display "via GitHub App on octocat, acme-corp" in the popup.
- If the user has zero installations:
  - Popup shows empty-state with: "The Auto Rebaser App isn't installed on any account you can access. [Install on personal] [Request for an org]"
  - "Request for an org" links to `https://github.com/apps/auto-rebaser/installations/new` — GitHub's standard request flow.
- During poll cycles, if a PR's repo is not covered by any installation: PR rendered with a yellow "App not installed in <org>" badge linking to install request.
- Org-suspended installations (admin re-approval pending) show with a different badge and don't get any automation actions until re-approved.

### Acceptance Criteria

- [ ] Popup shows installations list under user info
- [ ] Zero-installations user sees install/request links, not an empty PR list
- [ ] PRs in repos without installation render with a clear "App not installed" badge
- [ ] Suspended installation: PRs render but no rebase / merge / delete attempts are made
- [ ] Re-approval of a suspended installation is reflected on the next poll without sign-in

---

## Story 4.6 — GitHub Enterprise Server (GHES) base-URL config

**As an enterprise user on a self-hosted GHES instance, I want to point the extension at my company's GitHub.**

### Technical Details

- Settings adds `enterpriseHost?: string` (e.g. `github.acme.corp`). Empty = github.com.
- All endpoints derived from a single helper:

  ```ts
  function ghOrigin(host?: string) { return host ? `https://${host}` : 'https://github.com'; }
  function ghApiOrigin(host?: string) { return host ? `https://${host}/api/v3` : 'https://api.github.com'; }
  ```

- The same `client_id` cannot be reused — GHES has its own GitHub App registry. Settings UI prompts for the GHES `client_id` when host is set. (Not a secret; safe to ship blank-by-default.)
- GraphQL endpoint differs: `https://github.com/api/graphql` vs `https://<host>/api/graphql`.
- All `host_permissions` in manifest become wildcard-restricted: we cannot statically know GHES hosts. **Solution**: at runtime, when user sets `enterpriseHost`, request optional permission `https://<host>/*` via `chrome.permissions.request`. Manifest declares `optional_host_permissions: ["*://*/*"]` (Chrome) and `optional_permissions` (Firefox).
- Token refresh and Device Flow URLs swap to GHES. Same code, different origin.

### Acceptance Criteria

- [ ] Settings exposes `enterpriseHost` field with validation (no protocol, no path)
- [ ] Setting `enterpriseHost` triggers `chrome.permissions.request` for the host; rejection reverts the setting
- [ ] All API calls (REST + GraphQL + OAuth) target the configured host
- [ ] Sign-in via Device Flow works against a real GHES test instance
- [ ] Switching between github.com and a GHES host requires sign-out + sign-in (no token cross-leakage)
- [ ] Removing `enterpriseHost` revokes the optional host permission

---

# Phase 5 — Companion automations

Spec: `docs/superpowers/specs/2026-05-02-phase5-companion-automations-design.md`. All Phase 5 stories ship together as v0.2.1. **All UI lives in the toolbar popup** — no content scripts, no options page, no secondary windows.

## Story 5.1 — Stale-PR badge + ping-reviewers

**As a user, I want my own idle PRs surfaced so I can follow up before they're forgotten — without auto-closing anyone's work.**

### Technical Details

- **No new endpoints.** PR detail already returns `updated_at` (covers commits, comments, reviews).
- At poll time, after fetching detail, compute idle days and store on the PR record:
  ```ts
  type PRRecordPhase5 = {
    staleness?: { idleDays: number; lastActivityAt: number };
  };
  ```
- Threshold resolution: `staleThresholdOverrides[fullName] ?? staleThresholdDays` (default 14).
- State machine impact: **none.** `staleness` is additive metadata; existing states (current/behind/etc.) are orthogonal.
- `hasAttention` interaction: stale does NOT trigger the orange repo-group dot by default. Setting `staleCountsAsAttention: boolean` (default `false`) lets users escalate.
- **Ping action:** `POST /repos/{owner}/{repo}/issues/{number}/comments` with body from configurable template.
- Throttle: per-PR `lastPingedAt` in `chrome.storage.local`. Disable button for 24h after a ping; show "pinged Xh ago" in the row.

### Storage

```ts
// chrome.storage.sync (settings)
{
  staleThresholdDays: 7 | 14 | 30 | 60,
  staleThresholdOverrides: Record<string, 7 | 14 | 30 | 60>,
  staleCountsAsAttention: boolean,
  enableStaleBadge: boolean,
  enablePingReviewers: boolean,
  pingTemplate: string,
}

// chrome.storage.local (throttle)
{
  pingedPRs: { [prId: number]: { at: number } },
}
```

### UI (popup-only)

- PR row: `idle 14d` muted-amber pill; format degrades past 7d (`idle 3w`, `idle 2mo`); `ping ↗` link only when permitted.
- Ping confirmation: full-popup view replacing main content. Shows the exact comment body that will post and the list of reviewers to be tagged. Cancel returns; Post comment confirms and POSTs.
- Settings: stale-badge toggle; discrete threshold (7/14/30/60); attention-escalation toggle; ping-button toggle; template textarea; "Skip repos" + per-repo threshold override list. All in the existing automations settings view — no new top-level sections.

### Acceptance Criteria

- [ ] PRs whose `updated_at` is older than the effective threshold show an `idle Nd/Nw/Nmo` badge in the popup
- [ ] Badge respects per-repo threshold override
- [ ] Stale state does NOT trigger the repo-group attention dot unless `staleCountsAsAttention` is on
- [ ] Ping button hidden when `enablePingReviewers` is off, when there are no requested reviewers, or when pinged in the last 24h
- [ ] Clicking ping shows a full-popup confirmation view with the exact comment body and reviewer list before any API call
- [ ] After confirmation, comment posts and "pinged Xh ago" appears in the row
- [ ] Cancellation in the confirmation view returns to the PR list with no API call
- [ ] No content-script injection into github.com (verified by manifest review)

---

## Story 5.4 — Smart merge-method selection

**As a user, I want auto-merge to pick the right method per repo without per-repo configuration.**

### Why this replaces the original 5.4

GitHub already exposes per-repo allowed methods (`allow_squash_merge`, `allow_merge_commit`, `allow_rebase_merge`) on `GET /repos/{owner}/{repo}` — which we already call. The right design is to consume that signal and pick the first user-preferred method the repo allows. No per-repo override list needed.

### Technical Details

- Existing repo-cache extended with the three boolean fields.
- Replace `autoMergeMethod: MergeMethod` setting with `mergeMethodPreference: MergeMethod[]` (ordered, default `['SQUASH', 'REBASE', 'MERGE']`).
- Resolution at auto-merge time:
  ```ts
  function resolveMergeMethod(
    preference: MergeMethod[],
    repo: { allow_squash_merge: boolean; allow_merge_commit: boolean; allow_rebase_merge: boolean },
  ): MergeMethod | null {
    for (const method of preference) {
      if (method === 'SQUASH' && repo.allow_squash_merge) return 'SQUASH';
      if (method === 'MERGE' && repo.allow_merge_commit) return 'MERGE';
      if (method === 'REBASE' && repo.allow_rebase_merge) return 'REBASE';
    }
    return null;
  }
  ```
- `runEnableAutoMerge` consults this for each PR. If `null`, surface a small "auto-merge skipped: no allowed method" badge on the row; do not error.
- **Migration:** existing `autoMergeMethod: 'SQUASH'` setting maps to `mergeMethodPreference: ['SQUASH', 'REBASE', 'MERGE']` on first load (existing value first, others appended in default order).

### UI (popup-only)

- Auto-merge settings block: replace the single dropdown with a reorderable list of three rows (squash / rebase / merge), each with an enable checkbox.
- Reordering: drag handles preferred; if drag is too heavy, fall back to per-row up/down arrows. Either way, popup-only.
- PR row, when no method matches: small inline `auto-merge skipped: no allowed method` badge with a tooltip explaining which methods the repo allows.

### Acceptance Criteria

- [ ] On first load after upgrade, existing `autoMergeMethod` value migrates to first slot in `mergeMethodPreference`; no user re-configuration needed
- [ ] Auto-merge picks the first preference that the repo's GitHub settings allow
- [ ] Disabling all preferences disables auto-merge globally (the kill-switch already exists; this is a no-op confirmation)
- [ ] When no preference matches a repo, a clear inline badge surfaces on affected PR rows
- [ ] Reordering preferences in settings persists and takes effect on the next poll
- [ ] No new endpoints called (uses existing repo cache)

---

## Story 5.5 — Keyboard shortcuts

**As a power user, I want to drive the popup without a mouse.**

### Technical Details

- Popup-only; no `chrome.commands` (those require user-binding via `chrome://extensions/shortcuts` and aren't worth the friction for in-popup utility shortcuts).
- Single `useKeyboardShortcuts` hook on the popup root attaches a `keydown` listener.
- Skip when `event.target` is editable (`input`, `textarea`, `select`, `contentEditable`).
- Shortcuts:
  - `r` → poll now (sends `POLL_NOW` message; spinner appears as today)
  - `s` → navigate to settings
  - `Esc` → navigate back from settings or any full-popup view (ping confirm, help)
  - `?` → open help view
  - `j` / `k` → focus next / previous visible PR row (skips PRs in collapsed repo groups)
  - `Enter` → open the focused PR via `chrome.tabs.create({ url: focusedPR.url })`
- Focus state: `focusedPRId: number | null` in popup state; visual indicator via `data-focused="true"` attribute + CSS `:focus-visible`-style rule.

### UI (popup-only)

- Help view: full-popup view replacing main content. Static table of shortcuts.
- Footer hint: small `?` icon at the right edge of the existing footer opens the help view.
- Settings: single toggle "Enable keyboard shortcuts" (default ON). No per-shortcut binding.

### Acceptance Criteria

- [ ] Pressing `r` triggers a poll; pressing `s` opens settings; pressing `Esc` returns
- [ ] `j` / `k` cycle through visible rows (collapsed-group rows skipped)
- [ ] `Enter` opens the focused PR in a new tab
- [ ] `?` opens the help view; `Esc` closes it
- [ ] Shortcuts do NOT fire when the user is typing in an input, textarea, or select
- [ ] Toggling "Enable keyboard shortcuts" off disables all bindings without reload
- [ ] Visual focus indicator visible on the focused row

---

## Story 5.6 — Activity log

**As a user, I want a persistent record of every automated action the extension takes so I can investigate when something looks surprising.**

### Technical Details

- Storage: `chrome.storage.local` under key `activity`. Format `{ entries: ActivityEntry[] }`.
- Cap: 200 entries OR 30 days, whichever hits first.
- Logged actions (write only — never read-only operations like polls, ETag-cached responses, or status checks):
  - `rebase` (Story 1.3)
  - `branch_deleted` (Story 2.6)
  - `auto_merge_enabled` (Story 2.7)
  - `thread_resolved` (Story 2.8)
  - `notification_dismissed` (Story 2.9)
  - `reviewer_pinged` (Story 5.1)
- Entry shape:
  ```ts
  type ActivityEntry = {
    at: number;            // epoch ms
    action: ActivityAction;
    repo: string;          // "owner/repo"
    prNumber: number;
    prTitle: string;       // captured at action time (titles change)
    result: 'success' | 'failed';
    errorMessage?: string;
    branchRef?: string;        // for branch_deleted
    mergeMethod?: MergeMethod; // for auto_merge_enabled
    threadId?: string;         // for thread_resolved
    reviewers?: string[];      // for reviewer_pinged
  };
  ```
- **Write path: once per poll cycle.** The orchestrator already aggregates results from every adapter at the end of `runPollCycle`. It mints `ActivityEntry[]` from those results and does **one** read-modify-write at the end of the cycle. No `appendActivity` calls scattered through adapters; existing adapters and their tests stay untouched.
- Failure mode: storage write errors are non-fatal — log to console, automations continue. Audit gap for that cycle accepted.
- Helpers: `appendActivity(newEntries: ActivityEntry[])` and `trimByCapAndAge(entries, 200, 30 * 86400_000)`.

### Why `chrome.storage.local` (not IndexedDB / sync / session)

- `chrome.storage.session`: in-memory only; defeats audit purpose.
- `chrome.storage.sync`: 100KB total / 8KB per item / 1800 ops/hr — eats the budget; tokens-class data shouldn't sync to other devices.
- IndexedDB: correct shape for time-series, wrong scale at 200 entries / 40KB. Adds ~100 LOC of versioning ceremony for no payoff. Migration path exists if log ever exceeds ~5K entries.
- `chrome.storage.local`: matches existing project convention (PR cache, ETags, throttle state); 10MB quota; adequate.

### UI (popup-only)

- **Activity log view** (full-popup view, replaces main content):
  - Action filter dropdown: `All / rebase / branch_deleted / auto_merge_enabled / thread_resolved / notification_dismissed / reviewer_pinged`.
  - Repo filter dropdown: populated from log contents.
  - Clear log button: confirmation dialog, replaces stored entries with empty array.
  - Entries: timestamp (relative <1h, absolute thereafter), repo, PR number+title, action, result, optional details (branch ref, merge method, etc.), optional error.
  - Empty state: "No activity yet. The extension logs every automated action here."
- **Footer counter clickable:** existing `rebased N · deleted M` line opens activity log filtered to today's entries. Plain `view activity (37)` link is the secondary entry point.
- **No setting to disable.** Always-on; users who want it gone use Clear log. Disabling would create a footgun ("why didn't this get logged?") and saves negligible storage.

### Privacy disclosure

`PRIVACY.md` gains one row in the storage table:

> | Activity log (action, repo, PR number, PR title, result, timestamp) | `chrome.storage.local` | Audit trail for automated actions. Capped at 200 entries / 30 days. Cleared on demand via "Clear log". Never synced. |

### Acceptance Criteria

- [ ] Every write action generates exactly one log entry per occurrence
- [ ] Failed actions log with `result: 'failed'` and an `errorMessage`
- [ ] Log writes happen **once per poll cycle**, not once per action (verified by test that runs a multi-action cycle and asserts a single `chrome.storage.local.set` call against `activity`)
- [ ] Log automatically trims to ≤ 200 entries and entries < 30 days old
- [ ] Activity log view loads in <100ms with a 200-entry log
- [ ] Action and repo filters narrow displayed entries client-side without reloading
- [ ] "Clear log" confirms before deleting and empties the store
- [ ] Footer counter line is clickable and opens the log filtered to today's date
- [ ] Storage write failure is non-fatal; automations continue, error logged to console
- [ ] No log entries are written for read-only operations
- [ ] Existing automation adapters and their tests are untouched (verified by diff review)

---

## Considered and dropped (Phase 5)

- **5.2 push-since-approval** — GitHub branch protection ("Dismiss stale approvals on new commits") covers gating when admins opt in; surfacing-only didn't carry its weight against the existing native option.
- **5.3 flaky-CI auto-retry** — supporting infrastructure (pattern editor, activity log, GitHub App permission bump for Checks: Write + Actions: Write) is sized for a headline release. Revisit if/when flaky-CI becomes an explicit Pro-tier anchor.
