# Phase 5 — Companion automations (final design)

_2026-05-02 · status: ✅ shipped (v0.2.1 → v1.0.x; 5.1, 5.4, 5.5, 5.6 all on `main`). Frozen reference; `src/` and `docs/superpowers/BACKLOG.md` §7 are authoritative._

Four additions in the spirit of 2.6–2.9: same shape (poll-driven, deterministic, per-repo opt-out, kill-switch defaulted-OFF for any new write action), no admin scope, no backend, **all UI lives in the toolbar popup**.

- **5.1** Stale-PR badge + ping-reviewers
- **5.4** Smart merge-method selection
- **5.5** Keyboard shortcuts in popup
- **5.6** Activity log

## Decisions captured during review

- **Dropped: 5.2 push-since-approval.** GitHub natively dismisses stale approvals via branch protection rule when admins enable it. Surfacing-only adds complexity without unique value.
- **Dropped: 5.3 flaky-CI auto-retry.** Strong feature on its own, but not the right time — supporting infrastructure is sized for a headline release, not a polish bundle.
- **Simplified: 5.4.** Original "per-repo override list" replaced by automatic resolution against the repo's GitHub-configured allowed methods + a single user-preference order. Cuts UI surface, eliminates a configuration step, matches user expectation.
- **Added: 5.6 activity log.** Originally proposed as part of 5.3; promoted to a standalone story because it provides immediate value for the existing 5 write actions plus the new 5.1 ping. Also unblocks any future write-action automation by giving it logging for free.
- **UI constraint reaffirmed:** all surfaces stay in the toolbar popup. Modals become full-popup views with a back button. No content scripts, no options page, no `chrome.windows.create` secondary windows.

---

## 5.1 Stale-PR badge + ping-reviewers

### What

Surface idle days on your own PRs and offer an opt-in one-click reviewer ping.

### Why it fits

Read-only by default. Acts only on YOUR PRs. The one write action (`ping`) requires an explicit confirmation modal.

### System design

**No new endpoints.** PR detail already includes `updated_at` (any activity: commit, comment, review). Compute idle days at poll time:

```ts
type PRRecordPhase5 = {
  staleness?: {
    idleDays: number;
    lastActivityAt: number; // pr.updated_at parsed
  };
};
```

In `runPollCycle`, after fetching detail:

```ts
const idleDays = Math.floor((Date.now() - new Date(detail.updated_at).getTime()) / 86400_000);
const threshold = settings.staleThresholdOverrides[fullName] ?? settings.staleThresholdDays;
if (idleDays >= threshold) record.staleness = { idleDays, lastActivityAt };
```

State machine impact: **none**. `staleness` is additive metadata.

`hasAttention` interaction: by default, stale does NOT trigger the orange repo-group dot. Opt-in setting `staleCountsAsAttention` (default `false`) lets users escalate.

**Ping action:**
- POST `/repos/{owner}/{repo}/issues/{number}/comments` with `{ body }`.
- Body from configurable template, default: `"Friendly bump — could you take a look when you have a moment?"`.
- Throttle: store `lastPingedAt` per PR in `chrome.storage.local`. Disable button for 24h after a ping; show "pinged Xh ago" in the row.

### Storage

```ts
// settings (chrome.storage.sync)
{
  staleThresholdDays: 14,                              // default 14, options 7/14/30/60
  staleThresholdOverrides: { "acme/longcycle": 30 },
  staleCountsAsAttention: false,
  enableStaleBadge: true,
  enablePingReviewers: true,
  pingTemplate: "Friendly bump — could you take a look?",
}

// throttle (chrome.storage.local)
{
  pingedPRs: { [prId]: { at: number } },
}
```

### UI design (popup-only)

**PR row:**
```
acme/api  #142  Refactor session storage
[current] [idle 14d]                ping ↗
```

- `idle Nd` badge: muted amber pill, lighter weight than the state badge.
- 7–30d: amber. >30d: deeper amber/orange (still distinct from red `conflict`).
- Format degrades past 7d: `idle 14d` → `idle 3w` → `idle 2mo`.
- `ping ↗` shows only when `enablePingReviewers` is on, ≥1 requested reviewer, no recent ping.

**Ping confirmation** (full-popup view, replaces main content; back arrow returns):
```
← Ping reviewers on acme/api #142

Will post:
  "Friendly bump — could you take a look
   when you have a moment?"

To: @octocat, @hubot

[ Cancel ]            [ Post comment ]
```

