// src/core/automations-store.ts
// Phase 2 storage layer for automation settings and resolved-threads map.

import type { AutomationSettings, MergeMethod, ResolvedThreadsStore } from './automations-types';
import { DEFAULT_AUTOMATION_SETTINGS } from './automations-types';
import { AUTOMATION_STORAGE_KEYS } from './automations-constants';
import {
  readAccountKey,
  writeAccountKey,
  readAccountKeyFor,
  writeAccountKeyFor,
  getActiveAccountId,
  getGlobalSetting,
  setGlobalSetting,
  STORAGE_KEYS_V2,
  type PerAccountSettings,
} from './storage/multi-account';

/**
 * Story 5.4 migration — legacy `autoMergeMethod: MergeMethod` becomes the
 * first entry in `mergeMethodPreference`, with the remaining default methods
 * appended in default order.
 */
function migrateMergeMethod(stored: Record<string, unknown>): MergeMethod[] | undefined {
  const legacy = stored.autoMergeMethod as MergeMethod | undefined;
  if (!legacy) return undefined;
  const rest = DEFAULT_AUTOMATION_SETTINGS.mergeMethodPreference.filter((m) => m !== legacy);
  return [legacy, ...rest];
}

// OPS-3 — the SINGLE source of truth for which automation settings live in the
// shared global blob (vs per-account). isGlobalKey, the save loop, both read
// paths, AND migration's strip + promotion all derive from this tuple — so
// adding/removing a global key is a one-line change with no drift. (The
// `Settings`-sourced globals — intervalMinutes/enterpriseHost/enterpriseClientId
// — are deliberately NOT here; they have their own save path.)
export const GLOBAL_AUTOMATION_KEYS = ['ignoredRepos', 'enableIgnoredRepos', 'enableKeyboardShortcuts'] as const;
type GlobalKey = typeof GLOBAL_AUTOMATION_KEYS[number];

function isGlobalKey(k: string): k is GlobalKey {
  return (GLOBAL_AUTOMATION_KEYS as readonly string[]).includes(k);
}

// Read every global automation key into a partial (only the ones actually
// stored). Used by both getAutomationSettings and getAutomationSettingsFor so
// the global read set can never drift from the write set.
async function readGlobalAutomationSettings(): Promise<Partial<AutomationSettings>> {
  const out: Partial<AutomationSettings> = {};
  for (const k of GLOBAL_AUTOMATION_KEYS) {
    const v = await getGlobalSetting(k);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

async function readPerAccountSettings(): Promise<Partial<PerAccountSettings>> {
  const id = await getActiveAccountId();
  if (!id) return {};
  const key = `${STORAGE_KEYS_V2.perAccountSettingsPrefix}${id}`;
  const result = await chrome.storage.sync.get(key);
  return ((result ?? {})[key] ?? {}) as Partial<PerAccountSettings>;
}

async function writePerAccountSettings(patch: Partial<PerAccountSettings>): Promise<void> {
  const id = await getActiveAccountId();
  if (!id) return; // pre-migration: handled via legacy write path below
  const key = `${STORAGE_KEYS_V2.perAccountSettingsPrefix}${id}`;
  const snap = await chrome.storage.sync.get([
    key,
    STORAGE_KEYS_V2.perAccountSettingsIndex,
  ]);
  const current = ((snap ?? {})[key] ?? {}) as Partial<PerAccountSettings>;
  const merged = { ...current, ...patch };
  const index = ((snap ?? {})[STORAGE_KEYS_V2.perAccountSettingsIndex] ?? []) as string[];
  const nextIndex = index.includes(id) ? index : [...index, id];
  await chrome.storage.sync.set({
    [key]: merged,
    [STORAGE_KEYS_V2.perAccountSettingsIndex]: nextIndex,
  });
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const id = await getActiveAccountId();

  if (id) {
    // v2 split shape — perAccount is the source of truth, with globals
    // (ignoredRepos, enableKeyboardShortcuts) shared across accounts.
    const perAccount = await readPerAccountSettings();
    const globals = await readGlobalAutomationSettings();
    const merged: AutomationSettings = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      ...perAccount,
      ...globals, // globals overlay perAccount (and a migrated perAccount value survives until promoted)
    };
    return merged;
  }

  // No active account — read from the v1 single-key fallback, mirroring the
  // save-side path (PR #106). Any populated `global_settings` here is leakage
  // from a pre-#106 build and is intentionally ignored; without this branch,
  // the v2 fork above would fire on the leaked globals, return DEFAULTS, and
  // silently drop the user's v1-blob settings (FOLLOWUP-3).
  const result = await chrome.storage.sync.get(AUTOMATION_STORAGE_KEYS.settings);
  const stored = ((result ?? {})[AUTOMATION_STORAGE_KEYS.settings] ?? undefined) as
    | (Partial<AutomationSettings> & { autoMergeMethod?: MergeMethod })
    | undefined;
  if (!stored) return { ...DEFAULT_AUTOMATION_SETTINGS };

  const merged: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, ...stored };
  if (!stored.mergeMethodPreference) {
    const migrated = migrateMergeMethod(stored as Record<string, unknown>);
    if (migrated) merged.mergeMethodPreference = migrated;
  }
  delete (merged as Partial<AutomationSettings> & { autoMergeMethod?: MergeMethod }).autoMergeMethod;
  return merged;
}

