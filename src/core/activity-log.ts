// Story 5.6 — Activity log helpers.
// Single write per poll cycle: callers build an ActivityEntry[] then call appendActivity once.

import type { ActivityEntry } from './activity-log-types';
import {
  ACTIVITY_MAX_ENTRIES,
  ACTIVITY_MAX_AGE_MS,
} from './activity-log-types';
import { readAccountKey, writeAccountKey } from './storage/multi-account';

/**
 * Trim entries to satisfy both the cap (max N) and the age limit (max age ms).
 * Entries are assumed to be in ascending chronological order (oldest first).
 * Returns a new array — does not mutate the input.
 */
export function trimByCapAndAge(
  entries: ActivityEntry[],
  maxN: number = ACTIVITY_MAX_ENTRIES,
  maxAgeMs: number = ACTIVITY_MAX_AGE_MS,
  now: number = Date.now(),
): ActivityEntry[] {
  const cutoff = now - maxAgeMs;
  // Drop entries older than maxAgeMs first.
  const fresh = entries.filter((e) => e.at >= cutoff);
  // Then cap to the most-recent maxN.
  if (fresh.length > maxN) {
    return fresh.slice(fresh.length - maxN);
  }
  return fresh;
}

/**
 * Read-modify-write: appends newEntries to the stored log, trims, writes back.
 * Non-fatal: storage errors are logged to console.error but never thrown.
 * One call per poll cycle, not per action.
 */
export async function appendActivity(newEntries: ActivityEntry[]): Promise<void> {
  if (newEntries.length === 0) return;

  try {
    const store = await readAccountKey('activity');
    const existing: ActivityEntry[] = store?.entries ?? [];

    // Append new entries at the end (newer entries come last).
    const merged = [...existing, ...newEntries];
    const trimmed = trimByCapAndAge(merged);

    await writeAccountKey('activity', { entries: trimmed });
  } catch (err) {
    console.error('[activity] append failed:', err);
  }
}

/**
 * Replace the activity log with an empty entries array.
 * Used by the "Clear log" action in the popup.
 */
export async function clearActivity(): Promise<void> {
  await writeAccountKey('activity', { entries: [] });
}

/**
 * Load all stored entries.
 * Returns empty array when storage is missing or malformed.
 */
export async function loadActivity(): Promise<ActivityEntry[]> {
  try {
    const store = await readAccountKey('activity');
    return store?.entries ?? [];
  } catch {
    return [];
  }
}