Confirmation step is non-negotiable — public comments on someone else's review queue are visible-to-others actions.

**Settings panel** (under automations, popup-only):
- Toggle: "Show stale badge" (default ON, read-only, safe).
- Discrete options: stale threshold (7 / 14 / 30 / 60 days, default 14).
- Toggle: "Treat stale as attention" (default OFF).
- Toggle: "Show ping-reviewers button" (default ON).
- Textarea: ping template, with help text mentioning supported placeholders.
- Standard "Skip repos" + per-repo threshold override list.

### Effort

~6 hours. ~12 new tests.

---

## 5.4 Smart merge-method selection

### What

Auto-merge picks the right merge method per repo automatically, using the repo's GitHub-configured allowed methods plus a single user-preference order.

### Why the original design was wrong

Original 5.4 added a per-repo override map. Redundant: GitHub already exposes per-repo allowed methods (`allow_squash_merge`, `allow_merge_commit`, `allow_rebase_merge`) via `GET /repos/{owner}/{repo}`. The right design is to consume that signal and pick the first user-preferred method the repo allows.

### System design

**One existing endpoint** (`GET /repos/{owner}/{repo}`) we already call. Cache the three boolean fields per-repo in the existing repo cache.

**Resolution:**

```ts
type AutomationSettings = {
  // existing field renamed for clarity:
  mergeMethodPreference: MergeMethod[]; // e.g. ['SQUASH', 'REBASE', 'MERGE'], default in this order
};

function resolveMergeMethod(
  preference: MergeMethod[],
  repo: { allow_squash_merge: boolean; allow_merge_commit: boolean; allow_rebase_merge: boolean },
): MergeMethod | null {
  for (const method of preference) {
    if (method === 'SQUASH' && repo.allow_squash_merge) return 'SQUASH';
    if (method === 'MERGE' && repo.allow_merge_commit) return 'MERGE';
    if (method === 'REBASE' && repo.allow_rebase_merge) return 'REBASE';
  }
  return null; // no allowed method matches preference; surface in UI
}
```

`runEnableAutoMerge` consults this for each PR.

**Edge case:** preference is `['SQUASH']` only and repo doesn't allow squash → no method matches → surface a small "auto-merge skipped: no method allowed" badge on the PR row, do not error.

**Migration:** existing `autoMergeMethod: MergeMethod` setting maps to `mergeMethodPreference: [oldValue, ...rest in default order]` on first load. One-line shim.

### UI design (popup-only)

**Auto-merge settings block:**

```
Auto-enable auto-merge          [ on ]

Method preference (drag to reorder)
─────────────────────────────────────────────
≡  squash    ☑
≡  rebase    ☑
≡  merge     ☑
─────────────────────────────────────────────
The first allowed method per repo wins.

Skip repos
[ acme/legacy   ✕ ]
[ + Add repo ]
```

Drag-to-reorder is the canonical pattern; if drag is too heavy, fall back to per-row up/down arrows. Each row has an enable checkbox so users can disable methods entirely.

**PR row treatment** (when no method matches):
```
acme/legacy  #88  Update deps
[current]    auto-merge skipped: no allowed method
```

Tooltip explains: "This repo allows only [merge commits]; your preference doesn't include it."

### Effort

~3 hours (a hair more than the original 2h because of the preference-list UI). ~6 new tests.

---

## 5.5 Keyboard shortcuts in popup

### What

Vim-style and standard keys for popup navigation. Popup-scope only (not `chrome.commands`).

### System design

A single `useKeyboardShortcuts` hook on the popup root attaches a `keydown` listener. Skipped when `event.target` is editable (input, textarea, select, `contentEditable`).

```ts
const SHORTCUTS = {
  r: () => sendMessage({ type: 'POLL_NOW' }),
  s: () => navigate('settings'),
  Escape: () => navigate('back'),
  '?': () => setHelpOpen(true),
  j: () => focusNextRow(),
  k: () => focusPrevRow(),
  Enter: () => openFocusedRow(),
};
```

Focus management:
- `focusedPRId: number | null` in popup state.
- `j` / `k` cycles through visible rows. Skips PRs in collapsed repo groups.
- `Enter` calls `chrome.tabs.create({ url: focusedPR.url })`.
- Visual focus indicator via `data-focused="true"` attribute + CSS rule.

