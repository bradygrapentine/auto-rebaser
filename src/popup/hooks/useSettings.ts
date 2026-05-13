import { useState, useEffect } from 'react';
import type { Settings } from '../../core/types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../core/constants';
import { loadSettings, saveSettings as coreSaveSettings } from '../../core/settings-store';

export interface UseSettingsResult {
  settings: Settings;
  saveSettings: (s: Settings) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
      if (!cancelled) setSettings(s);
    });

    // Cross-context refresh — see useAutomationSettings for the rationale.
    // Settings live in chrome.storage.sync under STORAGE_KEYS.settings.
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (cancelled) return;
      if (area !== 'sync') return;
      const change = changes[STORAGE_KEYS.settings];
      if (!change) return;
      if (JSON.stringify(change.newValue) === JSON.stringify(change.oldValue)) return;
      loadSettings()
        .then((s) => {
          if (!cancelled) setSettings(s);
        })
        .catch(() => { /* keep last good */ });
    };
    chrome.storage.onChanged.addListener(onChanged);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const saveSettings = async (s: Settings) => {
    await coreSaveSettings(s);
    await chrome.runtime.sendMessage({ type: 'SET_INTERVAL', intervalMinutes: s.intervalMinutes });
    setSettings(s);
  };

  return { settings, saveSettings };
}
