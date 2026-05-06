// src/core/automations-store.ts
// Phase 2 storage layer for automation settings and resolved-threads map.

import type { AutomationSettings, MergeMethod, ResolvedThreadsStore } from './automations-types';
import { DEFAULT_AUTOMATION_SETTINGS } from './automations-types';
import { AUTOMATION_STORAGE_KEYS } from './automations-constants';

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

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const result = await chrome.storage.sync.get(AUTOMATION_STORAGE_KEYS.settings);
  const stored = result[AUTOMATION_STORAGE_KEYS.settings] as
    | (Partial<AutomationSettings> & { autoMergeMethod?: MergeMethod })
    | undefined;
  if (!stored) return { ...DEFAULT_AUTOMATION_SETTINGS };

  const merged: AutomationSettings = { ...DEFAULT_AUTOMATION_SETTINGS, ...stored };
  if (!stored.mergeMethodPreference) {
    const migrated = migrateMergeMethod(stored as Record<string, unknown>);
    if (migrated) merged.mergeMethodPreference = migrated;
  }
  // Drop legacy field if present in returned object.
  delete (merged as Partial<AutomationSettings> & { autoMergeMethod?: MergeMethod }).autoMergeMethod;
  return merged;
}

export async function saveAutomationSettings(s: AutomationSettings): Promise<void> {
  await chrome.storage.sync.set({ [AUTOMATION_STORAGE_KEYS.settings]: s });
}

export async function getResolvedThreads(): Promise<ResolvedThreadsStore> {
  const result = await chrome.storage.local.get(AUTOMATION_STORAGE_KEYS.resolvedThreads);
  return (result[AUTOMATION_STORAGE_KEYS.resolvedThreads] as ResolvedThreadsStore) ?? {};
}

export async function saveResolvedThreads(s: ResolvedThreadsStore): Promise<void> {
  await chrome.storage.local.set({ [AUTOMATION_STORAGE_KEYS.resolvedThreads]: s });
}
