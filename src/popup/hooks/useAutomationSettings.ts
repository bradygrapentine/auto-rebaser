import { useState, useEffect } from 'react';
import {
  DEFAULT_AUTOMATION_SETTINGS,
  type AutomationSettings,
} from '../../core/automations-types';
import {
  getAutomationSettings,
  saveAutomationSettings,
} from '../../core/automations-store';

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
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (patch: Partial<AutomationSettings>) => {
    const next = { ...settings, ...patch };
    await saveAutomationSettings(next);
    setSettings(next);
  };

  return { settings, save, loading };
}