### UI design (popup-only)

**Help overlay** (full-popup view, triggered by `?`):

```
← Keyboard shortcuts

  r       Refresh
  s       Settings
  Esc     Back
  j / k   Next / prev PR
  Enter   Open PR
  ?       This help
```

**Footer hint:** small `?` icon at the right edge of the existing footer opens the help view. Discoverable but not noisy.

**Settings:** single toggle "Enable keyboard shortcuts" (default ON). No per-shortcut configuration.

### Effort

~4 hours. ~8 new tests.

---

## 5.6 Activity log

### What

A persistent, browser-local record of every write action the extension takes — rebases, branch deletions, auto-merge enables, thread resolves, notification dismissals, and (new in 5.1) reviewer pings. Viewable in the popup. Capped at 200 entries / 30 days.

### Why it fits

Today, when the extension does something surprising, the user has zero way to investigate. The footer counter says "rebased 3 / deleted 1" but not which PRs or when. The activity log fills that gap — and pre-emptively gives any future write action (5.3-style flaky retry, anything else) a logging surface for free.

### Why `chrome.storage.local`

Considered alternatives:

| Option | Verdict |
|---|---|
| `chrome.storage.local` | ✅ optimal at our size class; matches existing project convention |
| `chrome.storage.session` | ❌ in-memory only; defeats audit purpose |
| `chrome.storage.sync` | ❌ 100KB total / 8KB per item / 1800 ops/hr cap; tokens-class data shouldn't sync |
| IndexedDB | ✅ correct shape, ❌ wrong scale — adds ~100 LOC of versioning ceremony for a 40KB log we read rarely |
| OPFS / chunked keys | ❌ micro-optimizations not worth the complexity |

If the log ever grows past ~5K entries or needs full-text search, IndexedDB becomes correct. Trivial migration when the time comes; not worth pre-paying.

### System design

**Storage shape** (under `chrome.storage.local` key `activity`):

```ts
type ActivityAction =
  | 'rebase'
  | 'branch_deleted'
  | 'auto_merge_enabled'
  | 'thread_resolved'
  | 'notification_dismissed'
  | 'reviewer_pinged';

type ActivityEntry = {
  at: number;           // epoch ms
  action: ActivityAction;
  repo: string;         // "owner/repo"
  prNumber: number;
  prTitle: string;      // captured at action time; PR titles change
  result: 'success' | 'failed';
  errorMessage?: string;
  // Action-specific fields (small, optional):
  branchRef?: string;        // for branch_deleted
  mergeMethod?: MergeMethod; // for auto_merge_enabled
  threadId?: string;         // for thread_resolved
  reviewers?: string[];      // for reviewer_pinged
};

type ActivityStore = { entries: ActivityEntry[] };
```

**Write path: once per poll cycle, not per action.** The orchestrator already aggregates results from every adapter at the end of `runPollCycle`. It mints `ActivityEntry` rows from those results and does **one** read-modify-write at the end:

```ts
async function appendActivity(newEntries: ActivityEntry[]) {
  if (newEntries.length === 0) return;
  try {
    const { entries = [] } = await chrome.storage.local.get('activity');
    const merged = [...entries, ...newEntries];
    const trimmed = trimByCapAndAge(merged, 200, 30 * 86400_000);
    await chrome.storage.local.set({ activity: { entries: trimmed } });
  } catch (err) {
    console.error('[activity] append failed:', err);
    // Non-fatal — automations proceed; we lose this cycle's audit rows.
  }
}

function trimByCapAndAge(entries: ActivityEntry[], maxN: number, maxAgeMs: number): ActivityEntry[] {
  const cutoff = Date.now() - maxAgeMs;
  return entries.filter(e => e.at >= cutoff).slice(-maxN);
}
```

This eliminates concurrent-write races (one write per cycle, not one per adapter), keeps existing adapters untouched, and bounds storage at predictable size.

**Failure mode acceptance:** if `chrome.storage.local.set` throws (quota, transient corruption), we log to console and proceed. Audit gap for that cycle; automations still happen. Documented as a known limitation.

**Adapter changes: zero.** Each existing adapter already returns structured success/failure arrays. The orchestrator translates them into `ActivityEntry[]` at the end of the cycle. No `appendActivity` calls scattered through the business logic.

**Reading:** the activity-log view does one `chrome.storage.local.get('activity')` on mount.

