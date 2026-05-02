// src/core/automations-store.ts
// Phase 2 storage layer for automation settings and resolved-threads map.

import type { AutomationSettings, ResolvedThreadsStore } from './automations-types';
import { DEFAULT_AUTOMATION_SETTINGS } from './automations-types';
import { AUTOMATION_STORAGE_KEYS } from './automations-constants';

export async function getAutomationSettings(): Promise<AutomationSettings> {
  const result = await chrome.storage.sync.get(AUTOMATION_STORAGE_KEYS.settings);
  const stored = result[AUTOMATION_STORAGE_KEYS.settings] as Partial<AutomationSettings> | undefined;
  if (!stored) return { ...DEFAULT_AUTOMATION_SETTINGS };
  // Forward-compat merge: defaults fill in any fields added after the user last saved.
  return { ...DEFAULT_AUTOMATION_SETTINGS, ...stored };
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
