# Auto-Rebaser V2 — Implementation Plan
_Drafted: 2026-05-07_
_Revised: 2026-05-07 (post Opus + Sonnet review — major reshape)_
_Status: 📝 ready for execution_

> **Scope:** Multi-account on GitHub + 2.5 filter + 2.4 desktop notifications + 5.2 GitHub-only push-since-approval. Marketplace listing (MP-1) ships *now* against v1.0.2 in parallel — not gated on V2 work. GitLab (GL-1) deferred to **v3.0.0** as its own major version.
> **Out of scope for V2:** GitLab provider, full `ProviderAdapter` interface, cross-provider 5.2, monetization, backend.

## Why this shape (post-review summary)

The first draft of this plan grouped GitLab + multi-account + polish + Marketplace into a single A→E cascade taking 22–28 dev days / 6–10 calendar weeks. Strategic review (Opus) flagged three problems:

1. **MP-1 was gated for no reason** — Marketplace listing review takes 5–10 business days regardless of code state. Shipping it now against v1.0.2 captures that wait time at zero opportunity cost.
2. **GitLab is a major version, not a wave.** Build cost of 7–10 days hides ongoing solo-dev maintenance of a second provider with materially different semantics (rebase async, discussions vs threads, MWPS vs auto-merge, project-id vs owner/repo). Better validated by waiting until v2 has install-base demand signals.
3. **Multi-account is the real V2 headline.** Work-GitHub + personal-GitHub is the dominant user need. It deserves to be the v2.0.0 anchor, not co-promoted with GitLab.

Tactical review (Sonnet) flagged two blocking errors in the original plan that are fixed below:
- Migration missed `resolved_threads` + `etags` keys (would cause silent stale-reads).
- `per_account_settings` exceeds `chrome.storage.sync`'s 8 KB-per-key quota at 2–3 accounts.

Plus four runbook corrections (PKCE redirect language, scope encoding, version regex, Firefox redirect URI) — applied to the relevant runbook files.

## Roadmap shape

| Track | Scope | Effort | Calendar |
|---|---|---|---|
| **MP-1 immediate** (parallel to V2) | GitHub Marketplace listing against current v1.0.2 | 2 dev days + 5–10 biz day review | starts now |
| **Sprint 1 — v2.0.0** | A-lite + 3.2 multi-account (GitHub-only) + 2.5 filter + 2.4 desktop notifications (pulled forward from Sprint 2) + tactical fixes | 8–11 dev days | after Sprint 1 PRs land + store reviews |
| **Sprint 2 — v2.1.0** | 5.2 push-since-approval (GitHub-only, actionable) | 2 dev days | follows v2.0.0 stability period (~2 wks) |
| **v3.0.0 — future** | Full `ProviderAdapter` + GitLab provider + cross-provider 5.2 | 10–14 dev days | gated on v2 demand signal |

Total V2 work: **~14 dev days** (down from 22–28). Each sprint is independently shippable. v3 decision deferred until v2 is in users' hands.

---

## MP-1 — GitHub Marketplace listing (ship now)

**Trigger:** ready immediately. No code change needed; the GitHub App registration from v1.0.x is the basis.

**Steps:** see `docs/runbooks/marketplace-listing.md`. Net effort:
- 1 day prep: capture v1.0.2 screenshots at 1280×640 for Marketplace, draft `docs/TERMS.md` (template in the runbook), confirm ToS URL serves at HTTP 200.
- 1 day submit: convert App registration to Marketplace listing, fill listing copy, submit for review.
- 5–10 biz days wait: GitHub manual review.

**Exit:** Marketplace badge in `README.md`; `BACKLOG.md` §7 entry. No code touched.

---

## Sprint 1 — v2.0.0

**Goal:** A user can sign in to multiple GitHub accounts (work + personal) and switch between them, plus filter the popup view by repo or org.

### Wave A-lite — Storage shape change

Minimal abstraction. **Not** a full `ProviderAdapter` — just enough to nest v1's existing single-account state under per-account keys.

#### v1 → v2 storage shape

```jsonc
// chrome.storage.local
V1:
{ auth, pr_store, activity, pingedPRs, resolved_threads, etags }

V2:
{
  storage_version: 2,
  active_account_id: "gh_brady",
  accounts: {
    "gh_brady": { auth, pr_store, activity, pingedPRs, resolved_threads }
  },
  _migration_backup_v1: { ...all v1 keys, backed_up_at: <ts> }
}
// `etags` is dropped on migration (regenerable on next poll cycle)
```