### UI design (popup-only)

**Activity log view** (full-popup view, replacing main content; back arrow returns):

```
← Activity log
─────────────────────────────────────────────
[ All ▾ ]  [ All repos ▾ ]      [ Clear log ]
─────────────────────────────────────────────
14:23  acme/api #142
       rebase · success

14:21  acme/api #138
       branch_deleted · 'feat/checkout' · success

13:55  acme/legacy #88
       auto_merge_enabled · squash · failed
       "no allowed method"

13:18  acme/web #99
       reviewer_pinged · @octocat, @hubot · success

(... infinite scroll up to 200 entries / 30 days ...)
```

- **Action filter:** dropdown with `All / rebase / branch_deleted / auto_merge_enabled / thread_resolved / notification_dismissed / reviewer_pinged`.
- **Repo filter:** dropdown populated from log contents.
- **Clear log:** confirmation dialog ("This deletes Activity history. Cannot be undone."). Replaces stored `activity` with empty entries array.
- **Empty state:** "No activity yet. The extension logs every automated action here."
- Timestamps relative for entries within the last hour ("23m ago"), absolute thereafter.

**Entry point — clickable footer counter:** the existing PR-list footer line (`rebased 3 · deleted 1`) becomes clickable. Click opens the activity log filtered to today's entries. The plain "view activity (37)" link is the secondary entry point next to it.

**Settings panel:** no toggle to disable. The log is always on; users who want it gone use "Clear log". Disabling the log itself would create a footgun ("why didn't this get logged?") and saves negligible storage.

### Privacy

`PRIVACY.md` gains one bullet under "What we store, where, and why":

> | Activity log (action, repo, PR number, PR title, result, timestamp) | `chrome.storage.local` | Audit trail for automated actions. Capped at 200 entries / 30 days. Cleared on demand via "Clear log". Never synced. |

The log holds the same data class as the existing PR cache, with one new property: **30-day retention after PRs close or repos go private**. Users can purge at any time.

### Acceptance Criteria

- [ ] Every write action (rebase, branch delete, auto-merge enable, thread resolve, notification dismiss, reviewer ping) generates exactly one log entry per occurrence
- [ ] Failed actions log with `result: 'failed'` and an `errorMessage`
- [ ] Log writes happen **once per poll cycle**, not once per action (verified by test)
- [ ] Log automatically trims to ≤ 200 entries and entries < 30 days old
- [ ] Activity-log view loads in <100ms with a full 200-entry log
- [ ] Action filter and repo filter narrow displayed entries client-side
- [ ] "Clear log" confirms before deleting and empties the store
- [ ] Footer counter line is clickable and opens the log filtered to today
- [ ] Storage write failure is non-fatal; automations continue, error logged to console
- [ ] No log entries written for read-only operations (status checks, polls, ETag-cached responses)

### Effort

~7 hours. ~15 new tests (orchestrator translation, trim logic, filter behavior, clear flow, empty state, click-through from footer).

---

## Combined effort & sequencing

| Story | Effort | Risk |
|---|---|---|
| 5.4 Smart merge method | 3h | trivial |
| 5.5 Keyboard shortcuts | 4h | low |
| 5.1 Stale-PR + ping | 6h | medium (ping confirmation UX) |
| 5.6 Activity log | 7h | low (single new view + orchestrator hook) |

**Total: ~20 hours / ~3 days.**

### Recommended sequencing

Ship Phase 5 as a single release riding alongside or just after Phase 4 (enterprise auth).

- 5.6 first — it's foundational and gives 5.1's new ping action a logging surface from day one.
- 5.4 + 5.5 are zero-risk polish — pull these in next.
- 5.1 ships last — read-only by default; the only write action (ping) has explicit confirmation, and 5.6 is in place to log it.

If Phase 4 (GitHub App auth) is mid-flight, slot Phase 5 for v0.2.1 immediately after. If Phase 4 is delayed, Phase 5 can ship as v0.2.0 standalone.

## Dropped from this phase (recorded for history)

- **5.2 push-since-approval** — GitHub branch protection covers this when admins opt in; surfacing-only doesn't carry its weight.
- **5.3 flaky-CI auto-retry** — strong standalone feature, but the supporting infrastructure (pattern editor, activity log, App permission bump) is sized for a headline release. Revisit if/when flaky-CI becomes the explicit Pro-tier anchor.
