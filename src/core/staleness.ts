// Story 5.1 — stale-PR detection.

import type { AutomationSettings, StaleThresholdDays } from './automations-types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole-day count between `lastActivityAt` and `now`. Floors negative diffs
 * to 0 so a clock skew can't surface a negative idle count.
 */
export function computeIdleDays(lastActivityAt: number, now: number = Date.now()): number {
  const ms = now - lastActivityAt;
  if (ms <= 0) return 0;
  return Math.floor(ms / MS_PER_DAY);
}

/**
 * Resolve the threshold in days for a given repo: per-repo override wins,
 * otherwise the global default.
 */
export function resolveThreshold(
  repo: string,
  settings: Pick<AutomationSettings, 'staleThresholdDays' | 'staleThresholdOverrides'>,
): StaleThresholdDays {
  return settings.staleThresholdOverrides[repo] ?? settings.staleThresholdDays;
}

/**
 * Format an idle-day count for display. Degrades past a week into weeks/months
 * so "idle 67d" doesn't dominate the row.
 */
export function formatIdleDays(idleDays: number): string {
  if (idleDays < 7) return `idle ${idleDays}d`;
  if (idleDays < 30) return `idle ${Math.floor(idleDays / 7)}w`;
  return `idle ${Math.floor(idleDays / 30)}mo`;
}