```jsonc
// chrome.storage.sync — quota-aware
V2:
{
  storage_version: 2,
  global_settings: { intervalMinutes, ignoredRepos, enableKeyboardShortcuts },
  // Per-account stored under SEPARATE KEYS to stay under the
  // chrome.storage.sync 8 KB-per-key quota:
  "per_account_settings:gh_brady": { ...automation toggles + opt-out lists },
  "per_account_settings:gh_brady_personal": { ... },
  // Discovery: list keys matching the prefix.
  per_account_settings_index: ["gh_brady", "gh_brady_personal"]
}
```

The per-key split (vs. one nested object) is required because Chrome's `storage.sync.QUOTA_BYTES_PER_ITEM` = 8,192 bytes. A user with 2 accounts and ~15 opt-out repos per automation per account exceeds this in the nested-object form. Per-key splitting gives each account its own 8 KB budget; total `storage.sync` quota is 100 KB so we comfortably fit ≥10 accounts.

See `docs/runbooks/multi-account-migration.md` for the migration procedure (fixed: now includes `resolved_threads` + `etags`).

#### Refactor scope

Strict minimum:
- New `src/core/storage/multi-account.ts` reads/writes the new shape.
- `src/core/auth/index.ts` becomes the facade; existing `src/core/auth*.ts` files keep their internals but route through the facade with an explicit `accountId` parameter.
- `src/background/automations/*` modules accept an `accountId` and read scoped state.
- `PRRecord` keeps its v1 shape — no `provider` discriminator yet (deferred to v3).

**Effort:** 3 dev days. One PR.

### Wave B — Multi-account UX

Three parallel tracks once Wave A-lite is merged:

**B1 — Account-switcher header.** Avatar in popup-header becomes a dropdown: list signed-in accounts + "+ Add account" + "Sign out current account". Clicking an account name flips `active_account_id` and the popup re-reads.

**B2 — Per-account vs global settings split.** Settings page splits the existing toggle pile into:
- Global (cross-account): `intervalMinutes`, `ignoredRepos`, `enableKeyboardShortcuts`.
- Per-account: `autoDeleteMergedBranch`, `autoEnableAutoMerge`, `mergeMethodPreference`, `autoResolveOutdatedThreads`, `enableStaleBadge`, `enablePingReviewers`, all opt-out lists.

**B3 — Activity log filter chip.** "This account" / "All accounts". Default: this account.

**Effort:** 5–7 dev days across 3 tracks (parallel).

### Story 2.5 — Filter by repo/org

Filter chip in the popup header (multi-select). Persists per-account. Filters display only — does NOT change polling.

**Effort:** 1.5 dev days, single track. Can run in parallel with B-tracks.

### Sprint 1 acceptance

