// DIGEST-1 — pure aggregation over the existing activity-log store.
//
// No IO, no clock read, no storage/settings reads: `computeDigest` is a pure
// function of its `entries` argument and an injected `now` (the impure boundary
// lives in `useDigest`). This mirrors `ActivityLogView.formatTime(at, now)`'s
// injection discipline and keeps the aggregation deterministic + unit-testable.

import type { ActivityAction, ActivityEntry } from './activity-log-types';

/** Default rolling window for the "this week" digest. */
export const DEFAULT_DIGEST_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Per-action result tally within the digest window. */
export interface DigestActionCount {
  action: ActivityAction;
  success: number;
  failed: number;
  skipped: number;
  /** success + failed + skipped. */
  total: number;
}

export interface ActivityDigest {
  windowDays: number;
  /** Epoch ms lower bound (inclusive): entries with `at >= since` are counted. */
  since: number;
  /** Sum of every `byAction[].total`. */
  totalActions: number;
  /** Per-action tallies, sorted total-desc then action-asc. Zero-count actions are omitted. */
  byAction: DigestActionCount[];
  /** The headline number: `rebase` actions that succeeded in-window. */
  rebaseSuccess: number;
}

/**
 * Aggregate activity-log entries into a windowed per-action digest. `now` is
 * REQUIRED (injected) — the function performs no clock read of its own.
 */
export function computeDigest(
  entries: ActivityEntry[],
  opts: { windowDays?: number; now: number },
): ActivityDigest {
  const windowDays = opts.windowDays ?? DEFAULT_DIGEST_WINDOW_DAYS;
  const since = opts.now - windowDays * DAY_MS;

  const byActionMap = new Map<ActivityAction, DigestActionCount>();
  for (const e of entries) {
    if (e.at < since) continue; // inclusive lower bound: `e.at >= since` is in-window
    let count = byActionMap.get(e.action);
    if (!count) {
      count = { action: e.action, success: 0, failed: 0, skipped: 0, total: 0 };
      byActionMap.set(e.action, count);
    }
    if (e.result === 'success') count.success++;
    else if (e.result === 'failed') count.failed++;
    else count.skipped++; // 'skipped' — the only remaining ActivityResult
    count.total++;
  }

  const byAction = [...byActionMap.values()].sort(
    (a, b) => b.total - a.total || a.action.localeCompare(b.action),
  );
  const totalActions = byAction.reduce((sum, c) => sum + c.total, 0);
  const rebaseSuccess = byActionMap.get('rebase')?.success ?? 0;

  return { windowDays, since, totalActions, byAction, rebaseSuccess };
}