export async function saveAutomationSettings(s: AutomationSettings): Promise<void> {
  const id = await getActiveAccountId();
  if (!id) {
    // Pre-migration / no-active-account path — write the v1 single-key blob
    // and DO NOT touch global_settings. Writing the global half would make
    // the next getAutomationSettings take the v2 branch (because
    // global_settings is now defined) and return DEFAULTS — perAccount is
    // empty, so the v1 write below would be silently dropped on read.
    await chrome.storage.sync.set({ [AUTOMATION_STORAGE_KEYS.settings]: s });
    return;
  }

  // v2 path: split into global + per-account writes. Write EVERY global key from
  // the single tuple (incl. enableIgnoredRepos — the OPS-3 bug was it being
  // listed as global but never written, so it reverted to its default on read).
  for (const k of GLOBAL_AUTOMATION_KEYS) {
    // GlobalSettings[k] === AutomationSettings[k] for every tuple key (see the
    // GlobalSettings interface); TS can't correlate the union index across the
    // two types in a loop, so the value is asserted to the key's global type.
    await setGlobalSetting(k, s[k] as never);
  }

  const perAccount: Partial<PerAccountSettings> = {};
  for (const [k, v] of Object.entries(s)) {
    if (!isGlobalKey(k)) {
      (perAccount as Record<string, unknown>)[k] = v;
    }
  }
  await writePerAccountSettings(perAccount);
}

export async function getResolvedThreads(): Promise<ResolvedThreadsStore> {
  const stored = await readAccountKey('resolved_threads');
  return stored ?? {};
}

export async function saveResolvedThreads(s: ResolvedThreadsStore): Promise<void> {
  await writeAccountKey('resolved_threads', s);
}

/**
 * Explicit-id variant — reads automation settings for the named account
 * directly. Skips the legacy single-key v1 fallback (that path is popup-only).
 */
export async function getAutomationSettingsFor(accountId: string): Promise<AutomationSettings> {
  const key = `${STORAGE_KEYS_V2.perAccountSettingsPrefix}${accountId}`;
  const result = await chrome.storage.sync.get(key);
  const perAccount = ((result ?? {})[key] ?? {}) as Partial<PerAccountSettings>;
  const globals = await readGlobalAutomationSettings();
  return {
    ...DEFAULT_AUTOMATION_SETTINGS,
    ...perAccount,
    ...globals,
  };
}

export async function getResolvedThreadsFor(accountId: string): Promise<ResolvedThreadsStore> {
  const stored = await readAccountKeyFor(accountId, 'resolved_threads');
  return stored ?? {};
}

export async function saveResolvedThreadsFor(
  accountId: string,
  s: ResolvedThreadsStore,
): Promise<void> {
  await writeAccountKeyFor(accountId, 'resolved_threads', s);
}
