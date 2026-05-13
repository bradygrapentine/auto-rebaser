import { useState, useEffect } from 'react';
import {
  DEFAULT_AUTOMATION_SETTINGS,
  type AutomationSettings,
} from '../../core/automations-types';
import {
  getAutomationSettings,
  saveAutomationSettings,
} from '../../core/automations-store';
import { AUTOMATION_STORAGE_KEYS } from '../../core/automations-constants';

export interface UseAutomationSettingsResult {
  settings: AutomationSettings;
  save: (patch: Partial<AutomationSettings>) => Promise<void>;
  loading: boolean;
}

export function useAutomationSettings(): UseAutomationSettingsResult {
  const [settings, setSettings] = useState<AutomationSettings>({
    ...DEFAULT_AUTOMATION_SETTINGS,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getAutomationSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        // Stub throws until Part A lands. Keep defaults; UI stays usable.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Cross-context refresh: another popup instance (or settings panel
    // mount) writing automation settings to chrome.storage.sync must
    // propagate to this hook's state. Pre-fix, two component instances
    // would diverge — one's stale `save({...settings, ...patch})` could
    // overwrite a sibling's flag (e.g. enableReviewerTab → false).
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (cancelled) return;
      if (area !== 'sync') return;
      const change = changes[AUTOMATION_STORAGE_KEYS.settings];
      if (!change) return;
      // Echo guard: Chrome sometimes fires onChanged for identical writes.
      // Compare storage's newValue↔oldValue (NOT local React state, which
      // may have been optimistically updated by saveSettings already).
      if (JSON.stringify(change.newValue) === JSON.stringify(change.oldValue)) return;
      getAutomationSettings()
        .then((s) => {
          if (!cancelled) setSettings(s);
        })
        .catch(() => {
          // Reuse last good state on transient errors.
        });
    };
    chrome.storage.onChanged.addListener(onChanged);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const save = async (patch: Partial<AutomationSettings>) => {
    const next = { ...settings, ...patch };
    await saveAutomationSettings(next);
    setSettings(next);
  };

  return { settings, save, loading };
}
