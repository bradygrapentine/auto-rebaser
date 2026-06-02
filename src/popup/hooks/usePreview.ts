// PREVIEW-1 (T2) — popup hook for the dry-run preview.
//
// Deliberately minimal: holds the PreviewProjection in EPHEMERAL local component
// state set from the PREVIEW_NOW response. It does NOT use usePRStore and does
// NOT read global settings via a hook — this structurally sidesteps the
// documented settings-read unhandled-rejection / 4-site mock ripple (no new
// AutomationSettings field, no settings hook threaded).

import { useCallback, useEffect, useState } from 'react';
import type { RuntimeResponse } from '../../core/types';
import type { PreviewProjection } from '../../background/automations/planned-action';

export interface UsePreview {
  projection: PreviewProjection | null;
  loading: boolean;
  error: string | null;
  /** Re-run the dry-run. */
  run: () => void;
}

export function usePreview(): UsePreview {
  const [projection, setProjection] = useState<PreviewProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = (await chrome.runtime.sendMessage({ type: 'PREVIEW_NOW' })) as RuntimeResponse;
        if (res?.ok && res.data) {
          setProjection(res.data as PreviewProjection);
        } else {
          setError(res?.error ?? 'PREVIEW_FAILED');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'PREVIEW_FAILED');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Run once on mount so opening the view triggers the dry-run.
  useEffect(() => {
    run();
  }, [run]);

  return { projection, loading, error, run };
}