_Status as of 2026-05-10 (post-2.4 #99 merge):_

- [x] Sign in to two GitHub accounts; both poll independently; combined badge count. — _code path shipped (poll-cycle iterates `listAccountIds()`); manual smoke pending._
- [x] Switch active account; popup reflects only that account's PRs. — _shipped via B1 #94._
- [x] Filter to 2 repos out of 30 PRs; clearing filter restores all. — _shipped via 2.5 #98._
- [x] Migration smoke-tested with v1.0.2 fixture (full key set, including `resolved_threads` + `etags`). — _unit-tested in `tests/core/storage/migration.test.ts`; manual real-fixture smoke still pending pre-release._
- [x] All v1 tests still pass + new tests cover account-switcher + filter. — _814 tests passing as of #99._
- [x] Coverage flat or up. — _95.61 / 90.04 / 95.61 / 95.61, all over the 95/88/95/95 thresholds._
- [x] Bundle delta < 5%. — _popup 190.7 kB (pre-B1) → 195.2 kB (post-2.4) ≈ +2.4 %._

Plus pulled-forward from Sprint 2:
- [x] Desktop notification fires on a sandbox PR rebase; throttled on the second event within 1 hr. — _shipped via 2.4 #99 (`notifications.ts` + dispatch in `poll-cycle` + `PingConfirmView`); manual smoke pending pre-release._

Remaining before cutting v2.0.0: manual two-account smoke pass, listing rewrites (MKT-1), version bump per `docs/runbooks/v2-release.md`.

### Sprint 1 release

Cut **v2.0.0**. See `docs/runbooks/v2-release.md`. Submit to Chrome + Firefox stores in parallel.

---

## Sprint 2 — v2.1.0 (polish)

**Trigger:** v2.0.0 has been live in stores for ~2 weeks with no critical migration bugs reported.

> **5.2 scope decision (2026-05-10):** The §🧊 drop applied to the **surfacing-only** flavor (badge with no action), which branch-protection's "Dismiss stale approvals on new commits" already covers. The **actionable** flavor below is a different feature: branch protection dismisses approvals but does **not** auto-re-request review, so the author still has to nag manually. Sprint 2 ships the actionable form. Implementation reuses the 5.1 PingConfirmView pattern almost 1:1, so the 2-day estimate stands.

### Story 2.4 — Desktop notifications _(shipped early in Sprint 1 — PR #99, 2026-05-10)_

Per-event opt-in toggles for: rebased, conflicted, merged-and-deleted, idle, ping-confirmed.

- New `notifications` permission in `optional_permissions`. Requested at runtime when user enables the feature.
- Throttle: 1 hr per (PR, event) tuple. Stored at `accounts.<id>.notif_throttle`.
- Default: OFF. Settings UI groups under existing automations section.

**Effort:** 1.5 dev days.

### Story 5.2 — Push-since-approval (GitHub-only, actionable)

GitHub-only because the GitLab path's only "action" would be posting an `@reviewer` mention comment (no native re-request API), which is a degraded UX masquerading as cross-provider parity. Revisit with GL-1 in v3.

- **Detect:** poll `pull_request.commits` and compare to most-recent approving review timestamp. If commits exist after approval, badge = "stale approval" (`! re-review` chip on the PR row).
- **Action:** click chip → confirm modal (mirror of ping-reviewers) → `POST /repos/.../pulls/{n}/requested_reviewers` (idempotent re-request).
- Default: badge ON; action OFF.

**Effort:** 2 dev days.

### Sprint 2 acceptance

- [ ] Desktop notification fires on a sandbox PR rebase; throttled on the second event within 1 hr.
- [ ] Stale-approval badge appears within 1 poll cycle of a push-after-approval scenario; cleared after re-request.
- [ ] No regressions in v2.0.0 acceptance tests.

### Sprint 2 release

Cut **v2.1.0**. Same store-resubmission flow as v2.0.0.

---

## v3.0.0 — GitLab provider (future)

**Triggered by demand**, not schedule. v2 install base + issue-tracker requests determine whether this is worth the maintenance burden.

### Why deferred

| Cost | Detail |
|---|---|
| Build | 7–10 dev days for the adapter alone |
| Ongoing | Two providers with materially different semantics (async rebase, discussions, MWPS, approval-rule shapes); each future feature needs cross-provider implementation |
| Architectural debt | Forces a full `ProviderAdapter` interface + dual-shape PR/MR records across the entire UI |
| Auth UX | Second OAuth Application registration flow + self-hosted instance pattern for users |

### Scope (when triggered)

See `docs/runbooks/gitlab-app-setup.md`. v3.0.0 ships:
- gitlab.com only (self-hosted GitLab deferred to v3.1)
- Rebase + branch-delete + comment (matches v1's GitHub set)
- **Deferred to v3.1:** auto-merge (MWPS shape mismatch), thread-resolve (discussions shape mismatch)

### v3 architectural prerequisite

Promote A-lite to a full `ProviderAdapter` interface. The v2 multi-account storage shape stays — GitLab accounts slot in as `accounts.gl_<host>_<login>`.

---

## Runbooks

- `docs/runbooks/marketplace-listing.md` — MP-1 (immediate)
- `docs/runbooks/multi-account-migration.md` — Sprint 1 (fixed: includes `resolved_threads` + `etags`; per-key sync split)
- `docs/runbooks/v2-release.md` — Sprint 1 + 2 release flow (fixed: version regex)
- `docs/runbooks/gitlab-app-setup.md` — v3.0.0 (deferred; tactical fixes applied)

## Open questions deferred to v3 (not blocking V2)

1. GitLab self-hosted in v3.0 vs. v3.1?
2. Cross-provider 5.2 worth implementing in v3, or leave as GitHub-only feature?

## Sprint 1 decisions (resolved 2026-05-07)

1. **Migration UX:** one-time banner explaining multi-account on first v2 launch (not a silent toast). Dismissible; never shown again after dismissal.
2. **Wave B parallelism:** dispatch 3 parallel tracks (B1 switcher / B2 settings split / B3 activity filter) once Wave A-lite is merged.
3. **`etags` on migration:** dropped. Regenerated on next poll cycle (full-body response once per endpoint per account, then back to 304s).
