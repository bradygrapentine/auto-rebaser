# SPIKE-1 — Deferred v1.2 feature verdicts (utility vs cost)

**Date:** 2026-06-01
**Source:** SPIKE-1 (gated §4: PREVIEW-1, DIGEST-1, OPS-5, REVIEWER-3, REVIEWER-4)
**Method:** read-only investigation. Four axes per feature — (1) client-side feasibility (no-backend hard gate), (2) effort vs current architecture (cited surface + S/M/L), (3) redundancy with shipped features, (4) value × risk — each codebase claim backed by a `file:line` citation. Verdicts overturn or confirm the §4 rows' preliminary assessment reads.

---

## PREVIEW-1 — Dry-run / preview mode for automations

1. **Client-side feasibility:** ✅ all automation logic already runs client-side in the service worker; preview adds no backend.
2. **Effort vs architecture: L.** `src/background/automations/orchestrator.ts:87 runAllAutomations()` interleaves *decision* and *execution* inline — each of the four blocks (auto-merge `:106`, merge-clean `:179`, delete-branch `:351`, resolve-threads `:388`) computes eligibility AND immediately calls its GitHub mutation. There is **no** separable "decide → action list → execute" seam today. PREVIEW-1 requires factoring each automation's decision predicate out of its execution so preview and execution share one predicate — a genuine refactor touching the orchestrator + all four modules (`delete-merged-branch.ts`, `enable-auto-merge.ts`, `resolve-obsolete-threads.ts`, plus the merge-clean path). The §4 row's "real refactor, not just UI" read is **confirmed**.
3. **Redundancy:** none. No existing surface shows projected-but-unexecuted actions.
4. **Value × risk:** highest *indirect* value of the five — a dry-run is the trust unlock that lets cautious users enable the already-built aggressive automations (direct-merge, auto-delete-branch). Risk is implementation cost, not blast (preview is read-only by definition). The decision/execution split is also reusable test scaffolding.

**Verdict: build** — promote to Ready as the marquee next feature; its plan must carry a prep refactor track (decision/execution split) before the preview UI, so size it as its own multi-track sprint, not a casual single-PR build.

---

## DIGEST-1 — Activity history / weekly digest view

1. **Client-side feasibility:** ✅ reads existing local storage only.
2. **Effort vs architecture: S–M.** The data already exists: `src/core/activity-log-types.ts:18 ActivityEntry { action, result, ts, prTitle }`, a 200-entry / 30-day store (`:41`, `:44`), and `src/core/activity-log.ts:106 loadActivityAll()`. DIGEST-1 is an aggregation pass (group by action/result over a time window) + one popup view, mirroring existing view/component patterns. No new types, no new endpoint, no new permission.
3. **Redundancy:** partial — the raw activity log may already be surfaced; the digest is the *aggregate* ("saved you N rebases this week"), which the raw log does not present. Net-new framing, low overlap.
4. **Value × risk:** moderate retention/trust value — makes invisible work visible, the classic "here's what the tool did for you" lever. Changes no outcomes (visibility-only), so the only risk is popup feature-bloat; mitigated by the low surface cost and the fact that it reuses shipped data.

**Verdict: build** — promote to Ready, **lower priority than PREVIEW-1**. Cheap, self-contained, reuses existing data; a good fill-in win when a larger feature isn't the focus.

---

## OPS-5 — Quiet hours / rate-aware polling

1. **Client-side feasibility:** ✅ alarm scheduling + header reads are all client-side.
2. **Effort vs architecture: M, and partly net-new.** Polling is a single user-configured interval today: `src/background/alarm.ts:4 setupAlarm()` → one `chrome.alarms.create` with a uniform `periodInMinutes`. Rate handling is **reactive only** — `src/github/http.ts:98` / `http-extra.ts:61` throw `RATE_LIMITED` on 429/403, and a grep of `src/github` finds **no** proactive `X-RateLimit-Remaining` read anywhere. So "rate-aware polling" is net-new (read the remaining-quota header, back off before hitting the wall), not a wiring tweak. "Quiet hours" layers timezone/DST edge cases on top of the existing interval.
3. **Redundancy:** poll interval is already user-configurable (Story 1.5) — a user who wants less off-hours traffic can already raise it. Quiet-hours is a convenience layer over an existing knob.
4. **Value × risk:** marginal *visible* value. The reactive `RATE_LIMITED` path already prevents hard failures; multi-account multiplies pressure but no rate-limit pain has been reported. Quiet-hours' timezone correctness risk outweighs its convenience.

