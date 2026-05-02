import { useState, useEffect } from 'react';
import type { Settings } from '../../core/types';
import { DEFAULT_SETTINGS } from '../../core/constants';
import { loadSettings, saveSettings as coreSaveSettings } from '../../core/settings-store';

export interface UseSettingsResult {
  settings: Settings;
  saveSettings: (s: Settings) => Promise<void>;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const saveSettings = async (s: Settings) => {
    await coreSaveSettings(s);
    await chrome.runtime.sendMessage({ type: 'SET_INTERVAL', intervalMinutes: s.intervalMinutes });
    setSettings(s);
  };

  return { settings, saveSettings };
}
