// src/core/automations-store.ts
// Phase 2 storage layer for automation settings and resolved-threads map.

import type { AutomationSettings, MergeMethod, ResolvedThreadsStore } from './automations-types';
import { DEFAULT_AUTOMATION_SETTINGS } from './automations-types';
import { AUTOMATION_STORAGE_KEYS } from './automations-constants';
import {
  readAccountKey,
  writeAccountKey,
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

const GLOBAL_KEYS = ['ignoredRepos', 'enableKeyboardShortcuts'] as const;
type GlobalKey = typeof GLOBAL_KEYS[number];

function isGlobalKey(k: string): k is GlobalKey {
  return (GLOBAL_KEYS as readonly string[]).includes(k);
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
  // Prefer the v2 split shape (global + per-account).
  const ignoredRepos = await getGlobalSetting('ignoredRepos');
  const enableKeyboardShortcuts = await getGlobalSetting('enableKeyboardShortcuts');
  const perAccount = await readPerAccountSettings();

  if (
    ignoredRepos !== undefined ||
    enableKeyboardShortcuts !== undefined ||
    Object.keys(perAccount).length > 0
  ) {
    const merged: AutomationSettings = {
      ...DEFAULT_AUTOMATION_SETTINGS,
      ...perAccount,
      ...(ignoredRepos !== undefined ? { ignoredRepos } : {}),
      ...(enableKeyboardShortcuts !== undefined ? { enableKeyboardShortcuts } : {}),
    };
    return merged;
  }

  // Pre-migration / test fallback — single v1 key.
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
  // Split into global + per-account writes.
  await setGlobalSetting('ignoredRepos', s.ignoredRepos);
  await setGlobalSetting('enableKeyboardShortcuts', s.enableKeyboardShortcuts);

  const perAccount: Partial<PerAccountSettings> = {};
  for (const [k, v] of Object.entries(s)) {
    if (!isGlobalKey(k)) {
      (perAccount as Record<string, unknown>)[k] = v;
    }
  }

  const id = await getActiveAccountId();
  if (id) {
    await writePerAccountSettings(perAccount);
  } else {
    // Pre-migration / tests with no active account: fall back to v1 single-key write
    // so existing flows keep working until migration runs.
    await chrome.storage.sync.set({ [AUTOMATION_STORAGE_KEYS.settings]: s });
  }
}

export async function getResolvedThreads(): Promise<ResolvedThreadsStore> {
  const stored = await readAccountKey('resolved_threads');
  return stored ?? {};
}

export async function saveResolvedThreads(s: ResolvedThreadsStore): Promise<void> {
  await writeAccountKey('resolved_threads', s);
}