**Verdict: defer** — keep, but narrow: the only part worth building later is a **rate-aware backoff** (proactive `X-RateLimit-Remaining` read → widen interval as quota depletes), which has a concrete trigger if multi-account users actually report throttling. **Drop the quiet-hours sub-feature** (redundant with the configurable interval, not worth the timezone edge cases). Re-route to 🧊 with this narrowed scope; promote only on a real rate-limit report.

---

## REVIEWER-3 — Auto-request reviewers from CODEOWNERS

1. **Client-side feasibility:** ✅ — CODEOWNERS file is fetchable via the contents API; request is a client call.
2. **Effort vs architecture: M, parser-dominated.** The *write* path is **free** — `src/github/endpoints/reviews.ts:86 requestReviewers()` already POSTs `requested_reviewers` (built for Story 5.1's ping). The real cost is net-new: a CODEOWNERS glob/team/precedence parser (last-match-wins semantics, team handles, nested-path precedence) — a grep finds **no** `CODEOWNERS` handling anywhere in the codebase.
3. **Redundancy: high.** GitHub branch protection's "Require review from Code Owners" already auto-requests code owners on PR open for any repo with the rule enabled — which is exactly the population that maintains a CODEOWNERS file. REVIEWER-3 would re-do natively-handled work for most target repos.
4. **Value × risk:** thin net-new value (only the narrow case of a repo with CODEOWNERS but *without* the branch-protection rule), against a real parser cost **and** a GitHub-write that, if the parser mis-resolves a glob, social-blasts the wrong reviewers.

**Verdict: drop** — the parser cost + write-blast risk are not justified by the narrow non-redundant slice. The §4 row's "often redundant" read is confirmed and is decisive. Re-route to 🧊 Deferred (dropped).

---

## REVIEWER-4 — Nudge-stale-PR comment

1. **Client-side feasibility:** ✅ — a PR comment is a client write.
2. **Effort vs architecture: S** — but the effort question is moot given redundancy + risk below.
3. **Redundancy: high.** The "this PR is stale, here's whom to nudge" job already shipped as **Story 5.1 reviewer-ping** (`src/core/ping-throttle.ts`, `getPingedStoreFor`/`recordPingFor`, with `requested_reviewers` captured `:129` "to know whom to @-mention on ping"). REVIEWER-4 (an auto *public bump comment*) covers the same "this is stale" signal at strictly higher cost.
4. **Value × risk:** auto public "bump" comments read as spam — highest social-blast of the five, on a PR thread visible to the whole team and reviewers. The assessment explicitly recommends not building it.

**Verdict: drop** — redundant with the shipped ping at higher blast. If a lower-blast variant is ever wanted, it's a *local-only* "nudge reminder" surfaced in the popup (no GitHub write) — but that's a fresh, separately-scoped idea, not this row. Re-route to 🧊 Deferred (dropped).

---

## Summary

| Feature | Verdict | Effort | Why (one line) |
|---|---|---|---|
| PREVIEW-1 | **build** | L | Highest trust value; needs a decision/execution-split refactor first (own sprint). |
| DIGEST-1 | **build** | S–M | Cheap visibility win — activity-log data already exists; lower priority than PREVIEW-1. |
| OPS-5 | **defer** | M | Narrow to rate-aware backoff; drop quiet-hours; promote only on a real throttling report. |
| REVIEWER-3 | **drop** | M | Redundant with branch-protection code-owner auto-request; parser cost + write-blast not justified. |
| REVIEWER-4 | **drop** | S | Redundant with shipped Story 5.1 ping at strictly higher (public-comment) social blast. |

**Net:** 2 build (PREVIEW-1, DIGEST-1) → Ready; 1 defer (OPS-5, narrowed) → 🧊; 2 drop (REVIEWER-3, REVIEWER-4) → 🧊.
